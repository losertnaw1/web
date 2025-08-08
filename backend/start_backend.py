#!/usr/bin/env python3

import os
import sys
import subprocess
import time
import signal
from pathlib import Path

def check_dependencies():
    """Check if required dependencies are installed"""
    try:
        import fastapi
        import uvicorn
        import websockets
        import pydantic
        import psutil
        print("✅ All Python dependencies are available")
        return True
    except ImportError as e:
        print(f"❌ Missing dependency: {e}")
        print("Installing dependencies...")
        
        # Install dependencies
        subprocess.run([
            sys.executable, "-m", "pip", "install", "-r", "requirements.txt"
        ], check=True)
        
        return True

def check_ros2():
    """Check if ROS2 is available"""
    try:
        import rclpy
        print("✅ ROS2 Python bindings are available")
        return True
    except ImportError:
        print("❌ ROS2 Python bindings not found")
        print("Please source ROS2 environment:")
        print("  source /opt/ros/humble/setup.bash")
        return False

def start_backend():
    """Start the FastAPI backend server"""
    
    print("🚀 Starting Indoor Autonomous Vehicle Web Backend")
    print("=" * 60)
    
    # Check dependencies
    if not check_dependencies():
        print("❌ Dependency check failed")
        return False
    
    if not check_ros2():
        print("⚠️  ROS2 not available - backend will run in limited mode")
    
    # Change to app directory
    app_dir = Path(__file__).parent / "app"
    os.chdir(app_dir)
    
    print(f"📁 Working directory: {app_dir}")
    print("🌐 Starting FastAPI server...")
    print("   - Host: 0.0.0.0")
    print("   - Port: 8000")
    print("   - API Docs: http://localhost:8000/docs")
    print("   - WebSocket: ws://localhost:8000/ws")
    print("")
    print("Press Ctrl+C to stop the server")
    print("=" * 60)
    
    try:
        # Start uvicorn server
        subprocess.run([
            sys.executable, "-m", "uvicorn",
            "main:app",
            "--host", "0.0.0.0",
            "--port", "8000",
            "--reload",
            "--log-level", "info"
        ])
        
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Server error: {e}")
        return False
    
    return True

def main():
    """Main entry point"""
    
    # Handle command line arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == "--check":
            print("🔍 Checking backend dependencies...")
            deps_ok = check_dependencies()
            ros_ok = check_ros2()
            
            if deps_ok and ros_ok:
                print("✅ All checks passed - backend ready to start")
                return 0
            else:
                print("❌ Some checks failed")
                return 1
                
        elif sys.argv[1] == "--help":
            print("Indoor Autonomous Vehicle Web Backend")
            print("")
            print("Usage:")
            print("  python3 start_backend.py          # Start the backend server")
            print("  python3 start_backend.py --check  # Check dependencies")
            print("  python3 start_backend.py --help   # Show this help")
            return 0
    
    # Start the backend
    success = start_backend()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
