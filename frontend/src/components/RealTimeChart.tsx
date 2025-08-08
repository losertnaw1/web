import React, { useEffect, useRef, useState } from 'react';
import { Box, Paper, Typography, FormControl, Select, MenuItem, SelectChangeEvent } from '@mui/material';

interface DataPoint {
  timestamp: number;
  value: number;
}

interface RealTimeChartProps {
  title: string;
  data: DataPoint[];
  maxDataPoints?: number;
  height?: number;
  color?: string;
  unit?: string;
  min?: number;
  max?: number;
  showGrid?: boolean;
  showLegend?: boolean;
}

const RealTimeChart: React.FC<RealTimeChartProps> = ({
  title,
  data,
  maxDataPoints = 100,
  height = 300,
  color = '#2196f3',
  unit = '',
  min,
  max,
  showGrid = true,
  showLegend = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [timeRange, setTimeRange] = useState<number>(60); // seconds

  // Filter data based on time range
  const filteredData = React.useMemo(() => {
    const now = Date.now() / 1000;
    const cutoff = now - timeRange;
    return data.filter(point => point.timestamp >= cutoff).slice(-maxDataPoints);
  }, [data, timeRange, maxDataPoints]);

  // Calculate value range
  const valueRange = React.useMemo(() => {
    if (filteredData.length === 0) return { min: 0, max: 100 };
    
    const values = filteredData.map(d => d.value);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    
    // Use provided min/max or calculate with padding
    const finalMin = min !== undefined ? min : dataMin - (dataMax - dataMin) * 0.1;
    const finalMax = max !== undefined ? max : dataMax + (dataMax - dataMin) * 0.1;
    
    return { 
      min: finalMin, 
      max: finalMax === finalMin ? finalMax + 1 : finalMax 
    };
  }, [filteredData, min, max]);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || filteredData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height: canvasHeight } = canvas;
    const padding = { top: 20, right: 60, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = canvasHeight - padding.top - padding.bottom;

    // Clear canvas
    ctx.clearRect(0, 0, width, canvasHeight);

    // Set up coordinate system
    const now = Date.now() / 1000;
    const timeMin = now - timeRange;
    const timeMax = now;
    
    const xScale = (timestamp: number) => 
      padding.left + ((timestamp - timeMin) / (timeMax - timeMin)) * chartWidth;
    
    const yScale = (value: number) => 
      padding.top + chartHeight - ((value - valueRange.min) / (valueRange.max - valueRange.min)) * chartHeight;

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      
      // Horizontal grid lines
      for (let i = 0; i <= 5; i++) {
        const value = valueRange.min + (valueRange.max - valueRange.min) * (i / 5);
        const y = yScale(value);
        
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();
        
        // Y-axis labels
        ctx.fillStyle = '#666';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(value.toFixed(1) + unit, padding.left - 10, y + 4);
      }
      
      // Vertical grid lines
      for (let i = 0; i <= 5; i++) {
        const time = timeMin + (timeMax - timeMin) * (i / 5);
        const x = xScale(time);
        
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, padding.top + chartHeight);
        ctx.stroke();
        
        // X-axis labels
        const date = new Date(time * 1000);
        const timeStr = date.toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit',
          second: '2-digit'
        });
        
        ctx.fillStyle = '#666';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(timeStr, x, padding.top + chartHeight + 20);
      }
    }

    // Draw chart border
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(padding.left, padding.top, chartWidth, chartHeight);

    // Draw data line
    if (filteredData.length > 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      const firstPoint = filteredData[0];
      ctx.moveTo(xScale(firstPoint.timestamp), yScale(firstPoint.value));
      
      for (let i = 1; i < filteredData.length; i++) {
        const point = filteredData[i];
        ctx.lineTo(xScale(point.timestamp), yScale(point.value));
      }
      
      ctx.stroke();
      
      // Draw data points
      ctx.fillStyle = color;
      filteredData.forEach(point => {
        ctx.beginPath();
        ctx.arc(xScale(point.timestamp), yScale(point.value), 3, 0, 2 * Math.PI);
        ctx.fill();
      });
    }

    // Draw current value indicator
    if (filteredData.length > 0) {
      const lastPoint = filteredData[filteredData.length - 1];
      const x = xScale(lastPoint.timestamp);
      const y = yScale(lastPoint.value);
      
      // Highlight last point
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill();
      
      // Current value label
      ctx.fillStyle = '#000';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(
        `${lastPoint.value.toFixed(2)}${unit}`, 
        padding.left + chartWidth + 10, 
        y + 4
      );
    }

    // Draw title
    ctx.fillStyle = '#333';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title, width / 2, 15);

  }, [filteredData, timeRange, valueRange, color, title, unit, showGrid, height]);

  const handleTimeRangeChange = (event: SelectChangeEvent<number>) => {
    setTimeRange(event.target.value as number);
  };

  return (
    <Paper sx={{ p: 2 }}>
      {/* Chart Controls */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">{title}</Typography>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <Select value={timeRange} onChange={handleTimeRangeChange}>
            <MenuItem value={30}>30 seconds</MenuItem>
            <MenuItem value={60}>1 minute</MenuItem>
            <MenuItem value={300}>5 minutes</MenuItem>
            <MenuItem value={600}>10 minutes</MenuItem>
            <MenuItem value={1800}>30 minutes</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Chart Canvas */}
      <canvas
        ref={canvasRef}
        width={800}
        height={height}
        style={{
          width: '100%',
          height: height,
          display: 'block'
        }}
      />

      {/* Chart Legend */}
      {showLegend && filteredData.length > 0 && (
        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'text.secondary' }}>
          <span>
            Min: {Math.min(...filteredData.map(d => d.value)).toFixed(2)}{unit}
          </span>
          <span>
            Avg: {(filteredData.reduce((sum, d) => sum + d.value, 0) / filteredData.length).toFixed(2)}{unit}
          </span>
          <span>
            Max: {Math.max(...filteredData.map(d => d.value)).toFixed(2)}{unit}
          </span>
          <span>
            Points: {filteredData.length}
          </span>
        </Box>
      )}

      {/* No Data Message */}
      {filteredData.length === 0 && (
        <Box sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          color: 'text.secondary'
        }}>
          <Typography variant="body2">No data available</Typography>
        </Box>
      )}
    </Paper>
  );
};

export default RealTimeChart;
