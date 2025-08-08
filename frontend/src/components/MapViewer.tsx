
import React, { useState } from 'react';
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, IconButton } from '@mui/material';
import { Fullscreen, Close } from '@mui/icons-material';
import { RobotData, SensorData } from '../hooks/useWebSocket_simple';
import MapViewer2D from './MapViewer2D';

interface MapViewerProps {
  robotData: RobotData;
  sensorData: SensorData;
  onMapClick: (x: number, y: number, theta?: number) => void;
  showLidar?: boolean;
  isSettingInitialPose?: boolean;
}

const MapViewer: React.FC<MapViewerProps> = ({ robotData, sensorData, onMapClick, showLidar = false, isSettingInitialPose = false }) => {
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  // Use real map data from ROS2 or fallback to simple map
  const mapData = sensorData.map ? {
    ...sensorData.map,
    origin: {
      x: sensorData.map.origin.x,
      y: sensorData.map.origin.y,
      theta: sensorData.map.origin.theta || 0  // Use theta directly from bridge
    }
  } : {
    width: 100,
    height: 100,
    resolution: 0.05,
    origin: { x: -2.5, y: -2.5, theta: 0 },
    data: Array(10000).fill(-1)  // ALL UNKNOWN - NO HARDCODED MAP!
  };

  // Convert robot data to map format - use direct ROS2 coordinates
  const robotPose = (() => {
    // Prioritize pose data (map frame) over odometry (odom frame)
    if (robotData.pose?.position) {
      // Use direct ROS2 coordinates without transformation
      const worldX = robotData.pose.position.x;
      const worldY = robotData.pose.position.y;

      // Calculate yaw from quaternion
      let theta = 0;
      if (robotData.pose.orientation) {
        const q = robotData.pose.orientation;
        theta = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
      }

      console.log(`🤖 Robot pose:`, {
        world: { x: worldX, y: worldY },
        theta: theta * 180 / Math.PI,
        frame: robotData.pose.frame_id || 'unknown'
      });

      return {
        x: worldX,
        y: worldY,
        theta: theta
      };
    } else if (robotData.odom?.position) {
      // Fallback to odometry
      const worldX = robotData.odom.position.x;
      const worldY = robotData.odom.position.y;

      let theta = 0;
      if (robotData.odom.orientation) {
        const q = robotData.odom.orientation;
        theta = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
      }

      return {
        x: worldX,
        y: worldY,
        theta: theta
      };
    }
    return undefined;
  })();

  // Mock goals and path for demonstration
  const goals = [
    { x: 1.0, y: 1.0, theta: 0 }
  ];

  const path = [
    { x: 0, y: 0 },
    { x: 0.5, y: 0.5 },
    { x: 1.0, y: 1.0 }
  ];

  return (
    <>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Map Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6">
            🗺️ Interactive Map
          </Typography>
          <Button
            startIcon={<Fullscreen />}
            onClick={() => setFullscreenOpen(true)}
            size="small"
            variant="outlined"
          >
            Fullscreen
          </Button>
        </Box>

        {/* Map Container */}
        <Box sx={{ flex: 1, minHeight: 300 }}>
          <MapViewer2D
            mapData={mapData}
            robotPose={robotPose}
            lidarData={showLidar ? sensorData.scan : undefined}
            goals={goals}
            path={path}
            onMapClick={onMapClick}
            isSettingInitialPose={isSettingInitialPose}
          />
        </Box>

        {/* Map Info */}
        <Box sx={{ mt: 1, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
          <Typography variant="caption" display="block">
            {isSettingInitialPose
              ? '📍 Click to set position, then click again to set direction'
              : '📍 Click on map to set navigation goal'
            }
            {!sensorData.map && (
              <span style={{ color: 'orange' }}> (Using fallback map - no real map data from ROS2)</span>
            )}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, fontSize: '12px', color: 'text.secondary' }}>
            <span>Resolution: {mapData.resolution}m/pixel</span>
            <span>Size: {mapData.width}×{mapData.height}</span>
            {robotPose && (
              <span>Robot: ({robotPose.x.toFixed(2)}, {robotPose.y.toFixed(2)})</span>
            )}
          </Box>
        </Box>
      </Box>

      {/* Fullscreen Dialog */}
      <Dialog
        open={fullscreenOpen}
        onClose={() => setFullscreenOpen(false)}
        maxWidth={false}
        fullScreen
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">🗺️ Map View - Fullscreen</Typography>
          <IconButton onClick={() => setFullscreenOpen(false)}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 1, height: '100%' }}>
          <MapViewer2D
            mapData={mapData}
            robotPose={robotPose}
            lidarData={showLidar ? sensorData.scan : undefined}
            goals={goals}
            path={path}
            onMapClick={onMapClick}
            isSettingInitialPose={isSettingInitialPose}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MapViewer;
