#!/usr/bin/env python3

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import uvicorn
import json
import asyncio
import logging
import math
from typing import Dict, List, Any
import os
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

# Configure logging early
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ROS bridge import - made optional for remote deployment
import os
REMOTE_MODE = os.getenv('REMOTE_MODE', 'false').lower() == 'true'

if REMOTE_MODE:
    # In remote mode, don't try to import ROS interface
    ROS_AVAILABLE = False
    def get_ros_bridge():
        return None
    def init_ros_bridge():
        return None
    logger.info("Running in REMOTE_MODE - ROS interface disabled")
else:
    # Normal mode - try to import ROS interface
    try:
        from ros_bridge.ros_interface import get_ros_bridge, init_ros_bridge
        ROS_AVAILABLE = True
    except ImportError:
        ROS_AVAILABLE = False
        def get_ros_bridge():
            return None
        def init_ros_bridge():
            return None
        logger.warning("ROS interface not available - running in limited mode")

# Import API routers (these might have ROS dependencies)
try:
    from api.robot_control import router as robot_router
    from api.navigation import router as navigation_router
    from api.sensors import router as sensors_router
    from api.system import router as system_router
    from api.parameters import router as parameters_router
    from api.logs import router as logs_router
    from api.auth import router as auth_router
    from api.diagnostics import router as diagnostics_router
    from api.maps import router as maps_router
    from api.waypoints import router as waypoints_router
    API_ROUTERS_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Some API routers not available: {e}")
    API_ROUTERS_AVAILABLE = False
# Import WebSocket and other managers (these might have ROS dependencies)
try:
    from websocket.websocket_manager import WebSocketManager
    from terminal.terminal_manager import handle_terminal_websocket
    from middleware.rate_limit import rate_limit_middleware
    from services.system_monitor import init_system_monitor, get_system_monitor
    WEBSOCKET_AVAILABLE = True
except ImportError as e:
    logger.warning(f"WebSocket manager not available: {e}")
    WEBSOCKET_AVAILABLE = False

# Logging already configured above

