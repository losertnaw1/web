import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Typography,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  Chip,
  Grid,
  Slider,
  FormControlLabel,
  Switch,
  Tabs,
  Tab,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Save as SaveIcon,
  Clear as ClearIcon,
  Undo as UndoIcon,
  Redo as RedoIcon,
  Edit as EditIcon,
  RoomOutlined as WaypointIcon,
  RouteOutlined as PathIcon
} from '@mui/icons-material';
import { getApiUrl } from '../config/config';

// Map element types
type ShapeType = 'line' | 'rectangle' | 'circle';

interface MapElement {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  x2?: number;
  y2?: number;
  color: string;
  selected: boolean;
}

interface Waypoint {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  orientation: number; // yaw in radians
  description?: string;
}

interface Path {
  id: string;
  name?: string;
  type: 'direct' | 'winding';
  startWaypointId: string;
  endWaypointId: string;
  intermediatePoints?: Array<{x: number; y: number}>; // For winding paths
  orientation?: number; // Final orientation for winding paths
}

interface SavedMap {
  id: string;
  name: string;
  elements: MapElement[];
  width: number;
  height: number;
  resolution: number;
  created: string;
  modified: string;
  waypoints?: Waypoint[];
  paths?: Path[];
  ros_files?: {
    yaml_file: string;
    pgm_file: string;
    full_path?: string;
    exported_at?: string;
    processed_at?: string;
  };
}

interface Point2D {
  x: number;
  y: number;
}

interface SelectionRect {
  topLeft: Point2D;
  topRight: Point2D;
  bottomRight: Point2D;
  bottomLeft: Point2D;
}

type CornerHandle = 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left';

type RosHandle =
  | CornerHandle
  | 'line-start'
  | 'line-end'
  | 'line-move'
  | 'circle-radius'
  | 'circle-move';

type RosTool = 'rectangle' | 'line' | 'circle';

interface MapEditorProps {
  initialElements?: MapElement[];
  width?: number;
  height?: number;
  onSaveMap?: (map: SavedMap) => void;
  onLoadMap?: (mapId: string) => void;
  savedMaps?: SavedMap[];
  viewMode?: boolean; // Thêm prop để xác định chế độ xem
  initialMapData?: SavedMap; // Thêm prop để truyền map data từ ngoài
  onMapMetadataUpdate?: (map: SavedMap) => void;
}

