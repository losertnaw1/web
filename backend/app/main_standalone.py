#!/usr/bin/env python3

"""
FastAPI Backend for Indoor Autonomous Vehicle - Standalone Version
Web interface backend that works without ROS for testing backend only
"""

import asyncio
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Add the parent directory to Python path for imports
sys.path.append(str(Path(__file__).parent.parent))

# Import API routers
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
from api.tasks import router as tasks_router

# Import WebSocket and other managers
from websocket.websocket_manager import WebSocketManager
from terminal.terminal_manager import handle_terminal_websocket
from middleware.rate_limit import rate_limit_middleware
from services.system_monitor import init_system_monitor, get_system_monitor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Store frontend logs in memory (in production, use proper logging system)
frontend_logs = []

# Create FastAPI app
app = FastAPI(
    title="Indoor Autonomous Vehicle API - Standalone",
    description="Web interface backend for indoor autonomous vehicle (Backend-only testing mode)",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add rate limiting middleware
app.middleware("http")(rate_limit_middleware)

# Initialize WebSocket manager
websocket_manager = WebSocketManager()

# Inject WebSocket manager into API routers that need it
import api.navigation
import api.robot_control

api.navigation.set_websocket_manager(websocket_manager)
api.robot_control.set_websocket_manager(websocket_manager)

# Include API routers
app.include_router(robot_router, prefix="/api/robot", tags=["robot"])
app.include_router(navigation_router, prefix="/api/navigation", tags=["navigation"])
app.include_router(sensors_router, prefix="/api/sensors", tags=["sensors"])
app.include_router(system_router, prefix="/api/system", tags=["system"])
app.include_router(parameters_router, prefix="/api/parameters", tags=["parameters"])
app.include_router(logs_router, prefix="/api/logs", tags=["logs"])
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(diagnostics_router, prefix="/api/diagnostics", tags=["diagnostics"])
app.include_router(maps_router, prefix="/api/maps", tags=["maps"])

# Add a direct endpoint for /api/maps to avoid redirect issues
@app.get("/api/maps")
async def get_maps_direct():
    """Direct endpoint for /api/maps to avoid redirect"""
    try:
        from api.maps import load_saved_maps
        maps = load_saved_maps()
        logger.info(f"Retrieved {len(maps)} saved maps from direct endpoint")
        return {
            "status": "success", 
            "maps": [m.dict() for m in maps],
            "count": len(maps)
        }
    except Exception as e:
        logger.error(f"Error retrieving maps from direct endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))
app.include_router(waypoints_router, prefix="/api", tags=["waypoints"])
app.include_router(tasks_router, prefix="/api", tags=["tasks"])

# Serve static files (React frontend)
frontend_path = Path(__file__).parent.parent.parent / "frontend" / "build"
if frontend_path.exists() and (frontend_path / "static").exists():
    app.mount("/static", StaticFiles(directory=str(frontend_path / "static")), name="static")

@app.on_event("startup")
async def startup_event():
    """Initialize backend in standalone mode (no ROS)"""
    try:
        logger.info("Starting backend in standalone mode (no ROS connection)")
        logger.info("This mode is for backend testing only")
        
        # Initialize and start system monitor (without ROS)
        system_monitor = init_system_monitor(websocket_manager)
        await system_monitor.start()
        logger.info("System monitor started")

    except Exception as e:
        logger.error(f"Failed to initialize standalone backend: {str(e)}")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down standalone backend...")

    # Stop system monitor
    system_monitor = get_system_monitor()
    if system_monitor:
        await system_monitor.stop()

    await websocket_manager.disconnect_all()
    logger.info("Shutdown complete")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Main WebSocket endpoint for real-time communication"""
    await websocket_manager.connect(websocket)
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Handle different message types
            await handle_websocket_message(websocket, message)
            
    except WebSocketDisconnect:
        websocket_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        websocket_manager.disconnect(websocket)

@app.websocket("/ws/terminal")
async def terminal_websocket(websocket: WebSocket):
    """WebSocket endpoint for terminal access"""
    await handle_terminal_websocket(websocket)

async def handle_websocket_message(websocket: WebSocket, message: Dict[str, Any]):
    """Handle incoming WebSocket messages"""
    try:
        message_type = message.get('type', '')
        
        if message_type == 'command':
            await handle_robot_command(message)
        elif message_type == 'get_status':
            await send_robot_status(websocket)
        elif message_type == 'ping':
            await websocket.send_text(json.dumps({'type': 'pong', 'timestamp': asyncio.get_event_loop().time()}))
        else:
            logger.warning(f"Unknown WebSocket message type: {message_type}")
            
    except Exception as e:
        logger.error(f"Error handling WebSocket message: {e}")

async def handle_robot_command(message: Dict[str, Any]):
    """Handle robot control commands (standalone mode - logs only)"""
    try:
        command = message.get('command', '')
        params = message.get('params', {})
        
        logger.info(f"🎮 [STANDALONE] Mock robot command: {command} with params: {params}")
        
        if command == 'move':
            linear_x = params.get('linear_x', 0.0)
            linear_y = params.get('linear_y', 0.0)
            angular_z = params.get('angular_z', 0.0)
            logger.info(f"🎮 [STANDALONE] Mock move command: linear=({linear_x}, {linear_y}), angular={angular_z}")
            
        elif command == 'navigate':
            x = params.get('x', 0.0)
            y = params.get('y', 0.0)
            orientation_w = params.get('orientation_w', 1.0)
            logger.info(f"🎯 [STANDALONE] Mock navigate command to ({x}, {y}) with orientation_w={orientation_w}")
                
        elif command == 'stop':
            logger.info(f"🛑 [STANDALONE] Mock stop command")
            
        elif command == 'set_initial_pose':
            x = params.get('x', 0.0)
            y = params.get('y', 0.0)
            theta = params.get('theta', 0.0)
            logger.info(f"📍 [STANDALONE] Mock set initial pose: ({x}, {y}, {theta})")
            
        else:
            logger.warning(f"Unknown robot command: {command}")
            
    except Exception as e:
        logger.error(f"Error executing robot command: {e}")

async def send_robot_status(websocket: WebSocket):
    """Send mock robot status"""
    try:
        status_data = {
            'type': 'robot_status',
            'timestamp': asyncio.get_event_loop().time(),
            'ros_connected': False,
            'ros_distro': 'standalone',
            'mode': 'testing',
            'battery': 85.5,
            'pose': {'x': 0.0, 'y': 0.0, 'theta': 0.0},
            'velocity': {'linear_x': 0.0, 'linear_y': 0.0, 'angular_z': 0.0}
        }
        
        await websocket.send_text(json.dumps(status_data))
        
    except Exception as e:
        logger.error(f"Error sending robot status: {e}")

@app.get("/")
async def serve_frontend():
    """Serve the React frontend"""
    frontend_path = Path(__file__).parent.parent.parent / "frontend" / "build"
    index_file = frontend_path / "index.html"
    
    if index_file.exists():
        return FileResponse(str(index_file))
    else:
        return {"message": "Frontend not built. Run 'npm run build' in the frontend directory."}

@app.post("/api/frontend-log")
async def frontend_log(request: dict):
    """Receive logs from frontend and write to backend log"""
    try:
        level = request.get("level", "info").upper()
        message = request.get("message", "")
        component = request.get("component", "frontend")
        timestamp = request.get("timestamp", "")

        # Store in memory for retrieval
        log_entry = {
            'timestamp': timestamp or datetime.now().isoformat(),
            'level': level.lower(),
            'component': component,
            'message': message,
            'id': len(frontend_logs) + 1
        }

        frontend_logs.append(log_entry)

        # Keep only last 1000 logs to prevent memory issues
        if len(frontend_logs) > 1000:
            frontend_logs.pop(0)

        # Format the log message for backend terminal
        log_msg = f"[FE-{component}] {message}"
        if timestamp:
            log_msg = f"{timestamp} - {log_msg}"

        # Log to backend with appropriate level
        if level == "ERROR":
            logger.error(log_msg)
        elif level == "WARN":
            logger.warning(log_msg)
        elif level == "DEBUG":
            logger.debug(log_msg)
        else:
            logger.info(log_msg)

        return {"status": "success", "logged": True}
    except Exception as e:
        logger.error(f"Error processing frontend log: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/api/logs")
async def get_frontend_logs():
    """Get all frontend logs"""
    try:
        return {
            "status": "success",
            "logs": frontend_logs,
            "count": len(frontend_logs)
        }
    except Exception as e:
        logger.error(f"Error retrieving frontend logs: {e}")
        return {"status": "error", "message": str(e)}

@app.post("/api/logs/clear")
async def clear_frontend_logs():
    """Clear all frontend logs"""
    try:
        global frontend_logs
        frontend_logs = []
        logger.info("Frontend logs cleared")
        return {"status": "success", "message": "Logs cleared"}
    except Exception as e:
        logger.error(f"Error clearing frontend logs: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        return {
            "status": "healthy",
            "mode": "standalone",
            "ros_bridge": "disabled",
            "ros_distro": "standalone",
            "timestamp": asyncio.get_event_loop().time()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "mode": "standalone",
            "ros_distro": "standalone",
            "timestamp": asyncio.get_event_loop().time()
        }

@app.get("/api/status")
async def api_status():
    """API status endpoint"""
    try:
        return {
            "status": "connected",
            "mode": "standalone",
            "ros_distro": "standalone",
            "ros_connected": False,
            "data_available": {
                "pose": False,
                "odom": False,
                "scan": False,
                "battery": False,
                "map": False
            },
            "message": "Backend running in standalone mode (no ROS)",
            "timestamp": asyncio.get_event_loop().time()
        }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mock endpoints for standalone testing
@app.get("/api/map")
async def get_mock_map():
    """Get mock map data for testing"""
    logger.info("🗺️ [STANDALONE] Mock map data requested")

    # Return a simple mock map
    mock_map_data = {
        "width": 100,
        "height": 100,
        "resolution": 0.1,
        "origin": {"x": -5.0, "y": -5.0, "theta": 0.0},
        "data": [0] * (100 * 100)  # Empty map
    }

    return {
        "status": "success",
        "map": mock_map_data,
        "message": "Mock map data (standalone mode)",
        "timestamp": asyncio.get_event_loop().time()
    }

@app.post("/api/map/refresh")
async def refresh_mock_map():
    """Mock map refresh for testing"""
    logger.info("🗺️ [STANDALONE] Mock map refresh requested")
    
    return {
        "status": "success",
        "message": "Mock map refreshed (standalone mode)",
        "timestamp": asyncio.get_event_loop().time()
    }

@app.post("/api/navigation/navigate")
async def mock_navigate_to_goal(request: dict):
    """Mock navigation for testing"""
    x = request.get("x")
    y = request.get("y")
    orientation = request.get("orientation")

    if x is None or y is None:
        raise HTTPException(status_code=400, detail="x and y coordinates are required")

    logger.info(f"🎯 [STANDALONE] Mock navigation goal: ({x}, {y}), Orientation={orientation}")

    return {
        "status": "success",
        "message": f"Mock navigation goal set to ({x}, {y})",
        "goal": {"x": x, "y": y, "orientation": orientation}
    }

@app.post("/api/robot/move")
async def mock_move_robot_direct(request: dict):
    """Mock robot movement for testing"""
    linear_x = request.get("linear_x", 0.0)
    linear_y = request.get("linear_y", 0.0)
    angular_z = request.get("angular_z", 0.0)

    logger.info(f"🎮 [STANDALONE] Mock movement: linear=({linear_x}, {linear_y}), angular={angular_z}")

    return {
        "status": "success",
        "message": f"Mock movement command sent",
        "command": {"linear_x": linear_x, "linear_y": linear_y, "angular_z": angular_z}
    }

@app.post("/api/robot/stop")
async def mock_stop_robot():
    """Mock stop robot for testing"""
    logger.info(f"🛑 [STANDALONE] Mock stop command")

    return {
        "status": "success",
        "message": "Mock robot stopped",
        "command": {"linear_x": 0.0, "linear_y": 0.0, "angular_z": 0.0}
    }

if __name__ == "__main__":
    # Run with uvicorn
    uvicorn.run(
        "main_standalone:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )