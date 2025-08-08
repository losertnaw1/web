#!/usr/bin/env python3

import json
import asyncio
import logging
import math
from typing import Dict, List, Set, Any
from fastapi import WebSocket
import time

logger = logging.getLogger(__name__)

def safe_json_dumps(obj):
    """JSON dumps that handles NaN and Infinity values"""
    def convert_nan_inf(obj):
        if isinstance(obj, dict):
            return {k: convert_nan_inf(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert_nan_inf(item) for item in obj]
        elif isinstance(obj, float):
            if math.isnan(obj):
                return 0.0  # Convert NaN to 0
            elif math.isinf(obj):
                return 1000.0 if obj > 0 else -1000.0  # Convert Inf to large number
            else:
                return obj
        else:
            return obj

    return json.dumps(convert_nan_inf(obj))

class WebSocketManager:
    """
    WebSocket Manager for handling real-time communication
    between ROS2 and web clients
    """
    
    def __init__(self):
        # Active connections
        self.active_connections: List[WebSocket] = []
        
        # Client subscriptions
        self.client_subscriptions: Dict[WebSocket, Set[str]] = {}
        
        # Data rate limiting
        self.last_broadcast_time: Dict[str, float] = {}
        self.min_broadcast_interval = {
            'pose': 0.1,        # 10 Hz
            'odom': 0.1,        # 10 Hz  
            'scan': 0.2,        # 5 Hz
            'battery': 1.0,     # 1 Hz
            'map': 5.0,         # 0.2 Hz
            'diagnostics': 2.0, # 0.5 Hz
            'log': 0.1,         # 10 Hz
            'ultrasonic': 0.1,  # 10 Hz
            'node_status': 2.0  # 0.5 Hz
        }
        
        logger.info("WebSocket Manager initialized")
    
    async def connect(self, websocket: WebSocket):
        """Accept new WebSocket connection"""
        await websocket.accept()
        self.active_connections.append(websocket)
        self.client_subscriptions[websocket] = set()
        
        logger.info(f"New WebSocket connection. Total: {len(self.active_connections)}")
        
        # Send welcome message
        await self.send_personal_message(websocket, {
            'type': 'connection',
            'status': 'connected',
            'message': 'Welcome to Indoor Autonomous Vehicle Web Interface',
            'timestamp': time.time()
        })
    
    def disconnect(self, websocket: WebSocket):
        """Remove WebSocket connection"""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        
        if websocket in self.client_subscriptions:
            del self.client_subscriptions[websocket]
        
        logger.info(f"WebSocket disconnected. Total: {len(self.active_connections)}")
    
    async def disconnect_all(self):
        """Disconnect all WebSocket connections"""
        for websocket in self.active_connections.copy():
            try:
                await websocket.close()
            except:
                pass
        
        self.active_connections.clear()
        self.client_subscriptions.clear()
        logger.info("All WebSocket connections closed")
    
    async def send_personal_message(self, websocket: WebSocket, message: Dict[str, Any]):
        """Send message to specific client"""
        try:
            await websocket.send_text(safe_json_dumps(message))
        except Exception as e:
            logger.error(f"Error sending personal message: {str(e)}")
            self.disconnect(websocket)
    
    async def broadcast(self, data_type: str, data: Dict[str, Any]):
        """Broadcast message to all subscribed clients with rate limiting"""
        
        # Rate limiting
        current_time = time.time()
        last_time = self.last_broadcast_time.get(data_type, 0)
        min_interval = self.min_broadcast_interval.get(data_type, 0.1)
        
        if current_time - last_time < min_interval:
            return  # Skip this broadcast due to rate limiting
        
        self.last_broadcast_time[data_type] = current_time
        
        # Prepare message
        message = {
            'type': 'data',
            'data_type': data_type,
            'data': data,
            'timestamp': current_time
        }
        
        # Send to subscribed clients
        disconnected_clients = []
        
        for websocket in self.active_connections:
            try:
                # Check if client is subscribed to this data type
                subscriptions = self.client_subscriptions.get(websocket, set())
                if not subscriptions or data_type in subscriptions:
                    await websocket.send_text(safe_json_dumps(message))
                    
            except Exception as e:
                logger.error(f"Error broadcasting to client: {str(e)}")
                disconnected_clients.append(websocket)
        
        # Clean up disconnected clients
        for websocket in disconnected_clients:
            self.disconnect(websocket)
    
    async def subscribe(self, websocket: WebSocket, topics: List[str]):
        """Subscribe client to specific topics"""
        if websocket not in self.client_subscriptions:
            self.client_subscriptions[websocket] = set()
        
        self.client_subscriptions[websocket].update(topics)
        
        await self.send_personal_message(websocket, {
            'type': 'subscription',
            'status': 'subscribed',
            'topics': topics,
            'timestamp': time.time()
        })
        
        logger.info(f"Client subscribed to: {topics}")
    
    async def unsubscribe(self, websocket: WebSocket, topics: List[str]):
        """Unsubscribe client from specific topics"""
        if websocket in self.client_subscriptions:
            self.client_subscriptions[websocket].difference_update(topics)
        
        await self.send_personal_message(websocket, {
            'type': 'subscription',
            'status': 'unsubscribed',
            'topics': topics,
            'timestamp': time.time()
        })
        
        logger.info(f"Client unsubscribed from: {topics}")
    
    # Specific broadcast methods for different data types
    
    async def broadcast_pose(self, data_type: str, data: Dict[str, Any]):
        """Broadcast robot pose data"""
        await self.broadcast('pose', data)
    
    async def broadcast_odom(self, data_type: str, data: Dict[str, Any]):
        """Broadcast odometry data"""
        await self.broadcast('odom', data)
    
    async def broadcast_scan(self, data_type: str, data: Dict[str, Any]):
        """Broadcast LiDAR scan data"""
        # Reduce data size for web transmission
        if 'ranges' in data:
            # Sample every 4th point to reduce bandwidth
            ranges = data['ranges']
            data['ranges'] = ranges[::4] if len(ranges) > 360 else ranges
        
        await self.broadcast('scan', data)
    
    async def broadcast_battery(self, data_type: str, data: Dict[str, Any]):
        """Broadcast battery status"""
        await self.broadcast('battery', data)
    
    async def broadcast_map(self, data_type: str, data: Dict[str, Any]):
        """Broadcast map data"""
        # Map data is large, only send to clients that specifically request it
        message = {
            'type': 'data',
            'data_type': 'map',
            'data': data,
            'timestamp': time.time()
        }
        
        for websocket in self.active_connections:
            try:
                subscriptions = self.client_subscriptions.get(websocket, set())
                if 'map' in subscriptions:
                    await websocket.send_text(safe_json_dumps(message))
            except Exception as e:
                logger.error(f"Error sending map data: {str(e)}")
                self.disconnect(websocket)
    
    async def broadcast_diagnostics(self, data_type: str, data: Dict[str, Any]):
        """Broadcast system diagnostics"""
        await self.broadcast('diagnostics', data)
    
    async def broadcast_log(self, data_type: str, data: Dict[str, Any]):
        """Broadcast log messages"""
        # Send all log messages (filtering can be done on frontend)
        await self.broadcast('log', data)
    
    async def broadcast_ultrasonic(self, data_type: str, data: Dict[str, Any]):
        """Broadcast ultrasonic sensor data"""
        await self.broadcast('ultrasonic', data)
    
    async def broadcast_node_status(self, data_type: str, data: Dict[str, Any]):
        """Broadcast ROS2 node status"""
        await self.broadcast('node_status', data)

    async def broadcast_switch_state(self, switch_type: str, state_data: Dict[str, Any]):
        """Broadcast switch state changes"""
        message = {  
            'type': 'switch_state_change',
            'switch_type': switch_type,  # 'map_source', 'position_mode', 'running_mode'
            'data': state_data,
            'timestamp': time.time()
        }

        for websocket in self.active_connections:
            try:
                await websocket.send_text(safe_json_dumps(message))
            except Exception as e:
                logger.error(f"Error broadcasting switch state: {str(e)}")
                self.disconnect(websocket)

    async def broadcast_system_status(self, status_data: Dict[str, Any]):
        """Broadcast overall system status including switch states"""
        message = {
            'type': 'system_status',
            'data': status_data,
            'timestamp': time.time()
        }

        for websocket in self.active_connections:
            try:
                await websocket.send_text(safe_json_dumps(message))
            except Exception as e:
                logger.error(f"Error broadcasting system status: {str(e)}")
                self.disconnect(websocket)

    def get_connection_stats(self) -> Dict[str, Any]:
        """Get WebSocket connection statistics"""
        return {
            'active_connections': len(self.active_connections),
            'total_subscriptions': sum(len(subs) for subs in self.client_subscriptions.values()),
            'broadcast_rates': self.min_broadcast_interval,
            'last_broadcast_times': self.last_broadcast_time
        }
