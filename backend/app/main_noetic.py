#!/usr/bin/env python3

"""
FastAPI Backend for Indoor Autonomous Vehicle - ROS Noetic Version
Web interface backend that connects to ROS Noetic instead of ROS2
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
    title="Indoor Autonomous Vehicle API - ROS Noetic",
    description="Web interface backend for indoor autonomous vehicle using ROS Noetic",
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
app.include_router(waypoints_router, prefix="/api", tags=["waypoints"])
app.include_router(tasks_router, prefix="/api", tags=["tasks"])

# Serve static files (React frontend)
frontend_path = Path(__file__).parent.parent.parent / "frontend" / "build"
if frontend_path.exists() and (frontend_path / "static").exists():
    app.mount("/static", StaticFiles(directory=str(frontend_path / "static")), name="static")

@app.on_event("startup")
async def startup_event():
    """Initialize ROS Noetic bridge on startup"""
    try:
        logger.info("Initializing ROS Noetic bridge...")
        
        # Check if ROS Noetic environment is available
        try:
            import rospy
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

        # Register WebSocket callbacks for real-time data

        logger.info("ROS Noetic bridge initialized successfully")

        # Initialize and start system monitor
        system_monitor = init_system_monitor(websocket_manager)
        await system_monitor.start()
        logger.info("System monitor started")

    except Exception as e:
        logger.error(f"Failed to initialize ROS Noetic bridge: {str(e)}")
        logger.warning("Backend will run in limited mode without ROS connection")

@app.on_event("shutdown")
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
    logger.info("🗺️ [API] Map data requested")

    ros_bridge = get_ros_bridge()
    if not ros_bridge:
        logger.warning("🗺️ [API] ROS bridge not available")
        return {
            "status": "no_map",
            "message": "ROS bridge not available",
            "timestamp": None
        }

    # Get map data from ROS bridge
    map_data = ros_bridge.get_latest_data('map')
    logger.info(f"🗺️ [API] Map data from bridge: {map_data is not None}")

    if map_data:
        logger.info(f"🗺️ [API] Returning map data: {map_data.get('width', 'unknown')}x{map_data.get('height', 'unknown')}")
        # Return in the exact format expected by frontend
        return {"map": map_data, "status": "success"}
    else:
        logger.warning("🗺️ [API] No map data available from ROS bridge")

        # Try to get all available data types for debugging
        available_data = ros_bridge.get_all_latest_data() if hasattr(ros_bridge, 'get_all_latest_data') else {}
        logger.info(f"🗺️ [API] Available data types: {list(available_data.keys())}")

        return {
            "status": "no_map",
            "message": "No map data available",
            "timestamp": ros_bridge.get_latest_data('timestamp') if ros_bridge else None,
            "available_data_types": list(available_data.keys())
        }

@app.post("/api/map/refresh")
async def refresh_map():
    """Force refresh map data by resubscribing to map topic"""
    logger.info("🗺️ [API] Map refresh requested")

    ros_bridge = get_ros_bridge()
    if not ros_bridge:
        logger.warning("🗺️ [API] ROS bridge not available for refresh")
        raise HTTPException(status_code=503, detail="ROS bridge not available")

    try:
        # Force a map refresh by resubscribing to the map topic
        if hasattr(ros_bridge, 'refresh_map_subscription'):
            ros_bridge.refresh_map_subscription()
            logger.info("🗺️ [API] Map subscription refreshed")
        else:
            logger.warning("🗺️ [API] Map refresh not supported by current ROS bridge")

        # Wait a moment for new data
        await asyncio.sleep(0.5)

        # Check if we now have map data
        map_data = ros_bridge.get_latest_data('map')
        if map_data:
            logger.info("🗺️ [API] Map data available after refresh")
            return {"status": "success", "message": "Map refreshed successfully", "map": map_data}
        else:
            logger.warning("🗺️ [API] No map data available after refresh")
            return {"status": "no_map", "message": "Map refresh completed but no data available"}

    except Exception as e:
        logger.error(f"🗺️ [API] Error refreshing map: {e}")
        raise HTTPException(status_code=500, detail=f"Map refresh failed: {str(e)}")


@app.post("/api/map/save")
async def save_map(request: Request):
    """Save current map to file using ROS map_saver"""
    logger.info("🗺️ [API] Map save requested")

    ros_bridge = get_ros_bridge()
    if not ros_bridge:
        logger.warning("🗺️ [API] ROS bridge not available for save")
        raise HTTPException(status_code=503, detail="ROS bridge not available")

    try:
        body = await request.json()
        name = body.get("name") if isinstance(body, dict) else None
        if not name:
            name = datetime.now().strftime("map_%Y%m%d_%H%M%S")

        save_dir = Path("amr_master/maps")
        save_dir.mkdir(parents=True, exist_ok=True)
        file_path = save_dir / name

        result = ros_bridge.save_map(str(file_path))
        logger.info(f"🗺️ [API] Map saved at {file_path}")
        return {
            "status": "success",
            "message": "Map saved successfully",
            "files": result
        }
    except Exception as e:
        logger.error(f"🗺️ [API] Error saving map: {e}")
        raise HTTPException(status_code=500, detail=f"Map save failed: {str(e)}")
