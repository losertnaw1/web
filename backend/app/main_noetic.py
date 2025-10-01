#!/usr/bin/env python3

"""
FastAPI Backend for Indoor Autonomous Vehicle - ROS Noetic Version
Web interface backend that connects to ROS Noetic instead of ROS2
"""

import asyncio
import base64
import json
import logging
import math
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager

# Add the parent directory to Python path for imports
sys.path.append(str(Path(__file__).parent.parent))

# Import ROS Noetic bridge instead of ROS2
from ros_bridge.ros_interface_noetic import get_ros_bridge, init_ros_bridge, shutdown_ros_bridge

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

# Configure logging với format rõ ràng và force output
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)  # Force log to stdout
    ],
    force=True  # Override any existing logging config
)
logger = logging.getLogger(__name__)

# Set logging level for our application loggers
logging.getLogger('web_interface').setLevel(logging.INFO)
logging.getLogger('uvicorn').setLevel(logging.WARNING)  # Reduce uvicorn noise
logging.getLogger('uvicorn.access').setLevel(logging.WARNING)

# Resolve workspace root so file operations work regardless of process cwd
WORKSPACE_ROOT = Path(__file__).resolve().parents[3]

# Store frontend logs in memory (in production, use proper logging system)
frontend_logs = []

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Startup
    await startup_event()
    yield
    # Shutdown
    await shutdown_event()

