#!/usr/bin/env python3

import asyncio
import json
import os
import pty
import subprocess
import threading
import time
from typing import Dict, Optional
from fastapi import WebSocket, WebSocketDisconnect
import logging

logger = logging.getLogger(__name__)

class TerminalSession:
    """
    Manages a single terminal session with PTY
    """
    
    def __init__(self, session_id: str, websocket: WebSocket):
        self.session_id = session_id
        self.websocket = websocket
        self.master_fd = None
        self.slave_fd = None
        self.process = None
        self.read_thread = None
        self.is_active = False
        self.loop = None
        
    async def start(self):
        """Start terminal session"""
        try:
            # Store the event loop
            self.loop = asyncio.get_event_loop()

            # Create PTY
            self.master_fd, self.slave_fd = pty.openpty()
            
            # Set up environment
            env = os.environ.copy()
            env['TERM'] = 'xterm-256color'
            env['PS1'] = r'\u@\h:\w$ '
            
            # Start bash process
            self.process = subprocess.Popen(
                ['/bin/bash', '--login'],
                stdin=self.slave_fd,
                stdout=self.slave_fd,
                stderr=self.slave_fd,
                env=env,
                preexec_fn=os.setsid
            )
            
            # Close slave fd in parent process
            os.close(self.slave_fd)
            
            self.is_active = True
            
            # Start reading thread
            self.read_thread = threading.Thread(target=self._read_output, daemon=True)
            self.read_thread.start()
            
            logger.info(f"Terminal session {self.session_id} started")
            
            # Send welcome message
            await self.websocket.send_text(json.dumps({
                'type': 'output',
                'data': 'Welcome to Indoor Autonomous Vehicle Terminal\r\n'
            }))
            
        except Exception as e:
            logger.error(f"Failed to start terminal session {self.session_id}: {e}")
            await self.websocket.send_text(json.dumps({
                'type': 'error',
                'data': f'Failed to start terminal: {str(e)}'
            }))
    
    def _read_output(self):
        """Read output from PTY and send to WebSocket"""
        try:
            while self.is_active and self.master_fd:
                try:
                    # Read from master fd with timeout
                    import select
                    ready, _, _ = select.select([self.master_fd], [], [], 0.1)
                    
                    if ready:
                        data = os.read(self.master_fd, 1024)
                        if data:
                            # Send to WebSocket using thread-safe method
                            try:
                                if self.loop and self.loop.is_running():
                                    asyncio.run_coroutine_threadsafe(
                                        self._send_output(data.decode('utf-8', errors='ignore')),
                                        self.loop
                                    )
                            except Exception as e:
                                logger.error(f"Failed to send output: {e}")
                        else:
                            break  # EOF
                            
                except OSError:
                    break  # PTY closed
                except Exception as e:
                    logger.error(f"Error reading from PTY: {e}")
                    break
                    
        except Exception as e:
            logger.error(f"Terminal read thread error: {e}")
        finally:
            self.is_active = False
    
    async def _send_output(self, data: str):
        """Send output to WebSocket"""
        try:
            if self.websocket and self.is_active:
                # Clean the data before sending
                clean_data = data.replace('\r\n', '\n').replace('\r', '\n')
                await self.websocket.send_text(json.dumps({
                    'type': 'output',
                    'data': clean_data
                }))
        except Exception as e:
            logger.error(f"Error sending terminal output: {e}")
            self.is_active = False
    
    async def write_input(self, data: str):
        """Write input to terminal"""
        try:
            if self.master_fd and self.is_active:
                os.write(self.master_fd, data.encode('utf-8'))
        except Exception as e:
            logger.error(f"Error writing to terminal: {e}")
    
    async def resize(self, cols: int, rows: int):
        """Resize terminal"""
        try:
            if self.master_fd:
                import fcntl
                import termios
                import struct
                
                # Set terminal size
                fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, 
                           struct.pack('HHHH', rows, cols, 0, 0))
        except Exception as e:
            logger.error(f"Error resizing terminal: {e}")
    
    async def close(self):
        """Close terminal session"""
        try:
            self.is_active = False
            
            # Terminate process
            if self.process:
                try:
                    self.process.terminate()
                    # Wait for process to terminate
                    try:
                        self.process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        self.process.kill()
                        self.process.wait()
                except:
                    pass
            
            # Close PTY
            if self.master_fd:
                try:
                    os.close(self.master_fd)
                except:
                    pass
            
            logger.info(f"Terminal session {self.session_id} closed")
            
        except Exception as e:
            logger.error(f"Error closing terminal session: {e}")

class TerminalManager:
    """
    Manages multiple terminal sessions
    """
    
    def __init__(self):
        self.sessions: Dict[str, TerminalSession] = {}
        self.session_counter = 0
    
    def create_session(self, websocket: WebSocket) -> str:
        """Create new terminal session"""
        self.session_counter += 1
        session_id = f"terminal_{self.session_counter}_{int(time.time())}"
        
        session = TerminalSession(session_id, websocket)
        self.sessions[session_id] = session
        
        logger.info(f"Created terminal session: {session_id}")
        return session_id
    
    def get_session(self, session_id: str) -> Optional[TerminalSession]:
        """Get terminal session by ID"""
        return self.sessions.get(session_id)
    
    async def close_session(self, session_id: str):
        """Close and remove terminal session"""
        session = self.sessions.get(session_id)
        if session:
            await session.close()
            del self.sessions[session_id]
            logger.info(f"Closed terminal session: {session_id}")
    
    async def close_all_sessions(self):
        """Close all terminal sessions"""
        for session_id in list(self.sessions.keys()):
            await self.close_session(session_id)
    
    def get_session_count(self) -> int:
        """Get number of active sessions"""
        return len(self.sessions)

# Global terminal manager instance
terminal_manager = TerminalManager()

async def handle_terminal_websocket(websocket: WebSocket):
    """
    Handle terminal WebSocket connection
    """
    session_id = None
    
    try:
        await websocket.accept()
        
        # Create new terminal session
        session_id = terminal_manager.create_session(websocket)
        session = terminal_manager.get_session(session_id)
        
        if not session:
            await websocket.send_text(json.dumps({
                'type': 'error',
                'data': 'Failed to create terminal session'
            }))
            return
        
        # Start terminal
        await session.start()
        
        # Handle WebSocket messages
        while True:
            try:
                data = await websocket.receive_text()
                message = json.loads(data)
                
                msg_type = message.get('type')
                
                if msg_type == 'input':
                    # User input
                    input_data = message.get('data', '')
                    await session.write_input(input_data)
                    
                elif msg_type == 'resize':
                    # Terminal resize
                    cols = message.get('cols', 80)
                    rows = message.get('rows', 24)
                    await session.resize(cols, rows)
                    
                elif msg_type == 'ping':
                    # Keepalive ping
                    await websocket.send_text(json.dumps({
                        'type': 'pong',
                        'data': 'alive'
                    }))
                    
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"Terminal WebSocket error: {e}")
                break
                
    except Exception as e:
        logger.error(f"Terminal WebSocket connection error: {e}")
    finally:
        # Clean up session
        if session_id:
            await terminal_manager.close_session(session_id)
