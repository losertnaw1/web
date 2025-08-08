#!/usr/bin/env python3

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from ros_bridge.ros_interface_noetic import get_ros_bridge

router = APIRouter()

# Pydantic models
class SensorReading(BaseModel):
    value: float
    timestamp: float
    unit: str
    status: str

class LidarData(BaseModel):
    ranges: List[Optional[float]]
    angle_min: float
    angle_max: float
    angle_increment: float
    range_min: float
    range_max: float
    timestamp: float

@router.get("/scan")
async def get_lidar_scan():
    """
    Get latest LiDAR scan data
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        scan_data = ros_bridge.get_latest_data('scan')
        
        if scan_data is None:
            return {
                "status": "no_data",
                "message": "No LiDAR scan data available",
                "scan": None
            }
        
        return {
            "status": "success",
            "scan": scan_data
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get LiDAR scan: {str(e)}")

@router.get("/ultrasonic")
async def get_ultrasonic_data():
    """
    Get latest ultrasonic sensor data
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        ultrasonic_data = ros_bridge.get_latest_data('ultrasonic')
        
        if ultrasonic_data is None:
            return {
                "status": "no_data",
                "message": "No ultrasonic data available",
                "ultrasonic": None
            }
        
        return {
            "status": "success",
            "ultrasonic": ultrasonic_data
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get ultrasonic data: {str(e)}")

@router.get("/battery")
async def get_battery_status():
    """
    Get battery status
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        battery_data = ros_bridge.get_latest_data('battery')
        
        if battery_data is None:
            return {
                "status": "no_data",
                "message": "No battery data available",
                "battery": None
            }
        
        return {
            "status": "success",
            "battery": battery_data
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get battery status: {str(e)}")

@router.get("/all")
async def get_all_sensor_data():
    """
    Get all sensor data in one request
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        # Get all sensor data
        scan_data = ros_bridge.get_latest_data('scan')
        ultrasonic_data = ros_bridge.get_latest_data('ultrasonic')
        battery_data = ros_bridge.get_latest_data('battery')
        
        return {
            "status": "success",
            "sensors": {
                "lidar": scan_data,
                "ultrasonic": ultrasonic_data,
                "battery": battery_data
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get sensor data: {str(e)}")

@router.get("/scan/obstacles")
async def get_obstacles():
    """
    Get detected obstacles from LiDAR scan
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        scan_data = ros_bridge.get_latest_data('scan')
        
        if scan_data is None:
            return {
                "status": "no_data",
                "message": "No LiDAR scan data available",
                "obstacles": []
            }
        
        # Process scan data to find obstacles
        obstacles = []
        ranges = scan_data.get('ranges', [])
        angle_min = scan_data.get('angle_min', 0)
        angle_increment = scan_data.get('angle_increment', 0)
        
        for i, range_val in enumerate(ranges):
            if range_val is not None and range_val < 2.0:  # Obstacles within 2m
                angle = angle_min + i * angle_increment
                x = range_val * cos(angle)
                y = range_val * sin(angle)
                
                obstacles.append({
                    "x": x,
                    "y": y,
                    "distance": range_val,
                    "angle": angle
                })
        
        return {
            "status": "success",
            "obstacles": obstacles,
            "count": len(obstacles)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process obstacles: {str(e)}")

@router.get("/scan/summary")
async def get_scan_summary():
    """
    Get summary statistics of LiDAR scan
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        scan_data = ros_bridge.get_latest_data('scan')
        
        if scan_data is None:
            return {
                "status": "no_data",
                "message": "No LiDAR scan data available",
                "summary": None
            }
        
        ranges = scan_data.get('ranges', [])
        valid_ranges = [r for r in ranges if r is not None and not float('inf') == r]
        
        if not valid_ranges:
            return {
                "status": "success",
                "summary": {
                    "total_points": len(ranges),
                    "valid_points": 0,
                    "min_distance": None,
                    "max_distance": None,
                    "avg_distance": None,
                    "obstacles_close": 0
                }
            }
        
        min_dist = min(valid_ranges)
        max_dist = max(valid_ranges)
        avg_dist = sum(valid_ranges) / len(valid_ranges)
        close_obstacles = len([r for r in valid_ranges if r < 1.0])
        
        summary = {
            "total_points": len(ranges),
            "valid_points": len(valid_ranges),
            "min_distance": min_dist,
            "max_distance": max_dist,
            "avg_distance": avg_dist,
            "obstacles_close": close_obstacles,
            "timestamp": scan_data.get('timestamp')
        }
        
        return {
            "status": "success",
            "summary": summary
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get scan summary: {str(e)}")

# Helper function for obstacle detection
def cos(angle):
    import math
    return math.cos(angle)

def sin(angle):
    import math
    return math.sin(angle)
