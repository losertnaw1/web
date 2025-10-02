#!/usr/bin/env python3

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import os
import uuid
from datetime import datetime
import numpy as np
from pathlib import Path
import logging

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()

# Data models
class MapElement(BaseModel):
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

class Waypoint(BaseModel):
    id: str
    name: str
    x: float
    y: float
    z: float
    orientation: float  # yaw in radians
    description: Optional[str] = None

class MapPath(BaseModel):
    id: str
    name: Optional[str] = None
    type: str  # 'direct' or 'winding'
    startWaypointId: str
    endWaypointId: str
    intermediatePoints: Optional[List[Dict[str, float]]] = None  # For winding paths
    orientation: Optional[float] = None  # Final orientation for winding paths

class SavedMap(BaseModel):
    id: str
    name: str
    elements: List[MapElement]
    width: int
    height: int
    resolution: float  # meters per pixel
    created: str
    modified: str
    waypoints: Optional[List[Waypoint]] = None
    paths: Optional[List[MapPath]] = None

class ROS2OccupancyGrid(BaseModel):
    width: int
    height: int
    resolution: float
    origin_x: float
    origin_y: float
    data: List[int]  # 0=free, 100=occupied, -1=unknown

# Storage paths
MAPS_DIR = Path("data/maps")
MAPS_DIR.mkdir(parents=True, exist_ok=True)

MAPS_FILE = MAPS_DIR / "saved_maps.json"
ROS2_MAPS_DIR = MAPS_DIR / "ros2"
ROS2_MAPS_DIR.mkdir(exist_ok=True)

def load_saved_maps() -> List[SavedMap]:
    """Load saved maps from file"""
    try:
        if MAPS_FILE.exists():
            with open(MAPS_FILE, 'r') as f:
                data = json.load(f)
                return [SavedMap(**map_data) for map_data in data]
        return []
    except Exception as e:
        logger.error(f"Error loading saved maps: {e}")
        return []

def save_maps_to_file(maps: List[SavedMap]):
    """Save maps to file"""
    try:
        with open(MAPS_FILE, 'w') as f:
            json.dump([map_data.dict() for map_data in maps], f, indent=2)
    except Exception as e:
        logger.error(f"Error saving maps to file: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save maps: {str(e)}")

def convert_to_occupancy_grid(saved_map: SavedMap) -> ROS2OccupancyGrid:
    """Convert custom map to ROS2 occupancy grid format"""
    try:
        # Create empty grid (all unknown = -1)
        grid_data = np.full((saved_map.height, saved_map.width), -1, dtype=np.int8)
        
        # Set background as free space (0)
        grid_data.fill(0)
        
        # Process each element
        for element in saved_map.elements:
            if element.type == 'line':
                # Draw line as occupied space
                if element.x2 is not None and element.y2 is not None:
                    # Simple line drawing using Bresenham's algorithm
                    x0, y0 = int(element.x), int(element.y)
                    x1, y1 = int(element.x2), int(element.y2)
                    
                    points = get_line_points(x0, y0, x1, y1)
                    for px, py in points:
                        if 0 <= px < saved_map.width and 0 <= py < saved_map.height:
                            # Make line thick (3 pixels)
                            for dx in range(-1, 2):
                                for dy in range(-1, 2):
                                    nx, ny = px + dx, py + dy
                                    if 0 <= nx < saved_map.width and 0 <= ny < saved_map.height:
                                        grid_data[ny, nx] = 100  # Occupied
            
            elif element.type == 'rectangle':
                # Draw rectangle as occupied space
                if element.width and element.height:
                    x, y = int(element.x), int(element.y)
                    w, h = int(element.width), int(element.height)
                    
                    # Fill rectangle
                    for py in range(max(0, y), min(saved_map.height, y + h)):
                        for px in range(max(0, x), min(saved_map.width, x + w)):
                            grid_data[py, px] = 100  # Occupied
            
            elif element.type == 'circle':
                # Draw circle as occupied space
                if element.radius:
                    cx, cy = int(element.x), int(element.y)
                    r = int(element.radius)
                    
                    # Fill circle
                    for py in range(max(0, cy - r), min(saved_map.height, cy + r + 1)):
                        for px in range(max(0, cx - r), min(saved_map.width, cx + r + 1)):
                            if (px - cx) ** 2 + (py - cy) ** 2 <= r ** 2:
                                grid_data[py, px] = 100  # Occupied
        
        # Convert to ROS2 format (flatten and convert coordinates)
        # ROS2 uses row-major order, origin at bottom-left
        flattened_data = []
        for y in range(saved_map.height - 1, -1, -1):  # Flip Y axis
            for x in range(saved_map.width):
                flattened_data.append(int(grid_data[y, x]))
        
        # Calculate origin - align with Gazebo world coordinates
        # Based on the current map size (99x99) and resolution (0.1), this creates a 9.9x9.9m map
        # Set origin so that robot at Gazebo position (1.98, -2.25) maps correctly
        # Robot should be at approximately map coordinates (69, 26) based on logs

        # For a 99x99 map with 0.1m resolution:
        # Map covers 9.9m x 9.9m
        # If robot at (1.98, -2.25) should be at map (69, 26):
        # origin_x = robot_world_x - (map_x * resolution) = 1.98 - (69 * 0.1) = 1.98 - 6.9 = -4.92
        # origin_y = robot_world_y - (map_y * resolution) = -2.25 - (26 * 0.1) = -2.25 - 2.6 = -4.85

        origin_x = -4.92  # Adjusted to match robot position
        origin_y = -4.85  # Adjusted to match robot position
        
        return ROS2OccupancyGrid(
            width=saved_map.width,
            height=saved_map.height,
            resolution=saved_map.resolution,
            origin_x=origin_x,
            origin_y=origin_y,
            data=flattened_data
        )
        
    except Exception as e:
        logger.error(f"Error converting map to occupancy grid: {e}")
        raise HTTPException(status_code=500, detail=f"Map conversion failed: {str(e)}")

