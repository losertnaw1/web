#!/usr/bin/env python3

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import sys
from pathlib import Path
import json
import time

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from ros_bridge.ros_interface_noetic import get_ros_bridge

router = APIRouter()

# Pydantic models
class LogEntry(BaseModel):
    timestamp: float
    level: str  # DEBUG, INFO, WARN, ERROR, FATAL
    node: str
    message: str
    file: Optional[str] = None
    function: Optional[str] = None
    line: Optional[int] = None

class LogFilter(BaseModel):
    level: Optional[str] = None
    node: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    search_text: Optional[str] = None

class LogResponse(BaseModel):
    logs: List[LogEntry]
    total_count: int
    filtered_count: int
    page: int
    page_size: int

# In-memory log storage (in production, use database)
log_storage: List[LogEntry] = []
MAX_LOGS = 10000  # Keep last 10k logs

def add_log_entry(entry: LogEntry):
    """Add log entry to storage with size limit"""
    global log_storage
    log_storage.append(entry)
    
    # Keep only recent logs
    if len(log_storage) > MAX_LOGS:
        log_storage = log_storage[-MAX_LOGS:]

@router.get("/", response_model=LogResponse)
async def get_logs(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(100, ge=1, le=1000, description="Logs per page"),
    level: Optional[str] = Query(None, description="Filter by log level"),
    node: Optional[str] = Query(None, description="Filter by node name"),
    start_time: Optional[float] = Query(None, description="Start timestamp"),
    end_time: Optional[float] = Query(None, description="End timestamp"),
    search: Optional[str] = Query(None, description="Search in message text")
):
    """
    Get historical logs with filtering and pagination
    """
    try:
        # Apply filters
        filtered_logs = log_storage.copy()
        
        if level:
            filtered_logs = [log for log in filtered_logs if log.level.upper() == level.upper()]
        
        if node:
            filtered_logs = [log for log in filtered_logs if node.lower() in log.node.lower()]
        
        if start_time:
            filtered_logs = [log for log in filtered_logs if log.timestamp >= start_time]
        
        if end_time:
            filtered_logs = [log for log in filtered_logs if log.timestamp <= end_time]
        
        if search:
            filtered_logs = [log for log in filtered_logs if search.lower() in log.message.lower()]
        
        # Sort by timestamp (newest first)
        filtered_logs.sort(key=lambda x: x.timestamp, reverse=True)
        
        # Pagination
        total_filtered = len(filtered_logs)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        page_logs = filtered_logs[start_idx:end_idx]
        
        return LogResponse(
            logs=page_logs,
            total_count=len(log_storage),
            filtered_count=total_filtered,
            page=page,
            page_size=page_size
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get logs: {str(e)}")

@router.get("/recent")
async def get_recent_logs(count: int = Query(50, ge=1, le=500)):
    """
    Get most recent logs
    """
    try:
        recent_logs = log_storage[-count:] if log_storage else []
        recent_logs.reverse()  # Newest first
        
        return {
            "status": "success",
            "logs": recent_logs,
            "count": len(recent_logs)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get recent logs: {str(e)}")

@router.get("/levels")
async def get_log_levels():
    """
    Get available log levels and their counts
    """
    try:
        level_counts = {}
        for log in log_storage:
            level = log.level.upper()
            level_counts[level] = level_counts.get(level, 0) + 1
        
        return {
            "status": "success",
            "levels": level_counts,
            "total_logs": len(log_storage)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get log levels: {str(e)}")

@router.get("/nodes")
async def get_log_nodes():
    """
    Get list of nodes that have generated logs
    """
    try:
        nodes = set()
        for log in log_storage:
            nodes.add(log.node)
        
        node_counts = {}
        for log in log_storage:
            node = log.node
            node_counts[node] = node_counts.get(node, 0) + 1
        
        return {
            "status": "success",
            "nodes": list(nodes),
            "node_counts": node_counts
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get log nodes: {str(e)}")

@router.delete("/clear")
async def clear_logs():
    """
    Clear all stored logs
    """
    try:
        global log_storage
        cleared_count = len(log_storage)
        log_storage.clear()
        
        return {
            "status": "success",
            "message": f"Cleared {cleared_count} logs"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear logs: {str(e)}")

@router.get("/export")
async def export_logs(
    format: str = Query("json", description="Export format: json, csv"),
    level: Optional[str] = Query(None, description="Filter by log level"),
    node: Optional[str] = Query(None, description="Filter by node name"),
    hours: Optional[int] = Query(None, description="Last N hours")
):
    """
    Export logs in different formats
    """
    try:
        # Apply filters
        filtered_logs = log_storage.copy()
        
        if level:
            filtered_logs = [log for log in filtered_logs if log.level.upper() == level.upper()]
        
        if node:
            filtered_logs = [log for log in filtered_logs if node.lower() in log.node.lower()]
        
        if hours:
            cutoff_time = time.time() - (hours * 3600)
            filtered_logs = [log for log in filtered_logs if log.timestamp >= cutoff_time]
        
        if format.lower() == "json":
            return {
                "status": "success",
                "format": "json",
                "logs": [log.dict() for log in filtered_logs],
                "count": len(filtered_logs)
            }
        elif format.lower() == "csv":
            # Convert to CSV format
            csv_lines = ["timestamp,level,node,message,file,function,line"]
            for log in filtered_logs:
                csv_line = f"{log.timestamp},{log.level},{log.node},\"{log.message}\",{log.file or ''},{log.function or ''},{log.line or ''}"
                csv_lines.append(csv_line)
            
            return {
                "status": "success",
                "format": "csv",
                "data": "\n".join(csv_lines),
                "count": len(filtered_logs)
            }
        else:
            raise HTTPException(status_code=400, detail="Unsupported format. Use 'json' or 'csv'")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export logs: {str(e)}")

@router.post("/simulate")
async def simulate_log_entries():
    """
    Generate sample log entries for testing (development only)
    """
    try:
        import random
        
        levels = ["DEBUG", "INFO", "WARN", "ERROR"]
        nodes = ["navigation_node", "localization_node", "sensor_node", "control_node"]
        messages = [
            "Node started successfully",
            "Processing sensor data",
            "Navigation goal received",
            "Obstacle detected, replanning path",
            "Battery level low",
            "Localization update completed",
            "Emergency stop activated",
            "System health check passed"
        ]
        
        # Generate 20 sample logs
        current_time = time.time()
        for i in range(20):
            log_entry = LogEntry(
                timestamp=current_time - random.randint(0, 3600),  # Last hour
                level=random.choice(levels),
                node=random.choice(nodes),
                message=random.choice(messages),
                file=f"src/{random.choice(nodes)}.py",
                function=f"function_{random.randint(1, 10)}",
                line=random.randint(10, 500)
            )
            add_log_entry(log_entry)
        
        return {
            "status": "success",
            "message": "Generated 20 sample log entries"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to simulate logs: {str(e)}")

# Function to be called by ROS bridge when new log arrives
def handle_ros_log(level: str, node: str, message: str, file: str = None, function: str = None, line: int = None):
    """
    Handle incoming ROS log message
    """
    log_entry = LogEntry(
        timestamp=time.time(),
        level=level,
        node=node,
        message=message,
        file=file,
        function=function,
        line=line
    )
    add_log_entry(log_entry)
