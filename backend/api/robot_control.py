#!/usr/bin/env python3

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
import sys
import logging
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from ros_bridge.ros_interface_noetic import get_ros_bridge
from security.auth import require_control, require_read

router = APIRouter()
logger = logging.getLogger(__name__)

# Global WebSocket manager instance (will be injected by main app)
websocket_manager = None

def set_websocket_manager(manager):
    """Set the WebSocket manager instance"""
    global websocket_manager
    websocket_manager = manager

# Pydantic models for request/response
class MoveCommand(BaseModel):
    linear_x: float = 0.0
    linear_y: float = 0.0
    angular_z: float = 0.0
    duration: Optional[float] = None  # Duration in seconds

class PoseCommand(BaseModel):
    x: float
    y: float
    orientation_w: float = 1.0

class RobotStatus(BaseModel):
    pose: Optional[dict] = None
    odom: Optional[dict] = None
    battery: Optional[dict] = None
    timestamp: float

@router.post("/move")
async def move_robot(command: MoveCommand, current_user: dict = Depends(require_control)):
    """
    Send velocity command to robot
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        ros_bridge.publish_cmd_vel(
            command.linear_x,
            command.linear_y, 
            command.angular_z
        )
        
        return {
            "status": "success",
            "message": f"Move command sent: linear=({command.linear_x}, {command.linear_y}), angular={command.angular_z}",
            "command": command.dict()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send move command: {str(e)}")

@router.post("/stop")
async def stop_robot():
    """
    Emergency stop - send zero velocity
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        ros_bridge.publish_cmd_vel(0.0, 0.0, 0.0)
        
        return {
            "status": "success",
            "message": "Emergency stop command sent",
            "command": {"linear_x": 0.0, "linear_y": 0.0, "angular_z": 0.0}
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop robot: {str(e)}")

@router.post("/home")
async def go_home():
    """
    Send robot to home position (0, 0)
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        ros_bridge.publish_navigation_goal(0.0, 0.0, 1.0)
        
        return {
            "status": "success",
            "message": "Home navigation command sent",
            "goal": {"x": 0.0, "y": 0.0, "orientation_w": 1.0}
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send home command: {str(e)}")

@router.post("/set_initial_pose")
async def set_initial_pose(pose: PoseCommand):
    """
    Set initial pose for AMCL localization
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        ros_bridge.publish_initial_pose(pose.x, pose.y, pose.orientation_w)
        
        return {
            "status": "success",
            "message": f"Initial pose set to ({pose.x}, {pose.y})",
            "pose": pose.dict()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set initial pose: {str(e)}")

@router.get("/pose")
async def get_robot_pose():
    """
    Get current robot pose
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        pose_data = ros_bridge.get_latest_data('pose')
        
        if pose_data is None:
            return {
                "status": "no_data",
                "message": "No pose data available",
                "pose": None
            }
        
        return {
            "status": "success",
            "pose": pose_data
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get robot pose: {str(e)}")

@router.get("/status")
async def get_robot_status(current_user: dict = Depends(require_read)):
    """
    Get comprehensive robot status
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        # Get all latest data
        pose_data = ros_bridge.get_latest_data('pose')
        odom_data = ros_bridge.get_latest_data('odom')
        battery_data = ros_bridge.get_latest_data('battery')
        
        status = RobotStatus(
            pose=pose_data,
            odom=odom_data,
            battery=battery_data,
            timestamp=ros_bridge.get_clock().now().nanoseconds / 1e9 if hasattr(ros_bridge, 'get_clock') else 0
        )
        
        return {
            "status": "success",
            "robot_status": status.dict()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get robot status: {str(e)}")

# Predefined movement commands
@router.post("/move/forward")
async def move_forward():
    """Move robot forward"""
    return await move_robot(MoveCommand(linear_x=0.2))

@router.post("/move/backward")
async def move_backward():
    """Move robot backward"""
    return await move_robot(MoveCommand(linear_x=-0.2))

@router.post("/move/left")
async def move_left():
    """Move robot left"""
    return await move_robot(MoveCommand(linear_y=0.2))

@router.post("/move/right")
async def move_right():
    """Move robot right"""
    return await move_robot(MoveCommand(linear_y=-0.2))

@router.post("/rotate/left")
async def rotate_left():
    """Rotate robot left"""
    return await move_robot(MoveCommand(angular_z=0.5))

@router.post("/rotate/right")
async def rotate_right():
    """Rotate robot right"""
    return await move_robot(MoveCommand(angular_z=-0.5))

# Global state for robot running mode switching
running_mode_state = {
    "current_mode": "line_following",  # "line_following" or "slam_auto"
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

@router.get("/running-mode")
async def get_running_mode():
    """
    Get current robot running mode configuration
    """
    try:
        return {
            "status": "success",
            "current_mode": running_mode_state["current_mode"],
            "available_modes": running_mode_state["available_modes"],
            "description": running_mode_state["description"],
            "config": running_mode_state["mode_config"][running_mode_state["current_mode"]]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get running mode: {str(e)}")

@router.post("/running-mode")
async def set_running_mode(request: dict):
    """
    Set robot running mode (line_following or slam_auto)
    """
    try:
        new_mode = request.get("mode")

        if not new_mode:
            raise HTTPException(status_code=400, detail="Missing 'mode' parameter")

        if new_mode not in running_mode_state["available_modes"]:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid mode. Available: {running_mode_state['available_modes']}"
            )

        # Update the state
        old_mode = running_mode_state["current_mode"]
        running_mode_state["current_mode"] = new_mode

        # Get ROS bridge and update behavior if needed
        ros_bridge = get_ros_bridge()
        if ros_bridge:
            # Update the running mode in ROS bridge
            mode_config = running_mode_state["mode_config"][new_mode]
            ros_bridge.set_running_mode(new_mode, mode_config)

        logger.info(f"Running mode switched from {old_mode} to {new_mode}")

        # Broadcast switch state change
        if websocket_manager:
            await websocket_manager.broadcast_switch_state('running_mode', {
                'previous_mode': old_mode,
                'current_mode': new_mode,
                'description': running_mode_state["description"][new_mode],
                'config': running_mode_state["mode_config"][new_mode]
            })

        return {
            "status": "success",
            "message": f"Running mode switched to {new_mode}",
            "previous_mode": old_mode,
            "current_mode": new_mode,
            "description": running_mode_state["description"][new_mode],
            "config": running_mode_state["mode_config"][new_mode]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set running mode: {str(e)}")
