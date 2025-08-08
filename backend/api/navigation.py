#!/usr/bin/env python3

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import logging
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from ros_bridge.ros_interface_noetic import get_ros_bridge

logger = logging.getLogger(__name__)
router = APIRouter()

# Global WebSocket manager instance (will be injected by main app)
websocket_manager = None

def set_websocket_manager(manager):
    """Set the WebSocket manager instance"""
    global websocket_manager
    websocket_manager = manager

# Pydantic models
class NavigationGoal(BaseModel):
    x: float
    y: float
    orientation_w: float = 1.0

class Waypoint(BaseModel):
    x: float
    y: float
    orientation_w: float = 1.0
    name: Optional[str] = None

class WaypointMission(BaseModel):
    waypoints: List[Waypoint]
    loop: bool = False

@router.post("/goal")
async def set_navigation_goal(goal: NavigationGoal):
    """
    Set navigation goal for the robot
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        ros_bridge.publish_navigation_goal(goal.x, goal.y, goal.orientation_w)
        
        return {
            "status": "success",
            "message": f"Navigation goal set to ({goal.x}, {goal.y})",
            "goal": goal.dict()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set navigation goal: {str(e)}")

@router.post("/cancel")
async def cancel_navigation():
    """
    Cancel current navigation goal
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        # Send current position as goal to stop navigation
        pose_data = ros_bridge.get_latest_data('pose')
        if pose_data:
            ros_bridge.publish_navigation_goal(
                pose_data['x'], 
                pose_data['y'], 
                pose_data['orientation']['w']
            )
        else:
            # Fallback: send stop command
            ros_bridge.publish_cmd_vel(0.0, 0.0, 0.0)
        
        return {
            "status": "success",
            "message": "Navigation cancelled"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to cancel navigation: {str(e)}")

@router.get("/status")
async def get_navigation_status():
    """
    Get current navigation status
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        # Get relevant data
        pose_data = ros_bridge.get_latest_data('pose')
        odom_data = ros_bridge.get_latest_data('odom')
        
        # Calculate navigation status
        status = {
            "current_pose": pose_data,
            "velocity": odom_data.get('linear_velocity') if odom_data else None,
            "is_moving": False,
            "navigation_active": False
        }
        
        # Check if robot is moving
        if odom_data and odom_data.get('linear_velocity'):
            vel = odom_data['linear_velocity']
            speed = (vel['x']**2 + vel['y']**2)**0.5
            status["is_moving"] = speed > 0.01
            status["navigation_active"] = speed > 0.01
        
        return {
            "status": "success",
            "navigation_status": status
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get navigation status: {str(e)}")

# Global state for map source switching
map_source_state = {
    "current_source": "static_map",  # "static_map" or "dynamic_map"
    "available_sources": ["static_map", "dynamic_map"],
    "topic_mapping": {
        "static_map": "/map",
        "dynamic_map": "/map_dynamic"  # or "/map_enhanced" based on your preference
    }
}

@router.get("/map-source")
async def get_map_source():
    """
    Get current map data source configuration
    """
    try:
        return {
            "status": "success",
            "current_source": map_source_state["current_source"],
            "available_sources": map_source_state["available_sources"],
            "topic_mapping": map_source_state["topic_mapping"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get map source: {str(e)}")

@router.post("/map-source")
async def set_map_source(request: dict):
    """
    Set map data source (static_map or dynamic_map)
    """
    try:
        new_source = request.get("source")

        if not new_source:
            raise HTTPException(status_code=400, detail="Missing 'source' parameter")

        if new_source not in map_source_state["available_sources"]:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid source. Available: {map_source_state['available_sources']}"
            )

        # Update the state
        old_source = map_source_state["current_source"]
        map_source_state["current_source"] = new_source

        # Get ROS bridge and update subscription if needed
        ros_bridge = get_ros_bridge()
        if ros_bridge:
            # Update the topic subscription in ROS bridge
            new_topic = map_source_state["topic_mapping"][new_source]
            ros_bridge.switch_map_topic(new_topic)

        logger.info(f"Map source switched from {old_source} to {new_source}")
        logger.info(f"Now subscribing to topic: {map_source_state['topic_mapping'][new_source]}")

        # Broadcast switch state change
        if websocket_manager:
            await websocket_manager.broadcast_switch_state('map_source', {
                'previous_source': old_source,
                'current_source': new_source,
                'topic': map_source_state['topic_mapping'][new_source]
            })

        return {
            "status": "success",
            "message": f"Map source switched to {new_source}",
            "previous_source": old_source,
            "current_source": new_source,
            "topic": map_source_state["topic_mapping"][new_source]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set map source: {str(e)}")

@router.get("/map")
async def get_map():
    """
    Get current map data from the active source
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")

        map_data = ros_bridge.get_latest_data('map')

        if map_data is None:
            return {
                "status": "no_data",
                "message": "No map data available",
                "map": None,
                "source": map_source_state["current_source"]
            }

        return {
            "status": "success",
            "map": map_data,
            "source": map_source_state["current_source"],
            "topic": map_source_state["topic_mapping"][map_source_state["current_source"]]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get map: {str(e)}")

# Global state for robot position mode switching
position_mode_state = {
    "current_mode": "receive_from_ros",  # "receive_from_ros" or "send_to_ros"
    "available_modes": ["receive_from_ros", "send_to_ros"],
    "description": {
        "receive_from_ros": "Receive robot position updates from ROS",
        "send_to_ros": "Send initial pose to ROS (click map to set position)"
    }
}

@router.get("/position-mode")
async def get_position_mode():
    """
    Get current robot position mode configuration
    """
    try:
        return {
            "status": "success",
            "current_mode": position_mode_state["current_mode"],
            "available_modes": position_mode_state["available_modes"],
            "description": position_mode_state["description"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get position mode: {str(e)}")

@router.post("/position-mode")
async def set_position_mode(request: dict):
    """
    Set robot position mode (receive_from_ros or send_to_ros)
    """
    try:
        new_mode = request.get("mode")

        if not new_mode:
            raise HTTPException(status_code=400, detail="Missing 'mode' parameter")

        if new_mode not in position_mode_state["available_modes"]:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid mode. Available: {position_mode_state['available_modes']}"
            )

        # Update the state
        old_mode = position_mode_state["current_mode"]
        position_mode_state["current_mode"] = new_mode

        # Get ROS bridge and update behavior if needed
        ros_bridge = get_ros_bridge()
        if ros_bridge:
            # Update the position mode in ROS bridge
            ros_bridge.set_position_mode(new_mode)

        logger.info(f"Position mode switched from {old_mode} to {new_mode}")

        # Broadcast switch state change
        if websocket_manager:
            await websocket_manager.broadcast_switch_state('position_mode', {
                'previous_mode': old_mode,
                'current_mode': new_mode,
                'description': position_mode_state["description"][new_mode]
            })

        return {
            "status": "success",
            "message": f"Position mode switched to {new_mode}",
            "previous_mode": old_mode,
            "current_mode": new_mode,
            "description": position_mode_state["description"][new_mode]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set position mode: {str(e)}")

@router.post("/set-initial-pose")
async def set_initial_pose(request: dict):
    """
    Set robot initial pose (only works when position mode is 'send_to_ros')
    """
    try:
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

        # Send initial pose to ROS
        ros_bridge.publish_initial_pose(float(x), float(y), float(theta))

        logger.info(f"Initial pose set to ({x}, {y}, {theta})")

        return {
            "status": "success",
            "message": "Initial pose set successfully",
            "pose": {"x": x, "y": y, "theta": theta}
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set initial pose: {str(e)}")

# Predefined navigation goals
@router.post("/goto/kitchen")
async def goto_kitchen():
    """Navigate to kitchen"""
    return await set_navigation_goal(NavigationGoal(x=2.0, y=1.0))

@router.post("/goto/living_room")
async def goto_living_room():
    """Navigate to living room"""
    return await set_navigation_goal(NavigationGoal(x=1.0, y=2.0))

@router.post("/goto/bedroom")
async def goto_bedroom():
    """Navigate to bedroom"""
    return await set_navigation_goal(NavigationGoal(x=3.0, y=3.0))

@router.post("/goto/entrance")
async def goto_entrance():
    """Navigate to entrance"""
    return await set_navigation_goal(NavigationGoal(x=0.5, y=0.5))

# Waypoint missions (future implementation)
@router.post("/mission/start")
async def start_waypoint_mission(mission: WaypointMission):
    """
    Start a waypoint mission (future implementation)
    """
    # This would integrate with mission planner node
    return {
        "status": "not_implemented",
        "message": "Waypoint missions not yet implemented",
        "mission": mission.dict()
    }

@router.get("/mission/status")
async def get_mission_status():
    """
    Get current mission status (future implementation)
    """
    return {
        "status": "not_implemented",
        "message": "Mission status not yet implemented"
    }
