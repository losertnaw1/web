import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Box, Paper, Typography, Switch, FormControlLabel, Slider } from '@mui/material';

interface JoystickPosition {
  x: number; // -1 to 1
  y: number; // -1 to 1
}

interface ContinuousJoystickProps {
  onMove: (position: JoystickPosition) => void;
  onStop: () => void;
  size?: number;
  maxDistance?: number;
  disabled?: boolean;
  showValues?: boolean;
  continuousMode?: boolean;
  updateRate?: number; // Hz
}

const ContinuousJoystick: React.FC<ContinuousJoystickProps> = ({
  onMove,
  onStop,
  size = 200,
  maxDistance = 80,
  disabled = false,
  showValues = true,
  continuousMode = true,
  updateRate = 10
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState<JoystickPosition>({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(true);
  const [currentUpdateRate, setCurrentUpdateRate] = useState(updateRate);
  const [maxSpeed, setMaxSpeed] = useState(1.0);
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

  // Track last sent position to avoid spam
  const lastSentPosition = useRef<JoystickPosition>({ x: 0, y: 0 });

  // Continuous movement handler
  const sendContinuousMovement = useCallback(() => {
    if (!isActive) return;

    const scaledPosition = {
      x: position.x * maxSpeed,
      y: position.y * maxSpeed
    };

    // Only send if position changed significantly (threshold 0.01)
    const threshold = 0.01;
    const deltaX = Math.abs(scaledPosition.x - lastSentPosition.current.x);
    const deltaY = Math.abs(scaledPosition.y - lastSentPosition.current.y);

    if (deltaX > threshold || deltaY > threshold) {
      onMove(scaledPosition);
      lastSentPosition.current = scaledPosition;
    }
  }, [position, isActive, maxSpeed, onMove]);

  // Setup continuous movement interval
  useEffect(() => {
    if (continuousMode && isDragging && isActive) {
      intervalRef.current = setInterval(sendContinuousMovement, 1000 / currentUpdateRate);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [continuousMode, isDragging, isActive, sendContinuousMovement, currentUpdateRate]);

  // Draw joystick with enhanced visuals
  const drawJoystick = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerX = size / 2;
    const centerY = size / 2;

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    // Draw background circle
    const bgGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxDistance + 20);
    bgGradient.addColorStop(0, 'rgba(33, 150, 243, 0.1)');
    bgGradient.addColorStop(1, 'rgba(33, 150, 243, 0.05)');
    ctx.fillStyle = bgGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, maxDistance + 20, 0, 2 * Math.PI);
    ctx.fill();

    // Draw outer circle (boundary)
    ctx.strokeStyle = disabled ? '#ccc' : (isActive ? '#2196f3' : '#999');
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(centerX, centerY, maxDistance, 0, 2 * Math.PI);
    ctx.stroke();

    // Draw speed zones
    const zones = [0.25, 0.5, 0.75, 1.0];
    zones.forEach((zone, index) => {
      ctx.strokeStyle = disabled ? '#eee' : `rgba(33, 150, 243, ${0.2 + index * 0.1})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, maxDistance * zone, 0, 2 * Math.PI);
      ctx.stroke();
    });

    // Draw directional indicators
    const directions = [
      { angle: 0, label: 'R' },
      { angle: Math.PI / 2, label: 'D' },
      { angle: Math.PI, label: 'L' },
      { angle: 3 * Math.PI / 2, label: 'U' }
    ];

    ctx.fillStyle = disabled ? '#ccc' : '#666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    directions.forEach(dir => {
      const x = centerX + Math.cos(dir.angle) * (maxDistance + 35);
      const y = centerY + Math.sin(dir.angle) * (maxDistance + 35) + 4;
      ctx.fillText(dir.label, x, y);
    });

    // Draw center cross
    ctx.strokeStyle = disabled ? '#ddd' : '#bbdefb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - 15, centerY);
    ctx.lineTo(centerX + 15, centerY);
    ctx.moveTo(centerX, centerY - 15);
    ctx.lineTo(centerX, centerY + 15);
    ctx.stroke();

    // Draw knob
    const knobX = centerX + position.x * maxDistance;
    const knobY = centerY - position.y * maxDistance; // Invert Y

    // Knob shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(knobX + 3, knobY + 3, 18, 0, 2 * Math.PI);
    ctx.fill();

    // Knob gradient
    const knobGradient = ctx.createRadialGradient(knobX - 6, knobY - 6, 0, knobX, knobY, 18);
    if (disabled) {
      knobGradient.addColorStop(0, '#f5f5f5');
      knobGradient.addColorStop(1, '#ccc');
    } else if (isDragging) {
      knobGradient.addColorStop(0, '#64b5f6');
      knobGradient.addColorStop(1, '#1976d2');
    } else {
      knobGradient.addColorStop(0, '#90caf9');
      knobGradient.addColorStop(1, '#2196f3');
    }

    ctx.fillStyle = knobGradient;
    ctx.beginPath();
    ctx.arc(knobX, knobY, 18, 0, 2 * Math.PI);
    ctx.fill();

    // Knob border
    ctx.strokeStyle = disabled ? '#bbb' : '#1565c0';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Direction vector
    if (position.x !== 0 || position.y !== 0) {
      const distance = Math.sqrt(position.x * position.x + position.y * position.y);
      ctx.strokeStyle = disabled ? '#999' : `rgba(255, 68, 68, ${0.5 + distance * 0.5})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(knobX, knobY);
      ctx.stroke();

      // Speed indicator
      ctx.fillStyle = disabled ? '#999' : '#ff4444';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${(distance * maxSpeed).toFixed(1)}`, knobX, knobY - 25);
    }

    // Active indicator
    if (isActive && !disabled) {
      ctx.strokeStyle = '#4caf50';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, maxDistance + 10, 0, 2 * Math.PI);
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

  }, [position, isDragging, disabled, size, maxDistance, isActive, maxSpeed]);

  // Handle mouse/touch events (same as VirtualJoystick)
  const handleStart = useCallback((clientX: number, clientY: number) => {
    if (disabled || !isActive) return;

    setIsDragging(true);
    const newPosition = screenToJoystick(clientX, clientY);
    setPosition(newPosition);
    
    if (!continuousMode) {
      onMove({
        x: newPosition.x * maxSpeed,
        y: newPosition.y * maxSpeed
      });
    }
  }, [disabled, isActive, screenToJoystick, onMove, continuousMode, maxSpeed]);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging || disabled || !isActive) return;

    const newPosition = screenToJoystick(clientX, clientY);
    setPosition(newPosition);
    
    if (!continuousMode) {
      onMove({
        x: newPosition.x * maxSpeed,
        y: newPosition.y * maxSpeed
      });
    }
  }, [isDragging, disabled, isActive, screenToJoystick, onMove, continuousMode, maxSpeed]);

  const handleEnd = useCallback(() => {
    if (!isDragging) return;

    setIsDragging(false);
    setPosition({ x: 0, y: 0 });

    // Only send stop if we were actually moving
    if (lastSentPosition.current.x !== 0 || lastSentPosition.current.y !== 0) {
      onStop();
      lastSentPosition.current = { x: 0, y: 0 };
    }
  }, [isDragging, onStop]);

  // Mouse events
  const handleMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    handleStart(event.clientX, event.clientY);
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    handleMove(event.clientX, event.clientY);
  };

  // Touch events
  const handleTouchStart = (event: React.TouchEvent) => {
    event.preventDefault();
    const touch = event.touches[0];
    handleStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    event.preventDefault();
    const touch = event.touches[0];
    handleMove(touch.clientX, touch.clientY);
  };

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

  return (
    <Paper sx={{ p: 2, textAlign: 'center' }}>
      <Typography variant="h6" gutterBottom>
        🎮 Advanced Joystick Control
      </Typography>

      {/* Joystick Canvas */}
      <Box sx={{ display: 'inline-block', position: 'relative', mb: 2}}>
        <canvas
          ref={canvasRef}
          width={size + 80}
          height={size + 80}
          style={{
            border: '2px solid #e0e0e0',
            borderRadius: '50%',
            cursor: disabled ? 'not-allowed' : (isDragging ? 'grabbing' : 'grab'),
            touchAction: 'none',
            userSelect: 'none'
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleEnd}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </Box>

      {/* Controls */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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

        <Box>
          <Typography variant="caption" gutterBottom display="block">
            Max Speed: {maxSpeed.toFixed(1)}x
          </Typography>
          <Slider
            value={maxSpeed}
            onChange={(_, value) => setMaxSpeed(value as number)}
            min={0.1}
            max={2.0}
            step={0.1}
            disabled={disabled}
            size="small"
          />
        </Box>

        <Box>
          <Typography variant="caption" gutterBottom display="block">
            Update Rate: {currentUpdateRate} Hz
          </Typography>
          <Slider
            value={currentUpdateRate}
            onChange={(_, value) => setCurrentUpdateRate(value as number)}
            min={1}
            max={50}
            step={1}
            disabled={disabled}
            size="small"
          />
        </Box>
      </Box>

      {/* Values Display */}
      {showValues && (
        <Box sx={{ mt: 2, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
          <Typography variant="body2" gutterBottom>
            Control Values:
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, fontSize: '12px' }}>
            <span>X: {(position.x * maxSpeed).toFixed(3)}</span>
            <span>Y: {(position.y * maxSpeed).toFixed(3)}</span>
            <span>Distance: {Math.sqrt(position.x * position.x + position.y * position.y).toFixed(3)}</span>
            <span>Mode: {continuousMode ? 'Continuous' : 'Discrete'}</span>
          </Box>
        </Box>
      )}

      {/* Instructions */}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        🎯 Drag to control • 🔄 Continuous movement at {currentUpdateRate}Hz
        <br />
        ⬆️ Forward • ⬇️ Backward • ⬅️➡️ Turn • 🎚️ Adjust speed & rate
      </Typography>
    </Paper>
  );
};

export default ContinuousJoystick;
