#!/usr/bin/env python3

"""
Minimal FastAPI Backend for Remote Deployment
This backend runs without any ROS dependencies and waits for bridge connections
"""

import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Dict, Any

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Indoor Autonomous Vehicle API - Remote Mode",
    description="Minimal backend for remote ROS bridge connections",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple WebSocket manager for bridge connections
class SimpleWebSocketManager:
    def __init__(self):
        self.connections = set()
        self.bridge_connections = set()  # Track bridge connections separately
        self.robot_data = {
            'connected': False,
            'last_update': None,
            'scan': None,
            'odom': None,
            'pose': None,
            'robot_pose': None,
            'map': None,
            'battery': None
        }
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.add(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.connections)}")
    
    def disconnect(self, websocket: WebSocket):
        self.connections.discard(websocket)
        logger.info(f"WebSocket disconnected. Total connections: {len(self.connections)}")
    
    async def broadcast(self, message: dict):
        """Broadcast to all connections"""
        if self.connections:
            disconnected = set()
            for connection in self.connections:
                try:
                    await connection.send_text(json.dumps(message))
                except:
                    disconnected.add(connection)

            # Remove disconnected connections
            for conn in disconnected:
                self.connections.discard(conn)
                self.bridge_connections.discard(conn)

    async def broadcast_to_clients_only(self, message: dict):
        """Broadcast only to web clients, not to bridge"""
        client_connections = self.connections - self.bridge_connections
        if client_connections:
            disconnected = set()
            for connection in client_connections:
                try:
                    await connection.send_text(json.dumps(message))
                except:
                    disconnected.add(connection)

            # Remove disconnected connections
            for conn in disconnected:
                self.connections.discard(conn)

    def mark_as_bridge(self, websocket: WebSocket):
        """Mark a connection as a bridge connection"""
        self.bridge_connections.add(websocket)
    
    def update_robot_data(self, data_type: str, data: Any):
        self.robot_data[data_type] = data
        self.robot_data['last_update'] = asyncio.get_event_loop().time()
        self.robot_data['connected'] = True

# Global WebSocket manager
websocket_manager = SimpleWebSocketManager()

@app.on_event("startup")
async def startup_event():
    """Startup event"""
    logger.info("🌐 Starting in REMOTE MODE")
    logger.info("Backend ready to receive bridge connections")
    logger.info("No local ROS dependencies required")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down remote backend...")

