import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { Box, Typography, Switch, FormControlLabel, Button, CircularProgress } from '@mui/material';
import { RobotData, SensorData } from '../hooks/useWebSocket_simple';

interface Robot3DViewerProps {
  robotData: RobotData;
  sensorData: SensorData;
  onMapClick?: (x: number, y: number) => void;
}

class Robot3DScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private robot: THREE.Group;
  private lidarPoints: THREE.Group;
  private animationId: number | null = null;
  private mouseControls: any;
  private isInitialized: boolean = false;
  private static instanceCount: number = 0;
  private onZoomChange?: (zoom: number) => void;
  
  constructor(container: HTMLElement, onZoomChange?: (zoom: number) => void) {
    Robot3DScene.instanceCount++;
    console.log(`🏗️ Creating Robot3DScene instance #${Robot3DScene.instanceCount}...`);

    this.onZoomChange = onZoomChange;

    // Ensure container is clean before creating new scene
    const existingCanvases = container.querySelectorAll('canvas');
    if (existingCanvases.length > 0) {
      console.warn(`⚠️ Found ${existingCanvases.length} existing canvas elements, removing them...`);
      existingCanvases.forEach(canvas => canvas.remove());
    }

    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x121212);

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.set(5, 5, 5);
    this.camera.lookAt(0, 0, 0);

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    console.log('📺 Canvas element added to container');

    // Warn if multiple instances exist (React Strict Mode detection)
    if (Robot3DScene.instanceCount > 1) {
      console.warn(`⚠️ Multiple Robot3DScene instances detected (${Robot3DScene.instanceCount}). This might be due to React Strict Mode in development.`);
    }

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);
    
    // Ground
    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    
    // Grid
    const gridHelper = new THREE.GridHelper(20, 20, 0x666666, 0xaaaaaa);
    this.scene.add(gridHelper);
    
    // Coordinate axes
    const axesHelper = new THREE.AxesHelper(2);
    this.scene.add(axesHelper);
    
    // Environment (walls)
    this.createEnvironment();
    
    // Robot
    this.robot = this.createRobot();
    this.scene.add(this.robot);
    
    // LiDAR points
    this.lidarPoints = new THREE.Group();
    this.scene.add(this.lidarPoints);
    
    // Mouse controls
    this.setupControls(container);
    
    // Mark as initialized and start animation loop
    this.isInitialized = true;
    this.animate();
  }
  
  private createRobot(): THREE.Group {
    const robotGroup = new THREE.Group();
    
    // Robot base (cylinder)
    const baseGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.2);
    const baseMaterial = new THREE.MeshLambertMaterial({ color: 0x2196f3 });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.1;
    base.castShadow = true;
    robotGroup.add(base);
    
    // Robot top (box)
    const topGeometry = new THREE.BoxGeometry(0.3, 0.1, 0.3);
    const topMaterial = new THREE.MeshLambertMaterial({ color: 0x1976d2 });
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.position.y = 0.25;
    top.castShadow = true;
    robotGroup.add(top);
    
    // Direction indicator (cone)
    const coneGeometry = new THREE.ConeGeometry(0.05, 0.15);
    const coneMaterial = new THREE.MeshLambertMaterial({ color: 0xff5722 });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.position.set(0.2, 0.25, 0);
    cone.rotation.z = -Math.PI / 2;
    robotGroup.add(cone);
    
    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.02);
    const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x424242 });
    
    const wheelPositions = [
      [0.15, 0.05, 0.15],
      [-0.15, 0.05, 0.15],
      [0.15, 0.05, -0.15],
      [-0.15, 0.05, -0.15]
    ];
    
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.position.set(pos[0], pos[1], pos[2]);
      wheel.rotation.z = Math.PI / 2;
      robotGroup.add(wheel);
    });
    
    return robotGroup;
  }
  
  private createEnvironment(): void {
    // Environment will be created from map data
    // Static walls removed - will be replaced by dynamic map geometry
  }

  private mapGroup: THREE.Group = new THREE.Group();

  // Filter map data to reduce noise in 3D visualization
  private filterMapData(data: number[], width: number, height: number): number[] {
    if (!data || data.length === 0) return data;

    const filtered = [...data];

    // Apply noise reduction filter
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;

        // Get 3x3 neighborhood
        const neighbors = [
          data[(y-1) * width + (x-1)], data[(y-1) * width + x], data[(y-1) * width + (x+1)],
          data[y * width + (x-1)],     data[y * width + x],     data[y * width + (x+1)],
          data[(y+1) * width + (x-1)], data[(y+1) * width + x], data[(y+1) * width + (x+1)]
        ];

        // Remove isolated occupied pixels (noise)
        if (data[idx] === 100) {
          const occupiedCount = neighbors.filter(val => val === 100).length;
          if (occupiedCount <= 3) { // If less than 3 neighbors are occupied, it's likely noise
            const freeCount = neighbors.filter(val => val === 0).length;
            const unknownCount = neighbors.filter(val => val === -1).length;
            filtered[idx] = freeCount > unknownCount ? 0 : -1;
          }
        }
      }
    }

    return filtered;
  }

  public updateMap(mapData: any): void {
    // Clear existing map
    this.scene.remove(this.mapGroup);
    this.mapGroup.clear();

    if (!mapData || !mapData.data) {
      console.log('📍 No map data available');
      return;
    }

    console.log('🗺️ Updating 3D map from occupancy grid...', {
      width: mapData.width,
      height: mapData.height,
      resolution: mapData.resolution
    });

    const { width, height, resolution, origin } = mapData;

    // Apply noise filtering to map data
    const filteredData = this.filterMapData(mapData.data, width, height);

    const wallMaterial = new THREE.MeshLambertMaterial({ color: 0x8d6e63 });
    const wallHeight = 2.0;

    // Create walls from filtered occupancy grid
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const value = filteredData[index];

        // Value 100 = occupied (wall), 0 = free, -1 = unknown
        if (value === 100) {
          // Convert grid coordinates to world coordinates
          const worldX = (x * resolution) + origin.x;
          const worldY = (y * resolution) + origin.y;

          // Create wall cube
          const wallGeometry = new THREE.BoxGeometry(resolution, wallHeight, resolution);
          const wall = new THREE.Mesh(wallGeometry, wallMaterial);
          wall.position.set(worldX, wallHeight / 2, -worldY); // Note: -worldY for ROS to Three.js conversion
          wall.castShadow = true;
          wall.receiveShadow = true;

          this.mapGroup.add(wall);
        }
      }
    }

    // Add map group to scene
    this.scene.add(this.mapGroup);
    console.log(`✅ Created 3D map with ${this.mapGroup.children.length} wall segments`);
  }
  
  private setupControls(container: HTMLElement): void {
    let isMouseDown = false;
    let mouseX = 0;
    let mouseY = 0;
    // Initialize with current camera position to prevent auto-movement
    let targetX = Math.atan2(this.camera.position.x, this.camera.position.z);
    let targetY = Math.asin(this.camera.position.y / this.camera.position.distanceTo(new THREE.Vector3(0, 0, 0)));
    let needsUpdate = false;
    // Store the zoom distance separately - this should NOT change during orbit
    let zoomDistance = this.camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
    
    container.addEventListener('mousedown', (event) => {
      isMouseDown = true;
      mouseX = event.clientX;
      mouseY = event.clientY;
    });
    
    container.addEventListener('mousemove', (event) => {
      if (!isMouseDown) return;

      const deltaX = event.clientX - mouseX;
      const deltaY = event.clientY - mouseY;

      targetX += deltaX * 0.01;
      targetY += deltaY * 0.01;
      needsUpdate = true;

      mouseX = event.clientX;
      mouseY = event.clientY;

      // Debug: This should NOT affect zoom
      console.log(`🖱️ Orbit move - zoomDistance stays: ${zoomDistance.toFixed(2)}`);
    });
    
    container.addEventListener('mouseup', () => {
      isMouseDown = false;
    });
    
    container.addEventListener('wheel', (event) => {
      event.preventDefault();

      // Improved zoom logic - ONLY affects zoomDistance, not orbit
      // Scroll up (negative deltaY) = zoom out (increase distance)
      // Scroll down (positive deltaY) = zoom in (decrease distance)
      const zoomSpeed = 0.5;
      let newZoomDistance = zoomDistance;

      if (event.deltaY < 0) {
        // Scroll up = zoom out
        newZoomDistance = Math.min(20, zoomDistance + zoomSpeed);
        console.log(`🔍 Zoom out: ${zoomDistance.toFixed(2)} → ${newZoomDistance.toFixed(2)}`);
      } else if (event.deltaY > 0) {
        // Scroll down = zoom in
        newZoomDistance = Math.max(2, zoomDistance - zoomSpeed);
        console.log(`🔍 Zoom in: ${zoomDistance.toFixed(2)} → ${newZoomDistance.toFixed(2)}`);
      }

      // Only update if distance actually changed
      if (Math.abs(newZoomDistance - zoomDistance) > 0.01) {
        zoomDistance = newZoomDistance; // Update the stored zoom distance

        // Apply new zoom distance to current camera position
        this.camera.position.normalize().multiplyScalar(zoomDistance);
        this.camera.lookAt(0, 0, 0);
        needsUpdate = true;

        // Notify zoom change
        if (this.onZoomChange) {
          const zoomPercent = this.getCurrentZoom();
          this.onZoomChange(zoomPercent);
        }
      }
    });
    
    // Update camera position based on mouse movement
    const updateCamera = () => {
      if (!needsUpdate) return;

      // Use stored zoomDistance instead of calculating from current position
      // This prevents zoom changes during orbit movement
      const radius = zoomDistance;

      // Clamp targetY to prevent camera flipping
      targetY = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, targetY));

      this.camera.position.x = radius * Math.sin(targetX) * Math.cos(targetY);
      this.camera.position.y = Math.max(1, radius * Math.sin(targetY) + 2); // Minimum height of 1
      this.camera.position.z = radius * Math.cos(targetX) * Math.cos(targetY);
      this.camera.lookAt(0, 0, 0);

      needsUpdate = false;
    };
    
    // Reset targets function
    const resetTargets = () => {
      targetX = Math.atan2(this.camera.position.x, this.camera.position.z);
      targetY = Math.asin(this.camera.position.y / this.camera.position.distanceTo(new THREE.Vector3(0, 0, 0)));
      zoomDistance = this.camera.position.distanceTo(new THREE.Vector3(0, 0, 0)); // Sync zoom distance
      needsUpdate = false; // Stop any pending updates
    };

    this.mouseControls = { updateCamera, resetTargets };
  }
  
  public updateRobot(robotData: RobotData): void {
    if (!robotData.odom && !robotData.pose) return;

    const position = robotData.odom?.position || robotData.pose || { x: 0, y: 0, z: 0 };
    const orientation = robotData.odom?.orientation || robotData.pose?.orientation || { x: 0, y: 0, z: 0, w: 1 };

    // Update robot position (convert ROS to Three.js coordinates)
    this.robot.position.set(position.x, position.z || 0, -position.y);

    // Update robot rotation (convert ROS2 quaternion to Three.js)
    // ROS2: X=forward, Y=left, Z=up
    // Three.js: X=right, Y=up, Z=forward
    // Need to convert ROS2 quaternion to match Three.js coordinate system

    // Convert ROS2 quaternion to Three.js coordinate system
    // ROS2 uses ENU (East-North-Up), Three.js uses right-handed with Y-up
    const quaternion = new THREE.Quaternion(-orientation.z, orientation.x, orientation.y, orientation.w);

    this.robot.setRotationFromQuaternion(quaternion);
  }
  
  // Removed lidarWalls - walls are now created only from SLAM map data

  public updateLiDAR(sensorData: SensorData, showLidar: boolean): void {
    // Clear existing LiDAR points only
    this.lidarPoints.clear();

    if (!sensorData.scan) return;

    const scan = sensorData.scan;
    const robotPosition = this.robot.position;

    if (showLidar) {
      // Show LiDAR points as small green spheres (sensor visualization only)
      const pointGeometry = new THREE.SphereGeometry(0.03);
      const pointMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

      for (let i = 0; i < scan.ranges.length; i += 10) {
        const range = scan.ranges[i];
        if (range && range > scan.range_min && range < scan.range_max && range < 10.0) {
          const angle = scan.angle_min + i * scan.angle_increment;
          const x = range * Math.cos(angle);
          const y = range * Math.sin(angle);

          const point = new THREE.Mesh(pointGeometry, pointMaterial);
          point.position.set(x, 0.3, -y);
          this.lidarPoints.add(point);
        }
      }

      this.lidarPoints.position.copy(robotPosition);
      this.lidarPoints.rotation.copy(this.robot.rotation);
    }

    // Note: Walls are now created only from SLAM map data, not LiDAR scans
    // This ensures walls are static and persistent in world coordinates
  }

  // Removed generateWallsFromLiDAR function
  // Walls are now created only from SLAM map data in updateMap3D method
  // This ensures walls are static and persistent in world coordinates
  
  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);

    // Only update camera controls if initialized and needed
    if (this.isInitialized && this.mouseControls?.updateCamera) {
      this.mouseControls.updateCamera();
    }

    this.renderer.render(this.scene, this.camera);
  }
  
  public resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
  
  public resetCamera(): void {
    this.camera.position.set(5, 5, 5);
    this.camera.lookAt(0, 0, 0);

    // Reset mouse control targets to match camera position
    if (this.mouseControls) {
      this.mouseControls.resetTargets();
    }

    console.log('📷 Camera reset to default position and zoom');
  }

  public stopAutoUpdates(): void {
    if (this.mouseControls) {
      this.mouseControls.resetTargets();
    }
  }

  public getCurrentZoom(): number {
    const distance = this.camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
    // Convert distance to zoom percentage (2 = 100%, 20 = 0%)
    return Math.round(((20 - distance) / 18) * 100);
  }
  
  public dispose(): void {
    Robot3DScene.instanceCount = Math.max(0, Robot3DScene.instanceCount - 1);
    console.log(`🗑️ Disposing 3D scene instance. Remaining instances: ${Robot3DScene.instanceCount}`);

    // Stop animation loop
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // Clear scene objects
    if (this.scene) {
      this.scene.clear();
    }

    // Dispose renderer and remove canvas
    if (this.renderer) {
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
      this.renderer.dispose();
    }

    // Clear references
    this.isInitialized = false;
    this.mouseControls = null;

    console.log('✅ 3D scene disposed successfully');
  }
}