def get_line_points(x0: int, y0: int, x1: int, y1: int) -> List[tuple]:
    """Bresenham's line algorithm"""
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

@router.get("/maps", response_model=List[SavedMap])
async def get_saved_maps():
    """Get all saved maps"""
    try:
        maps = load_saved_maps()
        logger.info(f"Retrieved {len(maps)} saved maps")
        return maps
    except Exception as e:
        logger.error(f"Error retrieving maps: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/maps", response_model=SavedMap)
async def save_map(map_data: SavedMap):
    """Save a new map or update existing one"""
    try:
        maps = load_saved_maps()
        
        # Check if map exists (update) or create new
        existing_index = next((i for i, m in enumerate(maps) if m.id == map_data.id), None)
        
        if existing_index is not None:
            # Update existing map
            maps[existing_index] = map_data
            logger.info(f"Updated existing map: {map_data.name} (ID: {map_data.id})")
        else:
            # Add new map
            if not map_data.id:
                map_data.id = str(uuid.uuid4())
            maps.append(map_data)
            logger.info(f"Saved new map: {map_data.name} (ID: {map_data.id})")
        
        # Save to file
        save_maps_to_file(maps)
        
        # Convert to ROS2 format and save
        try:
            ros2_grid = convert_to_occupancy_grid(map_data)
            ros2_file = ROS2_MAPS_DIR / f"{map_data.id}.json"
            
            with open(ros2_file, 'w') as f:
                json.dump(ros2_grid.dict(), f, indent=2)
            
            logger.info(f"Converted and saved ROS2 map: {ros2_file}")
        except Exception as e:
            logger.warning(f"Failed to convert map to ROS2 format: {e}")
        
        return map_data
        
    except Exception as e:
        logger.error(f"Error saving map: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/maps/{map_id}", response_model=SavedMap)
async def get_map(map_id: str):
    """Get a specific map by ID"""
    try:
        maps = load_saved_maps()
        map_data = next((m for m in maps if m.id == map_id), None)
        
        if not map_data:
            raise HTTPException(status_code=404, detail="Map not found")
        
        logger.info(f"Retrieved map: {map_data.name} (ID: {map_id})")
        return map_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving map {map_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/maps/{map_id}")
async def delete_map(map_id: str):
    """Delete a map"""
    try:
        maps = load_saved_maps()
        map_data = next((m for m in maps if m.id == map_id), None)
        
        if not map_data:
            raise HTTPException(status_code=404, detail="Map not found")
        
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
        save_maps_to_file(maps)
        
        # Remove ROS2 file
        ros2_file = ROS2_MAPS_DIR / f"{map_id}.json"
        if ros2_file.exists():
            ros2_file.unlink()
        
        logger.info(f"Deleted map: {map_data.name} (ID: {map_id})")
        return {"message": "Map deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting map {map_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/maps/{map_id}/ros2", response_model=ROS2OccupancyGrid)
async def get_ros2_map(map_id: str):
    """Get ROS2 occupancy grid format of a map"""
    try:
        # Try to load from ROS2 cache first
        ros2_file = ROS2_MAPS_DIR / f"{map_id}.json"
        
        if ros2_file.exists():
            with open(ros2_file, 'r') as f:
                data = json.load(f)
                return ROS2OccupancyGrid(**data)
        
        # If not cached, convert from original map
        maps = load_saved_maps()
        map_data = next((m for m in maps if m.id == map_id), None)
        
        if not map_data:
            raise HTTPException(status_code=404, detail="Map not found")
        
        ros2_grid = convert_to_occupancy_grid(map_data)
        
        # Cache the result
        with open(ros2_file, 'w') as f:
            json.dump(ros2_grid.dict(), f, indent=2)
        
        logger.info(f"Generated ROS2 occupancy grid for map: {map_data.name}")
        return ros2_grid
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating ROS2 map for {map_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/maps/{map_id}/publish")
async def publish_map_to_ros2(map_id: str):
    """Publish map to ROS2 system"""
    try:
        # Get ROS2 format
        ros2_grid = await get_ros2_map(map_id)
        
        # Get ROS2 bridge
        from ros_bridge.ros_interface_noetic import get_ros_bridge
        ros_bridge = get_ros_bridge()
        
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        # Publish map (you'll need to implement this in ros_interface.py)
        try:
            ros_bridge.publish_map(ros2_grid.dict())
            logger.info(f"Published map {map_id} to ROS2")
            return {"message": "Map published to ROS2 successfully"}
        except Exception as e:
            logger.error(f"Failed to publish map to ROS2: {e}")
            raise HTTPException(status_code=500, detail=f"ROS2 publish failed: {str(e)}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error publishing map {map_id} to ROS2: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/maps/stats")
async def get_maps_stats():
    """Get statistics about saved maps"""
    try:
        maps = load_saved_maps()
        
        stats = {
            "total_maps": len(maps),
            "total_elements": sum(len(m.elements) for m in maps),
            "maps_by_type": {},
            "average_elements_per_map": 0,
            "storage_info": {
                "maps_file_size": MAPS_FILE.stat().st_size if MAPS_FILE.exists() else 0,
                "ros2_maps_count": len(list(ROS2_MAPS_DIR.glob("*.json")))
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
        logger.error(f"Error getting maps stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))
