import React, { useRef, useEffect, useState } from 'react';
import { Box, Paper, Typography, Snackbar, Alert } from '@mui/material';
import { logWarn } from '../utils/backendLogger';
import { useI18n } from '../i18n/i18n';

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
    // Match ROS LaserScan semantics and WS hook shape
    ranges: Array<number | null>;
    angle_min: number;
    angle_max: number;
    angle_increment: number;
    range_min: number;
    range_max: number;
    timestamp?: number;
    frame_id?: string;
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
  multiGoalMode?: boolean;
  onGoalsChange?: (goals: Array<{x:number; y:number; theta:number}>) => void;
}

const MapViewer2D: React.FC<MapViewer2DProps> = ({
  mapData,
  robotPose,
  lidarData,
  goals = [],
  path = [],
  onMapClick,
  isSettingInitialPose = false,
  multiGoalMode = false,
  onGoalsChange,
}) => {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [pendingPosition, setPendingPosition] = useState<{x: number, y: number} | null>(null);
  const [isSelectingDirection, setIsSelectingDirection] = useState(false);
  
  // ADDED: Zoom and pan state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const minZoom = 0.1;
  const maxZoom = 10;

  // Fixed canvas settings
  const canvasWidth = 1600;
  const canvasHeight = 600;
  
  // MODIFIED: Calculate base scale and apply zoom
  const baseMapScale = Math.min(canvasWidth / (mapData?.width || 100), canvasHeight / (mapData?.height || 100));
  const mapScale = baseMapScale * zoomLevel;

  // Debug log on component mount - NO CHANGE
  console.log('🗺️ MapViewer2D mounted!');
  console.log('📊 MapData:', mapData);
  console.log('🤖 RobotPose:', robotPose);

  // Test alert - NO CHANGE
  if (mapData) {
    console.log(`🔍 Map size: ${mapData.width}x${mapData.height}`);
  } else {
    console.log('⚠️ No map data received!');
  }

  // MODIFIED: Convert world coordinates to canvas coordinates with zoom and pan
  const worldToCanvas = (worldX: number, worldY: number) => {
    if (!mapData) return { x: 0, y: 0 };

    // Convert world coordinates to map grid coordinates
    const mapX = (worldX - mapData.origin.x) / mapData.resolution;
    const mapY = (worldY - mapData.origin.y) / mapData.resolution;

    // Convert to canvas coordinates with centering, scaling, and pan offset
    const centerOffsetX = (canvasWidth - mapData.width * mapScale) / 2;
    const centerOffsetY = (canvasHeight - mapData.height * mapScale) / 2;

    const canvasX = (mapX * mapScale) + centerOffsetX + panOffset.x;
    const canvasY = ((mapData.height - 1 - mapY) * mapScale) + centerOffsetY + panOffset.y;

    return { x: canvasX, y: canvasY };
  };

  // MODIFIED: Convert canvas coordinates to world coordinates with zoom and pan
  const canvasToWorld = (canvasX: number, canvasY: number) => {
    if (!mapData) return { x: 0, y: 0 };

    // Remove centering offset and pan offset
    const centerOffsetX = (canvasWidth - mapData.width * mapScale) / 2;
    const centerOffsetY = (canvasHeight - mapData.height * mapScale) / 2;

    const mapX = (canvasX - centerOffsetX - panOffset.x) / mapScale;
    const mapY = (canvasY - centerOffsetY - panOffset.y) / mapScale;

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

  // ADDED: Handle mouse drag for panning
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef<boolean>(false);
  const [isSettingGoalAngle, setIsSettingGoalAngle] = useState(false);
  const DRAG_THRESHOLD_PX = 5; // movement threshold to consider as panning

  const handleMouseDown = (event: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !mapData || !canvasRef.current) return;

    if (event.button === 0) { // Left mouse button
      if (multiGoalMode) {
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;
        const worldPos = canvasToWorld(canvasX, canvasY);

        // Update previous goal's theta to point to new goal
        if (goals.length > 0 && onGoalsChange) {
          const prev = goals[goals.length - 1];
          const thetaPrev = Math.atan2(worldPos.y - prev.y, worldPos.x - prev.x);
          const updatedPrev = goals.slice(0, -1).concat([{ ...prev, theta: thetaPrev }]);
          onGoalsChange(updatedPrev);
        }

        // Add new goal
        if (onGoalsChange) {
          const newList = (goals.length > 0 ? goals.slice(0) : []).concat([{ x: worldPos.x, y: worldPos.y, theta: 0 }]);
          onGoalsChange(newList);
        }
        setIsSettingGoalAngle(true);
      } else {
        setIsDragging(true);
        setLastMousePos({ x: event.clientX, y: event.clientY });
        dragStartRef.current = { x: event.clientX, y: event.clientY };
        dragMovedRef.current = false;
      }
    }
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !mapData || !canvasRef.current) return;

    if (isDragging) {
      // Handle panning
      const deltaX = event.clientX - lastMousePos.x;
      const deltaY = event.clientY - lastMousePos.y;
      
      setPanOffset(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));
      
      setLastMousePos({ x: event.clientX, y: event.clientY });
      canvasRef.current.style.cursor = 'grabbing';

      // Mark as true drag if moved beyond threshold from drag start
      if (dragStartRef.current) {
        const totalDx = event.clientX - dragStartRef.current.x;
        const totalDy = event.clientY - dragStartRef.current.y;
        if (Math.hypot(totalDx, totalDy) >= DRAG_THRESHOLD_PX) {
          dragMovedRef.current = true;
        }
      }
    } else {
      // Handle cursor for goal validity (existing logic)
      const currentX = event.clientX - rect.left;
      const currentY = event.clientY - rect.top;

      const worldPos = canvasToWorld(currentX, currentY);
      // Live update last goal's theta while dragging in multi-goal mode
      if (multiGoalMode && isSettingGoalAngle && onGoalsChange && goals.length > 0) {
        const last = goals[goals.length - 1];
        const theta = Math.atan2(worldPos.y - last.y, worldPos.x - last.x);
        const updated = goals.slice(0, -1).concat([{ ...last, theta }]);
        onGoalsChange(updated);
      }
      const validation = isValidGoalPosition(worldPos.x, worldPos.y);

      canvasRef.current.style.cursor = validation.valid ? 'crosshair' : 'not-allowed';
    }
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'default';
      }
    }
    if (isSettingGoalAngle) {
      setIsSettingGoalAngle(false);
    }
  };

  // MODIFIED: Handle mouse click with drag detection
  const handleMouseClick = (event: React.MouseEvent) => {
    // In multi-goal mode, creation is handled on mousedown; ignore click
    if (multiGoalMode) return;
    // Only process click if not a drag/pan
    if (!isDragging && !dragMovedRef.current) {
      handleMapClick(event);
    }
    // Reset drag markers after click processing
    dragMovedRef.current = false;
    dragStartRef.current = null;
  };

  // ADDED: Reset zoom and pan
  const resetView = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Draw the map - MODIFIED: Updated scale reference and drawing positions
  useEffect(() => {
    const OCCUPIED_THRESHOLD = 65;
    const FREE_THRESHOLD = 25;
    const canvas = canvasRef.current;
    if (!canvas || !mapData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Debug map size
    console.log(`🗺️ Map size: ${mapData.width}x${mapData.height}, Scale: ${mapScale.toFixed(3)}, Zoom: ${zoomLevel.toFixed(2)}`);

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw occupancy grid with filtered data
    const imageData = ctx.createImageData(mapData.width, mapData.height);

    // Map data processing - NO CHANGE (lines 155-185 from original)
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const dataIndex = y * mapData.width + x;
        const value = mapData.data[dataIndex];

        const canvasY = mapData.height - 1 - y;
        const pixelIndex = (canvasY * mapData.width + x) * 4;

        if (value === OCCUPIED_THRESHOLD) {
          imageData.data[pixelIndex] = 200;
          imageData.data[pixelIndex + 1] = 200;
          imageData.data[pixelIndex + 2] = 200;
          imageData.data[pixelIndex + 3] = 255;
        } else if (value >= 0 && value < FREE_THRESHOLD) {
          imageData.data[pixelIndex] = 255;
          imageData.data[pixelIndex + 1] = 255;
          imageData.data[pixelIndex + 2] = 255;
          imageData.data[pixelIndex + 3] = 255;
        } else {
          imageData.data[pixelIndex] = 50;
          imageData.data[pixelIndex + 1] = 50;
          imageData.data[pixelIndex + 2] = 50;
          imageData.data[pixelIndex + 3] = 255;
        }
      }
    }

    // Create temporary canvas and draw map with zoom - MODIFIED: Updated positioning
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = mapData.width;
    tempCanvas.height = mapData.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.putImageData(imageData, 0, 0);
      
      const centerOffsetX = (canvasWidth - mapData.width * mapScale) / 2;
      const centerOffsetY = (canvasHeight - mapData.height * mapScale) / 2;

      ctx.drawImage(
        tempCanvas,
        centerOffsetX + panOffset.x,
        centerOffsetY + panOffset.y,
        mapData.width * mapScale,
        mapData.height * mapScale
      );
    }

    // Draw path
    if (path.length > 1) {
      ctx.save();
      ctx.strokeStyle = '#2196f3';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();

      const firstPoint = worldToCanvas(path[0].x, path[0].y);
      ctx.moveTo(firstPoint.x, firstPoint.y);

      for (let i = 1; i < path.length; i++) {
        const point = worldToCanvas(path[i].x, path[i].y);
        ctx.lineTo(point.x, point.y);
      }

      ctx.stroke();

      // Optional: draw small dots at waypoints for visibility/debug
      ctx.fillStyle = '#1976d2';
      for (let i = 0; i < path.length; i++) {
        const p = worldToCanvas(path[i].x, path[i].y);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Preview a straight line from robot to pending goal while selecting
    if (path.length <= 1 && pendingPosition && robotPose) {
      const a = worldToCanvas(robotPose.x, robotPose.y);
      const b = worldToCanvas(pendingPosition.x, pendingPosition.y);
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = '#2196f399';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }

    // Draw goals
    goals.forEach((goal, index) => {
      const pos = worldToCanvas(goal.x, goal.y);
      
      ctx.fillStyle = '#ff9800';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.strokeStyle = '#ff9800';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(
        pos.x + Math.cos(goal.theta) * 15,
        pos.y - Math.sin(goal.theta) * 15
      );
      ctx.stroke();
      
      ctx.fillStyle = '#000';
      ctx.font = '12px Arial';
      ctx.fillText(`G${index + 1}`, pos.x + 10, pos.y - 10);
    });

    const LIDAR_OFFSET_X = 0.66; // Ví dụ: LiDAR ở phía trước 66cm
    const LIDAR_OFFSET_Y = 0.0; // Ví dụ: LiDAR không lệch trái/phải
    const LIDAR_OFFSET_THETA = 0.0; // Ví dụ: LiDAR không xoay so với robot

    // Draw LiDAR points similar to RViz filtering
    if (lidarData && robotPose) {
      // Single consistent style
      ctx.fillStyle = '#00ff00';

      const { ranges, angle_min, angle_increment, range_min, range_max } = lidarData;

      for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i];
        // Ignore invalid like RViz: null/NaN/inf/out-of-range
        if (r == null || !isFinite(r) || r < range_min || r > range_max) continue;

        const angle = angle_min + i * angle_increment;

        // Point in lidar frame
        const x_l = r * Math.cos(angle);
        const y_l = r * Math.sin(angle);

        // Transform lidar->base_link (apply sensor yaw offset + translation)
        const cosL = Math.cos(LIDAR_OFFSET_THETA);
        const sinL = Math.sin(LIDAR_OFFSET_THETA);
        const x_b = LIDAR_OFFSET_X + x_l * cosL - y_l * sinL;
        const y_b = LIDAR_OFFSET_Y + x_l * sinL + y_l * cosL;

        // Transform base_link->map using robot pose (standard 2D SE(2))
        const cosR = Math.cos(robotPose.theta);
        const sinR = Math.sin(robotPose.theta);
        const x_m = robotPose.x + x_b * cosR - y_b * sinR;
        const y_m = robotPose.y + x_b * sinR + y_b * cosR;

        const p = worldToCanvas(x_m, y_m);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // Draw robot (lines 297-340 remain the same)
    function roundedRectPath(
      ctx: CanvasRenderingContext2D,
      x: number, y: number, w: number, h: number, r: number
    ) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + w - rr, y);
      ctx.arcTo(x + w, y, x + w, y + rr, rr);
      ctx.lineTo(x + w, y + h - rr);
      ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
      ctx.lineTo(x + rr, y + h);
      ctx.arcTo(x, y + h, x, y + h - rr, rr);
      ctx.lineTo(x, y + rr);
      ctx.arcTo(x, y, x + rr, y, rr);
    }
    if (robotPose) {
      const pos = worldToCanvas(robotPose.x, robotPose.y);

      // thân robot: rectangle bo góc, xoay theo -theta (do trục Y canvas hướng xuống)
      const w = mapScale*26, h = mapScale*16, r = 10;

      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(-robotPose.theta);

      ctx.fillStyle = '#ffffffff';
      ctx.strokeStyle = '#008000';
      ctx.lineWidth = 3;
      ctx.beginPath();
      if ('roundRect' in ctx) {
        (ctx as any).roundRect(-w/2, -h/2, w, h, r);
      } else {
        roundedRectPath(ctx, -w/2, -h/2, w, h, r);
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // hướng robot: mũi tên đỏ như cũ
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      const headLen = mapScale*25;
      const endX = pos.x + Math.cos(robotPose.theta) * headLen;
      const endY = pos.y - Math.sin(robotPose.theta) * headLen;
      ctx.lineTo(endX, endY);
      ctx.stroke();

      const arrowLength = 8, arrowAngle = 0.5;
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

      // nhãn
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(pos.x + 20, pos.y - 25, 50, 20);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 12px Arial';
      ctx.fillText(t('map.info.robot', 'ROBOT'), pos.x + 22, pos.y - 10);
    }

    // Draw pending position (lines 342-370 remain the same)
    if (pendingPosition) {
      const pos = worldToCanvas(pendingPosition.x, pendingPosition.y);

      const isInitial = isSettingInitialPose;
      const markerColor = isInitial ? '#ff8c00' : '#2196f3';
      const borderColor = isInitial ? '#ff4500' : '#0d47a1';
      const labelText = isInitial ? t('map.instruction.initial', 'Click to set direction') : t('map.instruction.goal', 'Click to set goal direction');

      ctx.fillStyle = markerColor;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = `${markerColor}80`;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 12, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(pos.x + 15, pos.y - 30, 120, 20);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 11px Arial';
      ctx.fillText(labelText, pos.x + 17, pos.y - 15);
    }

  }, [mapData, robotPose, lidarData, goals, path, canvasWidth, canvasHeight, mapScale, zoomLevel, panOffset]);

  // ADDED: Fix passive event listener for wheel events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheelEvent = (event: WheelEvent) => {
      event.preventDefault();
      
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      // Calculate zoom factor
      const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
      const newZoomLevel = Math.max(minZoom, Math.min(maxZoom, zoomLevel * zoomFactor));
      
      if (newZoomLevel !== zoomLevel) {
        // Calculate zoom center offset to keep mouse position stable
        const zoomCenterX = mouseX - canvasWidth / 2;
        const zoomCenterY = mouseY - canvasHeight / 2;
        
        // Adjust pan offset to maintain zoom center
        const scaleDiff = newZoomLevel / zoomLevel - 1;
        const newPanX = panOffset.x - zoomCenterX * scaleDiff;
        const newPanY = panOffset.y - zoomCenterY * scaleDiff;
        
        setZoomLevel(newZoomLevel);
        setPanOffset({ x: newPanX, y: newPanY });
      }
    };

    canvas.addEventListener('wheel', handleWheelEvent, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleWheelEvent);
    };
  }, [zoomLevel, panOffset, canvasWidth, canvasHeight, minZoom, maxZoom]);
  // Check if a world position is valid for goal setting - NO CHANGE (lines 375-420)
  const isValidGoalPosition = (worldX: number, worldY: number): { valid: boolean; reason?: string } => {
    if (!mapData) return { valid: false, reason: "No map data available" };

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

    const dataMapX = Math.floor((worldX - mapData.origin.x) / mapData.resolution);
    const dataMapY = Math.floor((worldY - mapData.origin.y) / mapData.resolution);

    if (dataMapX < 0 || dataMapX >= mapData.width || dataMapY < 0 || dataMapY >= mapData.height) {
      return { valid: false, reason: "Outside map grid" };
    }

    if (mapData.data && mapData.data.length > 0) {
      const index = dataMapY * mapData.width + dataMapX;
      if (index >= 0 && index < mapData.data.length) {
        const cellValue = mapData.data[index];

        console.log(`🔍 Cell validation:`, {
          dataMapCoords: { x: dataMapX, y: dataMapY },
          index: index,
          cellValue: cellValue,
          mapSize: { width: mapData.width, height: mapData.height },
          dataLength: mapData.data.length
        });

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

  // Handle map click logic - NO CHANGE (lines 422-480)
  const handleMapClick = (event: React.MouseEvent) => {
    if (!onMapClick || !mapData) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;

    const worldPos = canvasToWorld(canvasX, canvasY);

    const validation = isValidGoalPosition(worldPos.x, worldPos.y);

    logWarn(`🎯 Map clicked at canvas: (${canvasX.toFixed(1)}, ${canvasY.toFixed(1)}) -> world: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)})`, 'MapViewer2D');

    if (!validation.valid) {
      console.warn(`⚠️ Invalid goal position: ${validation.reason}`);
      setErrorMessage(`Cannot set goal here: ${validation.reason}`);
      return;
    }

    if (!isSelectingDirection) {
      setPendingPosition({ x: worldPos.x, y: worldPos.y });
      setIsSelectingDirection(true);
      const mode = isSettingInitialPose ? t('map2d.mode.initial', 'Initial Pose') : t('map2d.mode.nav_goal', 'Nav Goal');
      console.log(`📍 ${mode} position set to (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}). Click again to set direction.`);
      return;
    } else {
      if (pendingPosition) {
        const dx = worldPos.x - pendingPosition.x;
        const dy = worldPos.y - pendingPosition.y;
        const theta = Math.atan2(dy, dx);

        const mode = isSettingInitialPose ? t('map2d.mode.initial', 'Initial Pose') : t('map2d.mode.nav_goal', 'Nav Goal');
        console.log(`🧭 Direction set for ${mode}: ${(theta * 180 / Math.PI).toFixed(1)}°`);
        console.log(`✅ Complete ${mode}: (${pendingPosition.x.toFixed(2)}, ${pendingPosition.y.toFixed(2)}, ${theta.toFixed(3)})`);

        onMapClick(pendingPosition.x, pendingPosition.y, theta);

        setPendingPosition(null);
        setIsSelectingDirection(false);
      }
      return;
    }
  };

  // Debug logs - NO CHANGE (lines 485-500)
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

  // Debug alert (remain disabled by default). Enable if needed.
  // if (mapData && !(window as any).debugAlertShown) {
  //   const robotInfo = robotPose ? `${t('map.info.robot', 'Robot')}(${robotPose.x}, ${robotPose.y})` : 'NO ROBOT';
  //   const mapInfo = `${t('map.info.size', 'Size')} ${mapData.width}x${mapData.height}, res=${mapData.resolution}`;
  //   alert(`DEBUG: ${mapInfo}, ${robotInfo}`);
  //   (window as any).debugAlertShown = true;
  // }

  return (
    <Paper sx={{ position: 'relative', overflow: 'hidden', width: canvasWidth, height: canvasHeight }}>
      {/* MODIFIED: Debug info with zoom level */}
      <Box sx={{ position: 'absolute', top: 8, left: 8, zIndex: 2, bgcolor: 'yellow', p: 1 }}>
        {`${t('map.info.size', 'Size')} ${mapData ? `${mapData.width}x${mapData.height}` : t('map.viewer.no_data.title')} | Zoom: ${zoomLevel.toFixed(2)}x`}
      </Box>

      {/* ADDED: Zoom controls */}
      <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <button 
          onClick={() => setZoomLevel(prev => Math.min(maxZoom, prev * 1.2))}
          style={{ padding: '4px 8px', fontSize: '14px', cursor: 'pointer' }}
        >
          {t('map.viewer.zoom_in')}
        </button>
        <button 
          onClick={() => setZoomLevel(prev => Math.max(minZoom, prev / 1.2))}
          style={{ padding: '4px 8px', fontSize: '14px', cursor: 'pointer' }}
        >
          {t('map.viewer.zoom_out')}
        </button>
        <button 
          onClick={resetView}
          style={{ padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
        >
          {t('map.viewer.reset')}
        </button>
      </Box>

      {/* Map Status - NO CHANGE (lines 515-530) */}
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
            {t('map.info.robot', 'Robot')}: ({robotPose.x && robotPose.x.toFixed(2)}, {robotPose.y &&robotPose.y.toFixed(2)})
          </Typography>
        )}
      </Box>

      {/* MODIFIED: Canvas with zoom and pan event handlers */}
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        style={{
          width: canvasWidth,
          height: canvasHeight,
          cursor: isDragging ? 'grabbing' : 'default',
          display: 'block'
        }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onClick={handleMouseClick}
      />

      {/* No Map Message and Error Snackbar - NO CHANGE (lines 545-575) */}
      {!mapData && (
        <Box sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          color: 'text.secondary'
        }}>
          <Typography variant="h6">{t('map.viewer.no_data.title')}</Typography>
          <Typography variant="body2">
            {t('map.viewer.no_data.subtitle')}
          </Typography>
        </Box>
      )}

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