# Create FastAPI app
app = FastAPI(
    title="Indoor Autonomous Vehicle API - ROS Noetic",
    description="Web interface backend for indoor autonomous vehicle using ROS Noetic",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
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
# app.include_router(maps_router, prefix="/api/maps", tags=["maps"])  # Disabled - using ROS1 endpoints in main file

app.include_router(waypoints_router, prefix="/api", tags=["waypoints"])
app.include_router(tasks_router, prefix="/api", tags=["tasks"])

# Serve static files (React frontend)
frontend_path = Path(__file__).parent.parent.parent / "frontend" / "build"
if frontend_path.exists() and (frontend_path / "static").exists():
    app.mount("/static", StaticFiles(directory=str(frontend_path / "static")), name="static")

async def startup_event():
    """Initialize ROS Noetic bridge on startup"""
    try:
        logger.info("Initializing ROS Noetic bridge...")
        
        # Check if ROS Noetic environment is available
        try:
            import rospy  # noqa: F401
            logger.info("ROS Noetic Python bindings found")
        except ImportError:
            logger.error("ROS Noetic Python bindings not found!")
            logger.error("Please source ROS Noetic environment:")
            logger.error("  source /opt/ros/noetic/setup.bash")
            raise
        
        ros_bridge = init_ros_bridge()

        # Set the main event loop for WebSocket callbacks
        main_loop = asyncio.get_running_loop()
        ros_bridge.set_main_event_loop(main_loop)
        # Create sync wrapper functions for WebSocket callbacks
        def map_callback(data):
            if data:
                map_width = data.get('width', 'unknown')
                map_height = data.get('height', 'unknown')
                logger.info(f"🗺️ Map data received from ROS: {map_width}x{map_height}")
            asyncio.create_task(websocket_manager.broadcast_map('map', data))

        def diagnostics_callback(data):
            asyncio.create_task(websocket_manager.broadcast_diagnostics('diagnostics', data))

        def pose_callback(data):
            asyncio.create_task(websocket_manager.broadcast_pose('pose', data))

        def odom_callback(data):
            asyncio.create_task(websocket_manager.broadcast_odom('odom', data))

        def scan_callback(data):
            asyncio.create_task(websocket_manager.broadcast_scan('scan', data))

        def battery_callback(data):
            asyncio.create_task(websocket_manager.broadcast_battery('battery', data))

        # Register WebSocket callbacks for real-time data
        ros_bridge.register_websocket_callback('pose', pose_callback)
        ros_bridge.register_websocket_callback('odom', odom_callback)
        ros_bridge.register_websocket_callback('scan', scan_callback)
        ros_bridge.register_websocket_callback('battery', battery_callback)
        ros_bridge.register_websocket_callback('map', map_callback)
        ros_bridge.register_websocket_callback('diagnostics', diagnostics_callback)

        logger.info("✅ ROS Noetic bridge initialized successfully")

        # Initialize and start system monitor
        system_monitor = init_system_monitor(websocket_manager)
        await system_monitor.start()
        logger.info("System monitor started")

    except Exception as e:
        logger.error(f"Failed to initialize ROS Noetic bridge: {str(e)}")
        logger.warning("Backend will run in limited mode without ROS connection")

async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down web interface...")

    # Stop system monitor
    system_monitor = get_system_monitor()
    if system_monitor:
        await system_monitor.stop()

    # Shutdown ROS bridge
    shutdown_ros_bridge()

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
    """Handle robot control commands"""
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            logger.error("ROS bridge not available")
            return
        
        command = message.get('command', '')
        params = message.get('params', {})
        
        logger.info(f"🎮 [BE] Processing robot command: {command} with params: {params}")
        
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
                logger.info(f"✅ [BE] Navigation goal published to ROS Noetic successfully")
            except Exception as e:
                logger.error(f"❌ [BE] Error publishing navigation goal: {str(e)}")
                raise
                
        elif command == 'stop':
            ros_bridge.publish_cmd_vel(0.0, 0.0, 0.0)
            
        elif command == 'set_initial_pose':
            x = params.get('x', 0.0)
            y = params.get('y', 0.0)
            theta = params.get('theta', 0.0)
            ros_bridge.publish_initial_pose(x, y, theta)
            
        else:
            logger.warning(f"Unknown robot command: {command}")
            
    except Exception as e:
        logger.error(f"Error executing robot command: {e}")

async def send_robot_status(websocket: WebSocket):
    """Send current robot status"""
    try:
        ros_bridge = get_ros_bridge()
        if ros_bridge:
            status_data = ros_bridge.get_all_latest_data()
            status_data['type'] = 'robot_status'
            status_data['timestamp'] = asyncio.get_event_loop().time()
            status_data['ros_connected'] = True
            status_data['ros_distro'] = 'noetic'
        else:
            status_data = {
                'type': 'robot_status',
                'timestamp': asyncio.get_event_loop().time(),
                'ros_connected': False,
                'ros_distro': 'noetic',
                'error': 'ROS bridge not available'
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
        ros_bridge = get_ros_bridge()
        ros_status = "connected" if ros_bridge else "disconnected"

        return {
            "status": "healthy",
            "ros_bridge": ros_status,
            "ros_distro": "noetic",
            "timestamp": asyncio.get_event_loop().time()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "ros_distro": "noetic",
            "timestamp": asyncio.get_event_loop().time()
        }

@app.get("/api/status")
async def api_status():
    """API status endpoint"""
    try:
        ros_bridge = get_ros_bridge()
        
        if ros_bridge:
            latest_data = ros_bridge.get_all_latest_data()
            return {
                "status": "connected",
                "ros_distro": "noetic",
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
                "ros_distro": "noetic",
                "error": "ROS bridge not available",
                "timestamp": asyncio.get_event_loop().time()
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # Run with uvicorn
    uvicorn.run(
        "main_noetic:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )

# Switch System API Endpoints - Global state
map_source_state = {
    "current_source": "static_map",
    "available_sources": ["static_map", "dynamic_map"],
    "topic_mapping": {
        "static_map": "/map",
        "dynamic_map": "/map_dynamic"
    }
}

position_mode_state = {
    "current_mode": "receive_from_ros",
    "available_modes": ["receive_from_ros", "send_to_ros"],
    "description": {
        "receive_from_ros": "Receive robot position updates from ROS",
        "send_to_ros": "Send initial pose to ROS (click map to set position)"
    }
}

running_mode_state = {
    "current_mode": "line_following",
    "available_modes": ["line_following", "slam_auto"],
    "description": {
        "line_following": "Robot follows predefined lines/paths",
        "slam_auto": "Robot navigates autonomously using SLAM"
    },
    "mode_config": {
        "line_following": {
            "navigation_stack": "line_follower",
            "slam_enabled": False,
            "autonomous_navigation": False
        },
        "slam_auto": {
            "navigation_stack": "nav2",
            "slam_enabled": True,
            "autonomous_navigation": True
        }
    }
}

# Switch System API Endpoints
@app.get("/api/navigation/map-source")
async def get_map_source():
    """Get current map data source configuration"""
    return {
        "status": "success",
        "current_source": map_source_state["current_source"],
        "available_sources": map_source_state["available_sources"],
        "topic_mapping": map_source_state["topic_mapping"]
    }

@app.post("/api/navigation/map-source")
async def set_map_source(request: dict):
    """Set map data source (static_map or dynamic_map)"""
    new_source = request.get("source")
    if not new_source or new_source not in map_source_state["available_sources"]:
        raise HTTPException(status_code=400, detail="Invalid source")
    
    old_source = map_source_state["current_source"]
    map_source_state["current_source"] = new_source
    
    logger.info(f"Map source switched from {old_source} to {new_source}")
    
    return {
        "status": "success",
        "message": f"Map source switched to {new_source}",
        "previous_source": old_source,
        "current_source": new_source,
        "topic": map_source_state["topic_mapping"][new_source]
    }

@app.get("/api/navigation/position-mode")
async def get_position_mode():
    """Get current robot position mode configuration"""
    return {
        "status": "success",
        "current_mode": position_mode_state["current_mode"],
        "available_modes": position_mode_state["available_modes"],
        "description": position_mode_state["description"]
    }

@app.post("/api/navigation/position-mode")
async def set_position_mode(request: dict):
    """Set robot position mode (receive_from_ros or send_to_ros)"""
    new_mode = request.get("mode")
    if not new_mode or new_mode not in position_mode_state["available_modes"]:
        raise HTTPException(status_code=400, detail="Invalid mode")
    
    old_mode = position_mode_state["current_mode"]
    position_mode_state["current_mode"] = new_mode
    
    logger.info(f"Position mode switched from {old_mode} to {new_mode}")
    
    return {
        "status": "success",
        "message": f"Position mode switched to {new_mode}",
        "previous_mode": old_mode,
        "current_mode": new_mode,
        "description": position_mode_state["description"][new_mode]
    }

@app.post("/api/navigation/set-initial-pose")
async def set_initial_pose(request: dict):
    """Set robot initial pose (only works when position mode is 'send_to_ros')"""
    if position_mode_state["current_mode"] != "send_to_ros":
        raise HTTPException(
            status_code=400,
            detail="Initial pose can only be set when position mode is 'send_to_ros'"
        )

    x = request.get("x")
    y = request.get("y")
    theta = request.get("theta", 0.0)

    if x is None or y is None:
        raise HTTPException(status_code=400, detail="Missing 'x' or 'y' coordinates")

    ros_bridge = get_ros_bridge()
    if not ros_bridge:
        raise HTTPException(status_code=503, detail="ROS bridge not available")

    logger.info(f"Initial pose set to ({x}, {y}, {theta})")

    return {
        "status": "success",
        "message": "Initial pose set successfully",
        "pose": {"x": x, "y": y, "theta": theta}
    }

@app.post("/api/navigation/navigate")
async def navigate_to_goal(request: dict):
    """Send navigation goal to robot"""
    x = request.get("x")
    y = request.get("y")
    orientation: Optional[Dict[str, float]] = request.get("orientation")

    if x is None or y is None:
        raise HTTPException(status_code=400, detail="x and y coordinates are required")

    if orientation is None:
        # Tạo một quaternion mặc định (không xoay)
        orientation_data = {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
        logger.warning(f"⚠️ [API] No orientation provided. Defaulting to no rotation (w=1.0).")
    else:
        # Kiểm tra các trường cần thiết trong object orientation
        if not all(k in orientation for k in ["x", "y", "z", "w"]):
            raise HTTPException(
                status_code=400, 
                detail="Orientation object must contain 'x', 'y', 'z', and 'w' keys."
            )
        orientation_data = orientation

    ros_bridge = get_ros_bridge()
    if not ros_bridge:
        raise HTTPException(status_code=503, detail="ROS bridge not available")

    logger.info(f"🎯 [API] Navigation goal requested: ({x}, {y}), Orientation={orientation_data}")

    try:
        ros_bridge.publish_navigation_goal_with_pose(
            float(x), 
            float(y), 
            orientation_data
        )
        logger.info(f"✅ [API] Navigation goal published successfully")

        return {
            "status": "success",
            "message": f"Navigation goal set to ({x}, {y})",
            "goal": {"x": x, "y": y, "Orientation": orientation_data}
        }
    except Exception as e:
        logger.error(f"❌ [API] Error publishing navigation goal: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to set navigation goal: {str(e)}")

@app.post("/api/robot/move")
async def move_robot_direct(request: dict):
    """Send direct movement command to robot"""
    linear_x = request.get("linear_x", 0.0)
    linear_y = request.get("linear_y", 0.0)
    angular_z = request.get("angular_z", 0.0)

    ros_bridge = get_ros_bridge()
    if not ros_bridge:
        raise HTTPException(status_code=503, detail="ROS bridge not available")

    logger.info(f"🎮 [API] Movement command: linear=({linear_x}, {linear_y}), angular={angular_z}")

    try:
        ros_bridge.publish_cmd_vel(float(linear_x), float(linear_y), float(angular_z))
        logger.info(f"✅ [API] Movement command published successfully")

        return {
            "status": "success",
            "message": f"Movement command sent",
            "command": {"linear_x": linear_x, "linear_y": linear_y, "angular_z": angular_z}
        }
    except Exception as e:
        logger.error(f"❌ [API] Error publishing movement command: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send movement command: {str(e)}")

@app.post("/api/robot/stop")
async def stop_robot():
    """Stop robot movement"""
    ros_bridge = get_ros_bridge()
    if not ros_bridge:
        raise HTTPException(status_code=503, detail="ROS bridge not available")

    logger.info(f"🛑 [API] Stop command received")

    try:
        ros_bridge.publish_cmd_vel(0.0, 0.0, 0.0)
        logger.info(f"✅ [API] Stop command published successfully")

        return {
            "status": "success",
            "message": "Robot stopped",
            "command": {"linear_x": 0.0, "linear_y": 0.0, "angular_z": 0.0}
        }
    except Exception as e:
        logger.error(f"❌ [API] Error publishing stop command: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to stop robot: {str(e)}")

@app.get("/api/robot/running-mode")
async def get_running_mode():
    """Get current robot running mode configuration"""
    return {
        "status": "success",
        "current_mode": running_mode_state["current_mode"],
        "available_modes": running_mode_state["available_modes"],
        "description": running_mode_state["description"],
        "config": running_mode_state["mode_config"][running_mode_state["current_mode"]]
    }

@app.post("/api/robot/running-mode")
async def set_running_mode(request: dict):
    """Set robot running mode (line_following or slam_auto)"""
    new_mode = request.get("mode")
    if not new_mode or new_mode not in running_mode_state["available_modes"]:
        raise HTTPException(status_code=400, detail="Invalid mode")
    
    old_mode = running_mode_state["current_mode"]
    running_mode_state["current_mode"] = new_mode
    
    logger.info(f"Running mode switched from {old_mode} to {new_mode}")
    
    return {
        "status": "success",
        "message": f"Running mode switched to {new_mode}",
        "previous_mode": old_mode,
        "current_mode": new_mode,
        "description": running_mode_state["description"][new_mode],
        "config": running_mode_state["mode_config"][new_mode]
    }

@app.get("/api/slam/status")
async def get_slam_status():
    """Get current SLAM status"""
    ros_bridge = get_ros_bridge()
    if not ros_bridge:
        raise HTTPException(status_code=503, detail="ROS bridge not available")
    
    status = ros_bridge.get_slam_status()
    return {
        "status": "success",
        "slam": status
    }

@app.post("/api/slam/start")
async def start_slam(request: dict):
    """Start SLAM algorithm"""
    slam_type = request.get("type", "gmapping")
    
    ros_bridge = get_ros_bridge()
    if not ros_bridge:
        raise HTTPException(status_code=503, detail="ROS bridge not available")
    
    # Get dynamic mapper and start SLAM
    if hasattr(ros_bridge, 'dynamic_mapper') and ros_bridge.dynamic_mapper:
        success = ros_bridge.dynamic_mapper.start_slam(slam_type)
        if success:
            return {
                "status": "success",
                "message": f"SLAM started with {slam_type}",
                "slam_type": slam_type
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to start {slam_type} SLAM")
    else:
        raise HTTPException(status_code=503, detail="Dynamic mapper not available")

@app.post("/api/slam/stop")
async def stop_slam():
    """Stop SLAM algorithm"""
    ros_bridge = get_ros_bridge()
    if not ros_bridge:
        raise HTTPException(status_code=503, detail="ROS bridge not available")
    
    # Get dynamic mapper and stop SLAM
    if hasattr(ros_bridge, 'dynamic_mapper') and ros_bridge.dynamic_mapper:
        ros_bridge.dynamic_mapper.stop_slam()
        return {
            "status": "success",
            "message": "SLAM stopped"
        }
    else:
        raise HTTPException(status_code=503, detail="Dynamic mapper not available")

@app.get("/api/map")
async def get_map():
    """Get current map data"""
    ros_bridge = get_ros_bridge()
    if not ros_bridge:
        logger.warning("ROS bridge not available")
        return {
            "status": "no_map",
            "message": "ROS bridge not available",
            "timestamp": None
        }

    # Get map data from ROS bridge
    map_data = ros_bridge.get_latest_data('map')

    if map_data:
        logger.info(f"Map data returned: {map_data.get('width')}x{map_data.get('height')}")
        return {"map": map_data, "status": "success"}
    else:
        logger.warning("No map data available from ROS bridge")
        return {
            "status": "no_map",
            "message": "No map data available",
            "timestamp": None
        }

@app.post("/api/map/refresh")
async def refresh_map():
    """Force refresh map data by resubscribing to map topic"""
    logger.info("Map refresh requested")

    ros_bridge = get_ros_bridge()
    if not ros_bridge:
        raise HTTPException(status_code=503, detail="ROS bridge not available")

    try:
        if hasattr(ros_bridge, 'refresh_map_subscription'):
            ros_bridge.refresh_map_subscription()
            logger.info("Map subscription refreshed")

        await asyncio.sleep(0.5)

        map_data = ros_bridge.get_latest_data('map')
        if map_data:
            logger.info(f"Map refresh successful: {map_data.get('width')}x{map_data.get('height')}")
            return {"status": "success", "message": "Map refreshed successfully", "map": map_data}
        else:
            logger.warning("Map refresh completed but no data available")
            return {"status": "no_map", "message": "Map refresh completed but no data available"}

    except Exception as e:
        logger.error(f"Map refresh error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Map refresh failed: {str(e)}")


@app.post("/api/map/save")
async def save_current_map_to_list(request: Request):
    """Save current ROS map to managed maps list"""
    logger.info("🗺️ [API] Save current map to list requested")

    ros_bridge = get_ros_bridge()
    if not ros_bridge:
        logger.warning("🗺️ [API] ROS bridge not available for save")
        raise HTTPException(status_code=503, detail="ROS bridge not available")

    try:
        body = await request.json() if hasattr(request, 'json') else {}
        map_name = body.get("name", "") if isinstance(body, dict) else ""
        
        if not map_name:
            map_name = f"Map_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        # Get current map data from ROS
        map_data = ros_bridge.get_latest_data('map')
        if not map_data:
            raise HTTPException(status_code=404, detail="No current map data available from ROS")

        # Save map files to ros1_maps directory
        save_dir = Path("data/ros1_maps")
        save_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_filename = f"{map_name}_{timestamp}"
        
        # Save using ROS map_saver (creates .yaml and .pgm files)
        file_path = save_dir / base_filename
        ros_files = ros_bridge.save_map(str(file_path))
        
        # Create ROS1SavedMap entry
        new_map = ROS1SavedMap(
            id=str(uuid.uuid4()),
            name=map_name,
            elements=[],  # ROS maps don't have drawn elements
            width=map_data.get('width', 0),
            height=map_data.get('height', 0),
            resolution=map_data.get('resolution', 0.1),
            created=datetime.now().isoformat(),
            modified=datetime.now().isoformat()
        )
        
        # Add metadata about the saved files
        new_map.ros_files = {
            "yaml_file": f"{base_filename}.yaml",
            "pgm_file": f"{base_filename}.pgm",
            "full_path": str(file_path)
        }
        
        # Load existing maps and add new one
        maps = load_ros1_saved_maps()
        maps.append(new_map)
        save_ros1_maps_to_file(maps)
        
        logger.info(f"🗺️ [API] Map '{map_name}' saved to managed list with ID: {new_map.id}")
        
        return {
            "status": "success",
            "message": f"Map '{map_name}' saved to maps list successfully",
            "map": new_map.dict(),
            "files": ros_files
        }
        
    except Exception as e:
        logger.error(f"🗺️ [API] Error saving current map to list: {e}")
        raise HTTPException(status_code=500, detail=f"Map save failed: {str(e)}")

# ============================================================================
# ROS1 SAVED MAPS MANAGEMENT ENDPOINTS
# ============================================================================

# ROS1 Maps data models
from pydantic import BaseModel
import uuid
import json

class ROS1MapElement(BaseModel):
    id: str
    type: str  # 'line', 'rectangle', 'circle'
    x: float
    y: float
    width: Optional[float] = None
    height: Optional[float] = None
    radius: Optional[float] = None
    x2: Optional[float] = None
    y2: Optional[float] = None
    color: str
    selected: bool = False


class ROS1Waypoint(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    x: float
    y: float
    z: float = 0.0
    yaw: float = 0.0


class ROS1Path(BaseModel):
    id: str
    name: str
    type: str  # 'direct', 'winding'
    waypoint_ids: List[str]
    intermediate_points: Optional[List[Dict[str, float]]] = None
    description: Optional[str] = None


class ROS1SavedMap(BaseModel):
    id: str
    name: str
    elements: List[ROS1MapElement]
    width: int
    height: int
    resolution: float  # meters per pixel
    created: str
    modified: str
    ros_files: Optional[Dict[str, Any]] = None  # Store info about .yaml and .pgm files
    waypoints: List[ROS1Waypoint] = []
    paths: List[ROS1Path] = []


class SmoothRegionRequest(BaseModel):
    x: int
    y: int
    width: int
    height: int
    kernel_size: Optional[int] = 5
    quantize: Optional[bool] = True
    points: Optional[List[Dict[str, float]]] = None

class MaskRegionRequest(BaseModel):
    x: int
    y: int
    width: int
    height: int
    value: Optional[int] = 0  # 0 = occupied (black)
    points: Optional[List[Dict[str, float]]] = None

# ROS1 Maps storage paths
ROS1_MAPS_DIR = WORKSPACE_ROOT / "data" / "ros1_maps"
ROS1_MAPS_DIR.mkdir(parents=True, exist_ok=True)
ROS1_MAPS_FILE = ROS1_MAPS_DIR / "saved_maps.json"
ACTIVE_MAP_FILE = ROS1_MAPS_DIR / "active_map.json"
AMR_MASTER_MAPS_DIR = WORKSPACE_ROOT / "amr_master" / "maps"


def load_pgm_image(pgm_path: Path) -> Tuple[np.ndarray, int, int, int]:
    """Load a binary PGM image into a numpy array."""
    with open(pgm_path, 'rb') as pgm_file:
        magic_number = pgm_file.readline().strip()
        if magic_number != b'P5':
            raise ValueError(f"Unsupported PGM format in {pgm_path}")

        header_values: List[bytes] = []
        while len(header_values) < 3:
            line = pgm_file.readline()
            if not line:
                raise ValueError(f"Incomplete PGM header in {pgm_path}")
            if line.startswith(b'#'):
                continue
            header_values.extend(line.split())

        width = int(header_values[0])
        height = int(header_values[1])
        max_value = int(header_values[2])

        data = np.fromfile(pgm_file, dtype=np.uint8, count=width * height)
        if data.size != width * height:
            raise ValueError(f"PGM data size mismatch in {pgm_path}")

        image = data.reshape((height, width))
        return image, width, height, max_value


def save_pgm_image(pgm_path: Path, image: np.ndarray, max_value: int = 255) -> None:
    """Persist a numpy array as binary PGM file."""
    image_uint8 = np.clip(image, 0, max_value).astype(np.uint8)
    height, width = image_uint8.shape

    with open(pgm_path, 'wb') as pgm_file:
        pgm_file.write(b'P5\n')
        pgm_file.write(b'# Generated by web interface\n')
        pgm_file.write(f"{width} {height}\n".encode())
        pgm_file.write(f"{max_value}\n".encode())
        image_uint8.tofile(pgm_file)

def load_ros1_saved_maps() -> List[ROS1SavedMap]:
    """Load saved maps from ROS1 storage"""
    try:
        if ROS1_MAPS_FILE.exists():
            with open(ROS1_MAPS_FILE, 'r') as f:
                data = json.load(f)
                return [ROS1SavedMap(**map_data) for map_data in data]
        return []
    except Exception as e:
        logger.error(f"Error loading ROS1 saved maps: {e}")
        return []

def save_ros1_maps_to_file(maps: List[ROS1SavedMap]):
    """Save ROS1 maps to file"""
    try:
        with open(ROS1_MAPS_FILE, 'w') as f:
            json.dump([map_data.dict() for map_data in maps], f, indent=2)
        logger.info(f"Saved {len(maps)} ROS1 maps to {ROS1_MAPS_FILE}")
    except Exception as e:
        logger.error(f"Error saving ROS1 maps to file: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save ROS1 maps: {str(e)}")


NAVIGATION_LAUNCH_FILE = WORKSPACE_ROOT / "amr_master" / "launch" / "amr_navigation.launch"
ROS_RESTART_COMMAND = os.environ.get("AMR_ROS_RESTART_CMD")


def parse_polygon(points: Optional[List[Dict[str, float]]]) -> Optional[List[Tuple[float, float]]]:
    if not points:
        return None
    polygon: List[Tuple[float, float]] = []
    for point in points:
        try:
            polygon.append((float(point['x']), float(point['y'])))
        except (KeyError, TypeError, ValueError):
            continue
    if len(polygon) < 3:
        return None
    return polygon


def polygon_bounds(polygon: List[Tuple[float, float]]) -> Tuple[float, float, float, float]:
    xs = [p[0] for p in polygon]
    ys = [p[1] for p in polygon]
    return min(xs), min(ys), max(xs), max(ys)


def point_in_polygon(x: float, y: float, polygon: List[Tuple[float, float]]) -> bool:
    inside = False
    n = len(polygon)
    for i in range(n):
        x1, y1 = polygon[i]
        x2, y2 = polygon[(i + 1) % n]
        if ((y1 > y) != (y2 > y)):
            slope = (x2 - x1) / (y2 - y1) if (y2 - y1) != 0 else float('inf')
            x_intersect = slope * (y - y1) + x1
            if x < x_intersect:
                inside = not inside
    return inside


def compute_region_limits(
    map_width: int,
    map_height: int,
    base_x: int,
    base_y: int,
    base_width: int,
    base_height: int,
    polygon: Optional[List[Tuple[float, float]]]
) -> Tuple[int, int, int, int, Optional[List[Tuple[float, float]]]]:
    if polygon:
        min_x, min_y, max_x, max_y = polygon_bounds(polygon)
    else:
        min_x, min_y = base_x, base_y
        max_x = base_x + base_width
        max_y = base_y + base_height

    x_min = max(0, int(math.floor(min_x)))
    y_min = max(0, int(math.floor(min_y)))
    x_max = min(map_width - 1, int(math.ceil(max_x)))
    y_max = min(map_height - 1, int(math.ceil(max_y)))

    if x_min > x_max or y_min > y_max:
        raise HTTPException(status_code=400, detail="Selection area is outside the map bounds")

    return x_min, y_min, x_max, y_max, polygon


def update_navigation_launch(map_filename: str) -> bool:
    """Update amr_navigation.launch to reference the deployed map."""
    if not NAVIGATION_LAUNCH_FILE.exists():
        logger.warning("Navigation launch file not found at %s", NAVIGATION_LAUNCH_FILE)
        return False

    try:
        launch_content = NAVIGATION_LAUNCH_FILE.read_text()
    except Exception as read_error:
        logger.error("Failed to read navigation launch file: %s", read_error)
        return False

    desired_value = f"$(find amr_master)/maps/{map_filename}"
    pattern = r'(<arg\s+name="map_file"\s+default=")([^"]+)(")'
    updated_content, replacements = re.subn(pattern, r'\1' + desired_value + r'\3', launch_content, count=1)

    if replacements == 0:
        logger.warning("Could not locate map_file argument in %s", NAVIGATION_LAUNCH_FILE)
        return False

    if updated_content == launch_content:
        logger.info("Navigation launch file already points to %s", desired_value)
        return True

    try:
        NAVIGATION_LAUNCH_FILE.write_text(updated_content)
        logger.info("Updated navigation launch file to use %s", map_filename)
        return True
    except Exception as write_error:
        logger.error("Failed to update navigation launch file: %s", write_error)
        return False


def restart_ros_service() -> Dict[str, Any]:
    """Restart ROS navigation service if configured via environment variable."""
    if not ROS_RESTART_COMMAND:
        logger.warning("ROS restart command not configured (AMR_ROS_RESTART_CMD)")
        return {"enabled": False, "reason": "AMR_ROS_RESTART_CMD not configured"}

    logger.info(f"Executing ROS restart: {ROS_RESTART_COMMAND}")
    start_time = datetime.now()

    try:
        completed = subprocess.run(
            ROS_RESTART_COMMAND,
            shell=True,
            check=True,
            capture_output=True,
            text=True,
            timeout=30
        )

        duration = (datetime.now() - start_time).total_seconds()
        logger.info(f"ROS service restarted successfully (return code {completed.returncode}, {duration:.1f}s)")

        if completed.stderr.strip():
            logger.warning(f"Restart stderr: {completed.stderr.strip()}")

        return {
            "enabled": True,
            "command": ROS_RESTART_COMMAND,
            "returncode": completed.returncode,
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
            "duration_seconds": duration,
            "success": True
        }

    except subprocess.TimeoutExpired:
        duration = (datetime.now() - start_time).total_seconds()
        logger.error(f"ROS restart timeout after {duration:.1f}s")
        return {
            "enabled": True,
            "error": "Timeout after 30 seconds",
            "duration_seconds": duration,
            "success": False
        }

    except subprocess.CalledProcessError as exc:
        duration = (datetime.now() - start_time).total_seconds()
        logger.error(f"ROS restart failed (code {exc.returncode}): {exc.stderr}")
        return {
            "enabled": True,
            "returncode": exc.returncode,
            "error": exc.stderr.strip() if exc.stderr else str(exc),
            "duration_seconds": duration,
            "success": False
        }

    except Exception as exc:
        duration = (datetime.now() - start_time).total_seconds()
        logger.error(f"ROS restart error: {exc}")
        return {
            "enabled": True,
            "error": str(exc),
            "duration_seconds": duration,
            "success": False
        }



@app.get("/api/maps/{map_id}/image")
async def get_ros1_map_image(map_id: str):
    """Return the raw grayscale data of a ROS-sourced map."""
    try:
        maps = load_ros1_saved_maps()
        map_index = next((i for i, m in enumerate(maps) if m.id == map_id), None)
        map_data = maps[map_index] if map_index is not None else None

        if map_data is None:
            raise HTTPException(status_code=404, detail="Map not found")

        if not map_data.ros_files or not map_data.ros_files.get('pgm_file'):
            raise HTTPException(status_code=400, detail="Map does not contain ROS raster data")

        pgm_path = ROS1_MAPS_DIR / map_data.ros_files['pgm_file']
        if not pgm_path.exists():
            raise HTTPException(status_code=404, detail=f"PGM file not found: {pgm_path}")

        image, width, height, max_value = load_pgm_image(pgm_path)
        encoded = base64.b64encode(image.tobytes()).decode()

        return {
            "status": "success",
            "image": {
                "width": width,
                "height": height,
                "max_value": max_value,
                "data": encoded
            },
            "map": map_data.dict()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching ROS map image for {map_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/maps")
async def get_ros1_saved_maps():
    """Get all saved ROS1 maps"""
    try:
        maps = load_ros1_saved_maps()
        logger.info(f"Retrieved {len(maps)} saved ROS1 maps")
        return {
            "status": "success", 
            "maps": [m.dict() for m in maps],
            "count": len(maps)
        }
    except Exception as e:
        logger.error(f"Error retrieving ROS1 maps: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/maps")
async def save_ros1_map(map_data: ROS1SavedMap):
    """Save a new ROS1 map or update existing one"""
    try:
        maps = load_ros1_saved_maps()

        # Check if map exists (update) or create new
        existing_index = next((i for i, m in enumerate(maps) if m.id == map_data.id), None)

        if existing_index is not None:
            # Update existing map while preserving immutable metadata
            existing_map = maps[existing_index]
            map_data.id = existing_map.id
            map_data.created = existing_map.created
            if map_data.ros_files is None:
                map_data.ros_files = existing_map.ros_files
            map_data.modified = datetime.now().isoformat()

            maps[existing_index] = map_data
            logger.info(f"Updated existing ROS1 map: {map_data.name} (ID: {map_data.id})")
        else:
            # Add new map
            if not map_data.id:
                map_data.id = str(uuid.uuid4())
            now_iso = datetime.now().isoformat()
            map_data.created = map_data.created or now_iso
            map_data.modified = now_iso
            maps.append(map_data)
            logger.info(f"Saved new ROS1 map: {map_data.name} (ID: {map_data.id})")

        # Save to file
        save_ros1_maps_to_file(maps)

        return map_data.dict()

    except Exception as e:
        logger.error(f"Error saving ROS1 map: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/maps/{map_id}")
async def update_ros1_map(map_id: str, map_data: ROS1SavedMap):
    """Update an existing ROS1 map"""
    try:
        maps = load_ros1_saved_maps()
        
        # Find existing map
        existing_index = next((i for i, m in enumerate(maps) if m.id == map_id), None)
        
        if existing_index is None:
            raise HTTPException(status_code=404, detail="Map not found")
        
        # Keep original created time, update modified time
        original_created = maps[existing_index].created
        map_data.id = map_id  # Ensure ID matches
        map_data.created = original_created
        map_data.modified = datetime.now().isoformat()
        
        # Update existing map
        maps[existing_index] = map_data
        
        # Save to file
        save_ros1_maps_to_file(maps)
        
        logger.info(f"Updated ROS1 map: {map_data.name} (ID: {map_id})")
        return map_data.dict()
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating ROS1 map {map_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/maps/{map_id}")
async def get_ros1_map(map_id: str):
    """Get a specific ROS1 map by ID"""
    try:
        if map_id == "active":
            return await get_active_map_info()

        maps = load_ros1_saved_maps()
        map_data = next((m for m in maps if m.id == map_id), None)
        
        if not map_data:
            raise HTTPException(status_code=404, detail="ROS1 map not found")
        
        logger.info(f"Retrieved ROS1 map: {map_data.name} (ID: {map_id})")
        return map_data.dict()
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving ROS1 map {map_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/maps/{map_id}")
async def delete_ros1_map(map_id: str):
    """Delete a ROS1 map"""
    try:
        if map_id == "active":
            raise HTTPException(status_code=400, detail="Cannot delete active map via this endpoint")

        maps = load_ros1_saved_maps()
        map_data = next((m for m in maps if m.id == map_id), None)
        
        if not map_data:
            raise HTTPException(status_code=404, detail="ROS1 map not found")
        
        # Remove exported files if they exist
        if hasattr(map_data, 'ros_files') and map_data.ros_files:
            ros_files = map_data.ros_files
            # Remove .yaml file
            if ros_files.get('yaml_file'):
                yaml_path = Path("data/ros1_maps") / ros_files['yaml_file']
                if yaml_path.exists():
                    yaml_path.unlink()
                    logger.info(f"Deleted yaml file: {yaml_path}")
            
            # Remove .pgm file  
            if ros_files.get('pgm_file'):
                pgm_path = Path("data/ros1_maps") / ros_files['pgm_file']
                if pgm_path.exists():
                    pgm_path.unlink()
                    logger.info(f"Deleted pgm file: {pgm_path}")
                    
            # Remove any .png file with same base name
            if ros_files.get('yaml_file'):
                base_name = ros_files['yaml_file'].replace('.yaml', '')
                png_path = Path("data/ros1_maps") / f"{base_name}.png"
                if png_path.exists():
                    png_path.unlink()
                    logger.info(f"Deleted png file: {png_path}")
        
        # Remove from list
        maps = [m for m in maps if m.id != map_id]
        save_ros1_maps_to_file(maps)
        
        logger.info(f"Deleted ROS1 map: {map_data.name} (ID: {map_id})")
        return {"status": "success", "message": "ROS1 map deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting ROS1 map {map_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/maps/{map_id}/deploy")
async def deploy_map_to_ros(map_id: str):
    """Deploy a saved map to become the active ROS navigation map"""
    logger.info(f"🚀 [API] Deploy map requested for ID: {map_id}")
    
    try:
        # Load the map from saved list
        maps = load_ros1_saved_maps()
        map_index = next((i for i, m in enumerate(maps) if m.id == map_id), None)
        map_data = maps[map_index] if map_index is not None else None
        
        if map_data is None:
            raise HTTPException(status_code=404, detail="Map not found")
        
        if not map_data.ros_files:
            raise HTTPException(status_code=400, detail="Map does not have ROS files to deploy")
        
        # Paths for deployment
        source_yaml = ROS1_MAPS_DIR / map_data.ros_files["yaml_file"]
        source_pgm = ROS1_MAPS_DIR / map_data.ros_files["pgm_file"]

        # Target paths (what ROS navigation uses)
        target_dir = AMR_MASTER_MAPS_DIR
        target_dir.mkdir(parents=True, exist_ok=True)
        target_yaml = target_dir / map_data.ros_files["yaml_file"]
        target_pgm = target_dir / map_data.ros_files["pgm_file"]
        
        # Check if source files exist
        if not source_yaml.exists():
            raise HTTPException(status_code=404, detail=f"Source YAML file not found: {source_yaml}")
        if not source_pgm.exists():
            raise HTTPException(status_code=404, detail=f"Source PGM file not found: {source_pgm}")
        
        # Backup current active map (copy, do not remove original until overwrite succeeds)
        import shutil

        if target_yaml.exists():
            target_yaml.unlink()
        if target_pgm.exists():
            target_pgm.unlink()

        shutil.copy2(source_yaml, target_yaml)
        shutil.copy2(source_pgm, target_pgm)
        
        now_iso = datetime.now().isoformat()
        map_data.modified = now_iso
        if map_data.ros_files is None:
            map_data.ros_files = {}
        map_data.ros_files['deployed_at'] = now_iso
        map_data.ros_files['deployed_yaml'] = map_data.ros_files["yaml_file"]
        map_data.ros_files['deployed_pgm'] = map_data.ros_files["pgm_file"]
        maps[map_index] = map_data
        save_ros1_maps_to_file(maps)

        active_record = {
            "id": map_data.id,
            "name": map_data.name,
            "deployed_at": now_iso,
            "yaml_file": map_data.ros_files["yaml_file"],
            "pgm_file": map_data.ros_files["pgm_file"],
            "yaml_path": str(target_yaml.resolve()),
            "pgm_path": str(target_pgm.resolve()),
            "launch_file": str(NAVIGATION_LAUNCH_FILE.resolve())
        }

        launch_updated = update_navigation_launch(map_data.ros_files["yaml_file"])
        active_record["launch_updated"] = launch_updated

        try:
            with open(ACTIVE_MAP_FILE, 'w') as f:
                json.dump(active_record, f, indent=2)
        except Exception as write_error:
            logger.warning(f"🚀 [API] Could not persist active map metadata: {write_error}")

        logger.info(f"Deploying map '{map_data.name}' - restarting ROS service...")
        service_restart_info = restart_ros_service()

        if service_restart_info.get("success"):
            logger.info(f"ROS service restarted successfully in {service_restart_info.get('duration_seconds', 0):.1f}s")
        else:
            logger.error(f"ROS restart failed: {service_restart_info.get('error', 'Unknown error')}")

        logger.info(f"Map '{map_data.name}' deployed successfully")

        return {
            "status": "success",
            "message": f"Map '{map_data.name}' deployed successfully",
            "deployed_map": {
                "id": map_data.id,
                "name": map_data.name,
                "deployed_at": now_iso
            },
            "files": {
                "yaml": str(target_yaml.resolve()),
                "pgm": str(target_pgm.resolve())
            },
            "launch_updated": launch_updated,
            "service_restart": service_restart_info
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"🚀 [API] Error deploying map {map_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Map deployment failed: {str(e)}")


@app.post("/api/maps/{map_id}/smooth")
async def smooth_ros_map_region(map_id: str, request: SmoothRegionRequest):
    """Apply a simple smoothing filter to a selected area of a ROS-sourced map."""
    logger.info(
        "🧹 [API] Smooth map region requested for %s (x=%s, y=%s, w=%s, h=%s, kernel=%s)",
        map_id,
        request.x,
        request.y,
        request.width,
        request.height,
        request.kernel_size,
    )

    try:
        maps = load_ros1_saved_maps()
        map_index = next((i for i, m in enumerate(maps) if m.id == map_id), None)
        if map_index is None:
            raise HTTPException(status_code=404, detail="Map not found")

        map_data = maps[map_index]
        if not map_data.ros_files or not map_data.ros_files.get('pgm_file'):
            raise HTTPException(status_code=400, detail="Map does not contain ROS raster data")

        pgm_path = ROS1_MAPS_DIR / map_data.ros_files['pgm_file']
        if not pgm_path.exists():
            raise HTTPException(status_code=404, detail=f"PGM file not found: {pgm_path}")

        image, width, height, max_value = load_pgm_image(pgm_path)

        if request.width <= 0 or request.height <= 0:
            raise HTTPException(status_code=400, detail="Selection dimensions must be positive")

        polygon = parse_polygon(request.points)
        x_min, y_min, x_max, y_max, polygon = compute_region_limits(
            width,
            height,
            request.x,
            request.y,
            request.width,
            request.height,
            polygon
        )

        kernel_size = request.kernel_size or 5
        if kernel_size < 3:
            kernel_size = 3
        if kernel_size % 2 == 0:
            kernel_size += 1

        radius = kernel_size // 2
        source_image = image.copy().astype(np.float32)

        for y in range(y_min, y_max + 1):
            for x in range(x_min, x_max + 1):
                if polygon and not point_in_polygon(x + 0.5, y + 0.5, polygon):
                    continue

                y0 = max(0, y - radius)
                y1 = min(height - 1, y + radius)
                x0 = max(0, x - radius)
                x1 = min(width - 1, x + radius)

                window = source_image[y0:y1 + 1, x0:x1 + 1]
                smoothed_value = np.mean(window)

                if request.quantize:
                    if smoothed_value < 85:
                        smoothed_value = 0
                    elif smoothed_value > 170:
                        smoothed_value = 254
                    else:
                        smoothed_value = 205

                clamped_value = int(np.clip(smoothed_value, 0, max_value))
                image[y, x] = clamped_value

        save_pgm_image(pgm_path, image, max_value)

        now_iso = datetime.now().isoformat()
        map_data.modified = now_iso
        if map_data.ros_files is None:
            map_data.ros_files = {}
        map_data.ros_files['processed_at'] = now_iso
        maps[map_index] = map_data
        save_ros1_maps_to_file(maps)

        encoded = base64.b64encode(image.tobytes()).decode()

        logger.info(
            "🧹 [API] Smoothed map %s region bounds (%s,%s)→(%s,%s)%s",
            map_id,
            x_min,
            y_min,
            x_max,
            y_max,
            " (polygon)" if polygon else ""
        )

        return {
            "status": "success",
            "message": "Selected region smoothed successfully",
            "map": map_data.dict(),
            "image": {
                "width": width,
                "height": height,
                "max_value": max_value,
                "data": encoded
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error smoothing ROS map {map_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/maps/{map_id}/mask")
async def mask_ros_map_region(map_id: str, request: MaskRegionRequest):
    """Fill a selected area of a ROS-sourced map with a specific occupancy value."""
    logger.info(
        "⬛ [API] Mask map region requested for %s (x=%s, y=%s, w=%s, h=%s, value=%s)",
        map_id,
        request.x,
        request.y,
        request.width,
        request.height,
        request.value,
    )

    try:
        maps = load_ros1_saved_maps()
        map_index = next((i for i, m in enumerate(maps) if m.id == map_id), None)
        if map_index is None:
            raise HTTPException(status_code=404, detail="Map not found")

        map_data = maps[map_index]
        if not map_data.ros_files or not map_data.ros_files.get('pgm_file'):
            raise HTTPException(status_code=400, detail="Map does not contain ROS raster data")

        pgm_path = ROS1_MAPS_DIR / map_data.ros_files['pgm_file']
        if not pgm_path.exists():
            raise HTTPException(status_code=404, detail=f"PGM file not found: {pgm_path}")

        image, width, height, max_value = load_pgm_image(pgm_path)

        if request.width <= 0 or request.height <= 0:
            raise HTTPException(status_code=400, detail="Selection dimensions must be positive")

        polygon = parse_polygon(request.points)
        x_min, y_min, x_max, y_max, polygon = compute_region_limits(
            width,
            height,
            request.x,
            request.y,
            request.width,
            request.height,
            polygon
        )

        fill_value = int(request.value or 0)
        fill_value = max(0, min(max_value, fill_value))

        for y in range(y_min, y_max + 1):
            for x in range(x_min, x_max + 1):
                if polygon and not point_in_polygon(x + 0.5, y + 0.5, polygon):
                    continue
                image[y, x] = fill_value

        save_pgm_image(pgm_path, image, max_value)

        now_iso = datetime.now().isoformat()
        map_data.modified = now_iso
        if map_data.ros_files is None:
            map_data.ros_files = {}
        map_data.ros_files['processed_at'] = now_iso
        maps[map_index] = map_data
        save_ros1_maps_to_file(maps)

        encoded = base64.b64encode(image.tobytes()).decode()

        logger.info(
            "⬛ [API] Masked map %s region bounds (%s,%s)→(%s,%s)%s with value %s",
            map_id,
            x_min,
            y_min,
            x_max,
            y_max,
            " (polygon)" if polygon else "",
            fill_value
        )

        return {
            "status": "success",
            "message": "Selected region masked successfully",
            "map": map_data.dict(),
            "image": {
                "width": width,
                "height": height,
                "max_value": max_value,
                "data": encoded
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error masking ROS map {map_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/maps/active")
async def get_active_map_info():
    """Get information about the currently active ROS navigation map"""
    try:
        active_metadata = None
        if ACTIVE_MAP_FILE.exists():
            try:
                with open(ACTIVE_MAP_FILE, 'r') as f:
                    active_metadata = json.load(f)
            except Exception as metadata_error:
                logger.warning(f"Error reading active map metadata: {metadata_error}")

        yaml_path: Optional[Path] = None
        pgm_path: Optional[Path] = None

        if active_metadata:
            yaml_entry = active_metadata.get('yaml_path') or active_metadata.get('yaml_file')
            if yaml_entry:
                candidate = Path(yaml_entry)
                if not candidate.is_absolute():
                    candidate = (AMR_MASTER_MAPS_DIR / candidate).resolve()
                yaml_path = candidate

            pgm_entry = active_metadata.get('pgm_path') or active_metadata.get('pgm_file')
            if pgm_entry:
                candidate = Path(pgm_entry)
                if not candidate.is_absolute():
                    candidate = (AMR_MASTER_MAPS_DIR / candidate).resolve()
                pgm_path = candidate

        if yaml_path is None:
            fallback_yaml = AMR_MASTER_MAPS_DIR / "pnc.yaml"
            if fallback_yaml.exists():
                yaml_path = fallback_yaml
            else:
                return {
                    "status": "no_active_map",
                    "message": "No active navigation map found"
                }

        if not yaml_path.exists():
            return {
                "status": "no_active_map",
                "message": "No active navigation map found"
            }

        if pgm_path is None:
            fallback_pgm = AMR_MASTER_MAPS_DIR / "pnc.pgm"
            if fallback_pgm.exists():
                pgm_path = fallback_pgm

        yaml_stat = yaml_path.stat()
        pgm_stat = pgm_path.stat() if pgm_path and pgm_path.exists() else None

        saved_map_payload = None
        if active_metadata and active_metadata.get('id'):
            maps = load_ros1_saved_maps()
            active_saved = next((m for m in maps if m.id == active_metadata['id']), None)
            if active_saved:
                saved_map_payload = active_saved.dict()

        metadata_payload = active_metadata or {}
        metadata_payload.setdefault('yaml_path', str(yaml_path.resolve()))
        if pgm_path:
            metadata_payload.setdefault('pgm_path', str(pgm_path.resolve()))

        response_payload = {
            "status": "active_map_found",
            "active_map": {
                "yaml_file": str(yaml_path.resolve()),
                "pgm_file": str(pgm_path.resolve()) if pgm_path and pgm_path.exists() else None,
                "yaml_modified": datetime.fromtimestamp(yaml_stat.st_mtime).isoformat(),
                "pgm_modified": datetime.fromtimestamp(pgm_stat.st_mtime).isoformat() if pgm_stat else None,
                "yaml_size": yaml_stat.st_size,
                "pgm_size": pgm_stat.st_size if pgm_stat else None,
                "metadata": metadata_payload,
                "saved_map": saved_map_payload
            }
        }

        return response_payload
        
    except Exception as e:
        logger.error(f"Error getting active map info: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/maps/stats")
async def get_ros1_maps_stats():
    """Get statistics about saved ROS1 maps"""
    try:
        maps = load_ros1_saved_maps()
        
        stats = {
            "total_maps": len(maps),
            "total_elements": sum(len(m.elements) for m in maps),
            "maps_by_type": {},
            "average_elements_per_map": 0,
            "storage_info": {
                "maps_file_size": ROS1_MAPS_FILE.stat().st_size if ROS1_MAPS_FILE.exists() else 0,
                "storage_path": str(ROS1_MAPS_DIR)
            }
        }
        
        if maps:
            stats["average_elements_per_map"] = stats["total_elements"] / len(maps)
            
            # Count elements by type
            for map_data in maps:
                for element in map_data.elements:
                    element_type = element.type
                    stats["maps_by_type"][element_type] = stats["maps_by_type"].get(element_type, 0) + 1
        
        return stats
        
    except Exception as e:
        logger.error(f"Error getting ROS1 maps stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/maps/{map_id}/export")
async def export_drawn_map_to_ros_files(map_id: str):
    """Export a drawn map to ROS .pgm and .yaml files"""
    logger.info(f"🎨 [API] Export drawn map to ROS files requested for ID: {map_id}")
    
    try:
        # Load the map from saved list
        maps = load_ros1_saved_maps()
        map_data = next((m for m in maps if m.id == map_id), None)
        
        if not map_data:
            raise HTTPException(status_code=404, detail="Map not found")
        
        if map_data.ros_files:
            logger.info(f"🎨 [API] Map {map_id} already has ROS files")
            return {
                "status": "already_exported",
                "message": "Map already has ROS files",
                "files": map_data.ros_files
            }
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_filename = f"{map_data.name.replace(' ', '_')}_{timestamp}"
        
        # Create occupancy grid from drawn elements
        width = map_data.width
        height = map_data.height
        resolution = map_data.resolution
        
        # Create empty grid (0 = free, 100 = occupied, -1 = unknown)
        grid = np.zeros((height, width), dtype=np.int8)
        
        # Convert drawn elements to occupancy grid
        for element in map_data.elements:
            if element.type == 'line' and element.x2 is not None and element.y2 is not None:
                # Draw line as occupied
                x0, y0 = int(element.x), int(element.y)
                x1, y1 = int(element.x2), int(element.y2)
                
                # Simple line drawing using Bresenham's algorithm
                points = get_line_points_simple(x0, y0, x1, y1)
                for px, py in points:
                    if 0 <= px < width and 0 <= py < height:
                        # Make line thick (3 pixels)
                        for dx in range(-2, 3):
                            for dy in range(-2, 3):
                                nx, ny = px + dx, py + dy
                                if 0 <= nx < width and 0 <= ny < height:
                                    grid[ny, nx] = 100  # Occupied
                                    
            elif element.type == 'rectangle' and element.width and element.height:
                # Draw rectangle as occupied
                x, y = int(element.x), int(element.y)
                w, h = int(element.width), int(element.height)
                
                # Fill rectangle
                for py in range(max(0, y), min(height, y + h)):
                    for px in range(max(0, x), min(width, x + w)):
                        grid[py, px] = 100  # Occupied
                        
            elif element.type == 'circle' and element.radius:
                # Draw circle as occupied
                cx, cy = int(element.x), int(element.y)
                r = int(element.radius)
                
                # Fill circle
                for py in range(max(0, cy - r), min(height, cy + r + 1)):
                    for px in range(max(0, cx - r), min(width, cx + r + 1)):
                        if (px - cx) ** 2 + (py - cy) ** 2 <= r ** 2:
                            grid[py, px] = 100  # Occupied
        
        # Save PGM file (Portable GrayMap)
        pgm_file = ROS1_MAPS_DIR / f"{base_filename}.pgm"
        with open(pgm_file, 'wb') as f:
            # PGM header
            f.write(f"P5\n".encode())
            f.write(f"# Created by web interface\n".encode())
            f.write(f"{width} {height}\n".encode())
            f.write(f"255\n".encode())
            
            # Convert occupancy grid to PGM format
            # 0 (free) -> 254 (white), 100 (occupied) -> 0 (black), -1 (unknown) -> 205 (gray)
            pgm_data = np.zeros((height, width), dtype=np.uint8)
            for y in range(height):
                for x in range(width):
                    if grid[y, x] == 0:  # Free
                        pgm_data[y, x] = 254  # White
                    elif grid[y, x] == 100:  # Occupied
                        pgm_data[y, x] = 0   # Black
                    else:  # Unknown
                        pgm_data[y, x] = 205  # Gray
            
            # Flip Y axis for ROS coordinate system
            pgm_data = np.flipud(pgm_data)
            f.write(pgm_data.tobytes())
        
        # Create YAML file
        yaml_file = ROS1_MAPS_DIR / f"{base_filename}.yaml"
        
        # Calculate origin (bottom-left corner in ROS coordinate system)
        origin_x = -width * resolution / 2
        origin_y = -height * resolution / 2
        
        yaml_content = f"""image: {base_filename}.pgm
        resolution: {resolution}
        origin: [{origin_x}, {origin_y}, 0.0]
        negate: 0
        occupied_thresh: 0.65
        free_thresh: 0.196
        """
        
        with open(yaml_file, 'w') as f:
            f.write(yaml_content)
        
        # Update map data with ROS files info
        ros_files_info = {
            "yaml_file": f"{base_filename}.yaml",
            "pgm_file": f"{base_filename}.pgm",
            "full_path": str(ROS1_MAPS_DIR / base_filename),
            "exported_at": datetime.now().isoformat()
        }
        
        # Update the map in the list
        for i, m in enumerate(maps):
            if m.id == map_id:
                maps[i].ros_files = ros_files_info
                maps[i].modified = datetime.now().isoformat()
                break
        
        save_ros1_maps_to_file(maps)
        
        logger.info(f"🎨 [API] Successfully exported map '{map_data.name}' to ROS files")
        
        return {
            "status": "success",
            "message": f"Map '{map_data.name}' exported to ROS files successfully",
            "files": ros_files_info
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"🎨 [API] Error exporting map {map_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Map export failed: {str(e)}")

def get_line_points_simple(x0: int, y0: int, x1: int, y1: int) -> list:
    """Simple Bresenham's line algorithm"""
    points = []
    dx = abs(x1 - x0)
    dy = abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx - dy
    
    x, y = x0, y0
    
    while True:
        points.append((x, y))
        
        if x == x1 and y == y1:
            break
            
        e2 = 2 * err
        if e2 > -dy:
            err -= dy
            x += sx
        if e2 < dx:
            err += dx
            y += sy
    
    return points
