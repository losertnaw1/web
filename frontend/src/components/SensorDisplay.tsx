
import React from 'react';
import { Box, Typography, LinearProgress } from '@mui/material';
import { SensorData } from '../hooks/useWebSocket_simple';

interface SensorDisplayProps {
  sensorData: SensorData;
  isConnected: boolean;
}

const SensorDisplay: React.FC<SensorDisplayProps> = ({ sensorData, isConnected }) => {
  return (
    <Box>
      <Typography variant="body2" gutterBottom>
        Sensor Data
      </Typography>
      {sensorData.scan && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption">
            LiDAR: {sensorData.scan.ranges.filter(r => r !== null).length} points
          </Typography>
          <LinearProgress variant="determinate" value={75} />
        </Box>
      )}
      {sensorData.ultrasonic && (
        <Typography variant="caption">
          Ultrasonic: {sensorData.ultrasonic.range.toFixed(2)}m
        </Typography>
      )}
    </Box>
  );
};

export default SensorDisplay;
