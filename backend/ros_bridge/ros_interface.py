#!/usr/bin/env python3

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy
from rclpy.executors import MultiThreadedExecutor
import threading
import json
import asyncio
from typing import Dict, Any, Optional, Callable
import time

# ROS2 message imports
from std_msgs.msg import String, Header
from geometry_msgs.msg import Twist, PoseStamped, PoseWithCovarianceStamped
from sensor_msgs.msg import LaserScan, Range, BatteryState
from nav_msgs.msg import OccupancyGrid, Odometry
from diagnostic_msgs.msg import DiagnosticArray
from rcl_interfaces.msg import Log
from builtin_interfaces.msg import Time

class ROS2WebBridge(Node):
    """
    ROS2 Web Bridge Node - Cầu nối giữa ROS2 và Web Interface
    Chuyển đổi ROS2 messages thành JSON và ngược lại
    """
    
    def __init__(self):
        super().__init__('web_bridge_node')
        
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

        # Switch states
        self.map_source = "static_map"  # "static_map" or "dynamic_map"
        self.position_mode = "receive_from_ros"  # "receive_from_ros" or "send_to_ros"
        self.running_mode = "line_following"  # "line_following" or "slam_auto"

        # Dynamic topic subscriptions
        self.dynamic_subscribers = {}
        self.current_map_topic = '/map'
        
        # QoS profiles
        self.sensor_qos = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=5  # Increased from 1 to 5 for better buffering
        )

        self.reliable_qos = QoSProfile(
            reliability=ReliabilityPolicy.RELIABLE,
            history=HistoryPolicy.KEEP_LAST,
            depth=10
        )

        # Rate limiting for high-frequency data
        self.last_scan_time = 0.0
        self.scan_rate_limit = 5.0  # Max 5 Hz for web interface
        self.last_odom_time = 0.0
        self.odom_rate_limit = 10.0  # Max 10 Hz for odometry
        
        # Initialize subscribers
        self.init_subscribers()
        
        # Initialize publishers
        self.init_publishers()
        
        # Node monitoring
        self.node_monitor_timer = self.create_timer(2.0, self.monitor_nodes)



        self.get_logger().info('ROS2 Web Bridge initialized')
    
    def init_subscribers(self):
        """Initialize ROS2 subscribers"""
        
        # Robot pose (AMCL or SLAM)
        self.amcl_sub = self.create_subscription(
            PoseWithCovarianceStamped,
            '/amcl_pose',
            self.amcl_pose_callback,
            self.reliable_qos
        )

        # SLAM pose (from slam_toolbox or other SLAM)
        self.pose_sub = self.create_subscription(
            PoseWithCovarianceStamped,
            '/pose',
            self.pose_callback,
            self.reliable_qos
        )
        
        # Odometry
        self.odom_sub = self.create_subscription(
            Odometry,
            '/odom',
            self.odom_callback,
            self.sensor_qos
        )
        
        # LiDAR scan
        self.scan_sub = self.create_subscription(
            LaserScan,
            '/scan',
            self.scan_callback,
            self.sensor_qos
        )
        
        # Battery state
        self.battery_sub = self.create_subscription(
            BatteryState,
            '/battery_state',
            self.battery_callback,
            self.reliable_qos
        )
        
        # Map
        self.map_sub = self.create_subscription(
            OccupancyGrid,
            '/map',
            self.map_callback,
            self.reliable_qos
        )
        
        # Diagnostics
        self.diagnostics_sub = self.create_subscription(
            DiagnosticArray,
            '/diagnostics_agg',
            self.diagnostics_callback,
            self.reliable_qos
        )
        
        # System logs
        self.log_sub = self.create_subscription(
            Log,
            '/rosout',
            self.log_callback,
            self.reliable_qos
        )
        
        # Ultrasonic sensors
        self.ultrasonic_sub = self.create_subscription(
            Range,
            '/ultrasonic/proximity',
            self.ultrasonic_callback,
            self.sensor_qos
        )
    
    def init_publishers(self):
        """Initialize ROS2 publishers"""
        
        # Velocity commands
        self.cmd_vel_pub = self.create_publisher(
            Twist,
            '/cmd_vel',
            10
        )
        
        # Navigation goals
        self.goal_pub = self.create_publisher(
            PoseStamped,
            '/goal_pose',
            10
        )
        
        # Initial pose for AMCL
        self.initial_pose_pub = self.create_publisher(
            PoseWithCovarianceStamped,
            '/initialpose',
            10
        )

        # Map publisher for custom maps
        self.map_pub = self.create_publisher(
            OccupancyGrid,
            '/map_custom',
            10
        )
    
    def amcl_pose_callback(self, msg):
        """Handle AMCL pose updates"""
        pose_data = {
            'x': msg.pose.pose.position.x,
            'y': msg.pose.pose.position.y,
            'z': msg.pose.pose.position.z,
            'orientation': {
                'x': msg.pose.pose.orientation.x,
                'y': msg.pose.pose.orientation.y,
                'z': msg.pose.pose.orientation.z,
                'w': msg.pose.pose.orientation.w
            },
            'timestamp': time.time()
        }
        
        self.latest_data['pose'] = pose_data
        self.notify_websocket('pose', pose_data)

    def pose_callback(self, msg):
        """Handle SLAM pose updates from /pose topic"""
        pose_data = {
            'x': msg.pose.pose.position.x,
            'y': msg.pose.pose.position.y,
            'z': msg.pose.pose.position.z,
            'orientation': {
                'x': msg.pose.pose.orientation.x,
                'y': msg.pose.pose.orientation.y,
                'z': msg.pose.pose.orientation.z,
                'w': msg.pose.pose.orientation.w
            },
            'timestamp': time.time()
        }

        # Update pose data (this will override AMCL if both are available)
        self.latest_data['pose'] = pose_data
        self.notify_websocket('pose', pose_data)

    def odom_callback(self, msg):
        """Handle odometry updates with rate limiting"""
        current_time = time.time()

        # Rate limit odometry data for web interface
        if current_time - self.last_odom_time < (1.0 / self.odom_rate_limit):
            # Still update latest data but don't broadcast
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
                'timestamp': current_time
            }
            self.latest_data['odom'] = odom_data
            return  # Skip websocket notification

        self.last_odom_time = current_time

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
            'timestamp': current_time
        }

        self.latest_data['odom'] = odom_data
        self.notify_websocket('odom', odom_data)
    
    def scan_callback(self, msg):
        """Handle LiDAR scan updates with rate limiting"""
        current_time = time.time()

        # Rate limit scan data for web interface
        if current_time - self.last_scan_time < (1.0 / self.scan_rate_limit):
            return  # Skip this message to reduce load

        self.last_scan_time = current_time

        # Downsample scan data for web transmission
        step = max(1, len(msg.ranges) // 180)  # Reduced from 360 to 180 points for better performance
        ranges = msg.ranges[::step]

        scan_data = {
            'angle_min': msg.angle_min,
            'angle_max': msg.angle_max,
            'angle_increment': msg.angle_increment * step,
            'range_min': msg.range_min,
            'range_max': msg.range_max,
            'ranges': [r if not float('inf') == r else None for r in ranges],
            'timestamp': current_time
        }

        self.latest_data['scan'] = scan_data
        # Only notify websocket for scan data occasionally to reduce network load
        if int(current_time * self.scan_rate_limit) % 2 == 0:  # Every other processed message
            self.notify_websocket('scan', scan_data)
    
    def battery_callback(self, msg):
        """Handle battery state updates"""
        battery_data = {
            'voltage': msg.voltage,
            'current': msg.current,
            'charge': msg.charge,
            'capacity': msg.capacity,
            'percentage': msg.percentage,
            'power_supply_status': msg.power_supply_status,
            'timestamp': time.time()
        }
        
        self.latest_data['battery'] = battery_data
        self.notify_websocket('battery', battery_data)
    
    def map_callback(self, msg):
        """Handle map updates"""
        # Convert occupancy grid to simplified format
        map_data = {
            'width': msg.info.width,
            'height': msg.info.height,
            'resolution': msg.info.resolution,
            'origin': {
                'x': msg.info.origin.position.x,
                'y': msg.info.origin.position.y,
                'orientation': msg.info.origin.orientation.z
            },
            'data': list(msg.data),  # Convert to list for JSON
            'timestamp': time.time()
        }
        
        self.latest_data['map'] = map_data
        self.notify_websocket('map', map_data)
    
    def diagnostics_callback(self, msg):
        """Handle diagnostics updates"""
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
        self.notify_websocket('diagnostics', diagnostics_data)
    
    def log_callback(self, msg):
        """Handle log messages"""
        log_data = {
            'timestamp': time.time(),
            'level': msg.level,
            'name': msg.name,
            'msg': msg.msg,
            'file': msg.file,
            'function': msg.function,
            'line': msg.line
        }
        
        # Keep only last 1000 log entries
        self.latest_data['logs'].append(log_data)
        if len(self.latest_data['logs']) > 1000:
            self.latest_data['logs'] = self.latest_data['logs'][-1000:]
        
        self.notify_websocket('log', log_data)
    
    def ultrasonic_callback(self, msg):
        """Handle ultrasonic sensor updates"""
        ultrasonic_data = {
            'range': msg.range,
            'min_range': msg.min_range,
            'max_range': msg.max_range,
            'field_of_view': msg.field_of_view,
            'timestamp': time.time()
        }
        
        self.latest_data['ultrasonic'] = ultrasonic_data
        self.notify_websocket('ultrasonic', ultrasonic_data)
    
    def monitor_nodes(self):
        """Monitor active ROS2 nodes"""
        try:
            node_names = self.get_node_names()
            node_status = {}
            
            for node_name in node_names:
                node_status[node_name] = {
                    'status': 'active',
                    'timestamp': time.time()
                }
            
            self.latest_data['node_status'] = node_status
            self.notify_websocket('node_status', node_status)
            
        except Exception as e:
            self.get_logger().error(f'Error monitoring nodes: {str(e)}')


    def notify_websocket(self, data_type: str, data: Dict[str, Any]):
        """Notify WebSocket clients of new data"""
        if data_type in self.websocket_callbacks:
            try:
                callback = self.websocket_callbacks[data_type]
                if callback:
                    # Use the stored main event loop
                    if hasattr(self, 'main_event_loop') and self.main_event_loop:
                        try:
                            # Schedule the coroutine in the main event loop
                            future = asyncio.run_coroutine_threadsafe(
                                callback(data_type, data), self.main_event_loop
                            )
                            # Don't wait for completion to avoid blocking
                            self.get_logger().debug(f'Scheduled {data_type} broadcast')
                        except Exception as e:
                            self.get_logger().error(f'Failed to schedule {data_type} broadcast: {str(e)}')
                    else:
                        self.get_logger().debug(f'No main event loop available for {data_type} broadcast')
            except Exception as e:
                self.get_logger().error(f'WebSocket callback error: {str(e)}')
    
    def register_websocket_callback(self, data_type: str, callback: Callable):
        """Register callback for WebSocket notifications"""
        self.websocket_callbacks[data_type] = callback

    def set_main_event_loop(self, loop):
        """Set the main event loop for WebSocket callbacks"""
        self.main_event_loop = loop
        self.get_logger().info('Main event loop set for WebSocket callbacks')
    
    def publish_cmd_vel(self, linear_x: float, linear_y: float, angular_z: float):
        """Publish velocity command"""
        msg = Twist()
        # Ensure proper type conversion to float
        msg.linear.x = float(linear_x)
        msg.linear.y = float(linear_y)
        msg.angular.z = float(angular_z)

        self.cmd_vel_pub.publish(msg)
        self.get_logger().info(f'Published cmd_vel: linear=({linear_x}, {linear_y}), angular={angular_z}')
    
    def publish_navigation_goal(self, x: float, y: float, orientation_w: float = 1.0):
        """Publish navigation goal"""
        self.get_logger().info(f'🎯 [ROS] Received navigation goal request: ({x}, {y}) with orientation_w={orientation_w}')

        # Check if goal publisher is available
        if not hasattr(self, 'goal_pub') or self.goal_pub is None:
            self.get_logger().error(f'❌ [ROS] Goal publisher not initialized!')
            return

        msg = PoseStamped()
        msg.header.frame_id = 'map'
        msg.header.stamp = self.get_clock().now().to_msg()

        # Ensure proper type conversion to float
        msg.pose.position.x = float(x)
        msg.pose.position.y = float(y)
        msg.pose.position.z = 0.0

        msg.pose.orientation.x = 0.0
        msg.pose.orientation.y = 0.0
        msg.pose.orientation.z = 0.0
        msg.pose.orientation.w = float(orientation_w)

        self.get_logger().info(f'🎯 [ROS] Publishing to topic: {self.goal_pub.topic_name}')
        self.get_logger().info(f'🎯 [ROS] Message frame_id: {msg.header.frame_id}')
        self.get_logger().info(f'🎯 [ROS] Message position: ({msg.pose.position.x}, {msg.pose.position.y}, {msg.pose.position.z})')
        self.get_logger().info(f'🎯 [ROS] Message orientation: ({msg.pose.orientation.x}, {msg.pose.orientation.y}, {msg.pose.orientation.z}, {msg.pose.orientation.w})')

        try:
            self.goal_pub.publish(msg)
            self.get_logger().info(f'✅ [ROS] Navigation goal published successfully to {self.goal_pub.topic_name}')

            # Check if there are subscribers
            subscriber_count = self.goal_pub.get_subscription_count()
            self.get_logger().info(f'📊 [ROS] Goal topic has {subscriber_count} subscribers')

            if subscriber_count == 0:
                self.get_logger().warn(f'⚠️ [ROS] No subscribers listening to {self.goal_pub.topic_name}!')
                self.get_logger().info(f'🚗 [ROS] TESTING: Publishing direct cmd_vel command as fallback...')

                # Fallback: publish a simple movement command directly
                cmd_msg = Twist()
                cmd_msg.linear.x = 0.1  # Move forward slowly
                cmd_msg.angular.z = 0.0

                self.cmd_vel_pub.publish(cmd_msg)
                self.get_logger().info(f'🚗 [ROS] Direct cmd_vel published: linear.x=0.1, angular.z=0.0')

        except Exception as e:
            self.get_logger().error(f'❌ [ROS] Error publishing navigation goal: {str(e)}')
    
    def publish_initial_pose(self, x: float, y: float, orientation_w: float = 1.0):
        """Publish initial pose for AMCL"""
        msg = PoseWithCovarianceStamped()
        msg.header.frame_id = 'map'
        msg.header.stamp = self.get_clock().now().to_msg()

        # Ensure proper type conversion to float
        msg.pose.pose.position.x = float(x)
        msg.pose.pose.position.y = float(y)
        msg.pose.pose.position.z = 0.0

        msg.pose.pose.orientation.x = 0.0
        msg.pose.pose.orientation.y = 0.0
        msg.pose.pose.orientation.z = 0.0
        msg.pose.pose.orientation.w = float(orientation_w)
        
        # Set covariance (uncertainty)
        msg.pose.covariance = [0.25, 0.0, 0.0, 0.0, 0.0, 0.0,
                              0.0, 0.25, 0.0, 0.0, 0.0, 0.0,
                              0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                              0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                              0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                              0.0, 0.0, 0.0, 0.0, 0.0, 0.068]
        
        self.initial_pose_pub.publish(msg)
        self.get_logger().info(f'Published initial pose: ({x}, {y})')

    def publish_map(self, map_data: Dict[str, Any]):
        """Publish custom map as ROS2 OccupancyGrid"""
        try:
            msg = OccupancyGrid()

            # Header
            msg.header.frame_id = 'map'
            msg.header.stamp = self.get_clock().now().to_msg()

            # Map metadata
            msg.info.width = map_data['width']
            msg.info.height = map_data['height']
            msg.info.resolution = map_data['resolution']
            msg.info.origin.position.x = map_data['origin_x']
            msg.info.origin.position.y = map_data['origin_y']
            msg.info.origin.position.z = 0.0
            msg.info.origin.orientation.w = 1.0

            # Map data
            msg.data = map_data['data']

            # Publish
            self.map_pub.publish(msg)
            self.get_logger().info(f'Published custom map: {msg.info.width}x{msg.info.height} at {msg.info.resolution}m/px')

        except Exception as e:
            self.get_logger().error(f'Error publishing map: {str(e)}')
            raise

    def get_latest_data(self, data_type: str = None):
        """Get latest data for specific type or all data"""
        if data_type:
            return self.latest_data.get(data_type)
        return self.latest_data

    def switch_map_topic(self, new_topic):
        """Switch map subscription to a different topic"""
        try:
            # Destroy current subscription
            if hasattr(self, 'map_sub') and self.map_sub:
                self.destroy_subscription(self.map_sub)
                self.get_logger().info(f"Unsubscribed from {self.current_map_topic}")

            # Create new subscription
            self.map_sub = self.create_subscription(
                OccupancyGrid,
                new_topic,
                self.map_callback,
                self.reliable_qos
            )

            self.current_map_topic = new_topic
            self.get_logger().info(f"Switched map subscription to {new_topic}")

            # Update map source state
            if new_topic == '/map':
                self.map_source = "static_map"
            elif new_topic in ['/map_dynamic', '/map_enhanced']:
                self.map_source = "dynamic_map"

        except Exception as e:
            self.get_logger().error(f"Failed to switch map topic: {e}")

    def set_position_mode(self, mode):
        """Set robot position mode"""
        try:
            self.position_mode = mode
            self.get_logger().info(f"Position mode set to: {mode}")

            if mode == "receive_from_ros":
                self.get_logger().info("Robot will receive position updates from ROS")
            elif mode == "send_to_ros":
                self.get_logger().info("Robot ready to receive initial pose from web interface")

        except Exception as e:
            self.get_logger().error(f"Failed to set position mode: {e}")

    def set_running_mode(self, mode, config):
        """Set robot running mode"""
        try:
            self.running_mode = mode
            self.get_logger().info(f"Running mode set to: {mode}")
            self.get_logger().info(f"Mode config: {config}")

            # Here you can add logic to:
            # - Enable/disable SLAM nodes
            # - Switch navigation stacks
            # - Configure autonomous behavior

            if mode == "line_following":
                self.get_logger().info("Configured for line following mode")
                # Add line following specific configuration
            elif mode == "slam_auto":
                self.get_logger().info("Configured for SLAM autonomous mode")
                # Add SLAM autonomous specific configuration

        except Exception as e:
            self.get_logger().error(f"Failed to set running mode: {e}")

    def get_switch_states(self):
        """Get current switch states"""
        return {
            "map_source": self.map_source,
            "position_mode": self.position_mode,
            "running_mode": self.running_mode,
            "current_map_topic": self.current_map_topic
        }


# Global ROS2 bridge instance
ros_bridge = None
ros_executor = None
ros_thread = None

def init_ros_bridge():
    """Initialize ROS2 bridge in separate thread"""
    global ros_bridge, ros_executor, ros_thread
    
    if ros_bridge is not None:
        return ros_bridge
    
    def run_ros():
        global ros_bridge, ros_executor
        
        rclpy.init()
        ros_bridge = ROS2WebBridge()
        ros_executor = MultiThreadedExecutor()
        ros_executor.add_node(ros_bridge)
        
        try:
            ros_executor.spin()
        except KeyboardInterrupt:
            pass
        finally:
            ros_bridge.destroy_node()
            rclpy.shutdown()
    
    ros_thread = threading.Thread(target=run_ros, daemon=True)
    ros_thread.start()
    
    # Wait for initialization
    timeout = 10
    start_time = time.time()
    while ros_bridge is None and (time.time() - start_time) < timeout:
        time.sleep(0.1)
    
    if ros_bridge is None:
        raise RuntimeError("Failed to initialize ROS2 bridge")
    
    return ros_bridge

def get_ros_bridge():
    """Get the global ROS2 bridge instance"""
    global ros_bridge
    if ros_bridge is None:
        return init_ros_bridge()
    return ros_bridge

def shutdown_ros_bridge():
    """Shutdown ROS2 bridge"""
    global ros_bridge, ros_executor, ros_thread
    
    if ros_executor:
        ros_executor.shutdown()
    
    if ros_thread and ros_thread.is_alive():
        ros_thread.join(timeout=5)
    
    ros_bridge = None
    ros_executor = None
    ros_thread = None
