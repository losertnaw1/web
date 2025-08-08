import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Chip,
  Grid,
  Slider,
  Alert
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Save as SaveIcon,
  FolderOpen as LoadIcon,
  Clear as ClearIcon,
  Undo as UndoIcon,
  Redo as RedoIcon
} from '@mui/icons-material';

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

interface SavedMap {
  id: string;
  name: string;
  elements: MapElement[];
  width: number;
  height: number;
  resolution: number;
  created: string;
  modified: string;
}

interface MapEditorProps {
  onSaveMap?: (map: SavedMap) => void;
  onLoadMap?: (mapId: string) => void;
  savedMaps?: SavedMap[];
}

const MapEditor: React.FC<MapEditorProps> = ({
  onSaveMap,
  onLoadMap,
  savedMaps = []
}) => {
  // Force component refresh after fixing imports
  // Canvas and drawing state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elements, setElements] = useState<MapElement[]>([]);
  const [selectedTool, setSelectedTool] = useState<ShapeType>('line');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  
  // Map properties
  const [mapWidth, setMapWidth] = useState(800);
  const [mapHeight, setMapHeight] = useState(600);
  const [mapResolution, setMapResolution] = useState(0.05); // meters per pixel
  const [gridSize, setGridSize] = useState(20);
  const [showGrid, setShowGrid] = useState(true);
  
  // UI state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [mapName, setMapName] = useState('');
  const [currentMapId, setCurrentMapId] = useState<string | null>(null);
  
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
  }, [elements, mapWidth, mapHeight, gridSize, showGrid, colors, drawHandles]);

  // Update canvas when elements change
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Handle mouse events
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
              {/* Tool Selection */}
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Drawing Tool</InputLabel>
                <Select
                  value={selectedTool}
                  onChange={(e) => setSelectedTool(e.target.value as ShapeType)}
                  label="Drawing Tool"
                >
                  <MenuItem value="line">📏 Line/Wall</MenuItem>
                  <MenuItem value="rectangle">⬜ Rectangle</MenuItem>
                  <MenuItem value="circle">⭕ Circle</MenuItem>
                </Select>
              </FormControl>

              {/* Action Buttons */}
              <Button
                variant="outlined"
                startIcon={<UndoIcon />}
                onClick={undo}
                disabled={historyIndex <= 0}
                size="small"
              >
                Undo
              </Button>
              
              <Button
                variant="outlined"
                startIcon={<RedoIcon />}
                onClick={redo}
                disabled={historyIndex >= history.length - 1}
                size="small"
              >
                Redo
              </Button>

              <Button
                variant="outlined"
                startIcon={<DeleteIcon />}
                onClick={deleteSelected}
                disabled={!selectedElement}
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
              >
                Clear All
              </Button>

              {/* Map Actions */}
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={() => setSaveDialogOpen(true)}
                size="small"
              >
                Save Map
              </Button>

              <Button
                variant="outlined"
                startIcon={<LoadIcon />}
                onClick={() => setLoadDialogOpen(true)}
                size="small"
              >
                Load Map
              </Button>
            </Box>
          </Paper>
        </Grid>

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
                cursor: isDragging ? 'grabbing' :
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
              🔧 Properties
            </Typography>
            
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
              />
              
              <TextField
                label="Height (px)"
                type="number"
                value={mapHeight}
                onChange={(e) => setMapHeight(Number(e.target.value))}
                size="small"
                fullWidth
                sx={{ mb: 1 }}
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
          </Paper>
        </Grid>
      </Grid>

      {/* Save Dialog */}
      <Dialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        disableRestoreFocus
        keepMounted={false}
      >
        <DialogTitle>💾 Save Map</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus={saveDialogOpen}
            margin="dense"
            label="Map Name"
            fullWidth
            variant="outlined"
            value={mapName}
            onChange={(e) => setMapName(e.target.value)}
            tabIndex={saveDialogOpen ? 0 : -1}
          />
          <Alert severity="info" sx={{ mt: 2 }}>
            This map will be saved locally and sent to the backend for ROS2 conversion.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setSaveDialogOpen(false)}
            tabIndex={saveDialogOpen ? 0 : -1}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (mapName.trim()) {
                const savedMap: SavedMap = {
                  id: currentMapId || Date.now().toString(),
                  name: mapName,
                  elements: [...elements],
                  width: mapWidth,
                  height: mapHeight,
                  resolution: mapResolution,
                  created: currentMapId ? savedMaps.find(m => m.id === currentMapId)?.created || new Date().toISOString() : new Date().toISOString(),
                  modified: new Date().toISOString()
                };

                onSaveMap?.(savedMap);
                setCurrentMapId(savedMap.id);
                setSaveDialogOpen(false);
                setMapName('');
              }
            }}
            variant="contained"
            disabled={!mapName.trim()}
            tabIndex={saveDialogOpen ? 0 : -1}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Load Dialog */}
      <Dialog
        open={loadDialogOpen}
        onClose={() => setLoadDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        disableRestoreFocus
        keepMounted={false}
      >
        <DialogTitle>📂 Load Map</DialogTitle>
        <DialogContent>
          <List>
            {savedMaps.map((map) => (
              <ListItem key={map.id} disablePadding>
                <ListItemButton
                  onClick={() => {
                    // Load map data
                    setElements(map.elements);
                    setMapWidth(map.width);
                    setMapHeight(map.height);
                    setMapResolution(map.resolution);
                    setCurrentMapId(map.id);
                    setMapName(map.name);

                    // Reset history
                    setHistory([map.elements]);
                    setHistoryIndex(0);

                    onLoadMap?.(map.id);
                    setLoadDialogOpen(false);
                  }}
                  tabIndex={loadDialogOpen ? 0 : -1}
                >
                  <ListItemText
                    primary={map.name}
                    secondary={`${map.elements.length} elements • Modified: ${new Date(map.modified).toLocaleDateString()}`}
                  />
                </ListItemButton>
              </ListItem>
            ))}
            {savedMaps.length === 0 && (
              <ListItem>
                <ListItemText
                  primary="No saved maps"
                  secondary="Create and save a map to see it here"
                />
              </ListItem>
            )}
          </List>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setLoadDialogOpen(false)}
            tabIndex={loadDialogOpen ? 0 : -1}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MapEditor;
