
import React, { useEffect, useState, useCallback } from 'react';
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, IconButton } from '@mui/material';
import { Fullscreen, Close } from '@mui/icons-material';
import { RobotData, SensorData } from '../hooks/useWebSocket_simple';
import MapViewer2D from './MapViewer2D';
import { useI18n } from '../i18n/i18n';

interface MapViewerProps {
  robotData: RobotData;
  sensorData: SensorData;
  onMapClick: (x: number, y: number, theta?: number) => void;
  showLidar?: boolean;
  isSettingInitialPose?: boolean;
  isSettingNavGoal?: boolean;
  multiGoalMode?: boolean;
  multiGoals?: Array<{x:number; y:number; theta:number}>;
  onMultiGoalsChange?: (goals: Array<{x:number; y:number; theta:number}>) => void;
}

const MapViewer: React.FC<MapViewerProps> = ({ robotData, sensorData, onMapClick, showLidar = false, isSettingInitialPose = false, isSettingNavGoal = true, multiGoalMode = false, multiGoals = [], onMultiGoalsChange }) => {
  const { t } = useI18n();
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [goals, setGoals] = useState<Array<{x: number; y: number; theta: number}>>([]);
  const [displayPath, setDisplayPath] = useState<Array<{x: number; y: number}>>([]);

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

  // Local handler for single-goal mode
  const handleMapClickLocal = useCallback((x: number, y: number, theta?: number) => {
    if (multiGoalMode) return; // handled by multi-goal interactions
    onMapClick(x, y, theta);
    if (theta !== undefined) {
      setGoals([{ x, y, theta }]);
    }
  }, [onMapClick, multiGoalMode]);

  // Recompute display path: single vs multi
  useEffect(() => {
    if (!robotPose) {
      setDisplayPath([]);
      return;
    }
    if (multiGoalMode) {
      const pts = [
        { x: robotPose.x, y: robotPose.y },
        ...multiGoals.map(g => ({ x: g.x, y: g.y }))
      ];
      setDisplayPath(pts.length > 1 ? pts : []);
    } else if (goals.length > 0) {
      const g = goals[0];
      setDisplayPath([
        { x: robotPose.x, y: robotPose.y },
        { x: g.x, y: g.y }
      ]);
    } else {
      setDisplayPath([]);
    }
  }, [robotPose, goals, multiGoalMode, multiGoals]);

  return (
    <>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Map Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6">
            {t('map.header.interactive')}
          </Typography>
          <Button
            startIcon={<Fullscreen />}
            onClick={() => setFullscreenOpen(true)}
            size="small"
            variant="outlined"
          >
            {t('map.fullscreen')}
          </Button>
        </Box>

        {/* Map Container */}
        <Box sx={{ flex: 1, height: '100%', display: 'flex', justifyContent: 'center' }}>
          <MapViewer2D
            mapData={mapData}
            robotPose={robotPose}
            lidarData={showLidar ? sensorData.scan : undefined}
            goals={multiGoalMode ? multiGoals : goals}
            path={displayPath}
            onMapClick={handleMapClickLocal}
            isSettingInitialPose={isSettingInitialPose}
            multiGoalMode={multiGoalMode}
            onGoalsChange={onMultiGoalsChange}
          />
        </Box>

        {/* Map Info */}
        <Box sx={{ mt: 1, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
          <Typography variant="caption" display="block">
            {isSettingInitialPose ? t('map.instruction.initial') : t('map.instruction.goal')}
            {!sensorData.map && (
              <span style={{ color: 'orange' }}> {t('map.info.fallback')}</span>
            )}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, fontSize: '12px', color: 'text.secondary' }}>
            <span>{t('map.info.resolution', 'Resolution')}: {mapData.resolution}m/pixel</span>
            <span>{t('map.info.size', 'Size')}: {mapData.width}×{mapData.height}</span>
            {robotPose && (
              <span>{t('map.info.robot', 'Robot')}: ({robotPose.x.toFixed(2)}, {robotPose.y.toFixed(2)})</span>
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
          <Typography variant="h6">{t('map.dialog.title')}</Typography>
          <IconButton onClick={() => setFullscreenOpen(false)}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 1, height: '100%' }}>
          <MapViewer2D
            mapData={mapData}
            robotPose={robotPose}
            lidarData={showLidar ? sensorData.scan : undefined}
            goals={multiGoalMode ? multiGoals : goals}
            path={displayPath}
            onMapClick={handleMapClickLocal}
            isSettingInitialPose={isSettingInitialPose}
            multiGoalMode={multiGoalMode}
            onGoalsChange={onMultiGoalsChange}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MapViewer;
