#!/usr/bin/env python3

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import psutil
import time
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from ros_bridge.ros_interface_noetic import get_ros_bridge
from security.auth import require_read, require_admin

router = APIRouter()

# Pydantic models
class SystemMetrics(BaseModel):
    timestamp: float
    cpu_percent: float
    memory_percent: float
    disk_percent: float
    network_io: Dict[str, int]
    disk_io: Dict[str, int]
    temperature: Optional[float] = None

class ProcessInfo(BaseModel):
    pid: int
    name: str
    cpu_percent: float
    memory_percent: float
    status: str
    create_time: float

class NetworkInterface(BaseModel):
    interface: str
    bytes_sent: int
    bytes_recv: int
    packets_sent: int
    packets_recv: int
    errors_in: int
    errors_out: int

class DiagnosticCheck(BaseModel):
    name: str
    status: str  # "OK", "WARNING", "ERROR", "UNKNOWN"
    message: str
    timestamp: float
    details: Optional[Dict[str, Any]] = None

class SystemHealth(BaseModel):
    overall_status: str
    checks: List[DiagnosticCheck]
    metrics: SystemMetrics
    uptime: float
    timestamp: float

# Historical data storage (in production, use database)
metrics_history: List[SystemMetrics] = []
MAX_HISTORY_SIZE = 1000

def collect_system_metrics() -> SystemMetrics:
    """Collect current system metrics"""
    try:
        # CPU and Memory
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        # Network I/O
        network_io = psutil.net_io_counters()
        network_data = {
            "bytes_sent": network_io.bytes_sent,
            "bytes_recv": network_io.bytes_recv,
            "packets_sent": network_io.packets_sent,
            "packets_recv": network_io.packets_recv
        }
        
        # Disk I/O
        disk_io = psutil.disk_io_counters()
        disk_data = {
            "read_bytes": disk_io.read_bytes if disk_io else 0,
            "write_bytes": disk_io.write_bytes if disk_io else 0,
            "read_count": disk_io.read_count if disk_io else 0,
            "write_count": disk_io.write_count if disk_io else 0
        }
        
        # Temperature (if available)
        temperature = None
        try:
            temps = psutil.sensors_temperatures()
            if temps:
                # Get CPU temperature
                for name, entries in temps.items():
                    if entries:
                        temperature = entries[0].current
                        break
        except:
            pass
        
        metrics = SystemMetrics(
            timestamp=time.time(),
            cpu_percent=cpu_percent,
            memory_percent=memory.percent,
            disk_percent=disk.percent,
            network_io=network_data,
            disk_io=disk_data,
            temperature=temperature
        )
        
        # Store in history
        metrics_history.append(metrics)
        if len(metrics_history) > MAX_HISTORY_SIZE:
            metrics_history.pop(0)
        
        return metrics
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to collect metrics: {str(e)}")

def run_diagnostic_checks() -> List[DiagnosticCheck]:
    """Run system diagnostic checks"""
    checks = []
    current_time = time.time()
    
    try:
        # CPU Check
        cpu_percent = psutil.cpu_percent(interval=1)
        if cpu_percent > 90:
            status = "ERROR"
            message = f"High CPU usage: {cpu_percent:.1f}%"
        elif cpu_percent > 70:
            status = "WARNING"
            message = f"Moderate CPU usage: {cpu_percent:.1f}%"
        else:
            status = "OK"
            message = f"CPU usage normal: {cpu_percent:.1f}%"
        
        checks.append(DiagnosticCheck(
            name="CPU Usage",
            status=status,
            message=message,
            timestamp=current_time,
            details={"cpu_percent": cpu_percent}
        ))
        
        # Memory Check
        memory = psutil.virtual_memory()
        if memory.percent > 90:
            status = "ERROR"
            message = f"High memory usage: {memory.percent:.1f}%"
        elif memory.percent > 80:
            status = "WARNING"
            message = f"Moderate memory usage: {memory.percent:.1f}%"
        else:
            status = "OK"
            message = f"Memory usage normal: {memory.percent:.1f}%"
        
        checks.append(DiagnosticCheck(
            name="Memory Usage",
            status=status,
            message=message,
            timestamp=current_time,
            details={"memory_percent": memory.percent, "available_gb": memory.available / (1024**3)}
        ))
        
        # Disk Check
        disk = psutil.disk_usage('/')
        if disk.percent > 95:
            status = "ERROR"
            message = f"Disk almost full: {disk.percent:.1f}%"
        elif disk.percent > 85:
            status = "WARNING"
            message = f"Disk usage high: {disk.percent:.1f}%"
        else:
            status = "OK"
            message = f"Disk usage normal: {disk.percent:.1f}%"
        
        checks.append(DiagnosticCheck(
            name="Disk Usage",
            status=status,
            message=message,
            timestamp=current_time,
            details={"disk_percent": disk.percent, "free_gb": disk.free / (1024**3)}
        ))
        
        # ROS2 Bridge Check
        ros_bridge = get_ros_bridge()
        if ros_bridge:
            status = "OK"
            message = "ROS2 bridge connected"
            details = {"connected": True}
        else:
            status = "ERROR"
            message = "ROS2 bridge not available"
            details = {"connected": False}
        
        checks.append(DiagnosticCheck(
            name="ROS2 Bridge",
            status=status,
            message=message,
            timestamp=current_time,
            details=details
        ))
        
        # Network Check
        try:
            network_io = psutil.net_io_counters()
            if network_io.errin > 100 or network_io.errout > 100:
                status = "WARNING"
                message = f"Network errors detected: {network_io.errin + network_io.errout}"
            else:
                status = "OK"
                message = "Network status normal"
            
            checks.append(DiagnosticCheck(
                name="Network",
                status=status,
                message=message,
                timestamp=current_time,
                details={"errors_in": network_io.errin, "errors_out": network_io.errout}
            ))
        except:
            checks.append(DiagnosticCheck(
                name="Network",
                status="UNKNOWN",
                message="Unable to check network status",
                timestamp=current_time
            ))
        
        return checks
        
    except Exception as e:
        return [DiagnosticCheck(
            name="System Check",
            status="ERROR",
            message=f"Diagnostic check failed: {str(e)}",
            timestamp=current_time
        )]

