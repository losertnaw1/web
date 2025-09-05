
import React from 'react';
import { Box, Typography, LinearProgress } from '@mui/material';
import { SensorData } from '../hooks/useWebSocket_simple';
import { useI18n } from '../i18n/i18n';

interface SensorDisplayProps {
  sensorData: SensorData;
  isConnected: boolean;
}

const SensorDisplay: React.FC<SensorDisplayProps> = ({ sensorData, isConnected }) => {
  const { t } = useI18n();
  return (
    <Box>
      <Typography variant="body2" gutterBottom>
        {t('sensors.status', 'Sensor Data')}
      </Typography>
      {sensorData.scan && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption">
            {t('dashboard.lidar', 'LiDAR')}: {sensorData.scan.ranges.filter(r => r !== null).length} {t('dashboard.lidar_points', 'points detected')}
          </Typography>
          <LinearProgress variant="determinate" value={75} />
        </Box>
      )}
      {sensorData.ultrasonic && (
        <Typography variant="caption">
          {t('sensors.ultrasonic', 'Ultrasonic')}: {sensorData.ultrasonic.range.toFixed(2)}m
        </Typography>
      )}
    </Box>
  );
};

export default SensorDisplay;
