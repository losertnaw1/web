import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Box, Paper, Typography, Switch, FormControlLabel } from '@mui/material';

interface JoystickPosition {
  x: number; // -1 to 1
  y: number; // -1 to 1
}

interface VirtualJoystickProps {
  onMove: (position: JoystickPosition) => void;
  onStop: () => void;
  size?: number;
  maxDistance?: number;
  disabled?: boolean;
  showValues?: boolean;
}

const VirtualJoystick: React.FC<VirtualJoystickProps> = ({
  onMove,
  onStop,
  size = 200,
  maxDistance = 80,
  disabled = false,
  showValues = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState<JoystickPosition>({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(true);
  const animationRef = useRef<number | undefined>(undefined);

  // Convert screen coordinates to joystick position
  const screenToJoystick = useCallback((clientX: number, clientY: number): JoystickPosition => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance <= maxDistance) {
      return {
        x: deltaX / maxDistance,
        y: -deltaY / maxDistance // Invert Y for intuitive up/down
      };
    } else {
      // Clamp to circle boundary
      const angle = Math.atan2(deltaY, deltaX);
      return {
        x: Math.cos(angle),
        y: -Math.sin(angle)
      };
    }
  }, [maxDistance]);

  // Draw joystick
  const drawJoystick = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerX = size / 2;
    const centerY = size / 2;

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    // Draw outer circle (boundary)
    ctx.strokeStyle = disabled ? '#ccc' : '#2196f3';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, maxDistance, 0, 2 * Math.PI);
    ctx.stroke();

    // Draw inner circles (guides)
    ctx.strokeStyle = disabled ? '#eee' : '#e3f2fd';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, (maxDistance / 4) * i, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // Draw center cross
    ctx.strokeStyle = disabled ? '#ddd' : '#bbdefb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX - 10, centerY);
    ctx.lineTo(centerX + 10, centerY);
    ctx.moveTo(centerX, centerY - 10);
    ctx.lineTo(centerX, centerY + 10);
    ctx.stroke();

    // Draw knob
    const knobX = centerX + position.x * maxDistance;
    const knobY = centerY - position.y * maxDistance; // Invert Y

    // Knob shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.arc(knobX + 2, knobY + 2, 15, 0, 2 * Math.PI);
    ctx.fill();

    // Knob
    const gradient = ctx.createRadialGradient(knobX - 5, knobY - 5, 0, knobX, knobY, 15);
    if (disabled) {
      gradient.addColorStop(0, '#f5f5f5');
      gradient.addColorStop(1, '#ccc');
    } else if (isDragging) {
      gradient.addColorStop(0, '#64b5f6');
      gradient.addColorStop(1, '#1976d2');
    } else {
      gradient.addColorStop(0, '#90caf9');
      gradient.addColorStop(1, '#2196f3');
    }

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(knobX, knobY, 15, 0, 2 * Math.PI);
    ctx.fill();

    // Knob border
    ctx.strokeStyle = disabled ? '#bbb' : '#1565c0';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Direction indicator
    if (position.x !== 0 || position.y !== 0) {
      ctx.strokeStyle = disabled ? '#999' : '#ff4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(knobX, knobY);
      ctx.stroke();
    }

  }, [position, isDragging, disabled, size, maxDistance]);

  // Handle mouse/touch events
  const handleStart = useCallback((clientX: number, clientY: number) => {
    if (disabled || !isActive) return;

    setIsDragging(true);
    const newPosition = screenToJoystick(clientX, clientY);
    setPosition(newPosition);
    onMove(newPosition);
  }, [disabled, isActive, screenToJoystick, onMove]);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging || disabled || !isActive) return;

    const newPosition = screenToJoystick(clientX, clientY);
    setPosition(newPosition);
    onMove(newPosition);
  }, [isDragging, disabled, isActive, screenToJoystick, onMove]);

  const handleEnd = useCallback(() => {
    if (!isDragging) return;

    setIsDragging(false);
    setPosition({ x: 0, y: 0 });
    onStop();
  }, [isDragging, onStop]);

  // Mouse events
  const handleMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    handleStart(event.clientX, event.clientY);
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    handleMove(event.clientX, event.clientY);
  };

  const handleMouseUp = () => {
    handleEnd();
  };

  // Touch events
  // const handleTouchStart = (event: React.TouchEvent) => {
  //   event.preventDefault();
  //   const touch = event.touches[0];
  //   handleStart(touch.clientX, touch.clientY);
  // };

  // const handleTouchMove = (event: React.TouchEvent) => {
  //   event.preventDefault();
  //   const touch = event.touches[0];
  //   handleMove(touch.clientX, touch.clientY);
  // };

  const handleTouchEnd = (event: React.TouchEvent) => {
    event.preventDefault();
    handleEnd();
  };

  // Global mouse events
  useEffect(() => {
    const handleGlobalMouseMove = (event: MouseEvent) => {
      handleMove(event.clientX, event.clientY);
    };

    const handleGlobalMouseUp = () => {
      handleEnd();
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, handleMove, handleEnd]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      drawJoystick();
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [drawJoystick]);

  // Auto-return to center when not active
  useEffect(() => {
    if (!isActive && (position.x !== 0 || position.y !== 0)) {
      setPosition({ x: 0, y: 0 });
      onStop();
    }
  }, [isActive, position, onStop]);

  useEffect(() => {
    const element = document.getElementById('touch-area');
    if (!element) return; 
    
    const handler = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    };

    element.addEventListener('touchmove', handler, {passive : false});

    return () => {
      element.removeEventListener('touchmove', handler);
    };
  }, []);

  useEffect(() => {
    const element = document.getElementById('touch-area');
    if (!element) return; 
    
    const handler = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      handleStart(touch.clientX, touch.clientY);
    };

    element.addEventListener('touchstart', handler, {passive : false});

    return () => {
      element.removeEventListener('touchstart', handler);
    };
  }, []);

  return (
    <Paper id='touch-area' sx={{ p: 2, textAlign: 'center' }}>
      <Typography variant="h6" gutterBottom>
        🎮 Virtual Joystick
      </Typography>

      {/* Joystick Canvas */}
      <Box sx={{ display: 'inline-block', position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          style={{
            border: '2px solid #e0e0e0',
            borderRadius: '50%',
            cursor: disabled ? 'not-allowed' : (isDragging ? 'grabbing' : 'grab'),
            touchAction: 'none',
            userSelect: 'none'
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          // onTouchStart={handleTouchStart}
          // onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </Box>

      {/* Controls */}
      <Box sx={{ mt: 2 }}>
        <FormControlLabel
          control={
            <Switch
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={disabled}
            />
          }
          label="Enable Joystick"
        />
      </Box>

      {/* Values Display */}
      {showValues && (
        <Box sx={{ mt: 2, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
          <Typography variant="body2" gutterBottom>
            Position Values:
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'space-around' }}>
            <Typography variant="caption">
              X: {position.x.toFixed(3)}
            </Typography>
            <Typography variant="caption">
              Y: {position.y.toFixed(3)}
            </Typography>
            <Typography variant="caption">
              Distance: {Math.sqrt(position.x * position.x + position.y * position.y).toFixed(3)}
            </Typography>
          </Box>
        </Box>
      )}

      {/* Instructions */}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        Drag the blue knob to control robot movement
        <br />
        Up/Down: Forward/Backward • Left/Right: Turn
      </Typography>
    </Paper>
  );
};

export default VirtualJoystick;