// Main React Component
const Robot3DViewer: React.FC<Robot3DViewerProps> = ({ robotData, sensorData, onMapClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Robot3DScene | null>(null);
  const [showLidar, setShowLidar] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0); // For zoom feedback
  const [showZoomIndicator, setShowZoomIndicator] = useState(false); // Temporary zoom feedback

  // Initialize 3D scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear any existing canvas elements first
    const existingCanvases = container.querySelectorAll('canvas');
    existingCanvases.forEach(canvas => canvas.remove());

    // Only create new scene if one doesn't exist
    if (!sceneRef.current) {
      console.log('🎮 Initializing new 3D scene...');
      sceneRef.current = new Robot3DScene(container, (zoom) => {
        setZoomLevel(zoom);
        // Show zoom indicator temporarily
        setShowZoomIndicator(true);
        setTimeout(() => setShowZoomIndicator(false), 1500);
      });

      // Small delay to ensure proper initialization
      setTimeout(() => {
        if (sceneRef.current) {
          sceneRef.current.resetCamera();
          sceneRef.current.stopAutoUpdates();
          setIsInitialized(true);
          // Initialize zoom level
          setZoomLevel(sceneRef.current.getCurrentZoom());
          console.log('✅ 3D scene initialized successfully');

          // Force stop auto-updates after 1 second
          setTimeout(() => {
            if (sceneRef.current) {
              sceneRef.current.stopAutoUpdates();
            }
          }, 1000);
        }
      }, 200);
    }

    return () => {
      console.log('🧹 Cleaning up 3D scene...');
      if (sceneRef.current) {
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
      // Also clean up any remaining canvas elements using captured container reference
      if (container) {
        const canvases = container.querySelectorAll('canvas');
        canvases.forEach(canvas => canvas.remove());
      }
      setIsInitialized(false);
    };
  }, []); // Empty dependency array to run only once

  // Update robot position
  useEffect(() => {
    if (sceneRef.current && robotData && isInitialized) {
      sceneRef.current.updateRobot(robotData);
    }
  }, [robotData, isInitialized]);

  // Update LiDAR data
  useEffect(() => {
    if (sceneRef.current && sensorData && isInitialized) {
      sceneRef.current.updateLiDAR(sensorData, showLidar);
    }
  }, [sensorData, showLidar, isInitialized]);

  // Update map data
  useEffect(() => {
    if (sceneRef.current && sensorData?.map && isInitialized) {
      console.log('🗺️ Map data received, updating 3D environment...', sensorData.map);
      sceneRef.current.updateMap(sensorData.map);
    }
  }, [sensorData?.map, isInitialized]);

  // Handle window resize with debounce
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout;

    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (containerRef.current && sceneRef.current) {
          const { clientWidth, clientHeight } = containerRef.current;
          sceneRef.current.resize(clientWidth, clientHeight);
        }
      }, 100); // Debounce resize events
    };

    // Initial resize after mount
    setTimeout(handleResize, 200);

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  // Handle canvas click for navigation
  const handleCanvasClick = (event: React.MouseEvent) => {
    if (onMapClick && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Simple conversion to world coordinates (approximate)
      const worldX = x * 10;
      const worldY = y * 10;

      onMapClick(worldX, worldY);
    }
  };

  const resetCamera = () => {
    if (sceneRef.current) {
      sceneRef.current.resetCamera();
      sceneRef.current.stopAutoUpdates(); // Stop auto-updates after reset
      // Update zoom level after reset
      setZoomLevel(sceneRef.current.getCurrentZoom());
    }
  };

  return (
    <Box sx={{ height: '100%', position: 'relative' }}>
      {/* Loading Indicator */}
      {!isInitialized && (
        <Box sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          background: 'rgba(0,0,0,0.8)',
          padding: 3,
          borderRadius: 2
        }}>
          <CircularProgress size={60} sx={{ color: '#2196f3' }} />
          <Typography variant="h6" color="white">
            🎮 Initializing 3D Scene...
          </Typography>
          <Typography variant="caption" color="white" textAlign="center">
            Loading virtual environment and robot model
          </Typography>
        </Box>
      )}

      {/* Zoom Indicator */}
      {showZoomIndicator && (
        <Box sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1500,
          background: 'rgba(0,0,0,0.8)',
          padding: 2,
          borderRadius: 2,
          border: '2px solid #2196f3',
          minWidth: '120px',
          textAlign: 'center'
        }}>
          <Typography variant="h6" color="white" sx={{ fontWeight: 'bold' }}>
            🔍 {zoomLevel}%
          </Typography>
          <Typography variant="caption" color="white">
            {zoomLevel > 50 ? 'Zoomed In' : zoomLevel < 50 ? 'Zoomed Out' : 'Normal View'}
          </Typography>
        </Box>
      )}

      {/* Controls */}
      <Box sx={{
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        padding: 1,
        borderRadius: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 1
      }}>
        <FormControlLabel
          control={
            <Switch
              checked={showLidar}
              onChange={(e) => setShowLidar(e.target.checked)}
              size="small"
            />
          }
          label={<Typography variant="caption" color="white">LiDAR Points</Typography>}
        />
        <Button
          variant="outlined"
          size="small"
          onClick={resetCamera}
          sx={{ color: 'white', borderColor: 'white' }}
        >
          Reset View
        </Button>
      </Box>

      {/* Robot Info */}
      <Box sx={{
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        padding: 1,
        borderRadius: 1
      }}>
        <Typography variant="caption" color="white" display="block">
          🤖 Position: ({(robotData.odom?.position?.x || 0).toFixed(2)}, {(robotData.odom?.position?.y || 0).toFixed(2)})
        </Typography>
        <Typography variant="caption" color="white" display="block">
          🏃 Speed: {robotData.odom ? Math.sqrt(
            Math.pow(robotData.odom.linear_velocity.x, 2) +
            Math.pow(robotData.odom.linear_velocity.y, 2)
          ).toFixed(2) : 0} m/s
        </Typography>
        <Typography variant="caption" color="white" display="block">
          📡 LiDAR: {sensorData.scan?.ranges.filter(r => r !== null).length || 0} points
        </Typography>
        <Typography variant="caption" color="white" display="block">
          🔋 Battery: {robotData.battery?.percentage?.toFixed(0) || 'N/A'}%
        </Typography>
        <Typography variant="caption" color="white" display="block">
          🔍 Zoom: {zoomLevel}%
        </Typography>
      </Box>

      {/* Instructions */}
      <Box sx={{
        position: 'absolute',
        bottom: 10,
        left: 10,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        padding: 1,
        borderRadius: 1
      }}>
        <Typography variant="caption" color="white" display="block">
          🖱️ Drag: Orbit camera around robot
        </Typography>
        <Typography variant="caption" color="white" display="block">
          🎯 Click: Set navigation goal
        </Typography>
        <Typography variant="caption" color="white" display="block">
          🔍 Scroll ↑: Zoom out | Scroll ↓: Zoom in
        </Typography>
      </Box>

      {/* 3D Canvas Container */}
      <div
        ref={containerRef}
        onClick={handleCanvasClick}
        style={{
          width: '100%',
          height: '100%',
          cursor: 'grab',
          position: 'relative',
          overflow: 'hidden'
        }}
      />
    </Box>
  );
};

export default Robot3DViewer;
