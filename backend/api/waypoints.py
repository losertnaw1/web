#!/usr/bin/env python3

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import os
import uuid
from datetime import datetime
import logging

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()

# Data models
class Waypoint(BaseModel):
    id: str
    name: str
    x: float
    y: float
    theta: float  # orientation in radians
    map_id: Optional[str] = None  # Reference to which map this point belongs to
    description: Optional[str] = None
    created: str
    modified: str

class WaypointCreate(BaseModel):
    name: str
    x: float
    y: float
    theta: float
    map_id: Optional[str] = None
    description: Optional[str] = None

class WaypointUpdate(BaseModel):
    name: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    theta: Optional[float] = None
    description: Optional[str] = None

# Storage file path
WAYPOINTS_FILE = "data/waypoints.json"

def ensure_data_directory():
    """Ensure the data directory exists"""
    os.makedirs(os.path.dirname(WAYPOINTS_FILE), exist_ok=True)

def load_waypoints() -> List[Waypoint]:
    """Load waypoints from storage"""
    ensure_data_directory()

    if not os.path.exists(WAYPOINTS_FILE):
        return []

    try:
        with open(WAYPOINTS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return [Waypoint(**item) for item in data]
    except Exception as e:
        logger.error(f"Error loading waypoints: {e}")
        return []

def save_waypoints(waypoints: List[Waypoint]):
    """Save waypoints to storage"""
    ensure_data_directory()

    try:
        with open(WAYPOINTS_FILE, 'w', encoding='utf-8') as f:
            json.dump([wp.dict() for wp in waypoints], f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Error saving waypoints: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save waypoints: {str(e)}")

@router.get("/waypoints", response_model=List[Waypoint])
async def get_waypoints(map_id: Optional[str] = None):
    """Get all waypoints, optionally filter by map_id"""
    try:
        waypoints = load_waypoints()

        if map_id:
            waypoints = [wp for wp in waypoints if wp.map_id == map_id]

        logger.info(f"Retrieved {len(waypoints)} waypoints{f' for map {map_id}' if map_id else ''}")
        return waypoints

    except Exception as e:
        logger.error(f"Error retrieving waypoints: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve waypoints: {str(e)}")

@router.post("/waypoints", response_model=Waypoint)
async def create_waypoint(waypoint_data: WaypointCreate):
    """Create a new waypoint"""
    try:
        waypoints = load_waypoints()

        # Create new waypoint
        new_waypoint = Waypoint(
            id=str(uuid.uuid4()),
            name=waypoint_data.name,
            x=waypoint_data.x,
            y=waypoint_data.y,
            theta=waypoint_data.theta,
            map_id=waypoint_data.map_id,
            description=waypoint_data.description,
            created=datetime.now().isoformat(),
            modified=datetime.now().isoformat()
        )

        waypoints.append(new_waypoint)
        save_waypoints(waypoints)

        logger.info(f"Created waypoint: {new_waypoint.name} at ({new_waypoint.x}, {new_waypoint.y})")
        return new_waypoint

    except Exception as e:
        logger.error(f"Error creating waypoint: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create waypoint: {str(e)}")

@router.get("/waypoints/{waypoint_id}", response_model=Waypoint)
async def get_waypoint(waypoint_id: str):
    """Get a specific waypoint by ID"""
    try:
        waypoints = load_waypoints()
        waypoint = next((wp for wp in waypoints if wp.id == waypoint_id), None)

        if not waypoint:
            raise HTTPException(status_code=404, detail="Waypoint not found")

        return waypoint

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving waypoint {waypoint_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve waypoint: {str(e)}")

@router.put("/waypoints/{waypoint_id}", response_model=Waypoint)
async def update_waypoint(waypoint_id: str, waypoint_data: WaypointUpdate):
    """Update a waypoint"""
    try:
        waypoints = load_waypoints()
        waypoint_index = next((i for i, wp in enumerate(waypoints) if wp.id == waypoint_id), None)

        if waypoint_index is None:
            raise HTTPException(status_code=404, detail="Waypoint not found")

        # Update waypoint
        waypoint = waypoints[waypoint_index]
        update_data = waypoint_data.dict(exclude_unset=True)

        for field, value in update_data.items():
            setattr(waypoint, field, value)

        waypoint.modified = datetime.now().isoformat()

        save_waypoints(waypoints)

        logger.info(f"Updated waypoint: {waypoint.name}")
        return waypoint

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating waypoint {waypoint_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update waypoint: {str(e)}")

@router.delete("/waypoints/{waypoint_id}")
async def delete_waypoint(waypoint_id: str):
    """Delete a waypoint"""
    try:
        waypoints = load_waypoints()
        waypoint_index = next((i for i, wp in enumerate(waypoints) if wp.id == waypoint_id), None)

        if waypoint_index is None:
            raise HTTPException(status_code=404, detail="Waypoint not found")

        deleted_waypoint = waypoints.pop(waypoint_index)
        save_waypoints(waypoints)

        logger.info(f"Deleted waypoint: {deleted_waypoint.name}")
        return {"status": "success", "message": f"Deleted waypoint: {deleted_waypoint.name}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting waypoint {waypoint_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete waypoint: {str(e)}")

@router.post("/waypoints/current-position")
async def save_current_position(name: str, map_id: Optional[str] = None):
    """Save robot's current position as a waypoint"""
    try:
        # Get current robot position from ROS (this would need ROS bridge integration)
        # For now, return a mock position - this should be replaced with actual ROS data

        # TODO: Integrate with ROS to get actual robot position
        # current_pose = get_ros_bridge().get_robot_pose()

        # Mock data for now
        current_pose = {
            "x": 0.0,
            "y": 0.0,
            "theta": 0.0
        }

        waypoint_data = WaypointCreate(
            name=name,
            x=current_pose["x"],
            y=current_pose["y"],
            theta=current_pose["theta"],
            map_id=map_id,
            description=f"Saved from current robot position at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        )

        return await create_waypoint(waypoint_data)

    except Exception as e:
        logger.error(f"Error saving current position: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save current position: {str(e)}")