def safe_json_dumps(obj):
    """JSON dumps that handles NaN and Infinity values"""
    def convert_nan_inf(obj):
        if isinstance(obj, dict):
            return {k: convert_nan_inf(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert_nan_inf(item) for item in obj]
        elif isinstance(obj, float):
            if math.isnan(obj):
                return 0.0  # Convert NaN to 0
            elif math.isinf(obj):
                return 1000.0 if obj > 0 else -1000.0  # Convert Inf to large number
            else:
                return obj
        else:
            return obj

    return json.dumps(convert_nan_inf(obj))

# Create FastAPI app
app = FastAPI(
    title="Indoor Autonomous Vehicle Web Interface",
    description="Web interface for controlling and monitoring indoor autonomous vehicle",
    version="1.0.0"
)

# Security middleware
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["localhost", "127.0.0.1", "*.local", "*"]  # In production, restrict hosts
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # React dev server
        "http://localhost:8000",  # FastAPI server
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000",
        # In production, specify exact origins
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Rate limiting middleware
app.middleware("http")(rate_limit_middleware)

# WebSocket manager (only if available)
if WEBSOCKET_AVAILABLE:
    websocket_manager = WebSocketManager()
else:
    websocket_manager = None

# Include API routers (only if available)
if API_ROUTERS_AVAILABLE:
    app.include_router(auth_router, prefix="/api/auth", tags=["authentication"])
    app.include_router(robot_router, prefix="/api/robot", tags=["robot"])
    app.include_router(navigation_router, prefix="/api/navigation", tags=["navigation"])
    app.include_router(sensors_router, prefix="/api/sensors", tags=["sensors"])
    app.include_router(system_router, prefix="/api/system", tags=["system"])
    app.include_router(parameters_router, prefix="/api/parameters", tags=["parameters"])
    app.include_router(logs_router, prefix="/api/logs", tags=["logs"])
    app.include_router(diagnostics_router, prefix="/api/diagnostics", tags=["diagnostics"])
    app.include_router(maps_router, prefix="/api/maps", tags=["maps"])
    app.include_router(waypoints_router, prefix="/api", tags=["waypoints"])
    logger.info("All API routers loaded successfully")
else:
    logger.warning("API routers not loaded - running in minimal mode")

# Serve static files (React frontend)
frontend_path = Path(__file__).parent.parent.parent / "frontend" / "build"
if frontend_path.exists() and (frontend_path / "static").exists():
    app.mount("/static", StaticFiles(directory=str(frontend_path / "static")), name="static")

@app.on_event("startup")
async def startup_event():
    """Initialize ROS2 bridge on startup (if available)"""
    try:
        if REMOTE_MODE:
            logger.info("🌐 Starting in REMOTE MODE - waiting for bridge connections")
            logger.info("Backend will receive data from remote ROS bridge")
            ros_bridge = None
        elif ROS_AVAILABLE:
            logger.info("Initializing ROS2 bridge...")
            ros_bridge = init_ros_bridge()

            # Set the main event loop for WebSocket callbacks
            import asyncio
            main_loop = asyncio.get_running_loop()
            ros_bridge.set_main_event_loop(main_loop)
        else:
            logger.info("ROS2 not available - running in limited mode")
            ros_bridge = None

        # Register WebSocket callbacks (only if both ROS bridge and WebSocket manager are available)
        if ros_bridge and websocket_manager:
            ros_bridge.register_websocket_callback('pose', websocket_manager.broadcast_pose)
            ros_bridge.register_websocket_callback('odom', websocket_manager.broadcast_odom)
            ros_bridge.register_websocket_callback('scan', websocket_manager.broadcast_scan)
            ros_bridge.register_websocket_callback('battery', websocket_manager.broadcast_battery)
            ros_bridge.register_websocket_callback('map', websocket_manager.broadcast_map)
            ros_bridge.register_websocket_callback('diagnostics', websocket_manager.broadcast_diagnostics)
            ros_bridge.register_websocket_callback('log', websocket_manager.broadcast_log)
            ros_bridge.register_websocket_callback('ultrasonic', websocket_manager.broadcast_ultrasonic)
            ros_bridge.register_websocket_callback('node_status', websocket_manager.broadcast_node_status)

            logger.info("ROS2 bridge initialized successfully")
        else:
            logger.info("No ROS bridge or WebSocket manager - running in remote mode")

        # Initialize and start system monitor (only if available)
        if WEBSOCKET_AVAILABLE and websocket_manager:
            system_monitor = init_system_monitor(websocket_manager)
            await system_monitor.start()
            logger.info("System monitor started")
        else:
            logger.info("System monitor not available - running without monitoring")

    except Exception as e:
        logger.error(f"Failed to initialize ROS2 bridge: {str(e)}")
        # Don't exit, allow web interface to work in limited mode

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down web interface...")

    # Stop system monitor
    system_monitor = get_system_monitor()
    if system_monitor:
        await system_monitor.stop()

    await websocket_manager.disconnect_all()

@app.get("/")
async def read_root():
    """Serve React frontend"""
    if frontend_path.exists():
        index_file = frontend_path / "index.html"
        if index_file.exists():
            return HTMLResponse(content=index_file.read_text(), status_code=200)
    
    # Fallback HTML if React build not available
    return HTMLResponse(content="""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Indoor Autonomous Vehicle</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .container { max-width: 800px; margin: 0 auto; }
            .status { padding: 20px; background: #f0f0f0; border-radius: 5px; margin: 20px 0; }
            .button { padding: 10px 20px; margin: 5px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer; }
            .button:hover { background: #0056b3; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚗 Indoor Autonomous Vehicle Web Interface</h1>
            <div class="status">
                <h3>System Status</h3>
                <p>Backend: <span id="backend-status">Connected</span></p>
                <p>ROS2: <span id="ros-status">Checking...</span></p>
            </div>
            
            <h3>Quick Controls</h3>
            <button class="button" onclick="sendCommand('stop')">Emergency Stop</button>
            <button class="button" onclick="sendCommand('home')">Go Home</button>
            <button class="button" onclick="sendCommand('status')">Get Status</button>
            
            <h3>API Endpoints</h3>
            <ul>
                <li><a href="/docs">API Documentation (Swagger)</a></li>
                <li><a href="/api/system/status">System Status</a></li>
                <li><a href="/api/sensors/scan">LiDAR Data</a></li>
                <li><a href="/api/robot/pose">Robot Pose</a></li>
            </ul>
            
            <div id="output"></div>
        </div>
        
        <script>
            // WebSocket connection
            const ws = new WebSocket('ws://localhost:8000/ws');
            
            ws.onopen = function(event) {
                document.getElementById('ros-status').textContent = 'Connected';
                document.getElementById('ros-status').style.color = 'green';
            };
            
            ws.onmessage = function(event) {
                const data = JSON.parse(event.data);
                //console.log('Received:', data);
                
                const output = document.getElementById('output');
                output.innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
            };
            
            ws.onclose = function(event) {
                document.getElementById('ros-status').textContent = 'Disconnected';
                document.getElementById('ros-status').style.color = 'red';
            };
            
            function sendCommand(cmd) {
                fetch('/api/robot/' + cmd, { method: 'POST' })
                    .then(response => response.json())
                    .then(data => {
                        //console.log('Command result:', data);
                        document.getElementById('output').innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
                    })
                    .catch(error => {
                        console.error('Error:', error);
                        document.getElementById('output').innerHTML = '<pre>Error: ' + error + '</pre>';
                    });
            }
        </script>
    </body>
    </html>
    """, status_code=200)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time data"""
    await websocket_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive and handle client messages
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Handle client commands
            if message.get('type') == 'command':
                await handle_websocket_command(websocket, message)
            elif message.get('type') == 'subscribe':
                await websocket_manager.subscribe(websocket, message.get('topics', []))
            elif message.get('type') == 'unsubscribe':
                await websocket_manager.unsubscribe(websocket, message.get('topics', []))
                
    except WebSocketDisconnect:
        websocket_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        websocket_manager.disconnect(websocket)

@app.websocket("/ws/terminal")
async def terminal_websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for terminal sessions"""
    await handle_terminal_websocket(websocket)

async def handle_websocket_command(websocket: WebSocket, message: Dict[str, Any]):
    """Handle commands received via WebSocket"""
    try:
        command = message.get('command')
        params = message.get('params', {})

        import time
        timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
        logger.info(f"🌐 [BE] {timestamp} - Received WebSocket command: {command}")
        logger.info(f"🌐 [BE] Command params: {params}")

        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            logger.error(f"❌ [BE] ROS2 bridge not available for command: {command}")
            await websocket.send_text(safe_json_dumps({
                'type': 'error',
                'message': 'ROS2 bridge not available'
            }))
            return
        
        if command == 'move':
            linear_x = params.get('linear_x', 0.0)
            linear_y = params.get('linear_y', 0.0)
            angular_z = params.get('angular_z', 0.0)
            ros_bridge.publish_cmd_vel(linear_x, linear_y, angular_z)
            
        elif command == 'navigate':
            x = params.get('x', 0.0)
            y = params.get('y', 0.0)
            orientation_w = params.get('orientation_w', 1.0)

            logger.info(f"🎯 [BE] Processing navigate command to ({x}, {y}) with orientation_w={orientation_w}")

            try:
                ros_bridge.publish_navigation_goal(x, y, orientation_w)
                logger.info(f"✅ [BE] Navigation goal published to ROS2 successfully")
            except Exception as e:
                logger.error(f"❌ [BE] Error publishing navigation goal: {str(e)}")
                raise
            
        elif command == 'set_initial_pose':
            x = params.get('x', 0.0)
            y = params.get('y', 0.0)
            orientation_w = params.get('orientation_w', 1.0)
            ros_bridge.publish_initial_pose(x, y, orientation_w)
            
        logger.info(f"✅ [BE] Command {command} processed successfully, sending response")
        await websocket.send_text(safe_json_dumps({
            'type': 'command_result',
            'command': command,
            'status': 'success'
        }))
        logger.info(f"✅ [BE] Success response sent to frontend")
        
    except Exception as e:
        await websocket.send_text(safe_json_dumps({
            'type': 'error',
            'message': str(e)
        }))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        if REMOTE_MODE:
            return {
                "status": "healthy",
                "mode": "remote",
                "ros_bridge": "waiting_for_connection",
                "message": "Backend ready to receive bridge connections",
                "timestamp": asyncio.get_event_loop().time()
            }
        else:
            ros_bridge = get_ros_bridge()
            ros_status = "connected" if ros_bridge else "disconnected"

            return {
                "status": "healthy",
                "mode": "local",
                "ros2_bridge": ros_status,
                "timestamp": asyncio.get_event_loop().time()
            }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": asyncio.get_event_loop().time()
        }

@app.get("/api/status")
async def api_status():
    """API status endpoint"""
    try:
        if REMOTE_MODE:
            return {
                "status": "disconnected",
                "mode": "remote",
                "message": "Waiting for bridge connection",
                "data_available": {
                    "pose": False,
                    "odom": False,
                    "scan": False,
                    "battery": False,
                    "map": False
                },
                "timestamp": asyncio.get_event_loop().time()
            }
        else:
            ros_bridge = get_ros_bridge()

            if ros_bridge:
                latest_data = ros_bridge.get_all_latest_data()
                return {
                    "status": "connected",
                    "mode": "local",
                    "data_available": {
                        "pose": latest_data.get('pose') is not None,
                        "odom": latest_data.get('odom') is not None,
                        "scan": latest_data.get('scan') is not None,
                        "battery": latest_data.get('battery') is not None,
                        "map": latest_data.get('map') is not None
                    },
                    "timestamp": asyncio.get_event_loop().time()
                }
            else:
                return {
                    "status": "disconnected",
                    "mode": "local",
                    "error": "ROS bridge not available",
                    "timestamp": asyncio.get_event_loop().time()
                }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # Run with uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