@app.get("/")
async def root():
    """Root endpoint with simple interface"""
    return HTMLResponse(content="""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Indoor Autonomous Vehicle - Remote Mode</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status { padding: 15px; margin: 10px 0; border-radius: 5px; }
            .connected { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
            .disconnected { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
            .info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
            h1 { color: #333; }
            .endpoint { background: #f8f9fa; padding: 10px; margin: 5px 0; border-left: 4px solid #007bff; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🤖 Indoor Autonomous Vehicle - Remote Mode</h1>
            
            <div class="status info">
                <strong>Status:</strong> Backend running in remote mode<br>
                <strong>Mode:</strong> Waiting for ROS bridge connections<br>
                <strong>Time:</strong> <span id="time"></span>
            </div>
            
            <h2>📡 API Endpoints</h2>
            <div class="endpoint"><strong>GET /health</strong> - Health check</div>
            <div class="endpoint"><strong>GET /api/status</strong> - Robot connection status</div>
            <div class="endpoint"><strong>GET /docs</strong> - API documentation</div>
            <div class="endpoint"><strong>WebSocket /ws</strong> - Real-time data</div>

            <h2>🎮 Test Robot Commands</h2>
            <div style="margin: 20px 0;">
                <button onclick="testCommand('/test/move_forward')" style="margin: 5px; padding: 10px; background: #28a745; color: white; border: none; border-radius: 5px;">Move Forward</button>
                <button onclick="testCommand('/test/turn_left')" style="margin: 5px; padding: 10px; background: #007bff; color: white; border: none; border-radius: 5px;">Turn Left</button>
                <button onclick="testCommand('/test/stop')" style="margin: 5px; padding: 10px; background: #dc3545; color: white; border: none; border-radius: 5px;">Stop</button>
                <button onclick="getStatus()" style="margin: 5px; padding: 10px; background: #6c757d; color: white; border: none; border-radius: 5px;">Get Status</button>
            </div>
            <div id="command-result" style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 5px; display: none;"></div>
            
            <h2>🔧 Setup Instructions</h2>
            <div class="info">
                <p><strong>1. Start your ROS Noetic system</strong></p>
                <p><strong>2. Start the bridge:</strong></p>
                <code>./start_bridge.sh --host YOUR_BACKEND_IP</code>
                <p><strong>3. Monitor connection status at:</strong> <a href="/api/status">/api/status</a></p>
            </div>
        </div>
        
        <script>
            document.getElementById('time').textContent = new Date().toLocaleString();
            setInterval(() => {
                document.getElementById('time').textContent = new Date().toLocaleString();
            }, 1000);

            async function testCommand(endpoint) {
                const resultDiv = document.getElementById('command-result');
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = 'Sending command...';

                try {
                    const response = await fetch(endpoint);
                    const data = await response.json();
                    resultDiv.innerHTML = `<strong>✅ Command sent:</strong> ${JSON.stringify(data)}`;
                    resultDiv.style.background = '#d4edda';
                } catch (error) {
                    resultDiv.innerHTML = `<strong>❌ Error:</strong> ${error.message}`;
                    resultDiv.style.background = '#f8d7da';
                }
            }

            async function getStatus() {
                const resultDiv = document.getElementById('command-result');
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = 'Getting status...';

                try {
                    const response = await fetch('/api/robot/status');
                    const data = await response.json();
                    resultDiv.innerHTML = `<strong>📊 Status:</strong> ${JSON.stringify(data, null, 2)}`;
                    resultDiv.style.background = '#d1ecf1';
                } catch (error) {
                    resultDiv.innerHTML = `<strong>❌ Error:</strong> ${error.message}`;
                    resultDiv.style.background = '#f8d7da';
                }
            }
        </script>
    </body>
    </html>
    """)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for bridge and client connections"""
    await websocket_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Handle different message types
            message_type = message.get('type', '')
            
            if message_type == 'robot_status':
                # Message from bridge with robot data - mark this as bridge connection
                websocket_manager.mark_as_bridge(websocket)

                websocket_manager.update_robot_data('scan', message.get('scan_data'))
                websocket_manager.update_robot_data('odom', message.get('odometry'))
                websocket_manager.update_robot_data('pose', message.get('pose'))
                websocket_manager.update_robot_data('robot_pose', message.get('robot_pose'))
                # Store map data in the format expected by frontend
                raw_map_data = message.get('map_data')
                if raw_map_data:
                    formatted_map_data = {'map': raw_map_data}
                    websocket_manager.update_robot_data('map', formatted_map_data)
                else:
                    websocket_manager.update_robot_data('map', None)
                websocket_manager.update_robot_data('battery', message.get('robot_status', {}).get('battery'))

                # Send individual data messages in the format frontend expects
                # Send pose data
                pose_data = message.get('pose') or message.get('robot_pose')
                if pose_data:
                    await websocket_manager.broadcast_to_clients_only({
                        'type': 'data',
                        'data_type': 'pose',
                        'data': pose_data
                    })

                # Send odometry data
                odom_data = message.get('odometry')
                if odom_data:
                    await websocket_manager.broadcast_to_clients_only({
                        'type': 'data',
                        'data_type': 'odom',
                        'data': odom_data
                    })

                # Send scan data
                scan_data = message.get('scan_data')
                if scan_data:
                    await websocket_manager.broadcast_to_clients_only({
                        'type': 'data',
                        'data_type': 'scan',
                        'data': scan_data
                    })

                # Send battery data
                battery_data = message.get('robot_status', {}).get('battery')
                if battery_data:
                    await websocket_manager.broadcast_to_clients_only({
                        'type': 'data',
                        'data_type': 'battery',
                        'data': battery_data
                    })

                # Send map data
                raw_map_data = message.get('map_data')
                if raw_map_data:
                    # Send map data in the format frontend expects
                    await websocket_manager.broadcast_to_clients_only({
                        'type': 'data',
                        'data_type': 'map',
                        'data': raw_map_data
                    })

            elif message_type == 'command_response':
                # Command response from bridge - forward to web clients ONLY
                websocket_manager.mark_as_bridge(websocket)
                await websocket_manager.broadcast_to_clients_only({
                    'type': 'command_response',
                    'command': message.get('command'),
                    'status': message.get('status'),
                    'message': message.get('message')
                })

            elif message_type == 'move_robot':
                # Command from web client - forward to bridge
                await websocket_manager.broadcast(message)

            elif message_type == 'set_goal':
                # Command from web client - forward to bridge
                await websocket_manager.broadcast(message)

            elif message_type == 'stop_robot':
                # Command from web client - forward to bridge
                await websocket_manager.broadcast(message)

            elif message_type == 'get_status':
                # Status request - forward to bridge
                await websocket_manager.broadcast(message)
                
            elif message_type == 'command':
                # Handle frontend commands - convert to bridge format
                await handle_frontend_command(websocket, message)

            elif message_type == 'ping':
                # Ping/pong for connection health
                await websocket.send_text(json.dumps({
                    'type': 'pong',
                    'timestamp': asyncio.get_event_loop().time()
                }))

    except WebSocketDisconnect:
        websocket_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        websocket_manager.disconnect(websocket)

async def handle_frontend_command(websocket: WebSocket, message: Dict[str, Any]):
    """Handle commands from frontend and convert to bridge format"""
    try:
        command = message.get('command')
        params = message.get('params', {})

        logger.info(f"🌐 [BE] Received frontend command: {command} with params: {params}")

        # Convert frontend command format to bridge format
        if command == 'move':
            # Convert to move_robot message for bridge
            bridge_message = {
                'type': 'move_robot',
                'linear_x': params.get('linear_x', 0.0),
                'linear_y': params.get('linear_y', 0.0),
                'angular_z': params.get('angular_z', 0.0)
            }
            await websocket_manager.broadcast(bridge_message)

        elif command == 'stop':
            # Convert to stop_robot message for bridge
            bridge_message = {
                'type': 'stop_robot'
            }
            await websocket_manager.broadcast(bridge_message)

        elif command == 'navigate':
            # Convert to set_goal message for bridge
            bridge_message = {
                'type': 'set_goal',
                'x': params.get('x', 0.0),
                'y': params.get('y', 0.0),
                'orientation_w': params.get('orientation_w', 1.0)
            }
            await websocket_manager.broadcast(bridge_message)

        elif command == 'get_status':
            # Forward status request to bridge
            bridge_message = {
                'type': 'get_status'
            }
            await websocket_manager.broadcast(bridge_message)

        else:
            logger.warning(f"Unknown frontend command: {command}")
            await websocket.send_text(json.dumps({
                'type': 'error',
                'message': f'Unknown command: {command}'
            }))
            return

        # Send success response to frontend
        logger.info(f"✅ [BE] Command {command} forwarded to bridge successfully")
        await websocket.send_text(json.dumps({
            'type': 'command_result',
            'command': command,
            'status': 'success',
            'message': f'Command {command} sent to robot'
        }))

    except Exception as e:
        logger.error(f"❌ [BE] Error handling frontend command: {e}")
        await websocket.send_text(json.dumps({
            'type': 'error',
            'message': str(e)
        }))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "mode": "remote",
        "message": "Backend ready for bridge connections",
        "connections": len(websocket_manager.connections),
        "robot_connected": websocket_manager.robot_data['connected'],
        "timestamp": asyncio.get_event_loop().time()
    }

@app.get("/api/status")
async def api_status():
    """API status endpoint"""
    return {
        "status": "connected" if websocket_manager.robot_data['connected'] else "disconnected",
        "mode": "remote",
        "message": "Remote backend waiting for bridge" if not websocket_manager.robot_data['connected'] else "Bridge connected",
        "connections": len(websocket_manager.connections),
        "robot_data": websocket_manager.robot_data,
        "timestamp": asyncio.get_event_loop().time()
    }

@app.post("/api/robot/move")
async def move_robot(command: dict):
    """Send movement command to robot via bridge"""
    await websocket_manager.broadcast({
        'type': 'move_robot',
        'linear_x': command.get('linear_x', 0.0),
        'linear_y': command.get('linear_y', 0.0),
        'angular_z': command.get('angular_z', 0.0)
    })
    return {"status": "command_sent", "command": "move", "params": command}

@app.post("/api/robot/stop")
async def stop_robot():
    """Stop robot via bridge"""
    await websocket_manager.broadcast({
        'type': 'stop_robot'
    })
    return {"status": "command_sent", "command": "stop"}

@app.post("/api/navigation/goal")
async def set_navigation_goal(goal: dict):
    """Set navigation goal via bridge"""
    await websocket_manager.broadcast({
        'type': 'set_goal',
        'x': goal.get('x', 0.0),
        'y': goal.get('y', 0.0),
        'orientation_w': goal.get('orientation_w', 1.0)
    })
    return {"status": "command_sent", "command": "navigate", "params": goal}

@app.get("/api/robot/status")
async def get_robot_status():
    """Get current robot status"""
    # Request status from bridge
    await websocket_manager.broadcast({
        'type': 'get_status'
    })

    return {
        "status": "status_requested",
        "robot_data": websocket_manager.robot_data,
        "connections": len(websocket_manager.connections)
    }

# Simple test endpoints for manual testing
@app.get("/test/move_forward")
async def test_move_forward():
    """Test endpoint - move robot forward"""
    await websocket_manager.broadcast({
        'type': 'move_robot',
        'linear_x': 0.2,
        'linear_y': 0.0,
        'angular_z': 0.0
    })
    return {"status": "moving_forward", "linear_x": 0.2}

@app.get("/test/turn_left")
async def test_turn_left():
    """Test endpoint - turn robot left"""
    await websocket_manager.broadcast({
        'type': 'move_robot',
        'linear_x': 0.0,
        'linear_y': 0.0,
        'angular_z': 0.5
    })
    return {"status": "turning_left", "angular_z": 0.5}

@app.get("/test/stop")
async def test_stop():
    """Test endpoint - stop robot"""
    await websocket_manager.broadcast({
        'type': 'stop_robot'
    })
    return {"status": "stopped"}

@app.get("/api/map")
async def get_map():
    """Get current map data"""
    map_data = websocket_manager.robot_data.get('map')
    if map_data and map_data.get('map'):
        # Return in the exact format expected by frontend
        return map_data  # This already contains {'map': {...}}
    else:
        return {
            "status": "no_map",
            "message": "No map data available",
            "timestamp": websocket_manager.robot_data.get('last_update')
        }

if __name__ == "__main__":
    # Run with uvicorn
    uvicorn.run(
        "main_minimal:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
