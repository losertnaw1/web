#!/usr/bin/env python3

import asyncio
import time
import psutil
import logging
from typing import Dict, Any, Optional
from websocket.websocket_manager import WebSocketManager

logger = logging.getLogger(__name__)

class SystemMonitor:
    """
    System monitoring service that collects and broadcasts system metrics
    """
    
    def __init__(self, websocket_manager: WebSocketManager):
        self.websocket_manager = websocket_manager
        self.is_running = False
        self.monitor_task: Optional[asyncio.Task] = None
        self.update_interval = 2.0  # seconds
        
    async def start(self):
        """Start system monitoring"""
        if self.is_running:
            return
            
        self.is_running = True
        self.monitor_task = asyncio.create_task(self._monitor_loop())
        logger.info("System monitor started")
        
    async def stop(self):
        """Stop system monitoring"""
        self.is_running = False
        if self.monitor_task:
            self.monitor_task.cancel()
            try:
                await self.monitor_task
            except asyncio.CancelledError:
                pass
        logger.info("System monitor stopped")
        
    async def _monitor_loop(self):
        """Main monitoring loop"""
        try:
            while self.is_running:
                try:
                    # Collect and broadcast system metrics
                    await self._collect_and_broadcast_metrics()
                    
                    # Collect and broadcast network interfaces
                    await self._collect_and_broadcast_network()
                    
                    # Collect and broadcast ROS2 node status
                    await self._collect_and_broadcast_nodes()
                    
                    await asyncio.sleep(self.update_interval)
                    
                except Exception as e:
                    logger.error(f"Error in system monitor loop: {e}")
                    await asyncio.sleep(1)  # Short delay before retry
                    
        except asyncio.CancelledError:
            logger.info("System monitor loop cancelled")
            
    async def _collect_and_broadcast_metrics(self):
        """Collect and broadcast system metrics"""
        try:
            # CPU and Memory
            cpu_percent = psutil.cpu_percent(interval=0.1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            # System info
            boot_time = psutil.boot_time()
            uptime = time.time() - boot_time
            
            # Load average (Linux only)
            load_avg = None
            try:
                load_avg = psutil.getloadavg()
            except AttributeError:
                pass  # Not available on all platforms
            
            # Format uptime
            uptime_str = self._format_uptime(uptime)
            
            system_data = {
                'cpu_usage': cpu_percent,
                'memory_usage': memory.percent,
                'disk_usage': disk.percent,
                'cpu_cores': psutil.cpu_count(),
                'total_memory': memory.total,
                'uptime': uptime_str,
                'load_average': f"{load_avg[0]:.2f}, {load_avg[1]:.2f}, {load_avg[2]:.2f}" if load_avg else "Unknown",
                'timestamp': time.time()
            }
            
            # Broadcast system diagnostics
            await self.websocket_manager.broadcast('diagnostics', system_data)
            
        except Exception as e:
            logger.error(f"Error collecting system metrics: {e}")
            
    async def _collect_and_broadcast_network(self):
        """Collect and broadcast network interface information"""
        try:
            network_interfaces = {}
            
            # Get network interface statistics
            net_io = psutil.net_io_counters(pernic=True)
            net_addrs = psutil.net_if_addrs()
            net_stats = psutil.net_if_stats()
            
            for interface_name in net_addrs:
                if interface_name.startswith('lo'):  # Skip loopback
                    continue
                    
                # Get IP address
                ip_address = "Unknown"
                for addr in net_addrs[interface_name]:
                    if addr.family == 2:  # AF_INET (IPv4)
                        ip_address = addr.address
                        break
                
                # Get interface status
                status = "down"
                if interface_name in net_stats:
                    status = "up" if net_stats[interface_name].isup else "down"
                
                # Get I/O statistics
                bytes_sent = 0
                bytes_recv = 0
                if interface_name in net_io:
                    bytes_sent = net_io[interface_name].bytes_sent
                    bytes_recv = net_io[interface_name].bytes_recv
                
                network_interfaces[interface_name] = {
                    'ip': ip_address,
                    'status': status,
                    'bytes_sent': bytes_sent,
                    'bytes_recv': bytes_recv
                }
            
            # Broadcast network interface data as system data
            network_data = {
                'network_interfaces': network_interfaces,
                'timestamp': time.time()
            }
            
            # Send as separate data type for system status page
            await self.websocket_manager.broadcast('network_status', network_data)
            
        except Exception as e:
            logger.error(f"Error collecting network data: {e}")
            
    async def _collect_and_broadcast_nodes(self):
        """Collect and broadcast ROS2 node status"""
        try:
            ros_nodes = []
            
            # Get ROS2 related processes
            for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'status']):
                try:
                    proc_info = proc.info
                    if proc_info['name'] and any(keyword in proc_info['name'].lower() 
                                               for keyword in ['ros', 'gazebo', 'rviz', 'nav2']):
                        ros_nodes.append({
                            'pid': proc_info['pid'],
                            'name': proc_info['name'],
                            'cpu_usage': proc_info['cpu_percent'] or 0,
                            'memory_usage': proc_info['memory_percent'] or 0,
                            'status': proc_info['status']
                        })
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    pass
            
            # Broadcast ROS2 node status
            node_data = {
                'ros_nodes': ros_nodes,
                'timestamp': time.time()
            }
            
            await self.websocket_manager.broadcast('node_status', node_data)
            
        except Exception as e:
            logger.error(f"Error collecting ROS2 node data: {e}")
            
    def _format_uptime(self, uptime_seconds: float) -> str:
        """Format uptime in human readable format"""
        days = int(uptime_seconds // 86400)
        hours = int((uptime_seconds % 86400) // 3600)
        minutes = int((uptime_seconds % 3600) // 60)
        
        if days > 0:
            return f"{days}d {hours}h {minutes}m"
        elif hours > 0:
            return f"{hours}h {minutes}m"
        else:
            return f"{minutes}m"

# Global system monitor instance
system_monitor: Optional[SystemMonitor] = None

def init_system_monitor(websocket_manager: WebSocketManager) -> SystemMonitor:
    """Initialize system monitor"""
    global system_monitor
    system_monitor = SystemMonitor(websocket_manager)
    return system_monitor

def get_system_monitor() -> Optional[SystemMonitor]:
    """Get system monitor instance"""
    return system_monitor
