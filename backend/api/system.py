#!/usr/bin/env python3

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import sys
import psutil
import time
import subprocess
import json
import os
import signal
import yaml
import logging
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from ros_bridge.ros_interface_noetic import get_ros_bridge

router = APIRouter()

# Pydantic models
class SystemInfo(BaseModel):
    cpu_percent: float
    memory_percent: float
    disk_percent: float
    uptime: float
    timestamp: float

class NodeStatus(BaseModel):
    name: str
    status: str
    timestamp: float

@router.get("/status")
async def get_system_status():
    """
    Get comprehensive system status
    """
    try:
        ros_bridge = get_ros_bridge()
        
        # System metrics
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        boot_time = psutil.boot_time()
        uptime = time.time() - boot_time
        
        # ROS2 status
        ros_status = "connected" if ros_bridge else "disconnected"
        
        # Get ROS2 data availability
        data_status = {}
        if ros_bridge:
            data_types = ['pose', 'odom', 'scan', 'battery', 'map', 'diagnostics']
            for data_type in data_types:
                data = ros_bridge.get_latest_data(data_type)
                data_status[data_type] = "available" if data else "no_data"
        
        system_status = {
            "system": {
                "cpu_percent": cpu_percent,
                "memory_percent": memory.percent,
                "disk_percent": disk.percent,
                "uptime": uptime,
                "timestamp": time.time()
            },
            "ros2": {
                "status": ros_status,
                "data_status": data_status
            }
        }
        
        return {
            "status": "success",
            "system_status": system_status
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get system status: {str(e)}")

@router.get("/nodes")
async def get_ros_nodes():
    """
    Get list of active ROS2 nodes
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        node_status = ros_bridge.get_latest_data('node_status')
        
        if node_status is None:
            return {
                "status": "no_data",
                "message": "No node status data available",
                "nodes": []
            }
        
        nodes = []
        for node_name, status_info in node_status.items():
            nodes.append({
                "name": node_name,
                "status": status_info.get('status', 'unknown'),
                "timestamp": status_info.get('timestamp', 0)
            })
        
        return {
            "status": "success",
            "nodes": nodes,
            "count": len(nodes)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get ROS nodes: {str(e)}")

@router.get("/diagnostics")
async def get_system_diagnostics():
    """
    Get system diagnostics
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        diagnostics_data = ros_bridge.get_latest_data('diagnostics')
        
        if diagnostics_data is None:
            return {
                "status": "no_data",
                "message": "No diagnostics data available",
                "diagnostics": None
            }
        
        return {
            "status": "success",
            "diagnostics": diagnostics_data
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get diagnostics: {str(e)}")

@router.get("/logs")
async def get_system_logs(limit: int = 100):
    """
    Get recent system logs
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        logs_data = ros_bridge.get_latest_data('logs')
        
        if logs_data is None:
            return {
                "status": "no_data",
                "message": "No logs data available",
                "logs": []
            }
        
        # Return last 'limit' logs
        recent_logs = logs_data[-limit:] if len(logs_data) > limit else logs_data
        
        return {
            "status": "success",
            "logs": recent_logs,
            "count": len(recent_logs),
            "total_logs": len(logs_data)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get logs: {str(e)}")

@router.get("/performance")
async def get_performance_metrics():
    """
    Get detailed performance metrics
    """
    try:
        # CPU information
        cpu_count = psutil.cpu_count()
        cpu_freq = psutil.cpu_freq()
        cpu_percent_per_core = psutil.cpu_percent(percpu=True)
        
        # Memory information
        memory = psutil.virtual_memory()
        swap = psutil.swap_memory()
        
        # Disk information
        disk = psutil.disk_usage('/')
        disk_io = psutil.disk_io_counters()
        
        # Network information
        network_io = psutil.net_io_counters()
        
        # Process information
        processes = []
        for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
            try:
                if proc.info['name'] and 'ros' in proc.info['name'].lower():
                    processes.append(proc.info)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        
        performance = {
            "cpu": {
                "count": cpu_count,
                "frequency": cpu_freq._asdict() if cpu_freq else None,
                "percent_total": psutil.cpu_percent(),
                "percent_per_core": cpu_percent_per_core
            },
            "memory": {
                "total": memory.total,
                "available": memory.available,
                "percent": memory.percent,
                "used": memory.used,
                "free": memory.free
            },
            "swap": {
                "total": swap.total,
                "used": swap.used,
                "free": swap.free,
                "percent": swap.percent
            },
            "disk": {
                "total": disk.total,
                "used": disk.used,
                "free": disk.free,
                "percent": disk.percent,
                "io": disk_io._asdict() if disk_io else None
            },
            "network": {
                "io": network_io._asdict() if network_io else None
            },
            "ros_processes": processes,
            "timestamp": time.time()
        }
        
        return {
            "status": "success",
            "performance": performance
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get performance metrics: {str(e)}")

@router.post("/nodes/{node_name}/start")
async def start_ros_node(node_name: str):
    """
    Start a specific ROS2 node or launch file
    """
    try:
        import subprocess
        import os

        # Define launch commands for different nodes
        launch_commands = {
            "navigation": ["ros2", "launch", "indoor_navigation", "navigation.launch.py"],
            "slam": ["ros2", "launch", "slam_toolbox", "online_async_launch.py"],
            "localization": ["ros2", "launch", "indoor_navigation", "localization.launch.py"],
            "perception": ["ros2", "launch", "perception_system", "perception.launch.py"],
            "safety_monitor": ["ros2", "run", "safety_monitor", "safety_monitor"],
            "mission_planner": ["ros2", "run", "mission_planner", "mission_planner"],
            "web_interface": ["ros2", "run", "web_interface", "web_server"]
        }

        if node_name not in launch_commands:
            raise HTTPException(status_code=400, detail=f"Unknown node: {node_name}")

        command = launch_commands[node_name]

        # Start process in background
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=os.environ.copy()
        )

        return {
            "status": "success",
            "message": f"Started {node_name}",
            "pid": process.pid,
            "command": " ".join(command)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start {node_name}: {str(e)}")

@router.post("/nodes/{node_name}/stop")
async def stop_ros_node(node_name: str):
    """
    Stop a specific ROS2 node
    """
    try:
        import subprocess
        import signal

        # Get processes by name
        result = subprocess.run(
            ["pgrep", "-f", node_name],
            capture_output=True,
            text=True
        )

        if result.returncode == 0:
            pids = result.stdout.strip().split('\n')
            killed_pids = []

            for pid in pids:
                if pid:
                    try:
                        os.kill(int(pid), signal.SIGTERM)
                        killed_pids.append(pid)
                    except ProcessLookupError:
                        pass  # Process already dead

            return {
                "status": "success",
                "message": f"Stopped {node_name}",
                "killed_pids": killed_pids
            }
        else:
            return {
                "status": "not_found",
                "message": f"No running processes found for {node_name}"
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop {node_name}: {str(e)}")

@router.post("/restart_node")
async def restart_ros_node(node_name: str):
    """
    Restart a specific ROS2 node
    """
    try:
        # Stop first
        stop_result = await stop_ros_node(node_name)

        # Wait a moment
        import asyncio
        await asyncio.sleep(2)

        # Start again
        start_result = await start_ros_node(node_name)

        return {
            "status": "success",
            "message": f"Restarted {node_name}",
            "stop_result": stop_result,
            "start_result": start_result
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to restart {node_name}: {str(e)}")

@router.get("/nodes/{node_name}/parameters")
async def get_node_parameters(node_name: str):
    """
    Get parameters of a specific ROS2 node
    """
    try:
        import subprocess
        import yaml

        # Get parameters using ros2 param list
        result = subprocess.run(
            ["ros2", "param", "list", f"/{node_name}"],
            capture_output=True,
            text=True,
            timeout=10
        )

        if result.returncode != 0:
            raise HTTPException(status_code=404, detail=f"Node {node_name} not found or not responding")

        param_names = result.stdout.strip().split('\n')
        parameters = {}

        # Get each parameter value
        for param_name in param_names:
            if param_name.strip():
                try:
                    param_result = subprocess.run(
                        ["ros2", "param", "get", f"/{node_name}", param_name.strip()],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )

                    if param_result.returncode == 0:
                        # Parse parameter value
                        param_output = param_result.stdout.strip()
                        if param_output.startswith("Parameter name:"):
                            lines = param_output.split('\n')
                            if len(lines) >= 2:
                                value_line = lines[1].strip()
                                if value_line.startswith("Parameter value:"):
                                    value = value_line.replace("Parameter value:", "").strip()
                                    # Try to parse as YAML for proper type conversion
                                    try:
                                        parsed_value = yaml.safe_load(value)
                                        parameters[param_name.strip()] = {
                                            "value": parsed_value,
                                            "type": type(parsed_value).__name__
                                        }
                                    except:
                                        parameters[param_name.strip()] = {
                                            "value": value,
                                            "type": "string"
                                        }
                except subprocess.TimeoutExpired:
                    parameters[param_name.strip()] = {
                        "value": "timeout",
                        "type": "error"
                    }
                except Exception as e:
                    parameters[param_name.strip()] = {
                        "value": str(e),
                        "type": "error"
                    }

        return {
            "status": "success",
            "node": node_name,
            "parameters": parameters,
            "count": len(parameters)
        }

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=408, detail=f"Timeout getting parameters for {node_name}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get parameters for {node_name}: {str(e)}")

@router.post("/nodes/{node_name}/parameters")
async def set_node_parameters(node_name: str, parameters: dict):
    """
    Set parameters of a specific ROS2 node
    """
    try:
        import subprocess

        results = {}

        for param_name, param_data in parameters.items():
            try:
                # Extract value from parameter data
                if isinstance(param_data, dict) and "value" in param_data:
                    param_value = param_data["value"]
                else:
                    param_value = param_data

                # Convert value to string for ros2 param set
                if isinstance(param_value, bool):
                    value_str = "true" if param_value else "false"
                elif isinstance(param_value, (int, float)):
                    value_str = str(param_value)
                elif isinstance(param_value, str):
                    value_str = param_value
                else:
                    value_str = str(param_value)

                # Set parameter using ros2 param set
                result = subprocess.run(
                    ["ros2", "param", "set", f"/{node_name}", param_name, value_str],
                    capture_output=True,
                    text=True,
                    timeout=10
                )

                if result.returncode == 0:
                    results[param_name] = {
                        "status": "success",
                        "message": "Parameter set successfully",
                        "value": param_value
                    }
                else:
                    results[param_name] = {
                        "status": "error",
                        "message": result.stderr.strip() or "Failed to set parameter",
                        "value": param_value
                    }

            except subprocess.TimeoutExpired:
                results[param_name] = {
                    "status": "error",
                    "message": "Timeout setting parameter",
                    "value": param_value
                }
            except Exception as e:
                results[param_name] = {
                    "status": "error",
                    "message": str(e),
                    "value": param_value
                }

        # Check if any parameters were successfully set
        success_count = sum(1 for r in results.values() if r["status"] == "success")

        return {
            "status": "success" if success_count > 0 else "error",
            "node": node_name,
            "results": results,
            "success_count": success_count,
            "total_count": len(parameters)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set parameters for {node_name}: {str(e)}")

@router.get("/health")
async def health_check():
    """
    Comprehensive health check
    """
    try:
        ros_bridge = get_ros_bridge()
        
        # Check ROS2 connection
        ros_healthy = ros_bridge is not None
        
        # Check system resources
        cpu_percent = psutil.cpu_percent()
        memory_percent = psutil.virtual_memory().percent
        disk_percent = psutil.disk_usage('/').percent
        
        # Health thresholds
        cpu_healthy = cpu_percent < 80
        memory_healthy = memory_percent < 80
        disk_healthy = disk_percent < 90
        
        overall_healthy = all([ros_healthy, cpu_healthy, memory_healthy, disk_healthy])
        
        health_status = {
            "overall": "healthy" if overall_healthy else "unhealthy",
            "components": {
                "ros2": "healthy" if ros_healthy else "unhealthy",
                "cpu": "healthy" if cpu_healthy else "unhealthy",
                "memory": "healthy" if memory_healthy else "unhealthy",
                "disk": "healthy" if disk_healthy else "unhealthy"
            },
            "metrics": {
                "cpu_percent": cpu_percent,
                "memory_percent": memory_percent,
                "disk_percent": disk_percent
            },
            "timestamp": time.time()
        }
        
        return {
            "status": "success",
            "health": health_status
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")
