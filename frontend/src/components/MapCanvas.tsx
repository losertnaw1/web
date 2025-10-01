import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Box } from '@mui/material';

// Map element types
export type ShapeType = 'line' | 'rectangle' | 'circle';

export interface MapElement {
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

interface MapCanvasProps {
  elements: MapElement[];
  onElementsChange: (elements: MapElement[]) => void;
  selectedTool: ShapeType;
  mapWidth: number;
  mapHeight: number;
  showGrid?: boolean;
  gridSize?: number;
  disabled?: boolean;
}

const MapCanvas: React.FC<MapCanvasProps> = ({
  elements,
  onElementsChange,
  selectedTool,
  mapWidth,
  mapHeight,
  showGrid = true,
  gridSize = 20,
  disabled = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);

  // Colors for different elements
  const colors = useMemo(() => ({
    line: '#2196F3',
    rectangle: '#FF9800',
    circle: '#4CAF50',
    selected: '#F44336',
    grid: '#E0E0E0',
    handle: '#FFFFFF',
    handleBorder: '#000000'
  }), []);

  // Function to draw selection handles
  const drawHandles = useCallback((ctx: CanvasRenderingContext2D, element: MapElement) => {
    const handleSize = 6;
    const handles: { x: number; y: number }[] = [];

    switch (element.type) {
      case 'line':
        if (element.x2 !== undefined && element.y2 !== undefined) {
          handles.push(
            { x: element.x, y: element.y },
            { x: element.x2, y: element.y2 }
          );
        }
        break;
      case 'rectangle':
        if (element.width && element.height) {
          handles.push(
            { x: element.x, y: element.y },
            { x: element.x + element.width, y: element.y },
            { x: element.x, y: element.y + element.height },
            { x: element.x + element.width, y: element.y + element.height }
          );
        }
        break;
      case 'circle':
        if (element.radius) {
          handles.push(
            { x: element.x, y: element.y },
            { x: element.x + element.radius, y: element.y },
            { x: element.x - element.radius, y: element.y },
            { x: element.x, y: element.y + element.radius },
            { x: element.x, y: element.y - element.radius }
          );
        }
        break;
    }

    handles.forEach(handle => {
      ctx.fillStyle = colors.handle;
      ctx.beginPath();
      ctx.arc(handle.x, handle.y, handleSize, 0, 2 * Math.PI);
      ctx.fill();
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

  // Function to check if click is on element body
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
              ctx.fillStyle = colors.selected + '20';
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
              ctx.fillStyle = colors.selected + '20';
              ctx.fill();
            }
          }
          break;
      }

      if (element.selected) {
        drawHandles(ctx, element);
      }
    });
  }, [elements, mapWidth, mapHeight, gridSize, showGrid, colors, drawHandles]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let clickedElement: MapElement | undefined;
    let clickedHandle: string | null = null;
    let isBodyClick = false;

    for (const element of elements) {
      if (element.selected) {
        clickedHandle = getClickedHandle(element, x, y);
        if (clickedHandle) {
          clickedElement = element;
          break;
        }
      }

      if (isClickOnElementBody(element, x, y)) {
        clickedElement = element;
        isBodyClick = true;
        break;
      }
    }

    if (clickedElement) {
      const newElements = elements.map(el => ({
        ...el,
        selected: el.id === clickedElement.id
      }));
      onElementsChange(newElements);
      setSelectedElement(clickedElement.id);
      setDragStart({ x, y });

      if (clickedHandle) {
        setIsResizing(true);
        setActiveHandle(clickedHandle);
      } else if (isBodyClick) {
        setIsDragging(true);
        setDragOffset({
          x: x - clickedElement.x,
          y: y - clickedElement.y
        });
      }
    } else {
      setIsDrawing(true);
      setDragStart({ x, y });

      const newElements = elements.map(el => ({ ...el, selected: false }));
      onElementsChange(newElements);
      setSelectedElement(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isResizing && selectedElement && activeHandle && dragStart) {
      const newElements = elements.map(el => {
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
                updatedElement.radius = Math.max(5, distance);
              }
              break;
          }

          return updatedElement;
        }
        return el;
      });
      onElementsChange(newElements);
    } else if (isDragging && selectedElement && dragOffset) {
      const newX = x - dragOffset.x;
      const newY = y - dragOffset.y;

      const newElements = elements.map(el => {
        if (el.id === selectedElement) {
          const updatedElement = { ...el };

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
      });
      onElementsChange(newElements);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (disabled) return;

    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
      setDragOffset(null);
      return;
    }

    if (isResizing) {
      setIsResizing(false);
      setActiveHandle(null);
      setDragStart(null);
      return;
    }

    if (!isDrawing || !dragStart) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

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
    onElementsChange(newElements);

    setIsDrawing(false);
    setDragStart(null);
  };

  return (
    <Box>
      <canvas
        ref={canvasRef}
        width={mapWidth}
        height={mapHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{
          border: '1px solid #ccc',
          cursor: disabled ? 'default' :
                 isDragging ? 'grabbing' :
                 isResizing ? 'nw-resize' :
                 isDrawing ? 'crosshair' :
                 selectedElement ? 'grab' : 'default',
          display: 'block'
        }}
      />
    </Box>
  );
};

export default MapCanvas;