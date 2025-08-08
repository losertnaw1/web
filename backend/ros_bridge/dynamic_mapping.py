#!/usr/bin/env python3

"""
Dynamic Mapping Module for ROS Bridge
Integrates SLAM algorithms to build dynamic maps from sensor data
"""

import rospy
import threading
import numpy as np
from sensor_msgs.msg import LaserScan
from nav_msgs.msg import OccupancyGrid, Odometry
from geometry_msgs.msg import PoseWithCovarianceStamped
from tf2_msgs.msg import TFMessage
import tf2_ros
import tf2_geometry_msgs
from tf.transformations import euler_from_quaternion
import subprocess
import os
import signal
import time

class DynamicMapper:
    """
    Dynamic mapping system that can switch between different SLAM algorithms
    """
    
    def __init__(self):
        self.current_slam_mode = None
        self.slam_process = None
        self.dynamic_map = None
        self.slam_lock = threading.Lock()
        
        # TF buffer for coordinate transformations
        self.tf_buffer = tf2_ros.Buffer()
        self.tf_listener = tf2_ros.TransformListener(self.tf_buffer)
        
        # Subscribers for sensor data
        self.scan_sub = None
        self.odom_sub = None
        self.tf_sub = None
        
        # Publisher for dynamic map
        self.map_pub = rospy.Publisher('/map_dynamic', OccupancyGrid, queue_size=1)
        
        # Callback for map updates
        self.map_callback = None
        
        rospy.loginfo("Dynamic Mapper initialized")
    
    def set_map_callback(self, callback):
        """Set callback function for map updates"""
        self.map_callback = callback
    
    def start_slam(self, slam_type="gmapping"):
        """
        Start SLAM algorithm
        
        Args:
            slam_type: "gmapping", "hector", or "cartographer"
        """
        with self.slam_lock:
            # Stop current SLAM if running
            self.stop_slam()
            
            rospy.loginfo(f"Starting {slam_type} SLAM...")
            
            if slam_type == "gmapping":
                self._start_gmapping()
            elif slam_type == "hector":
                self._start_hector_slam()
            else:
                rospy.logerr(f"Unknown SLAM type: {slam_type}")
                return False
            
            self.current_slam_mode = slam_type
            
            # Subscribe to the dynamic map topic
            self.map_sub = rospy.Subscriber('/map', OccupancyGrid, self._map_callback)
            
            rospy.loginfo(f"{slam_type} SLAM started successfully")
            return True
    
    def stop_slam(self):
        """Stop current SLAM algorithm"""
        with self.slam_lock:
            if self.slam_process:
                rospy.loginfo(f"Stopping {self.current_slam_mode} SLAM...")
                try:
                    # Send SIGTERM to gracefully shutdown
                    self.slam_process.terminate()
                    self.slam_process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    # Force kill if not responding
                    self.slam_process.kill()
                    self.slam_process.wait()
                
                self.slam_process = None
                rospy.loginfo("SLAM process stopped")
            
            # Unsubscribe from map topic
            if hasattr(self, 'map_sub') and self.map_sub:
                self.map_sub.unregister()
                self.map_sub = None
            
            self.current_slam_mode = None
    
    def _start_gmapping(self):
        """Start GMapping SLAM"""
        # GMapping launch command
        cmd = [
            'rosrun', 'gmapping', 'slam_gmapping',
            'scan:=/scan_forward',
            '_base_frame:=base_link',
            '_odom_frame:=odom',
            '_map_frame:=map',
            '_delta:=0.05',
            '_xmin:=-10.0',
            '_ymin:=-10.0',
            '_xmax:=10.0',
            '_ymax:=10.0',
            '_particles:=100',
            '_linearUpdate:=0.2',
            '_angularUpdate:=0.1',
            '_temporalUpdate:=0.5'
        ]
        
        self.slam_process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            preexec_fn=os.setsid  # Create new process group
        )
        
        rospy.loginfo("GMapping process started")
    
    def _start_hector_slam(self):
        """Start Hector SLAM (if available)"""
        # Hector SLAM launch command
        cmd = [
            'rosrun', 'hector_mapping', 'hector_mapping',
            'scan:=/scan_forward',
            '_base_frame:=base_link',
            '_odom_frame:=odom',
            '_map_frame:=map',
            '_map_resolution:=0.05',
            '_map_size:=1024',
            '_map_start_x:=0.5',
            '_map_start_y:=0.5'
        ]
        
        self.slam_process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            preexec_fn=os.setsid
        )
        
        rospy.loginfo("Hector SLAM process started")
    
    def _map_callback(self, msg):
        """Callback for dynamic map updates"""
        self.dynamic_map = msg
        
        # Republish on dynamic map topic
        self.map_pub.publish(msg)
        
        # Call external callback if set
        if self.map_callback:
            try:
                # Convert to format expected by web interface
                map_data = {
                    'map': {
                        'info': {
                            'resolution': msg.info.resolution,
                            'width': msg.info.width,
                            'height': msg.info.height,
                            'origin': {
                                'position': {
                                    'x': msg.info.origin.position.x,
                                    'y': msg.info.origin.position.y,
                                    'z': msg.info.origin.position.z
                                },
                                'orientation': {
                                    'x': msg.info.origin.orientation.x,
                                    'y': msg.info.origin.orientation.y,
                                    'z': msg.info.origin.orientation.z,
                                    'w': msg.info.origin.orientation.w
                                }
                            }
                        },
                        'data': list(msg.data)
                    },
                    'timestamp': rospy.Time.now().to_sec(),
                    'source': 'dynamic_slam'
                }
                
                self.map_callback(map_data)
                
            except Exception as e:
                rospy.logerr(f"Error in map callback: {e}")
    
    def get_current_map(self):
        """Get current dynamic map"""
        return self.dynamic_map
    
    def is_slam_running(self):
        """Check if SLAM is currently running"""
        with self.slam_lock:
            return self.slam_process is not None and self.slam_process.poll() is None
    
    def get_slam_status(self):
        """Get current SLAM status"""
        return {
            'running': self.is_slam_running(),
            'mode': self.current_slam_mode,
            'map_available': self.dynamic_map is not None
        }
    
    def shutdown(self):
        """Shutdown dynamic mapper"""
        rospy.loginfo("Shutting down Dynamic Mapper...")
        self.stop_slam()
        rospy.loginfo("Dynamic Mapper shutdown complete")

# Global instance
dynamic_mapper = None

def get_dynamic_mapper():
    """Get global dynamic mapper instance"""
    global dynamic_mapper
    if dynamic_mapper is None:
        dynamic_mapper = DynamicMapper()
    return dynamic_mapper

def shutdown_dynamic_mapper():
    """Shutdown global dynamic mapper"""
    global dynamic_mapper
    if dynamic_mapper:
        dynamic_mapper.shutdown()
        dynamic_mapper = None