@router.get("/health", response_model=SystemHealth)
async def get_system_health(current_user: dict = Depends(require_read)):
    """
    Get comprehensive system health status
    """
    try:
        # Collect metrics
        metrics = collect_system_metrics()
        
        # Run diagnostic checks
        checks = run_diagnostic_checks()
        
        # Determine overall status
        error_count = sum(1 for check in checks if check.status == "ERROR")
        warning_count = sum(1 for check in checks if check.status == "WARNING")
        
        if error_count > 0:
            overall_status = "ERROR"
        elif warning_count > 0:
            overall_status = "WARNING"
        else:
            overall_status = "OK"
        
        # System uptime
        uptime = time.time() - psutil.boot_time()
        
        return SystemHealth(
            overall_status=overall_status,
            checks=checks,
            metrics=metrics,
            uptime=uptime,
            timestamp=time.time()
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get system health: {str(e)}")

@router.get("/metrics/current", response_model=SystemMetrics)
async def get_current_metrics(current_user: dict = Depends(require_read)):
    """
    Get current system metrics
    """
    try:
        return collect_system_metrics()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get metrics: {str(e)}")

@router.get("/metrics/history")
async def get_metrics_history(
    hours: int = Query(1, ge=1, le=24, description="Hours of history to retrieve"),
    current_user: dict = Depends(require_read)
):
    """
    Get historical metrics data
    """
    try:
        cutoff_time = time.time() - (hours * 3600)
        filtered_metrics = [m for m in metrics_history if m.timestamp >= cutoff_time]
        
        return {
            "status": "success",
            "metrics": filtered_metrics,
            "count": len(filtered_metrics),
            "hours": hours
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get metrics history: {str(e)}")

@router.get("/processes")
async def get_system_processes(
    limit: int = Query(20, ge=1, le=100, description="Number of processes to return"),
    current_user: dict = Depends(require_admin)
):
    """
    Get system processes information (admin only)
    """
    try:
        processes = []
        
        for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'status', 'create_time']):
            try:
                proc_info = proc.info
                processes.append(ProcessInfo(
                    pid=proc_info['pid'],
                    name=proc_info['name'],
                    cpu_percent=proc_info['cpu_percent'] or 0.0,
                    memory_percent=proc_info['memory_percent'] or 0.0,
                    status=proc_info['status'],
                    create_time=proc_info['create_time']
                ))
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        # Sort by CPU usage
        processes.sort(key=lambda x: x.cpu_percent, reverse=True)
        
        return {
            "status": "success",
            "processes": processes[:limit],
            "total_processes": len(processes)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get processes: {str(e)}")

@router.get("/network")
async def get_network_info(current_user: dict = Depends(require_read)):
    """
    Get network interface information
    """
    try:
        interfaces = []
        
        net_io = psutil.net_io_counters(pernic=True)
        
        for interface, stats in net_io.items():
            interfaces.append(NetworkInterface(
                interface=interface,
                bytes_sent=stats.bytes_sent,
                bytes_recv=stats.bytes_recv,
                packets_sent=stats.packets_sent,
                packets_recv=stats.packets_recv,
                errors_in=stats.errin,
                errors_out=stats.errout
            ))
        
        return {
            "status": "success",
            "interfaces": interfaces
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get network info: {str(e)}")

@router.post("/clear-history")
async def clear_metrics_history(current_user: dict = Depends(require_admin)):
    """
    Clear metrics history (admin only)
    """
    try:
        global metrics_history
        cleared_count = len(metrics_history)
        metrics_history.clear()
        
        return {
            "status": "success",
            "message": f"Cleared {cleared_count} metric entries"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear history: {str(e)}")
