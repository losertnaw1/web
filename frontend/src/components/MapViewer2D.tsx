import React, { useRef, useEffect, useState } from 'react';
import { Box, Paper, Typography, Snackbar, Alert } from '@mui/material';

interface MapViewer2DProps {
  mapData?: {
    width: number;
    height: number;
    resolution: number;
    origin: { x: number; y: number; theta: number };
    data: number[]; // Occupancy grid data
  };
  robotPose?: {
    x: number;
    y: number;
    theta: number;
  };
  lidarData?: {
    ranges: number[];
    angle_min: number;
    angle_max: number;
    angle_increment: number;
    range_min: number;
    range_max: number;
  };
  goals?: Array<{
    x: number;
    y: number;
    theta: number;
  }>;
  path?: Array<{
    x: number;
    y: number;
  }>;
  onMapClick?: (x: number, y: number, theta?: number) => void;
  isSettingInitialPose?: boolean;
}

const MapViewer2D: React.FC<MapViewer2DProps> = ({
  mapData,
  robotPose,
  lidarData,
  goals = [],
  path = [],
  onMapClick,
  isSettingInitialPose = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [pendingPosition, setPendingPosition] = useState<{x: number, y: number} | null>(null);
  const [isSelectingDirection, setIsSelectingDirection] = useState(false);

  // Fixed canvas and map settings - no pan/zoom
  const canvasWidth = 800;
  const canvasHeight = 600;
  const mapScale = Math.min(canvasWidth / (mapData?.width || 100), canvasHeight / (mapData?.height || 100)); // Use 80% of available space

  // Debug log on component mount
  console.log('🗺️ MapViewer2D mounted!');
  console.log('📊 MapData:', mapData);
  console.log('🤖 RobotPose:', robotPose);

  // Test alert
  if (mapData) {
    console.log(`🔍 Map size: ${mapData.width}x${mapData.height}`);
  } else {
    console.log('❌ No map data received!');
  }



  // Filter map data to reduce noise
  const filterMapData = (data: number[], width: number, height: number): number[] => {
    if (!data || data.length === 0) return data;

    const filtered = [...data];

    // Apply median filter to reduce noise
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;

        // Get 3x3 neighborhood
        const neighbors = [
          data[(y-1) * width + (x-1)], data[(y-1) * width + x], data[(y-1) * width + (x+1)],
          data[y * width + (x-1)],     data[y * width + x],     data[y * width + (x+1)],
          data[(y+1) * width + (x-1)], data[(y+1) * width + x], data[(y+1) * width + (x+1)]
        ];

        // Only filter non-obstacle areas to preserve walls
        if (data[idx] !== 100) {
          // Remove isolated pixels
          const occupiedCount = neighbors.filter(val => val === 100).length;
          const freeCount = neighbors.filter(val => val === 0).length;
          const unknownCount = neighbors.filter(val => val === -1).length;

          // If current pixel is very different from neighbors, smooth it
          if (data[idx] === 100 && occupiedCount <= 2) {
            filtered[idx] = freeCount > unknownCount ? 0 : -1;
          } else if (data[idx] === 0 && freeCount <= 2) {
            filtered[idx] = occupiedCount > unknownCount ? 100 : -1;
          }
        }
      }
    }

    return filtered;
  };

  // Convert world coordinates to canvas coordinates - SIMPLIFIED
  const worldToCanvas = (worldX: number, worldY: number) => {
    if (!mapData) return { x: 0, y: 0 };

    // Convert world coordinates to map grid coordinates
    const mapX = (worldX - mapData.origin.x) / mapData.resolution;
    const mapY = (worldY - mapData.origin.y) / mapData.resolution;

    // Convert to canvas coordinates with centering and scaling
    const centerOffsetX = (canvasWidth - mapData.width * mapScale) / 2;
    const centerOffsetY = (canvasHeight - mapData.height * mapScale) / 2;

    const canvasX = mapX * mapScale + centerOffsetX;
    const canvasY = (mapData.height - 1 - mapY) * mapScale + centerOffsetY; // Flip Y

    return { x: canvasX, y: canvasY };
  };

  // Convert canvas coordinates to world coordinates - SIMPLIFIED
  const canvasToWorld = (canvasX: number, canvasY: number) => {
    if (!mapData) return { x: 0, y: 0 };

    // Remove centering offset
    const centerOffsetX = (canvasWidth - mapData.width * mapScale) / 2;
    const centerOffsetY = (canvasHeight - mapData.height * mapScale) / 2;

    const mapX = (canvasX - centerOffsetX) / mapScale;
    const mapY = (canvasY - centerOffsetY) / mapScale;

    // Flip Y back to match data coordinates
    const dataMapY = mapData.height - 1 - mapY;

    // Bounds checking
    const clampedMapX = Math.max(0, Math.min(mapData.width - 1, mapX));
    const clampedDataMapY = Math.max(0, Math.min(mapData.height - 1, dataMapY));

    // Convert to world coordinates
    const worldX = clampedMapX * mapData.resolution + mapData.origin.x;
    const worldY = clampedDataMapY * mapData.resolution + mapData.origin.y;

    console.log(`🗺️ Canvas to World:`, {
      canvas: { x: canvasX, y: canvasY },
      map: { x: mapX, y: mapY },
      dataMapY: dataMapY,
      world: { x: worldX, y: worldY }
    });

    return { x: worldX, y: worldY };
  };

  // Draw the map
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Debug map size
    console.log(`🗺️ Map size: ${mapData.width}x${mapData.height}, Scale: ${mapScale.toFixed(3)}`);

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply noise filtering to map data
    const filteredData = filterMapData(mapData.data, mapData.width, mapData.height);

    // Draw occupancy grid with filtered data
    const imageData = ctx.createImageData(mapData.width, mapData.height);

    // Map data is in row-major order: index = y * width + x
    // ROS2 uses bottom-left origin, Canvas uses top-left origin
    // We need to flip Y-axis during rendering
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const dataIndex = y * mapData.width + x;
        const value = filteredData[dataIndex];

        // Flip Y-axis: canvas Y = height - 1 - data Y
        const canvasY = mapData.height - 1 - y;
        const pixelIndex = (canvasY * mapData.width + x) * 4;

        if (value === -1) {
          // Unknown space - light gray
          imageData.data[pixelIndex] = 200;     // R
          imageData.data[pixelIndex + 1] = 200; // G
          imageData.data[pixelIndex + 2] = 200; // B
          imageData.data[pixelIndex + 3] = 255; // A
        } else if (value === 0) {
          // Free space - white
          imageData.data[pixelIndex] = 255;     // R
          imageData.data[pixelIndex + 1] = 255; // G
          imageData.data[pixelIndex + 2] = 255; // B
          imageData.data[pixelIndex + 3] = 255; // A
        } else {
          // Occupied space - dark gray/black
          imageData.data[pixelIndex] = 50;      // R
          imageData.data[pixelIndex + 1] = 50;  // G
          imageData.data[pixelIndex + 2] = 50;  // B
          imageData.data[pixelIndex + 3] = 255; // A
        }
      }
    }

    // Create temporary canvas for the map
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = mapData.width;
    tempCanvas.height = mapData.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.putImageData(imageData, 0, 0);
      
      // Draw map centered and scaled
      const centerOffsetX = (canvasWidth - mapData.width * mapScale) / 2;
      const centerOffsetY = (canvasHeight - mapData.height * mapScale) / 2;

      ctx.drawImage(
        tempCanvas,
        centerOffsetX,
        centerOffsetY,
        mapData.width * mapScale,
        mapData.height * mapScale
      );
    }

    // Draw path
    if (path.length > 1) {
      ctx.strokeStyle = '#2196f3';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      const firstPoint = worldToCanvas(path[0].x, path[0].y);
      ctx.moveTo(firstPoint.x, firstPoint.y);
      
      for (let i = 1; i < path.length; i++) {
        const point = worldToCanvas(path[i].x, path[i].y);
        ctx.lineTo(point.x, point.y);
      }
      
      ctx.stroke();
    }

    // Draw goals
    goals.forEach((goal, index) => {
      const pos = worldToCanvas(goal.x, goal.y);
      
      // Goal marker
      ctx.fillStyle = '#ff9800';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, 2 * Math.PI);
      ctx.fill();
      
      // Goal direction arrow
      ctx.strokeStyle = '#ff9800';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(
        pos.x + Math.cos(goal.theta) * 15,
        pos.y - Math.sin(goal.theta) * 15
      );
      ctx.stroke();
      
      // Goal label
      ctx.fillStyle = '#000';
      ctx.font = '12px Arial';
      ctx.fillText(`G${index + 1}`, pos.x + 10, pos.y - 10);
    });

    // Draw LiDAR points
    if (lidarData && robotPose) {
      ctx.fillStyle = '#00ff00'; // Green LiDAR points

      // Draw LiDAR scan points
      for (let i = 0; i < lidarData.ranges.length; i += 5) { // Sample every 5th point
        const range = lidarData.ranges[i];
        if (range && range > lidarData.range_min && range < lidarData.range_max && range < 10.0) {
          const angle = lidarData.angle_min + i * lidarData.angle_increment;

          // Calculate LiDAR point position relative to robot
          // Try different coordinate transformations to match the map

          // Option 1: Standard transformation
          const lidarX1 = robotPose.x + range * Math.cos(angle + robotPose.theta);
          const lidarY1 = robotPose.y + range * Math.sin(angle + robotPose.theta);

          // Option 2: Reverse angle direction
          const lidarX2 = robotPose.x + range * Math.cos(-angle + robotPose.theta);
          const lidarY2 = robotPose.y + range * Math.sin(-angle + robotPose.theta);

          // Option 3: No robot rotation (LiDAR in world frame)
          const lidarX3 = robotPose.x + range * Math.cos(angle);
          const lidarY3 = robotPose.y + range * Math.sin(angle);

          // Option 4: Reverse angle + no robot rotation
          const lidarX4 = robotPose.x + range * Math.cos(-angle);
          const lidarY4 = robotPose.y + range * Math.sin(-angle);

          // Use Option 2 for now (reverse angle direction)
          const lidarX = lidarX2;
          const lidarY = lidarY2;

          const lidarPos = worldToCanvas(lidarX, lidarY);

          // Draw small circle for each LiDAR point
          ctx.beginPath();
          ctx.arc(lidarPos.x, lidarPos.y, 3, 0, 2 * Math.PI); // Slightly larger for visibility
          ctx.fill();

          // Debug: Draw different options with different colors
          if (i % 20 === 0) { // Only for some points to avoid clutter
            // Option 1: Red
            ctx.fillStyle = '#ff0000';
            const pos1 = worldToCanvas(lidarX1, lidarY1);
            ctx.beginPath();
            ctx.arc(pos1.x, pos1.y, 1, 0, 2 * Math.PI);
            ctx.fill();

            // Option 3: Blue
            ctx.fillStyle = '#0000ff';
            const pos3 = worldToCanvas(lidarX3, lidarY3);
            ctx.beginPath();
            ctx.arc(pos3.x, pos3.y, 1, 0, 2 * Math.PI);
            ctx.fill();

            // Option 4: Yellow
            ctx.fillStyle = '#ffff00';
            const pos4 = worldToCanvas(lidarX4, lidarY4);
            ctx.beginPath();
            ctx.arc(pos4.x, pos4.y, 1, 0, 2 * Math.PI);
            ctx.fill();

            // Reset to green for main points
            ctx.fillStyle = '#00ff00';
          }
        }
      }
    }

    // Draw robot
    if (robotPose) {
      const pos = worldToCanvas(robotPose.x, robotPose.y);

      // Robot body (larger, brighter circle)
      ctx.fillStyle = '#00ff00'; // Bright green
      ctx.strokeStyle = '#008000'; // Dark green border
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 5, 0, 2 * Math.PI); // Larger radius
      ctx.fill();
      ctx.stroke();

      // Robot direction (arrow)
      ctx.strokeStyle = '#ff0000'; // Red arrow for direction
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(
        pos.x + Math.cos(robotPose.theta) * 25,
        pos.y - Math.sin(robotPose.theta) * 25
      );
      ctx.stroke();

      // Arrow head
      const arrowLength = 8;
      const arrowAngle = 0.5;
      const endX = pos.x + Math.cos(robotPose.theta) * 25;
      const endY = pos.y - Math.sin(robotPose.theta) * 25;

      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - arrowLength * Math.cos(robotPose.theta - arrowAngle),
        endY + arrowLength * Math.sin(robotPose.theta - arrowAngle)
      );
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - arrowLength * Math.cos(robotPose.theta + arrowAngle),
        endY + arrowLength * Math.sin(robotPose.theta + arrowAngle)
      );
      ctx.stroke();

      // Robot label with background
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(pos.x + 20, pos.y - 25, 50, 20);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 12px Arial';
      ctx.fillText('ROBOT', pos.x + 22, pos.y - 10);
    }

    // Draw pending initial pose position and direction selection
    if (pendingPosition && isSettingInitialPose) {
      const pos = worldToCanvas(pendingPosition.x, pendingPosition.y);

      // Pending position marker (pulsing orange circle)
      ctx.fillStyle = '#ff8c00'; // Orange
      ctx.strokeStyle = '#ff4500'; // Red-orange border
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Pulsing effect (inner circle)
      ctx.fillStyle = 'rgba(255, 140, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 12, 0, 2 * Math.PI);
      ctx.fill();

      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(pos.x + 15, pos.y - 30, 120, 20);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 11px Arial';
      ctx.fillText('Click to set direction', pos.x + 17, pos.y - 15);
    }

  }, [mapData, robotPose, lidarData, goals, path, canvasWidth, canvasHeight, mapScale]);

  // Handle mouse events - SIMPLIFIED (no drag/pan)
  const handleMouseMove = (event: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !mapData || !canvasRef.current) return;

    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;

    // Update cursor based on goal validity
    const worldPos = canvasToWorld(currentX, currentY);
    const validation = isValidGoalPosition(worldPos.x, worldPos.y);

    canvasRef.current.style.cursor = validation.valid ? 'crosshair' : 'not-allowed';
  };

  const handleMouseClick = (event: React.MouseEvent) => {
    handleMapClick(event);
  };

  // Check if a world position is valid for goal setting
  const isValidGoalPosition = (worldX: number, worldY: number): { valid: boolean; reason?: string } => {
    if (!mapData) return { valid: false, reason: "No map data available" };

    // Check world bounds
    const mapWorldBounds = {
      minX: mapData.origin.x,
      minY: mapData.origin.y,
      maxX: mapData.origin.x + mapData.width * mapData.resolution,
      maxY: mapData.origin.y + mapData.height * mapData.resolution
    };

    if (worldX < mapWorldBounds.minX || worldX > mapWorldBounds.maxX ||
        worldY < mapWorldBounds.minY || worldY > mapWorldBounds.maxY) {
      return { valid: false, reason: "Outside map bounds" };
    }

    // Convert to map coordinates for cell checking
    const dataMapX = Math.floor((worldX - mapData.origin.x) / mapData.resolution);
    const dataMapY = Math.floor((worldY - mapData.origin.y) / mapData.resolution);

    // Check if within map grid
    if (dataMapX < 0 || dataMapX >= mapData.width || dataMapY < 0 || dataMapY >= mapData.height) {
      return { valid: false, reason: "Outside map grid" };
    }

    // Check if cell is free (if map data is available)
    if (mapData.data && mapData.data.length > 0) {
      const index = dataMapY * mapData.width + dataMapX;
      if (index >= 0 && index < mapData.data.length) {
        const cellValue = mapData.data[index];

        // Debug logging for cell checking
        console.log(`🔍 Cell validation:`, {
          dataMapCoords: { x: dataMapX, y: dataMapY },
          index: index,
          cellValue: cellValue,
          mapSize: { width: mapData.width, height: mapData.height },
          dataLength: mapData.data.length
        });

        // Cell values: -1 = unknown, 0 = free, 100 = occupied
        // Only allow free space (0-49) for goals
        if (cellValue > 50) {
          return { valid: false, reason: `Goal in obstacle (cell value: ${cellValue})` };
        }
        if (cellValue === -1) {
          return { valid: false, reason: `Goal in unknown area (cell value: ${cellValue})` };
        }
      } else {
        return { valid: false, reason: `Invalid index: ${index} (data length: ${mapData.data.length})` };
      }
    }

    return { valid: true };
  };

  const handleMapClick = (event: React.MouseEvent) => {
    if (!onMapClick || !mapData) return;

    // Only process click if not dragging (small movement tolerance)
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;

    const worldPos = canvasToWorld(canvasX, canvasY);

    // Validate goal position
    const validation = isValidGoalPosition(worldPos.x, worldPos.y);

    console.log(`🎯 Map clicked at canvas: (${canvasX.toFixed(1)}, ${canvasY.toFixed(1)}) -> world: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)})`);

    if (!validation.valid) {
      console.warn(`❌ Invalid goal position: ${validation.reason}`);
      setErrorMessage(`Cannot set goal here: ${validation.reason}`);
      return;
    }

    // Handle two-step initial pose setting (position + direction)
    if (isSettingInitialPose) {
      if (!isSelectingDirection) {
        // First click: set position, start direction selection
        setPendingPosition({ x: worldPos.x, y: worldPos.y });
        setIsSelectingDirection(true);
        console.log(`📍 Initial pose position set to (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}). Click again to set direction.`);
        return;
      } else {
        // Second click: calculate direction and complete pose setting
        if (pendingPosition) {
          const dx = worldPos.x - pendingPosition.x;
          const dy = worldPos.y - pendingPosition.y;
          const theta = Math.atan2(dy, dx);

          console.log(`🧭 Direction set: (${dx.toFixed(2)}, ${dy.toFixed(2)}) -> ${(theta * 180 / Math.PI).toFixed(1)}°`);
          console.log(`✅ Complete initial pose: (${pendingPosition.x.toFixed(2)}, ${pendingPosition.y.toFixed(2)}, ${theta.toFixed(3)})`);

          onMapClick(pendingPosition.x, pendingPosition.y, theta);

          // Reset state
          setPendingPosition(null);
          setIsSelectingDirection(false);
        }
        return;
      }
    }

    // Normal navigation goal setting
    console.log(`✅ Valid goal position - sending to navigation`);
    onMapClick(worldPos.x, worldPos.y);
  };



  // DETAILED MAP AND ROBOT LOGS
  console.log('🎨 MapViewer2D RENDERING NOW!');
  console.log('📊 MapData:', mapData ? {
    width: mapData.width,
    height: mapData.height,
    resolution: mapData.resolution,
    origin: mapData.origin
  } : 'NO MAP');
  console.log('🤖 RobotPose:', robotPose ? {
    x: robotPose.x,
    y: robotPose.y,
    theta: robotPose.theta
  } : 'NO ROBOT');

  // Force alert to make sure code runs
  if (mapData && !(window as any).debugAlertShown) {
    const robotInfo = robotPose ? `Robot(${robotPose.x}, ${robotPose.y})` : 'NO ROBOT';
    const mapInfo = `Map ${mapData.width}x${mapData.height}, res=${mapData.resolution}`;
    alert(`DEBUG: ${mapInfo}, ${robotInfo}`);
    (window as any).debugAlertShown = true;
  }

  return (
    <Paper sx={{ position: 'relative', overflow: 'hidden', width: canvasWidth, height: canvasHeight }}>
      {/* Debug info */}
      <Box sx={{ position: 'absolute', top: 8, left: 8, zIndex: 2, bgcolor: 'yellow', p: 1 }}>
        DEBUG: Map {mapData ? `${mapData.width}x${mapData.height}` : 'NO DATA'}
      </Box>

      {/* Map Status */}
      <Box sx={{
        position: 'absolute',
        bottom: 8,
        left: 8,
        zIndex: 1,
        bgcolor: 'rgba(0,0,0,0.7)',
        color: 'white',
        padding: 1,
        borderRadius: 1,
        fontSize: '12px'
      }}>
        {robotPose && (
          <Typography variant="caption" display="block">
            Robot: ({robotPose.x && robotPose.x.toFixed(2)}, {robotPose.y &&robotPose.y.toFixed(2)})
          </Typography>
        )}
      </Box>

      {/* Canvas - FIXED SIZE */}
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        style={{
          width: canvasWidth,
          height: canvasHeight,
          cursor: 'default',
          display: 'block'
        }}
        onMouseMove={handleMouseMove}
        onClick={handleMouseClick}
      />

      {/* No Map Message */}
      {!mapData && (
        <Box sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          color: 'text.secondary'
        }}>
          <Typography variant="h6">No Map Data</Typography>
          <Typography variant="body2">
            Map will appear when available
          </Typography>
        </Box>
      )}

      {/* Error Snackbar */}
      <Snackbar
        open={!!errorMessage}
        autoHideDuration={3000}
        onClose={() => setErrorMessage('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setErrorMessage('')} severity="warning" sx={{ width: '100%' }}>
          {errorMessage}
        </Alert>
      </Snackbar>
    </Paper>
  );
};

export default MapViewer2D;
