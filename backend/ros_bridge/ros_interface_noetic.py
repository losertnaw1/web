#!/usr/bin/env python3

"""
ROS Noetic Web Bridge Interface
Provides ROS1 (Noetic) integration for the web backend
Compatible with the existing backend API but uses ROS1 instead of ROS2
"""

import rospy
import threading
import json
import time
import subprocess
import os
from threading import Lock
from typing import Dict, Any, Optional, Callable
from pathlib import Path

# ROS1 message imports
from std_msgs.msg import String, Header
from sensor_msgs.msg import LaserScan
from amr_battery.msg import Battery_msgs
from nav_msgs.msg import Odometry, OccupancyGrid
from geometry_msgs.msg import Twist, PoseStamped, PoseWithCovarianceStamped
from diagnostic_msgs.msg import DiagnosticArray
import genpy
import rostopic

class ROS1WebBridge:
    """
    ROS1 Web Bridge - Bridge between ROS Noetic and Web Interface
    Provides the same interface as ROS2 bridge but uses ROS1
    """
    
    def __init__(self):
        # Initialize ROS node with proper signal handling
        try:
            # Check if ROS node is already initialized
            if not rospy.core.is_initialized():
                rospy.init_node('web_bridge_node', anonymous=True, disable_signals=True)
                rospy.loginfo("ROS node initialized successfully")
            else:
                rospy.loginfo("ROS node already initialized")
        except Exception as e:
            rospy.logerr(f"Failed to initialize ROS node: {e}")
            raise
        
        # Data storage for latest messages
        self.latest_data = {
            'pose': None,
            'odom': None,
            'scan': None,
            'battery': None,
            'map': None,
            'diagnostics': None,
            'logs': [],
            'node_status': {},
            'ultrasonic': {}
        }
        
        # WebSocket callback functions
        self.websocket_callbacks = {}

        # Thread safety
        self.data_lock = Lock()

        # Switch states
        self.map_source = "static_map"  # "static_map" or "dynamic_map"
        self.position_mode = "receive_from_ros"  # "receive_from_ros" or "send_to_ros"
        self.running_mode = "line_following"  # "line_following" or "slam_auto"

        # Dynamic topic subscriptions
        self.dynamic_subscribers = {}
        
        # Initialize subscribers and publishers
        self.init_subscribers()
        self.init_publishers()
        
        # Main event loop reference (for WebSocket callbacks)
        self.main_event_loop = None
        
        rospy.loginfo("ROS1 Web Bridge initialized")
    
    def init_subscribers(self):
        """Initialize ROS1 subscribers"""
        
        # Robot pose (AMCL)
        self.amcl_sub = rospy.Subscriber(
            '/amcl_pose',
            PoseWithCovarianceStamped,
            self.amcl_pose_callback,
            queue_size=10
        )
        
        # Odometry
        self.odom_sub = rospy.Subscriber(
            '/odom_from_laser',
            Odometry,
            self.odom_callback,
            queue_size=10
        )
        
        # LiDAR scan
        self.scan_sub = rospy.Subscriber(
            '/scan_forward',
            LaserScan,
            self.scan_callback,
            queue_size=5
        )
        
        self.battery_sub = rospy.Subscriber(
            '/battery',
            Battery_msgs,
            self.battery_callback,
            queue_size=10
        )
        
        # Map data - initially subscribe to static map
        self.map_sub = rospy.Subscriber(
            '/map',
            OccupancyGrid,
            self.map_callback,
            queue_size=1
        )

        # Store current map topic for dynamic switching
        self.current_map_topic = '/map'
        
        # Diagnostics
        self.diagnostics_sub = rospy.Subscriber(
            '/diagnostics',
            DiagnosticArray,
            self.diagnostics_callback,
            queue_size=10
        )
        
        rospy.loginfo("ROS1 subscribers initialized")
    
    def init_publishers(self):
        """Initialize ROS1 publishers"""
        
        # Velocity commands
        self.cmd_vel_pub = rospy.Publisher(
            '/cmd_vel',
            Twist,
            queue_size=10
        )
        
        # Navigation goals
        self.goal_pub = rospy.Publisher(
            '/move_base/current_goal',
            PoseStamped,
            queue_size=10
        )
        
        # Initial pose (for AMCL)
        self.initial_pose_pub = rospy.Publisher(
            '/initialpose',
            PoseWithCovarianceStamped,
            queue_size=10
        )
        
        rospy.loginfo("ROS1 publishers initialized")
    
    def set_main_event_loop(self, loop):
        """Set the main event loop for WebSocket callbacks"""
        self.main_event_loop = loop
    
    def register_websocket_callback(self, data_type: str, callback: Callable):
        """Register callback for WebSocket updates"""
        self.websocket_callbacks[data_type] = callback
    
    def amcl_pose_callback(self, msg):
        """Handle AMCL pose updates"""
        with self.data_lock:
            pose_data = {
                'position': {
                    'x': msg.pose.pose.position.x,
                    'y': msg.pose.pose.position.y,
                    'z': msg.pose.pose.position.z
                },
                'orientation': {
                    'x': msg.pose.pose.orientation.x,
                    'y': msg.pose.pose.orientation.y,
                    'z': msg.pose.pose.orientation.z,
                    'w': msg.pose.pose.orientation.w
                },
                'covariance': list(msg.pose.covariance),
                'timestamp': time.time(),
                'frame_id': msg.header.frame_id
            }
            
            self.latest_data['pose'] = pose_data
            self._trigger_websocket_callback('pose', pose_data)
    
    def pose_callback(self, msg):
        """Handle general pose updates"""
        self.amcl_pose_callback(msg)  # Same handling as AMCL
    
    def odom_callback(self, msg):
        """Handle odometry updates"""
        with self.data_lock:
            odom_data = {
                'position': {
                    'x': msg.pose.pose.position.x,
                    'y': msg.pose.pose.position.y,
                    'z': msg.pose.pose.position.z
                },
                'orientation': {
                    'x': msg.pose.pose.orientation.x,
                    'y': msg.pose.pose.orientation.y,
                    'z': msg.pose.pose.orientation.z,
                    'w': msg.pose.pose.orientation.w
                },
                'linear_velocity': {
                    'x': msg.twist.twist.linear.x,
                    'y': msg.twist.twist.linear.y,
                    'z': msg.twist.twist.linear.z
                },
                'angular_velocity': {
                    'x': msg.twist.twist.angular.x,
                    'y': msg.twist.twist.angular.y,
                    'z': msg.twist.twist.angular.z
                },
                'timestamp': time.time(),
                'frame_id': msg.header.frame_id
            }
            
            self.latest_data['odom'] = odom_data
            self._trigger_websocket_callback('odom', odom_data)
    
    def scan_callback(self, msg):
        """Handle LiDAR scan updates"""
        with self.data_lock:
            # Convert ranges, filtering out invalid values
            ranges = []
            for r in msg.ranges:
                if r < msg.range_min or r > msg.range_max:
                    ranges.append(None)
                else:
                    ranges.append(float(r))
            
            scan_data = {
                'ranges': ranges,
                'angle_min': msg.angle_min,
                'angle_max': msg.angle_max,
                'angle_increment': msg.angle_increment,
                'range_min': msg.range_min,
                'range_max': msg.range_max,
                'timestamp': time.time(),
                'frame_id': msg.header.frame_id
            }
            
            self.latest_data['scan'] = scan_data
            self._trigger_websocket_callback('scan', scan_data)
    
    def battery_callback(self, msg):
        """Handle battery state updates - supports both standard and custom message types"""
        with self.data_lock:
            try:
                # Initialize battery data with defaults
                battery_data = {
                    'voltage': 0.0,
                    'current': 0.0,
                    'charge': 0.0,
                    'capacity': 0.0,
                    'percentage': 0.0,
                    'power_supply_status': 0,
                    'power_supply_health': 0,
                    'timestamp': time.time()
                }

                # Try to extract data from the message dynamically
                # Check for standard BatteryState fields
                if hasattr(msg, 'voltage'):
                    battery_data['voltage'] = float(msg.voltage)
                if hasattr(msg, 'current'):
                    battery_data['current'] = float(msg.current)
                if hasattr(msg, 'charge'):
                    battery_data['charge'] = float(msg.charge)
                if hasattr(msg, 'capacity'):
                    battery_data['capacity'] = float(msg.capacity)
                if hasattr(msg, 'percentage'):
                    battery_data['percentage'] = float(msg.percentage)
                if hasattr(msg, 'power_supply_status'):
                    battery_data['power_supply_status'] = int(msg.power_supply_status)
                if hasattr(msg, 'power_supply_health'):
                    battery_data['power_supply_health'] = int(msg.power_supply_health)

                # Check for custom message fields (common alternatives)
                if hasattr(msg, 'volt') and battery_data['voltage'] == 0.0:
                    battery_data['voltage'] = float(msg.volt)
                if hasattr(msg, 'amp') and battery_data['current'] == 0.0:
                    battery_data['current'] = float(msg.amp)
                if hasattr(msg, 'percent') and battery_data['percentage'] == 0.0:
                    battery_data['percentage'] = float(msg.percent)
                if hasattr(msg, 'level') and battery_data['percentage'] == 0.0:
                    battery_data['percentage'] = float(msg.level)

                # Log the extracted data for debugging
                # rospy.loginfo(f"🔋 [ROS Bridge] Battery data extracted: voltage={battery_data['voltage']:.2f}V, "
                #              f"current={battery_data['current']:.2f}A, percentage={battery_data['percentage']:.1f}%")

                self.latest_data['battery'] = battery_data
                self._trigger_websocket_callback('battery', battery_data)

            except Exception as e:
                rospy.logerr(f"🔋 [ROS Bridge] Error processing battery message: {e}")
                rospy.logerr(f"🔋 [ROS Bridge] Message attributes: {dir(msg)}")

                # Provide fallback data
                fallback_data = {
                    'voltage': 12.0,  # Default voltage
                    'current': 0.0,
                    'charge': 0.0,
                    'capacity': 100.0,
                    'percentage': 50.0,  # Default percentage
                    'power_supply_status': 2,  # POWER_SUPPLY_STATUS_DISCHARGING
                    'power_supply_health': 1,  # POWER_SUPPLY_HEALTH_GOOD
                    'timestamp': time.time()
                }
                self.latest_data['battery'] = fallback_data
                self._trigger_websocket_callback('battery', fallback_data)
    
    def map_callback(self, msg):
        """Handle map updates"""
        rospy.loginfo("MAP CALLBACK CALLED! Map size: {}x{}, data length: {}".format(msg.info.width, msg.info.height, len(msg.data)))
        with self.data_lock:
            map_data = {
                'width': msg.info.width,
                'height': msg.info.height,
                'resolution': msg.info.resolution,
                'origin': {
                    'x': msg.info.origin.position.x,
                    'y': msg.info.origin.position.y,
                    'theta': msg.info.origin.orientation.z
                },
                'data': list(msg.data),
                'timestamp': time.time(),
                'frame_id': msg.header.frame_id
            }
            
            self.latest_data['map'] = map_data
            rospy.loginfo("MAP DATA STORED in latest_data")
            self._trigger_websocket_callback('map', map_data)
    
    def diagnostics_callback(self, msg):
        """Handle diagnostics updates"""
        with self.data_lock:
            diagnostics_data = {
                'status': [],
                'timestamp': time.time()
            }
            
            for status in msg.status:
                status_data = {
                    'name': status.name,
                    'level': status.level,
                    'message': status.message,
                    'hardware_id': status.hardware_id,
                    'values': {kv.key: kv.value for kv in status.values}
                }
                diagnostics_data['status'].append(status_data)
            
            self.latest_data['diagnostics'] = diagnostics_data
            self._trigger_websocket_callback('diagnostics', diagnostics_data)
    
    def _trigger_websocket_callback(self, data_type: str, data: Dict[str, Any]):
        """Trigger WebSocket callback if registered"""
        if data_type in self.websocket_callbacks:
            callback = self.websocket_callbacks[data_type]
            if self.main_event_loop and callback:
                # Schedule callback in main event loop
                self.main_event_loop.call_soon_threadsafe(
                    lambda: self._safe_callback(callback, data)
                )
    
    def _safe_callback(self, callback, data):
        """Safely execute callback"""
        try:
            if hasattr(callback, '__call__'):
                callback(data)
        except Exception as e:
            rospy.logerr(f"WebSocket callback error: {e}")
    
    def get_latest_data(self, data_type: str) -> Optional[Dict[str, Any]]:
        """Get latest data for specified type"""
        with self.data_lock:
            return self.latest_data.get(data_type)
    
    def get_all_latest_data(self) -> Dict[str, Any]:
        """Get all latest data"""
        with self.data_lock:
            return self.latest_data.copy()

    def refresh_map_subscription(self):
        """Refresh map subscription to force new map data"""
        try:
            rospy.loginfo("🗺️ [ROS Bridge] Refreshing map subscription...")

            # Unsubscribe from current map topic
            if hasattr(self, 'map_sub') and self.map_sub:
                self.map_sub.unregister()
                rospy.loginfo("🗺️ [ROS Bridge] Unsubscribed from map topic")

            # Wait a moment
            rospy.sleep(0.1)

            # Resubscribe to map topic
            self.map_sub = rospy.Subscriber(
                '/map',
                OccupancyGrid,
                self.map_callback,
                queue_size=1
            )
            rospy.loginfo("🗺️ [ROS Bridge] Resubscribed to map topic")

            # Clear old map data to force fresh data
            with self.data_lock:
                if 'map' in self.latest_data:
                    del self.latest_data['map']
                    rospy.loginfo("🗺️ [ROS Bridge] Cleared old map data")

        except Exception as e:
            rospy.logerr(f"🗺️ [ROS Bridge] Error refreshing map subscription: {e}")
            raise

    def save_map(self, file_path: str) -> Dict[str, str]:
        """Save current map using ROS map_saver"""
        try:
            # Ensure directory exists
            path = Path(file_path)
            if path.parent:
                path.parent.mkdir(parents=True, exist_ok=True)

            subprocess.run(
                ['rosrun', 'map_server', 'map_saver', '-f', str(path)],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            rospy.loginfo(f"Map saved to {path}")
            return {
                'yaml': f"{path}.yaml",
                'pgm': f"{path}.pgm"
            }
        except subprocess.CalledProcessError as e:
            err = e.stderr.decode() if e.stderr else str(e)
            rospy.logerr(f"Map save command failed: {err}")
            raise
        except Exception as e:
            rospy.logerr(f"Failed to save map: {e}")
            raise

    def publish_cmd_vel(self, linear_x: float, linear_y: float, angular_z: float):
        """Publish velocity command"""
        msg = Twist()
        msg.linear.x = float(linear_x)
        msg.linear.y = float(linear_y)
        msg.angular.z = float(angular_z)
        
        self.cmd_vel_pub.publish(msg)
        rospy.loginfo(f'Published cmd_vel: linear=({linear_x}, {linear_y}), angular={angular_z}')
    
    def publish_navigation_goal(self, x: float, y: float, orientation_w: float = 1.0):
        """Publish navigation goal"""
        rospy.loginfo(f'Publishing navigation goal: ({x}, {y}) with orientation_w={orientation_w}')
        
        msg = PoseStamped()
        msg.header.frame_id = 'map'
        msg.header.stamp = rospy.Time.now()
        
        msg.pose.position.x = float(x)
        msg.pose.position.y = float(y)
        msg.pose.position.z = 0.0
        
        msg.pose.orientation.x = 0.0
        msg.pose.orientation.y = 0.0
        msg.pose.orientation.z = 0.0
        msg.pose.orientation.w = float(orientation_w)
        
        self.goal_pub.publish(msg)
        rospy.loginfo(f'Navigation goal published successfully')
    
    def publish_initial_pose(self, x: float, y: float, theta: float):
        """Publish initial pose for AMCL"""
        msg = PoseWithCovarianceStamped()
        msg.header.frame_id = 'map'
        msg.header.stamp = rospy.Time.now()
        
        msg.pose.pose.position.x = float(x)
        msg.pose.pose.position.y = float(y)
        msg.pose.pose.position.z = 0.0
        
        # Convert theta to quaternion
        import math
        msg.pose.pose.orientation.x = 0.0
        msg.pose.pose.orientation.y = 0.0
        msg.pose.pose.orientation.z = math.sin(theta / 2.0)
        msg.pose.pose.orientation.w = math.cos(theta / 2.0)
        
        # Set covariance
        msg.pose.covariance = [0.0] * 36
        msg.pose.covariance[0] = 0.25   # x
        msg.pose.covariance[7] = 0.25   # y
        msg.pose.covariance[35] = 0.068 # theta
        
        self.initial_pose_pub.publish(msg)
        rospy.loginfo(f'Initial pose published: ({x}, {y}, {theta})')

    def switch_map_topic(self, new_topic):
        """Switch map subscription to a different topic"""
        try:
            # Unsubscribe from current topic
            if hasattr(self, 'map_sub') and self.map_sub:
                self.map_sub.unregister()
                rospy.loginfo(f"Unsubscribed from {self.current_map_topic}")

            # Subscribe to new topic
            self.map_sub = rospy.Subscriber(
                new_topic,
                OccupancyGrid,
                self.map_callback,
                queue_size=1
            )

            self.current_map_topic = new_topic
            rospy.loginfo(f"Switched map subscription to {new_topic}")

            # Update map source state
            if new_topic == '/map':
                self.map_source = "static_map"
            elif new_topic in ['/map_dynamic', '/map_enhanced']:
                self.map_source = "dynamic_map"

        except Exception as e:
            rospy.logerr(f"Failed to switch map topic: {e}")

    def set_position_mode(self, mode):
        """Set robot position mode"""
        try:
            self.position_mode = mode
            rospy.loginfo(f"Position mode set to: {mode}")

            if mode == "receive_from_ros":
                rospy.loginfo("Robot will receive position updates from ROS")
            elif mode == "send_to_ros":
                rospy.loginfo("Robot ready to receive initial pose from web interface")

        except Exception as e:
            rospy.logerr(f"Failed to set position mode: {e}")

    def set_running_mode(self, mode, config):
        """Set robot running mode"""
        try:
            self.running_mode = mode
            rospy.loginfo(f"Running mode set to: {mode}")
            rospy.loginfo(f"Mode config: {config}")

            # Here you can add logic to:
            # - Enable/disable SLAM nodes
            # - Switch navigation stacks
            # - Configure autonomous behavior

            if mode == "line_following":
                rospy.loginfo("Configured for line following mode")
                # Add line following specific configuration
            elif mode == "slam_auto":
                rospy.loginfo("Configured for SLAM autonomous mode")
                # Add SLAM autonomous specific configuration

        except Exception as e:
            rospy.logerr(f"Failed to set running mode: {e}")

    def get_switch_states(self):
        """Get current switch states"""
        return {
            "map_source": self.map_source,
            "position_mode": self.position_mode,
            "running_mode": self.running_mode,
            "current_map_topic": self.current_map_topic
        }

# Global bridge instance
ros_bridge = None
ros_thread = None

def get_ros_bridge():
    """Get the global ROS bridge instance"""
    return ros_bridge

def init_ros_bridge():
    """Initialize ROS1 bridge in separate thread"""
    global ros_bridge, ros_thread
    
    if ros_bridge is not None:
        return ros_bridge
    
    def run_ros():
        global ros_bridge
        try:
            ros_bridge = ROS1WebBridge()
            rospy.spin()  # Keep the node alive
        except Exception as e:
            rospy.logerr(f"ROS bridge error: {e}")
        finally:
            ros_bridge = None
    
    ros_thread = threading.Thread(target=run_ros, daemon=True)
    ros_thread.start()
    
    # Wait for initialization
    timeout = 10  # seconds
    start_time = time.time()
    while ros_bridge is None and (time.time() - start_time) < timeout:
        time.sleep(0.1)
    
    if ros_bridge is None:
        raise Exception("Failed to initialize ROS1 bridge within timeout")
    
    return ros_bridge

def shutdown_ros_bridge():
    """Shutdown ROS bridge"""
    global ros_bridge
    if ros_bridge:
        rospy.signal_shutdown("Web interface shutdown")
        ros_bridge = None

    def switch_map_topic(self, new_topic):
        """Switch map data source topic"""
        rospy.loginfo(f"Switching map topic to: {new_topic}")
        
        # Unsubscribe from current map topic
        if hasattr(self, 'map_sub') and self.map_sub:
            self.map_sub.unregister()
        
        if new_topic == "/map_dynamic":
            # Start dynamic mapping
            from .dynamic_mapping import get_dynamic_mapper
            self.dynamic_mapper = get_dynamic_mapper()
            self.dynamic_mapper.set_map_callback(self._handle_dynamic_map)
            
            # Start SLAM for dynamic mapping
            self.dynamic_mapper.start_slam("gmapping")
            rospy.loginfo("Dynamic mapping started with GMapping")
            
        else:
            # Stop dynamic mapping if it was running
            if hasattr(self, 'dynamic_mapper') and self.dynamic_mapper:
                self.dynamic_mapper.stop_slam()
            
            # Subscribe to static map topic
            self.map_sub = rospy.Subscriber(new_topic, OccupancyGrid, self.map_callback)
            rospy.loginfo(f"Subscribed to static map topic: {new_topic}")
    
    def _handle_dynamic_map(self, map_data):
        """Handle dynamic map updates"""
        try:
            # Send to WebSocket
            if self.websocket_callback:
                self.websocket_callback('map', map_data)
        except Exception as e:
            rospy.logerr(f"Error handling dynamic map: {e}")
    
    def set_position_mode(self, mode):
        """Set robot position mode"""
        rospy.loginfo(f"Setting position mode to: {mode}")
        self.position_mode = mode
        
        if mode == "send_to_ros":
            # Initialize initial pose publisher if not exists
            if not hasattr(self, 'initial_pose_pub'):
                self.initial_pose_pub = rospy.Publisher(
                    '/initialpose', 
                    PoseWithCovarianceStamped, 
                    queue_size=1
                )
                rospy.loginfo("Initial pose publisher created")
    
    def publish_initial_pose(self, x, y, theta):
        """Publish initial pose to ROS"""
        if not hasattr(self, 'initial_pose_pub'):
            rospy.logerr("Initial pose publisher not initialized")
            return False
        
        try:
            from geometry_msgs.msg import PoseWithCovarianceStamped, Pose, Point, Quaternion
            from tf.transformations import quaternion_from_euler
            
            pose_msg = PoseWithCovarianceStamped()
            pose_msg.header.stamp = rospy.Time.now()
            pose_msg.header.frame_id = "map"
            
            # Set position
            pose_msg.pose.pose.position = Point(x=x, y=y, z=0.0)
            
            # Convert theta to quaternion
            quat = quaternion_from_euler(0, 0, theta)
            pose_msg.pose.pose.orientation = Quaternion(x=quat[0], y=quat[1], z=quat[2], w=quat[3])
            
            # Set covariance (uncertainty)
            pose_msg.pose.covariance = [0.25, 0.0, 0.0, 0.0, 0.0, 0.0,
                                       0.0, 0.25, 0.0, 0.0, 0.0, 0.0,
                                       0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                                       0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                                       0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                                       0.0, 0.0, 0.0, 0.0, 0.0, 0.06853891945200942]
            
            self.initial_pose_pub.publish(pose_msg)
            rospy.loginfo(f"Published initial pose: ({x}, {y}, {theta})")
            return True
            
        except Exception as e:
            rospy.logerr(f"Error publishing initial pose: {e}")
            return False
    
    def set_running_mode(self, mode, config):
        """Set robot running mode"""
        rospy.loginfo(f"Setting running mode to: {mode}")
        rospy.loginfo(f"Mode config: {config}")
        
        # Here you can implement mode-specific logic
        # For example, switching between different navigation stacks
        
        if mode == "slam_auto":
            # Enable autonomous navigation with SLAM
            if hasattr(self, 'dynamic_mapper') and self.dynamic_mapper:
                if not self.dynamic_mapper.is_slam_running():
                    self.dynamic_mapper.start_slam("gmapping")
                    rospy.loginfo("SLAM enabled for autonomous mode")
        
        elif mode == "line_following":
            # Disable SLAM for line following mode
            if hasattr(self, 'dynamic_mapper') and self.dynamic_mapper:
                if self.dynamic_mapper.is_slam_running():
                    self.dynamic_mapper.stop_slam()
                    rospy.loginfo("SLAM disabled for line following mode")
    
    def get_slam_status(self):
        """Get current SLAM status"""
        if hasattr(self, 'dynamic_mapper') and self.dynamic_mapper:
            return self.dynamic_mapper.get_slam_status()
        return {'running': False, 'mode': None, 'map_available': False}