const MapEditor: React.FC<MapEditorProps> = ({
  initialElements = [],
  width = 800,
  height = 600,
  onSaveMap,
  onLoadMap,
  savedMaps = [],
  viewMode = false,
  initialMapData,
  onMapMetadataUpdate
}) => {
  // Force component refresh after fixing imports
  // Canvas and drawing state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elements, setElements] = useState<MapElement[]>(initialElements);
  const [selectedTool, setSelectedTool] = useState<ShapeType>('line');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  
  // Map properties
  const [mapWidth, setMapWidth] = useState(width);
  const [mapHeight, setMapHeight] = useState(height);
  const [mapResolution, setMapResolution] = useState(0.05); // meters per pixel
  const [gridSize, setGridSize] = useState(20);
  const [showGrid, setShowGrid] = useState(true);
  
  // UI state
  const [mapName, setMapName] = useState('');
  const [currentMapId, setCurrentMapId] = useState<string | null>(null);

  // Tab navigation state
  const [activeTab, setActiveTab] = useState<'edit' | 'waypoint' | 'path'>('edit');

  // Waypoints and paths state
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [paths, setPaths] = useState<Path[]>([]);
  const [selectedWaypoint, setSelectedWaypoint] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [waypointDialogOpen, setWaypointDialogOpen] = useState(false);
  const [pathDialogOpen, setPathDialogOpen] = useState(false);
  const [newWaypointData, setNewWaypointData] = useState<{
    x: number;
    y: number;
    z: number;
    orientation: number;
    name: string;
    description: string;
  } | null>(null);
  const [newPathData, setNewPathData] = useState<{
    type: 'direct' | 'winding';
    startWaypointId: string;
    endWaypointId: string;
    name: string;
  } | null>(null);
  
  const isRosMap = Boolean(initialMapData?.ros_files);
  const [rosImageData, setRosImageData] = useState<ImageData | null>(null);
  const [rosRawPixels, setRosRawPixels] = useState<Uint8Array | null>(null);
  const [rosLoading, setRosLoading] = useState(false);
  const [rosError, setRosError] = useState<string | null>(null);
  const [rosSelectionRect, setRosSelectionRect] = useState<SelectionRect | null>(null);
  const [rosSelectionStart, setRosSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [isRosSelecting, setIsRosSelecting] = useState(false);
  const [rosProcessing, setRosProcessing] = useState(false);
  const [rosKernelSize, setRosKernelSize] = useState(5);
  const [rosQuantize, setRosQuantize] = useState(true);
  const [rosActiveHandle, setRosActiveHandle] = useState<RosHandle | null>(null);
  const [maskValue, setMaskValue] = useState(0);
  const [rosSelectionTool, setRosSelectionTool] = useState<RosTool>('rectangle');
  const [rosSelectionLine, setRosSelectionLine] = useState<{ start: Point2D; end: Point2D } | null>(null);
  const [rosSelectionCircle, setRosSelectionCircle] = useState<{ center: Point2D; radius: number } | null>(null);

  const handleRosToolChange = useCallback((_: React.SyntheticEvent, value: RosTool | null) => {
    if (value) {
      setRosSelectionTool(value);
    }
  }, []);

  // History for undo/redo
  const [history, setHistory] = useState<MapElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Colors for different elements
  const colors = useMemo(() => ({
    line: '#2196F3',    // Blue for walls
    rectangle: '#FF9800', // Orange for obstacles
    circle: '#4CAF50',   // Green for special areas
    selected: '#F44336', // Red for selected
    grid: '#E0E0E0',    // Light gray for grid
    handle: '#FFFFFF',  // White for handles
    handleBorder: '#000000' // Black border for handles
  }), []);

  const decodeBase64ToUint8Array = useCallback((base64Data: string) => {
    const binaryString = atob(base64Data);
    const length = binaryString.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }, []);

  const createImageDataFromGrayscale = useCallback((pixels: Uint8Array, imgWidth: number, imgHeight: number) => {
    const rgba = new Uint8ClampedArray(imgWidth * imgHeight * 4);
    for (let i = 0; i < pixels.length; i += 1) {
      const value = pixels[i];
      const baseIndex = i * 4;
      rgba[baseIndex] = value;
      rgba[baseIndex + 1] = value;
      rgba[baseIndex + 2] = value;
      rgba[baseIndex + 3] = 255;
    }
    return new ImageData(rgba, imgWidth, imgHeight);
  }, []);

  const clamp = useCallback((value: number, minValue: number, maxValue: number) => {
    return Math.min(Math.max(value, minValue), maxValue);
  }, []);

  const getCornerPositions = useCallback((rect: SelectionRect) => {
    return {
      'top-left': rect.topLeft,
      'top-right': rect.topRight,
      'bottom-right': rect.bottomRight,
      'bottom-left': rect.bottomLeft
    } as const;
  }, []);

  const detectCornerHandle = useCallback((rect: SelectionRect, x: number, y: number): CornerHandle | null => {
    const handles = getCornerPositions(rect);
    const threshold = 10;
    for (const [key, point] of Object.entries(handles) as [CornerHandle, Point2D][]) {
      if (Math.abs(point.x - x) <= threshold && Math.abs(point.y - y) <= threshold) {
        return key;
      }
    }
    return null;
  }, [getCornerPositions]);

  const detectLineHandle = useCallback((line: { start: Point2D; end: Point2D }, x: number, y: number): RosHandle | null => {
    const threshold = 10;
    const distStart = Math.hypot(x - line.start.x, y - line.start.y);
    if (distStart <= threshold) return 'line-start';
    const distEnd = Math.hypot(x - line.end.x, y - line.end.y);
    if (distEnd <= threshold) return 'line-end';
    const distanceToLine = Math.abs((line.end.y - line.start.y) * x - (line.end.x - line.start.x) * y + line.end.x * line.start.y - line.end.y * line.start.x) /
      Math.sqrt(Math.pow(line.end.y - line.start.y, 2) + Math.pow(line.end.x - line.start.x, 2));
    if (distanceToLine <= threshold && distStart > threshold && distEnd > threshold) {
      return 'line-move';
    }
    return null;
  }, []);

  const detectCircleHandle = useCallback((circle: { center: Point2D; radius: number }, x: number, y: number): RosHandle | null => {
    const threshold = 10;
    const distance = Math.hypot(x - circle.center.x, y - circle.center.y);
    if (Math.abs(distance - circle.radius) <= threshold) {
      return 'circle-radius';
    }
    if (distance < circle.radius) {
      return 'circle-move';
    }
    return null;
  }, []);

  const createSelectionFromBounds = useCallback((x1: number, y1: number, x2: number, y2: number): SelectionRect => {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    return {
      topLeft: { x: minX, y: minY },
      topRight: { x: maxX, y: minY },
      bottomRight: { x: maxX, y: maxY },
      bottomLeft: { x: minX, y: maxY }
    };
  }, []);

  const getSelectionBounds = useCallback((rect: SelectionRect) => {
    const points = [rect.topLeft, rect.topRight, rect.bottomRight, rect.bottomLeft];
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }, []);
  const lineThickness = 3;

  const getPolygonBounds = useCallback((points: Point2D[]) => {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }, []);

  const getLinePolygon = useCallback((line: { start: Point2D; end: Point2D }, thickness = lineThickness) => {
    const dx = line.end.x - line.start.x;
    const dy = line.end.y - line.start.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const offsetX = -(dy / length) * (thickness / 2);
    const offsetY = (dx / length) * (thickness / 2);
    return [
      { x: line.start.x + offsetX, y: line.start.y + offsetY },
      { x: line.end.x + offsetX, y: line.end.y + offsetY },
      { x: line.end.x - offsetX, y: line.end.y - offsetY },
      { x: line.start.x - offsetX, y: line.start.y - offsetY }
    ];
  }, []);

  const getCirclePolygon = useCallback((circle: { center: Point2D; radius: number }, segments = 64) => {
    const pts: Point2D[] = [];
    for (let i = 0; i < segments; i += 1) {
      const angle = (2 * Math.PI * i) / segments;
      pts.push({
        x: circle.center.x + circle.radius * Math.cos(angle),
        y: circle.center.y + circle.radius * Math.sin(angle)
      });
    }
    return pts;
  }, []);

  const rosSelectionBounds = useMemo(() => {
    if (!isRosMap) return null;
    if (rosSelectionTool === 'rectangle' && rosSelectionRect) {
      return getSelectionBounds(rosSelectionRect);
    }
    if (rosSelectionTool === 'line' && rosSelectionLine) {
      return getPolygonBounds(getLinePolygon(rosSelectionLine));
    }
    if (rosSelectionTool === 'circle' && rosSelectionCircle) {
      return getPolygonBounds(getCirclePolygon(rosSelectionCircle));
    }
    return null;
  }, [
    isRosMap,
    rosSelectionTool,
    rosSelectionRect,
    rosSelectionLine,
    rosSelectionCircle,
    getSelectionBounds,
    getPolygonBounds,
    getLinePolygon,
    getCirclePolygon
  ]);

  const hasRosSelection = useMemo(() => {
    if (!isRosMap) return false;
    if (rosSelectionTool === 'rectangle') {
      return !!rosSelectionRect;
    }
    if (rosSelectionTool === 'line') {
      if (!rosSelectionLine) return false;
      const length = Math.hypot(
        rosSelectionLine.end.x - rosSelectionLine.start.x,
        rosSelectionLine.end.y - rosSelectionLine.start.y
      );
      return length >= 1;
    }
    if (rosSelectionTool === 'circle') {
      return !!rosSelectionCircle && rosSelectionCircle.radius >= 1;
    }
    return false;
  }, [
    isRosMap,
    rosSelectionTool,
    rosSelectionRect,
    rosSelectionLine,
    rosSelectionCircle
  ]);

  // Add to history for undo/redo
  const addToHistory = useCallback((newElements: MapElement[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...newElements]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  // Function to draw selection handles
  const drawHandles = useCallback((ctx: CanvasRenderingContext2D, element: MapElement) => {
    const handleSize = 6;
    const handles: { x: number; y: number }[] = [];

    // Get handle positions based on element type
    switch (element.type) {
      case 'line':
        if (element.x2 !== undefined && element.y2 !== undefined) {
          handles.push(
            { x: element.x, y: element.y },      // Start point
            { x: element.x2, y: element.y2 }    // End point
          );
        }
        break;
      case 'rectangle':
        if (element.width && element.height) {
          handles.push(
            { x: element.x, y: element.y },                           // Top-left
            { x: element.x + element.width, y: element.y },           // Top-right
            { x: element.x, y: element.y + element.height },          // Bottom-left
            { x: element.x + element.width, y: element.y + element.height } // Bottom-right
          );
        }
        break;
      case 'circle':
        if (element.radius) {
          handles.push(
            { x: element.x, y: element.y },                    // Center
            { x: element.x + element.radius, y: element.y },   // Right
            { x: element.x - element.radius, y: element.y },   // Left
            { x: element.x, y: element.y + element.radius },   // Bottom
            { x: element.x, y: element.y - element.radius }    // Top
          );
        }
        break;
    }

    // Draw handles
    handles.forEach(handle => {
      // Draw handle background
      ctx.fillStyle = colors.handle;
      ctx.beginPath();
      ctx.arc(handle.x, handle.y, handleSize, 0, 2 * Math.PI);
      ctx.fill();

      // Draw handle border
      ctx.strokeStyle = colors.handleBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }, [colors]);

  // Function to detect which handle was clicked
  const getClickedHandle = useCallback((element: MapElement, x: number, y: number): string | null => {
    const handleSize = 8;

    switch (element.type) {
      case 'line':
        if (element.x2 !== undefined && element.y2 !== undefined) {
          if (Math.sqrt(Math.pow(x - element.x, 2) + Math.pow(y - element.y, 2)) <= handleSize) {
            return 'start';
          }
          if (Math.sqrt(Math.pow(x - element.x2, 2) + Math.pow(y - element.y2, 2)) <= handleSize) {
            return 'end';
          }
        }
        break;
      case 'rectangle':
        if (element.width && element.height) {
          const handles = [
            { id: 'top-left', x: element.x, y: element.y },
            { id: 'top-right', x: element.x + element.width, y: element.y },
            { id: 'bottom-left', x: element.x, y: element.y + element.height },
            { id: 'bottom-right', x: element.x + element.width, y: element.y + element.height }
          ];

          for (const handle of handles) {
            if (Math.sqrt(Math.pow(x - handle.x, 2) + Math.pow(y - handle.y, 2)) <= handleSize) {
              return handle.id;
            }
          }
        }
        break;
      case 'circle':
        if (element.radius) {
          const handles = [
            { id: 'right', x: element.x + element.radius, y: element.y },
            { id: 'left', x: element.x - element.radius, y: element.y },
            { id: 'top', x: element.x, y: element.y - element.radius },
            { id: 'bottom', x: element.x, y: element.y + element.radius }
          ];

          for (const handle of handles) {
            if (Math.sqrt(Math.pow(x - handle.x, 2) + Math.pow(y - handle.y, 2)) <= handleSize) {
              return handle.id;
            }
          }
        }
        break;
    }

    return null;
  }, []);

  // Function to check if click is on element body (not handles)
  const isClickOnElementBody = useCallback((element: MapElement, x: number, y: number): boolean => {
    switch (element.type) {
      case 'line':
        if (element.x2 !== undefined && element.y2 !== undefined) {
          const dist = Math.abs((element.y2 - element.y) * x - (element.x2 - element.x) * y + element.x2 * element.y - element.y2 * element.x) /
                       Math.sqrt(Math.pow(element.y2 - element.y, 2) + Math.pow(element.x2 - element.x, 2));
          return dist < 8;
        }
        return false;
      case 'rectangle':
        if (element.width && element.height) {
          // Only on border, not inside
          const onBorder = (x >= element.x - 3 && x <= element.x + 3) ||
                          (x >= element.x + element.width - 3 && x <= element.x + element.width + 3) ||
                          (y >= element.y - 3 && y <= element.y + 3) ||
                          (y >= element.y + element.height - 3 && y <= element.y + element.height + 3);
          const inBounds = x >= element.x - 3 && x <= element.x + element.width + 3 &&
                          y >= element.y - 3 && y <= element.y + element.height + 3;
          return onBorder && inBounds;
        }
        return false;
      case 'circle':
        if (element.radius) {
          const distance = Math.sqrt(Math.pow(x - element.x, 2) + Math.pow(y - element.y, 2));
          // Only on border area, not center
          return distance >= element.radius - 5 && distance <= element.radius + 5;
        }
        return false;
      default:
        return false;
    }
  }, []);

  // Draw canvas
  const drawCanvas = useCallback(() => {
    if (isRosMap) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, mapWidth, mapHeight);

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1;
      
      for (let x = 0; x <= mapWidth; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, mapHeight);
        ctx.stroke();
      }
      
      for (let y = 0; y <= mapHeight; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(mapWidth, y);
        ctx.stroke();
      }
    }

    // Draw elements
    elements.forEach(element => {
      ctx.strokeStyle = element.selected ? colors.selected : element.color;
      ctx.fillStyle = element.selected ? colors.selected : element.color;
      ctx.lineWidth = element.selected ? 3 : 2;

      switch (element.type) {
        case 'line':
          if (element.x2 !== undefined && element.y2 !== undefined) {
            ctx.beginPath();
            ctx.moveTo(element.x, element.y);
            ctx.lineTo(element.x2, element.y2);
            ctx.stroke();
          }
          break;

        case 'rectangle':
          if (element.width && element.height) {
            ctx.strokeRect(element.x, element.y, element.width, element.height);
            if (element.selected) {
              ctx.fillStyle = colors.selected + '20'; // Semi-transparent
              ctx.fillRect(element.x, element.y, element.width, element.height);
            }
          }
          break;

        case 'circle':
          if (element.radius) {
            ctx.beginPath();
            ctx.arc(element.x, element.y, element.radius, 0, 2 * Math.PI);
            ctx.stroke();
            if (element.selected) {
              ctx.fillStyle = colors.selected + '20'; // Semi-transparent
              ctx.fill();
            }
          }
          break;
      }

      // Draw handles for selected elements
      if (element.selected) {
        drawHandles(ctx, element);
      }
    });
  }, [elements, mapWidth, mapHeight, gridSize, showGrid, colors, drawHandles, isRosMap]);

  const drawRosCanvas = useCallback(() => {
    if (!isRosMap) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (rosImageData) {
      ctx.putImageData(rosImageData, 0, 0);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (rosSelectionTool === 'rectangle' && rosSelectionRect) {
      const handles = getCornerPositions(rosSelectionRect);
      ctx.save();
      ctx.strokeStyle = '#FF9800';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(handles['top-left'].x, handles['top-left'].y);
      ctx.lineTo(handles['top-right'].x, handles['top-right'].y);
      ctx.lineTo(handles['bottom-right'].x, handles['bottom-right'].y);
      ctx.lineTo(handles['bottom-left'].x, handles['bottom-left'].y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      const handleSize = 8;
      (Object.entries(handles) as [CornerHandle, Point2D][]).forEach(([key, point]) => {
        ctx.save();
        ctx.fillStyle = rosActiveHandle === key ? '#1976d2' : '#ffffff';
        ctx.strokeStyle = '#1976d2';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(point.x - handleSize / 2, point.y - handleSize / 2, handleSize, handleSize);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });
    }

    if (rosSelectionTool === 'line' && rosSelectionLine) {
      const { start, end } = rosSelectionLine;
      ctx.save();
      ctx.strokeStyle = '#FF9800';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.restore();

      const handleSize = 8;
      const handles: [RosHandle, Point2D][] = [
        ['line-start', start],
        ['line-end', end]
      ];
      handles.forEach(([key, point]) => {
        ctx.save();
        ctx.fillStyle = rosActiveHandle === key ? '#1976d2' : '#ffffff';
        ctx.strokeStyle = '#1976d2';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(point.x - handleSize / 2, point.y - handleSize / 2, handleSize, handleSize);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });
    }

    if (rosSelectionTool === 'circle' && rosSelectionCircle) {
      const { center, radius } = rosSelectionCircle;
      ctx.save();
      ctx.strokeStyle = '#FF9800';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.restore();

      const handleSize = 8;
      const handlePoint: Point2D = { x: center.x + radius, y: center.y };
      ctx.save();
      ctx.fillStyle = rosActiveHandle === 'circle-radius' ? '#1976d2' : '#ffffff';
      ctx.strokeStyle = '#1976d2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(handlePoint.x - handleSize / 2, handlePoint.y - handleSize / 2, handleSize, handleSize);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }, [
    isRosMap,
    rosImageData,
    rosSelectionTool,
    rosSelectionRect,
    rosSelectionLine,
    rosSelectionCircle,
    getCornerPositions,
    rosActiveHandle
  ]);

  // Draw waypoints and paths overlay
  const drawWaypointsAndPaths = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw paths first (behind waypoints)
    paths.forEach((path) => {
      const startWp = waypoints.find(wp => wp.id === path.startWaypointId);
      const endWp = waypoints.find(wp => wp.id === path.endWaypointId);

      if (startWp && endWp) {
        ctx.strokeStyle = path.id === selectedPath ? '#FF5722' : '#2196F3';
        ctx.lineWidth = path.id === selectedPath ? 3 : 2;
        ctx.setLineDash([5, 5]);

        ctx.beginPath();
        ctx.moveTo(startWp.x, startWp.y);
        ctx.lineTo(endWp.x, endWp.y);
        ctx.stroke();

        ctx.setLineDash([]);

        // Draw arrow at end
        const angle = Math.atan2(endWp.y - startWp.y, endWp.x - startWp.x);
        const arrowLength = 10;
        ctx.beginPath();
        ctx.moveTo(endWp.x, endWp.y);
        ctx.lineTo(
          endWp.x - arrowLength * Math.cos(angle - Math.PI / 6),
          endWp.y - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(endWp.x, endWp.y);
        ctx.lineTo(
          endWp.x - arrowLength * Math.cos(angle + Math.PI / 6),
          endWp.y - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      }
    });

    // Draw waypoints
    waypoints.forEach((wp) => {
      const isSelected = wp.id === selectedWaypoint;

      // Draw circle
      ctx.fillStyle = isSelected ? '#FF5722' : '#4CAF50';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(wp.x, wp.y, 8, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Draw orientation arrow
      const arrowLength = 15;
      ctx.strokeStyle = isSelected ? '#FF5722' : '#4CAF50';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(wp.x, wp.y);
      ctx.lineTo(
        wp.x + arrowLength * Math.cos(wp.orientation),
        wp.y + arrowLength * Math.sin(wp.orientation)
      );
      ctx.stroke();

      // Draw name
      ctx.fillStyle = '#000000';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(wp.name, wp.x, wp.y - 15);
    });
  }, [waypoints, paths, selectedWaypoint, selectedPath]);

  // Update elements when initialElements change
  useEffect(() => {
    setElements(initialElements);
    setHistory([initialElements]);
    setHistoryIndex(0);
  }, [initialElements]);

  // Set initial values based on props
  useEffect(() => {
    setMapWidth(width);
    setMapHeight(height);
  }, [width, height]);

  // Auto-set map name when currentMapId changes
  useEffect(() => {
    if (currentMapId) {
      const currentMap = savedMaps.find(m => m.id === currentMapId);
      if (currentMap && !mapName) {
        setMapName(currentMap.name);
      }
    }
  }, [currentMapId, savedMaps, mapName]);

  // Load initial map data if provided
  useEffect(() => {
    if (initialMapData) {
      setElements(initialMapData.elements);
      setMapWidth(initialMapData.width);
      setMapHeight(initialMapData.height);
      setMapResolution(initialMapData.resolution);
      setCurrentMapId(initialMapData.id);
      setMapName(initialMapData.name);
      setHistory([initialMapData.elements]);
      setHistoryIndex(0);
    }
  }, [initialMapData]);

  useEffect(() => {
    let isCancelled = false;

    if (!isRosMap || !initialMapData?.id) {
      if (!isCancelled) {
        setRosImageData(null);
        setRosRawPixels(null);
        setRosSelectionRect(null);
        setRosSelectionStart(null);
        setRosLoading(false);
      }
      return () => {
        isCancelled = true;
      };
    }

    const fetchRosImage = async () => {
      try {
        setRosLoading(true);
        setRosError(null);
        const response = await fetch(getApiUrl(`/api/maps/${initialMapData.id}/image`));
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || 'Failed to load ROS map image');
        }
        const data = await response.json();
        if (isCancelled) {
          return;
        }
        const imageInfo = data.image;
        const rawPixels = decodeBase64ToUint8Array(imageInfo.data);
        setRosRawPixels(rawPixels);
        setRosImageData(createImageDataFromGrayscale(rawPixels, imageInfo.width, imageInfo.height));
        setMapWidth(imageInfo.width);
        setMapHeight(imageInfo.height);
        setRosSelectionRect(null);
        setRosSelectionStart(null);
      } catch (error) {
        if (!isCancelled) {
          setRosError('Không thể tải dữ liệu bản đồ từ ROS: ' + (error as Error).message);
        }
      } finally {
        if (!isCancelled) {
          setRosLoading(false);
        }
      }
    };

    fetchRosImage();

    return () => {
      isCancelled = true;
    };
  }, [isRosMap, initialMapData?.id, decodeBase64ToUint8Array, createImageDataFromGrayscale]);

  // Update canvas when elements change
  useEffect(() => {
    if (isRosMap) {
      drawRosCanvas();
    } else {
      drawCanvas();
    }

    // Draw waypoints and paths overlay for waypoint/path tabs
    if (activeTab === 'waypoint' || activeTab === 'path') {
      drawWaypointsAndPaths();
    }
  }, [isRosMap, drawCanvas, drawRosCanvas, activeTab, drawWaypointsAndPaths]);

  const handleRosMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isRosMap || viewMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvas.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(canvas.height, e.clientY - rect.top));
    const snappedX = Math.floor(x);
    const snappedY = Math.floor(y);

    if (rosSelectionTool === 'rectangle') {
      const handle = rosSelectionRect ? detectCornerHandle(rosSelectionRect, snappedX, snappedY) : null;
      if (handle && rosSelectionRect) {
        setRosActiveHandle(handle);
        setIsRosSelecting(false);
        return;
      }

      setRosActiveHandle(null);
      setRosSelectionStart({ x: snappedX, y: snappedY });
      setRosSelectionRect(createSelectionFromBounds(snappedX, snappedY, snappedX, snappedY));
      setIsRosSelecting(true);
      return;
    }

    if (rosSelectionTool === 'line') {
      if (rosSelectionLine) {
        const handle = detectLineHandle(rosSelectionLine, snappedX, snappedY);
        if (handle) {
          setRosActiveHandle(handle);
          setRosSelectionStart({ x: snappedX, y: snappedY });
          setIsRosSelecting(handle === 'line-start' || handle === 'line-end');
          return;
        }
      }
      setRosActiveHandle('line-end');
      const startPoint = { x: snappedX, y: snappedY };
      setRosSelectionLine({ start: startPoint, end: startPoint });
      setIsRosSelecting(true);
      return;
    }

    if (rosSelectionTool === 'circle') {
      if (rosSelectionCircle) {
        const handle = detectCircleHandle(rosSelectionCircle, snappedX, snappedY);
        if (handle) {
          setRosActiveHandle(handle);
          setRosSelectionStart({ x: snappedX, y: snappedY });
          setIsRosSelecting(handle === 'circle-radius');
          return;
        }
      }
      setRosActiveHandle('circle-radius');
      setRosSelectionCircle({ center: { x: snappedX, y: snappedY }, radius: 0 });
      setRosSelectionStart({ x: snappedX, y: snappedY });
      setIsRosSelecting(true);
    }
  }, [
    createSelectionFromBounds,
    detectCornerHandle,
    detectLineHandle,
    detectCircleHandle,
    isRosMap,
    rosSelectionTool,
    rosSelectionRect,
    rosSelectionLine,
    rosSelectionCircle,
    viewMode
  ]);

  const handleRosMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isRosMap) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvas.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(canvas.height, e.clientY - rect.top));

    const endX = Math.floor(x);
    const endY = Math.floor(y);
    const clampedX = clamp(endX, 0, canvas.width);
    const clampedY = clamp(endY, 0, canvas.height);

    if (rosSelectionTool === 'rectangle') {
      if (rosActiveHandle) {
        setRosSelectionRect(prev => {
          if (!prev) return prev;
          const updated: SelectionRect = {
            topLeft: { ...prev.topLeft },
            topRight: { ...prev.topRight },
            bottomRight: { ...prev.bottomRight },
            bottomLeft: { ...prev.bottomLeft }
          };

          switch (rosActiveHandle) {
            case 'top-left':
              updated.topLeft = { x: clampedX, y: clampedY };
              break;
            case 'top-right':
              updated.topRight = { x: clampedX, y: clampedY };
              break;
            case 'bottom-right':
              updated.bottomRight = { x: clampedX, y: clampedY };
              break;
            case 'bottom-left':
              updated.bottomLeft = { x: clampedX, y: clampedY };
              break;
          }

          return updated;
        });
        return;
      }

      if (!isRosSelecting || !rosSelectionStart) return;
      setRosSelectionRect(createSelectionFromBounds(rosSelectionStart.x, rosSelectionStart.y, endX, endY));
      return;
    }

    if (rosSelectionTool === 'line') {
      if (rosActiveHandle && rosSelectionLine) {
        setRosSelectionLine(prev => {
          if (!prev) return prev;
          switch (rosActiveHandle) {
            case 'line-start':
              return { start: { x: clampedX, y: clampedY }, end: prev.end };
            case 'line-end':
              return { start: prev.start, end: { x: clampedX, y: clampedY } };
            case 'line-move':
              if (!rosSelectionStart) return prev;
              const dx = clampedX - rosSelectionStart.x;
              const dy = clampedY - rosSelectionStart.y;
              setRosSelectionStart({ x: clampedX, y: clampedY });
              return {
                start: { x: prev.start.x + dx, y: prev.start.y + dy },
                end: { x: prev.end.x + dx, y: prev.end.y + dy }
              };
            default:
              return prev;
          }
        });
        return;
      }

      if (isRosSelecting && rosSelectionLine) {
        setRosSelectionLine(prev => prev ? {
          start: prev.start,
          end: { x: clampedX, y: clampedY }
        } : prev);
      }
      return;
    }

    if (rosSelectionTool === 'circle') {
      if (rosActiveHandle && rosSelectionCircle) {
        setRosSelectionCircle(prev => {
          if (!prev) return prev;
          if (rosActiveHandle === 'circle-radius') {
            const radius = Math.max(0, Math.hypot(clampedX - prev.center.x, clampedY - prev.center.y));
            return { center: prev.center, radius };
          }
          if (rosActiveHandle === 'circle-move' && rosSelectionStart) {
            const dx = clampedX - rosSelectionStart.x;
            const dy = clampedY - rosSelectionStart.y;
            setRosSelectionStart({ x: clampedX, y: clampedY });
            return {
              center: { x: prev.center.x + dx, y: prev.center.y + dy },
              radius: prev.radius
            };
          }
          return prev;
        });
        return;
      }

      if (isRosSelecting && rosSelectionCircle && rosSelectionStart) {
        const radius = Math.max(0, Math.hypot(clampedX - rosSelectionCircle.center.x, clampedY - rosSelectionCircle.center.y));
        setRosSelectionCircle(prev => prev ? { center: prev.center, radius } : prev);
      }
    }
  }, [
    clamp,
    createSelectionFromBounds,
    isRosMap,
    rosSelectionTool,
    rosActiveHandle,
    rosSelectionStart,
    rosSelectionRect,
    rosSelectionLine,
    rosSelectionCircle,
    isRosSelecting,
    detectCornerHandle,
    detectLineHandle,
    detectCircleHandle
  ]);

  const handleRosMouseUp = useCallback(() => {
    if (!isRosMap) return;

    if (rosActiveHandle) {
      setRosActiveHandle(null);
    }

    if (!isRosSelecting) {
      setRosSelectionStart(null);
      return;
    }

    setIsRosSelecting(false);
    setRosSelectionStart(null);

    if (rosSelectionTool === 'rectangle') {
      setRosSelectionRect(prev => {
        if (!prev) return null;
        const bounds = getSelectionBounds(prev);
        if (bounds.width < 1 || bounds.height < 1) {
          return null;
        }
        return prev;
      });
      return;
    }

    if (rosSelectionTool === 'line') {
      setRosSelectionLine(prev => {
        if (!prev) return null;
        const length = Math.hypot(prev.end.x - prev.start.x, prev.end.y - prev.start.y);
        return length < 1 ? null : prev;
      });
      return;
    }

    if (rosSelectionTool === 'circle') {
      setRosSelectionCircle(prev => {
        if (!prev) return null;
        return prev.radius < 1 ? null : prev;
      });
    }
  }, [
    getSelectionBounds,
    isRosMap,
    isRosSelecting,
    rosActiveHandle,
    rosSelectionTool
  ]);

  const clearRosSelection = useCallback(() => {
    setRosSelectionRect(null);
    setRosSelectionStart(null);
    setRosActiveHandle(null);
    setRosSelectionLine(null);
    setRosSelectionCircle(null);
  }, []);

  useEffect(() => {
    clearRosSelection();
  }, [rosSelectionTool, clearRosSelection]);

  // Load waypoints and paths when map loads
  useEffect(() => {
    if (initialMapData) {
      setWaypoints(initialMapData.waypoints || []);
      setPaths(initialMapData.paths || []);
    }
  }, [initialMapData]);

  const applyRosRegion = useCallback(async (action: 'smooth' | 'mask') => {
    if (!isRosMap || !initialMapData?.id) {
      return;
    }

    if (!hasRosSelection) {
      setRosError('Vui lòng chọn một vùng có kích thước lớn hơn.');
      return;
    }

    let polygon: Point2D[] | null = null;
    let bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } | null = null;
    const payload: Record<string, unknown> = {};

    if (rosSelectionTool === 'rectangle' && rosSelectionRect) {
      polygon = [
        rosSelectionRect.topLeft,
        rosSelectionRect.topRight,
        rosSelectionRect.bottomRight,
        rosSelectionRect.bottomLeft
      ];
      bounds = getSelectionBounds(rosSelectionRect);
    } else if (rosSelectionTool === 'line' && rosSelectionLine) {
      polygon = getLinePolygon(rosSelectionLine, lineThickness);
      bounds = getPolygonBounds(polygon);
      payload.shape = 'line';
      payload.thickness = lineThickness;
      payload.line = {
        start: rosSelectionLine.start,
        end: rosSelectionLine.end
      };
    } else if (rosSelectionTool === 'circle' && rosSelectionCircle) {
      polygon = getCirclePolygon(rosSelectionCircle);
      bounds = getPolygonBounds(polygon);
      payload.shape = 'circle';
      payload.circle = {
        center: rosSelectionCircle.center,
        radius: rosSelectionCircle.radius
      };
    }

    if (!polygon || !bounds || bounds.width < 1 || bounds.height < 1) {
      setRosError('Vui lòng chọn một vùng có kích thước lớn hơn.');
      return;
    }

    setRosProcessing(true);
    setRosError(null);

    try {
      payload.x = Math.round(bounds.minX);
      payload.y = Math.round(bounds.minY);
      payload.width = Math.max(1, Math.round(bounds.width));
      payload.height = Math.max(1, Math.round(bounds.height));
      payload.points = polygon.map(point => ({
        x: Math.round(point.x),
        y: Math.round(point.y)
      }));

      let endpoint = 'smooth';
      if (action === 'smooth') {
        payload.kernel_size = rosKernelSize % 2 === 0 ? rosKernelSize + 1 : rosKernelSize;
        payload.quantize = rosQuantize;
      } else {
        endpoint = 'mask';
        payload.value = maskValue;
      }

      const response = await fetch(getApiUrl(`/api/maps/${initialMapData.id}/${endpoint}`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Region update failed');
      }

      const data = await response.json();

      if (data.image) {
        const rawPixels = decodeBase64ToUint8Array(data.image.data);
        setRosRawPixels(rawPixels);
        setRosImageData(createImageDataFromGrayscale(rawPixels, data.image.width, data.image.height));
        setMapWidth(data.image.width);
        setMapHeight(data.image.height);
        clearRosSelection();
      }

      if (data.map) {
        onMapMetadataUpdate?.(data.map);
      }
    } catch (error) {
      const message = action === 'smooth'
        ? 'Không thể làm mịn khu vực đã chọn: '
        : 'Không thể phủ đen khu vực đã chọn: ';
      setRosError(message + (error as Error).message);
    } finally {
      setRosProcessing(false);
    }
  }, [
    clearRosSelection,
    createImageDataFromGrayscale,
    decodeBase64ToUint8Array,
    getSelectionBounds,
    getPolygonBounds,
    getLinePolygon,
    getCirclePolygon,
    initialMapData?.id,
    isRosMap,
    maskValue,
    onMapMetadataUpdate,
    rosKernelSize,
    rosQuantize,
    hasRosSelection,
    rosSelectionTool,
    rosSelectionRect,
    rosSelectionLine,
    rosSelectionCircle
  ]);

  // Handle mouse events
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isRosMap) {
      handleRosMouseDown(e);
      return;
    }
    if (viewMode) return; // Disable editing in view mode
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Find clicked element and determine interaction type
    let clickedElement: MapElement | undefined;
    let clickedHandle: string | null = null;
    let isBodyClick = false;

    // Check all elements for clicks
    for (const element of elements) {
      // First check if clicking on handles (only for selected elements)
      if (element.selected) {
        clickedHandle = getClickedHandle(element, x, y);
        if (clickedHandle) {
          clickedElement = element;
          break;
        }
      }

      // Then check if clicking on element body
      if (isClickOnElementBody(element, x, y)) {
        clickedElement = element;
        isBodyClick = true;
        break;
      }
    }

    if (clickedElement) {
      // Select the element
      setElements(prev => prev.map(el => ({
        ...el,
        selected: el.id === clickedElement.id
      })));
      setSelectedElement(clickedElement.id);
      setDragStart({ x, y });

      if (clickedHandle) {
        // Handle-based resizing/editing
        setIsResizing(true);
        setActiveHandle(clickedHandle);
      } else if (isBodyClick) {
        // Body-based moving
        setIsDragging(true);
        setDragOffset({
          x: x - clickedElement.x,
          y: y - clickedElement.y
        });
      }
    } else {
      // Start drawing new element
      setIsDrawing(true);
      setDragStart({ x, y });

      // Deselect all elements
      setElements(prev => prev.map(el => ({ ...el, selected: false })));
      setSelectedElement(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isRosMap) {
      handleRosMouseMove(e);
      return;
    }
    if (viewMode) return; // Disable editing in view mode
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isResizing && selectedElement && activeHandle && dragStart) {
      // Handle-based resizing/editing
      setElements(prev => prev.map(el => {
        if (el.id === selectedElement) {
          const updatedElement = { ...el };

          switch (el.type) {
            case 'line':
              if (el.x2 !== undefined && el.y2 !== undefined) {
                if (activeHandle === 'start') {
                  updatedElement.x = x;
                  updatedElement.y = y;
                } else if (activeHandle === 'end') {
                  updatedElement.x2 = x;
                  updatedElement.y2 = y;
                }
              }
              break;

            case 'rectangle':
              if (el.width && el.height) {
                const originalRight = el.x + el.width;
                const originalBottom = el.y + el.height;

                switch (activeHandle) {
                  case 'top-left':
                    updatedElement.x = x;
                    updatedElement.y = y;
                    updatedElement.width = originalRight - x;
                    updatedElement.height = originalBottom - y;
                    break;
                  case 'top-right':
                    updatedElement.y = y;
                    updatedElement.width = x - el.x;
                    updatedElement.height = originalBottom - y;
                    break;
                  case 'bottom-left':
                    updatedElement.x = x;
                    updatedElement.width = originalRight - x;
                    updatedElement.height = y - el.y;
                    break;
                  case 'bottom-right':
                    updatedElement.width = x - el.x;
                    updatedElement.height = y - el.y;
                    break;
                }

                // Ensure positive dimensions
                if (updatedElement.width < 0) {
                  updatedElement.x += updatedElement.width;
                  updatedElement.width = Math.abs(updatedElement.width);
                }
                if (updatedElement.height < 0) {
                  updatedElement.y += updatedElement.height;
                  updatedElement.height = Math.abs(updatedElement.height);
                }
              }
              break;

            case 'circle':
              if (el.radius) {
                const distance = Math.sqrt(Math.pow(x - el.x, 2) + Math.pow(y - el.y, 2));
                updatedElement.radius = Math.max(5, distance); // Minimum radius of 5
              }
              break;
          }

          return updatedElement;
        }
        return el;
      }));
    } else if (isDragging && selectedElement && dragOffset) {
      // Body-based moving
      const newX = x - dragOffset.x;
      const newY = y - dragOffset.y;

      setElements(prev => prev.map(el => {
        if (el.id === selectedElement) {
          const updatedElement = { ...el };

          // Update position based on element type
          switch (el.type) {
            case 'line':
              if (el.x2 !== undefined && el.y2 !== undefined) {
                const deltaX = newX - el.x;
                const deltaY = newY - el.y;
                updatedElement.x = newX;
                updatedElement.y = newY;
                updatedElement.x2 = el.x2 + deltaX;
                updatedElement.y2 = el.y2 + deltaY;
              }
              break;
            case 'rectangle':
            case 'circle':
              updatedElement.x = newX;
              updatedElement.y = newY;
              break;
          }

          return updatedElement;
        }
        return el;
      }));
    } else if (isDrawing && dragStart) {
      // Preview drawing could be implemented here
      // Currently not implemented - just placeholder for future enhancement
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isRosMap) {
      handleRosMouseUp();
      return;
    }
    if (viewMode) return; // Disable editing in view mode
    if (isDragging) {
      // End dragging
      setIsDragging(false);
      setDragStart(null);
      setDragOffset(null);

      // Add current state to history
      addToHistory([...elements]);
      return;
    }

    if (isResizing) {
      // End resizing
      setIsResizing(false);
      setActiveHandle(null);
      setDragStart(null);

      // Add current state to history
      addToHistory([...elements]);
      return;
    }

    if (!isDrawing || !dragStart) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Create new element
    const newElement: MapElement = {
      id: Date.now().toString(),
      type: selectedTool,
      x: Math.min(dragStart.x, x),
      y: Math.min(dragStart.y, y),
      color: colors[selectedTool],
      selected: false
    };

    switch (selectedTool) {
      case 'line':
        newElement.x = dragStart.x;
        newElement.y = dragStart.y;
        newElement.x2 = x;
        newElement.y2 = y;
        break;
      case 'rectangle':
        newElement.width = Math.abs(x - dragStart.x);
        newElement.height = Math.abs(y - dragStart.y);
        break;
      case 'circle':
        newElement.radius = Math.sqrt(
          Math.pow(x - dragStart.x, 2) + Math.pow(y - dragStart.y, 2)
        );
        newElement.x = dragStart.x;
        newElement.y = dragStart.y;
        break;
    }

    const newElements = [...elements, newElement];
    setElements(newElements);
    addToHistory(newElements);

    setIsDrawing(false);
    setDragStart(null);
  };

  // Tool functions
  const clearMap = () => {
    setElements([]);
    addToHistory([]);
    setSelectedElement(null);
  };

  const deleteSelected = () => {
    if (selectedElement) {
      const newElements = elements.filter(el => el.id !== selectedElement);
      setElements(newElements);
      addToHistory(newElements);
      setSelectedElement(null);
    }
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setElements(history[historyIndex - 1]);
    }
  };

  // Waypoint and Path functions
  const handleWaypointCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if ROS map and pixel is Free (254)
    if (isRosMap && rosRawPixels) {
      const pixelIndex = Math.floor(y) * mapWidth + Math.floor(x);
      const pixelValue = rosRawPixels[pixelIndex];

      if (pixelValue !== 254) {
        alert('Chỉ có thể thêm waypoint vào vùng trắng (Free space - giá trị 254)!');
        return;
      }
    }

    // Open dialog with pre-filled coordinates
    setNewWaypointData({
      x: Math.round(x),
      y: Math.round(y),
      z: 0,
      orientation: 0,
      name: `Waypoint ${waypoints.length + 1}`,
      description: ''
    });
    setWaypointDialogOpen(true);
  };

  const handleSaveWaypoint = () => {
    if (!newWaypointData) return;

    const newWaypoint: Waypoint = {
      id: Date.now().toString(),
      ...newWaypointData
    };

    setWaypoints([...waypoints, newWaypoint]);
    setWaypointDialogOpen(false);
    setNewWaypointData(null);
  };

  const handleDeleteWaypoint = (id: string) => {
    setWaypoints(waypoints.filter(wp => wp.id !== id));
    // Also delete paths that use this waypoint
    setPaths(paths.filter(p => p.startWaypointId !== id && p.endWaypointId !== id));
  };

  const handleSavePath = () => {
    if (!newPathData) return;

    const newPath: Path = {
      id: Date.now().toString(),
      ...newPathData
    };

    setPaths([...paths, newPath]);
    setPathDialogOpen(false);
    setNewPathData(null);
  };

  const handleDeletePath = (id: string) => {
    setPaths(paths.filter(p => p.id !== id));
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setElements(history[historyIndex + 1]);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom>
        🎨 Map Editor
      </Typography>
      
      <Grid container spacing={2}>
        {/* Toolbar */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              {!isRosMap ? (
                <>
                  <FormControl size="small" sx={{ minWidth: 120 }} disabled={viewMode}>
                    <InputLabel>Drawing Tool</InputLabel>
                    <Select
                      value={selectedTool}
                      onChange={(e) => setSelectedTool(e.target.value as ShapeType)}
                      label="Drawing Tool"
                      disabled={viewMode}
                    >
                      <MenuItem value="line">📏 Line/Wall</MenuItem>
                      <MenuItem value="rectangle">⬜ Rectangle</MenuItem>
                      <MenuItem value="circle">⭕ Circle</MenuItem>
                    </Select>
                  </FormControl>

                  <Button
                    variant="outlined"
                    startIcon={<UndoIcon />}
                    onClick={undo}
                    disabled={historyIndex <= 0 || viewMode}
                    size="small"
                  >
                    Undo
                  </Button>

                  <Button
                    variant="outlined"
                    startIcon={<RedoIcon />}
                    onClick={redo}
                    disabled={historyIndex >= history.length - 1 || viewMode}
                    size="small"
                  >
                    Redo
                  </Button>

                  <Button
                    variant="outlined"
                    startIcon={<DeleteIcon />}
                    onClick={deleteSelected}
                    disabled={!selectedElement || viewMode}
                    color="error"
                    size="small"
                  >
                    Delete
                  </Button>

                  <Button
                    variant="outlined"
                    startIcon={<ClearIcon />}
                    onClick={clearMap}
                    color="warning"
                    size="small"
                    disabled={viewMode}
                  >
                    Clear All
                  </Button>
                </>
              ) : (
                <>
                  <Chip label="ROS Map" color="primary" size="small" />
                  <Typography variant="body2" color="text.secondary">
                    Chế độ chỉnh sửa map từ ROS: chọn vùng trên canvas và xử lý ở bảng công cụ.
                  </Typography>
                </>
              )}
            </Box>

            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mt: 2 }}>
              <TextField
                label="Map Name"
                value={mapName}
                onChange={(e) => setMapName(e.target.value)}
                size="small"
                sx={{ minWidth: 200 }}
                disabled={viewMode}
                placeholder="Enter map name..."
              />

              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={() => {
                  if (mapName.trim()) {
                    const mapId = currentMapId || Date.now().toString();

                    const savedMap: SavedMap = {
                      id: mapId,
                      name: mapName.trim(),
                      elements: [...elements],
                      width: mapWidth,
                      height: mapHeight,
                      resolution: mapResolution,
                      created: currentMapId ? savedMaps.find(m => m.id === currentMapId)?.created || new Date().toISOString() : new Date().toISOString(),
                      modified: new Date().toISOString(),
                      waypoints: waypoints.length > 0 ? waypoints : undefined,
                      paths: paths.length > 0 ? paths : undefined,
                      ros_files: initialMapData?.ros_files
                    };

                    onSaveMap?.(savedMap);

                    setCurrentMapId(savedMap.id);
                    if (!currentMapId) {
                      setMapName('');
                    }
                  }
                }}
                size="small"
                disabled={!mapName.trim() || viewMode}
              >
                Save Map
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Tab Navigation */}
        <Grid item xs={12}>
          <Paper sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs
              value={activeTab}
              onChange={(_, newValue) => setActiveTab(newValue)}
              variant="fullWidth"
            >
              <Tab
                icon={<EditIcon />}
                label="Sửa map"
                value="edit"
              />
              <Tab
                icon={<WaypointIcon />}
                label="Tạo waypoint"
                value="waypoint"
              />
              <Tab
                icon={<PathIcon />}
                label="Add path"
                value="path"
              />
            </Tabs>
          </Paper>
        </Grid>

        {/* Content based on active tab */}
        {activeTab === 'edit' && (
          <>
            {/* Canvas Area */}
            <Grid item xs={12} md={9}>
              <Paper sx={{ p: 1 }}>
                <canvas
                  ref={canvasRef}
                  width={mapWidth}
                  height={mapHeight}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  style={{
                    border: '1px solid #ccc',
                    cursor: viewMode ? 'default' :
                           isDragging ? 'grabbing' :
                           isResizing ? 'nw-resize' :
                           isDrawing ? 'crosshair' :
                           selectedElement ? 'grab' : 'default',
                    display: 'block'
                  }}
                />
              </Paper>
            </Grid>

            {/* Properties Panel */}
            <Grid item xs={12} md={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              {isRosMap ? '🧰 ROS Map Tools' : '🔧 Properties'}
            </Typography>

            {isRosMap ? (
              <>
                {rosError && (
                  <Alert severity="error" onClose={() => setRosError(null)} sx={{ mb: 2 }}>
                    {rosError}
                  </Alert>
                )}

                {rosLoading ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={20} />
                    <Typography variant="body2">Đang tải dữ liệu map từ ROS...</Typography>
                  </Box>
                ) : (
                  <>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Công cụ chọn vùng
                      </Typography>
                      <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel>Công cụ</InputLabel>
                        <Select
                          value={rosSelectionTool}
                          label="Công cụ"
                          onChange={(e) => setRosSelectionTool(e.target.value as RosTool)}
                        >
                          <MenuItem value="rectangle">Hình chữ nhật</MenuItem>
                          <MenuItem value="line">Đường thẳng</MenuItem>
                          <MenuItem value="circle">Hình tròn</MenuItem>
                        </Select>
                      </FormControl>
                      {rosSelectionTool === 'line' && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          Độ dày đường thẳng: {lineThickness}px
                        </Typography>
                      )}
                    </Box>

                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Thông tin map
                      </Typography>
                      <Typography variant="caption" component="div">
                        Kích thước: {mapWidth} x {mapHeight} px
                      </Typography>
                      {initialMapData?.ros_files?.pgm_file && (
                        <Typography variant="caption" component="div">
                          PGM: {initialMapData.ros_files.pgm_file}
                        </Typography>
                      )}
                      {initialMapData?.ros_files?.processed_at && (
                        <Typography variant="caption" component="div">
                          Lần xử lý gần nhất: {new Date(initialMapData.ros_files.processed_at).toLocaleString()}
                        </Typography>
                      )}
                    </Box>

                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Vùng làm mịn
                      </Typography>
                      {rosSelectionBounds ? (
                        <>
                          <Typography variant="body2">
                            (x: {Math.round(rosSelectionBounds.minX)}, y: {Math.round(rosSelectionBounds.minY)}) •
                            w: {Math.round(rosSelectionBounds.width)} px • h: {Math.round(rosSelectionBounds.height)} px
                          </Typography>
                          {rosSelectionTool === 'line' && rosSelectionLine && (
                            <Typography variant="body2" color="text.secondary">
                              Line: ({Math.round(rosSelectionLine.start.x)}, {Math.round(rosSelectionLine.start.y)}) → ({Math.round(rosSelectionLine.end.x)}, {Math.round(rosSelectionLine.end.y)})
                            </Typography>
                          )}
                          {rosSelectionTool === 'circle' && rosSelectionCircle && (
                            <Typography variant="body2" color="text.secondary">
                              Tâm: ({Math.round(rosSelectionCircle.center.x)}, {Math.round(rosSelectionCircle.center.y)}) • R = {Math.round(rosSelectionCircle.radius)} px
                            </Typography>
                          )}
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Kéo chuột trên canvas để chọn vùng cần làm mịn.
                        </Typography>
                      )}
                    </Box>

                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Tham số xử lý
                      </Typography>
                      <Typography variant="caption" component="div">Kernel size: {rosKernelSize}px</Typography>
                      <Slider
                        value={rosKernelSize}
                        onChange={(_, value) => setRosKernelSize(value as number)}
                        min={3}
                        max={17}
                        step={2}
                        size="small"
                        disabled={rosProcessing || viewMode}
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={rosQuantize}
                            onChange={(_, checked) => setRosQuantize(checked)}
                            size="small"
                            disabled={rosProcessing || viewMode}
                          />
                        }
                        label="Giữ mức giá trị 0 / 205 / 254"
                      />

                      <FormControl size="small" fullWidth sx={{ mt: 2 }} disabled={rosProcessing || viewMode}>
                        <InputLabel>Giá trị phủ màu</InputLabel>
                        <Select
                          label="Giá trị phủ màu"
                          value={maskValue}
                          onChange={(e) => setMaskValue(Number(e.target.value))}
                        >
                          <MenuItem value={0}>0 - Occupied (đen)</MenuItem>
                          <MenuItem value={205}>205 - Unknown (xám)</MenuItem>
                          <MenuItem value={254}>254 - Free (trắng)</MenuItem>
                        </Select>
                      </FormControl>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1, flexDirection: "column" }}>
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={() => applyRosRegion('smooth')}
                        disabled={rosProcessing || rosLoading || !hasRosSelection || viewMode}
                        startIcon={rosProcessing ? <CircularProgress size={16} color="inherit" /> : undefined}
                      >
                        Process
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={clearRosSelection}
                        disabled={!hasRosSelection || rosProcessing || viewMode}
                      >
                        Xóa vùng chọn
                      </Button>
                      <Button
                        variant="contained"
                        color="error"
                        onClick={() => applyRosRegion('mask')}
                        disabled={rosProcessing || rosLoading || !hasRosSelection || viewMode}
                        startIcon={rosProcessing ? <CircularProgress size={16} color="inherit" /> : undefined}
                      >
                        Phủ màu vùng chọn
                      </Button>
                    </Box>

                    {rosProcessing && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        Đang xử lý vùng đã chọn...
                      </Typography>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                {/* Map Settings */}
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Map Settings:
                  </Typography>

                  <TextField
                    label="Width (px)"
                    type="number"
                    value={mapWidth}
                    onChange={(e) => setMapWidth(Number(e.target.value))}
                    size="small"
                    fullWidth
                    sx={{ mb: 1 }}
                    disabled={viewMode}
                  />

                  <TextField
                    label="Height (px)"
                    type="number"
                    value={mapHeight}
                    onChange={(e) => setMapHeight(Number(e.target.value))}
                    size="small"
                    fullWidth
                    sx={{ mb: 1 }}
                    disabled={viewMode}
                  />

                  <TextField
                    label="Resolution (m/px)"
                    type="number"
                    inputProps={{ step: 0.01 }}
                    value={mapResolution}
                    onChange={(e) => setMapResolution(Number(e.target.value))}
                    size="small"
                    fullWidth
                    sx={{ mb: 1 }}
                    disabled={viewMode}
                  />
                </Box>

                {/* Grid Settings */}
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Grid Settings:
                  </Typography>

                  <Typography variant="caption">Grid Size: {gridSize}px</Typography>
                  <Slider
                    value={gridSize}
                    onChange={(_, value) => setGridSize(value as number)}
                    min={10}
                    max={50}
                    step={5}
                    size="small"
                  />

                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setShowGrid(!showGrid)}
                    fullWidth
                  >
                    {showGrid ? 'Hide Grid' : 'Show Grid'}
                  </Button>
                </Box>

                {/* Element Info */}
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Elements: {elements.length}
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip 
                      label={`Lines: ${elements.filter(e => e.type === 'line').length}`}
                      size="small"
                      color="primary"
                    />
                    <Chip 
                      label={`Rectangles: ${elements.filter(e => e.type === 'rectangle').length}`}
                      size="small"
                      color="secondary"
                    />
                    <Chip 
                      label={`Circles: ${elements.filter(e => e.type === 'circle').length}`}
                      size="small"
                      color="success"
                    />
                  </Box>
                </Box>

                {/* Instructions */}
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Instructions:
                  </Typography>
                  <Typography variant="caption" component="div">
                    1. Select a drawing tool<br/>
                    2. Click and drag to draw<br/>
                    3. Click elements to select<br/>
                    4. Drag handles to resize/edit<br/>
                    5. Drag borders to move<br/>
                    6. Use toolbar to delete/clear<br/>
                    7. Save your map when done
                  </Typography>
                </Box>
              </>
            )}
          </Paper>
        </Grid>
          </>
        )}

        {/* Waypoint Tab Content */}
        {activeTab === 'waypoint' && (
          <>
            {/* Canvas for waypoint display */}
            <Grid item xs={12} md={9}>
              <Paper sx={{ p: 1 }}>
                <canvas
                  ref={canvasRef}
                  width={mapWidth}
                  height={mapHeight}
                  onClick={handleWaypointCanvasClick}
                  style={{
                    border: '1px solid #ccc',
                    cursor: 'crosshair',
                    display: 'block'
                  }}
                />
              </Paper>
            </Grid>

            {/* Waypoint Panel */}
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h6" gutterBottom>
                  📍 Waypoints
                </Typography>

                <Box sx={{ flex: 1, overflowY: 'auto', mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Danh sách Waypoints ({waypoints.length})
                  </Typography>
                  <List dense>
                    {waypoints.map((wp) => (
                      <ListItem
                        key={wp.id}
                        selected={selectedWaypoint === wp.id}
                        sx={{
                          border: 1,
                          borderColor: 'divider',
                          borderRadius: 1,
                          mb: 1,
                          bgcolor: selectedWaypoint === wp.id ? 'action.selected' : 'background.paper'
                        }}
                      >
                        <ListItemText
                          primary={wp.name}
                          secondary={`x: ${wp.x.toFixed(1)}, y: ${wp.y.toFixed(1)}`}
                        />
                        <Box>
                          <IconButton
                            size="small"
                            edge="end"
                            onClick={() => setSelectedWaypoint(wp.id)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            edge="end"
                            onClick={() => handleDeleteWaypoint(wp.id)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </ListItem>
                    ))}
                  </List>
                </Box>

                <Typography variant="caption" color="text.secondary">
                  Click vào vùng trắng (Free) trên map để thêm waypoint
                </Typography>
              </Paper>
            </Grid>
          </>
        )}

        {/* Path Tab Content */}
        {activeTab === 'path' && (
          <>
            {/* Canvas for path display */}
            <Grid item xs={12} md={9}>
              <Paper sx={{ p: 1 }}>
                <canvas
                  ref={canvasRef}
                  width={mapWidth}
                  height={mapHeight}
                  style={{
                    border: '1px solid #ccc',
                    cursor: 'default',
                    display: 'block'
                  }}
                />
              </Paper>
            </Grid>

            {/* Path Panel */}
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h6" gutterBottom>
                  🛤️ Paths
                </Typography>

                <Button
                  variant="contained"
                  startIcon={<PathIcon />}
                  size="small"
                  fullWidth
                  sx={{ mb: 2 }}
                  disabled={waypoints.length < 2}
                  onClick={() => {
                    setNewPathData({
                      type: 'direct',
                      startWaypointId: waypoints[0]?.id || '',
                      endWaypointId: waypoints[1]?.id || '',
                      name: `Path ${paths.length + 1}`
                    });
                    setPathDialogOpen(true);
                  }}
                >
                  Add Path
                </Button>

                <Box sx={{ flex: 1, overflowY: 'auto', mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Danh sách Paths ({paths.length})
                  </Typography>
                  <List dense>
                    {paths.map((path) => (
                      <ListItem
                        key={path.id}
                        selected={selectedPath === path.id}
                        sx={{
                          border: 1,
                          borderColor: 'divider',
                          borderRadius: 1,
                          mb: 1,
                          bgcolor: selectedPath === path.id ? 'action.selected' : 'background.paper'
                        }}
                      >
                        <ListItemText
                          primary={path.name || `Path ${path.id.slice(0, 8)}`}
                          secondary={`Type: ${path.type}`}
                        />
                        <Box>
                          <IconButton
                            size="small"
                            edge="end"
                            onClick={() => setSelectedPath(path.id)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            edge="end"
                            onClick={() => handleDeletePath(path.id)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </ListItem>
                    ))}
                  </List>
                </Box>

                <Typography variant="caption" color="text.secondary">
                  {waypoints.length < 2 ? 'Cần ít nhất 2 waypoints để tạo path' : 'Nhấn Add Path để tạo đường đi mới'}
                </Typography>
              </Paper>
            </Grid>
          </>
        )}
      </Grid>

      {/* Waypoint Dialog */}
      <Dialog open={waypointDialogOpen} onClose={() => setWaypointDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Thêm Waypoint</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              label="Tên waypoint"
              value={newWaypointData?.name || ''}
              onChange={(e) => setNewWaypointData(prev => prev ? { ...prev, name: e.target.value } : null)}
              fullWidth
              size="small"
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="X"
                type="number"
                value={newWaypointData?.x || 0}
                onChange={(e) => setNewWaypointData(prev => prev ? { ...prev, x: Number(e.target.value) } : null)}
                size="small"
                disabled
              />
              <TextField
                label="Y"
                type="number"
                value={newWaypointData?.y || 0}
                onChange={(e) => setNewWaypointData(prev => prev ? { ...prev, y: Number(e.target.value) } : null)}
                size="small"
                disabled
              />
              <TextField
                label="Z"
                type="number"
                value={newWaypointData?.z || 0}
                onChange={(e) => setNewWaypointData(prev => prev ? { ...prev, z: Number(e.target.value) } : null)}
                size="small"
              />
            </Box>
            <TextField
              label="Orientation (radians)"
              type="number"
              inputProps={{ step: 0.1 }}
              value={newWaypointData?.orientation || 0}
              onChange={(e) => setNewWaypointData(prev => prev ? { ...prev, orientation: Number(e.target.value) } : null)}
              size="small"
              fullWidth
            />
            <TextField
              label="Mô tả"
              value={newWaypointData?.description || ''}
              onChange={(e) => setNewWaypointData(prev => prev ? { ...prev, description: e.target.value } : null)}
              multiline
              rows={3}
              fullWidth
              size="small"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWaypointDialogOpen(false)}>Hủy</Button>
          <Button onClick={handleSaveWaypoint} variant="contained">Lưu</Button>
        </DialogActions>
      </Dialog>

      {/* Path Dialog */}
      <Dialog open={pathDialogOpen} onClose={() => setPathDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Thêm Path</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              label="Tên path"
              value={newPathData?.name || ''}
              onChange={(e) => setNewPathData(prev => prev ? { ...prev, name: e.target.value } : null)}
              fullWidth
              size="small"
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Loại path</InputLabel>
              <Select
                value={newPathData?.type || 'direct'}
                label="Loại path"
                onChange={(e) => setNewPathData(prev => prev ? { ...prev, type: e.target.value as 'direct' | 'winding' } : null)}
              >
                <MenuItem value="direct">Direct</MenuItem>
                <MenuItem value="winding">Winding</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Điểm bắt đầu</InputLabel>
              <Select
                value={newPathData?.startWaypointId || ''}
                label="Điểm bắt đầu"
                onChange={(e) => setNewPathData(prev => prev ? { ...prev, startWaypointId: e.target.value } : null)}
              >
                {waypoints.map(wp => (
                  <MenuItem key={wp.id} value={wp.id}>{wp.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Điểm kết thúc</InputLabel>
              <Select
                value={newPathData?.endWaypointId || ''}
                label="Điểm kết thúc"
                onChange={(e) => setNewPathData(prev => prev ? { ...prev, endWaypointId: e.target.value } : null)}
              >
                {waypoints.map(wp => (
                  <MenuItem key={wp.id} value={wp.id}>{wp.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {newPathData?.type === 'winding' && (
              <Typography variant="caption" color="text.secondary">
                Path Winding sẽ xác định hướng của điểm cuối ngay từ đầu để đi thẳng tới điểm cuối dễ dàng hơn.
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPathDialogOpen(false)}>Hủy</Button>
          <Button onClick={handleSavePath} variant="contained">Lưu</Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};


export default MapEditor;
