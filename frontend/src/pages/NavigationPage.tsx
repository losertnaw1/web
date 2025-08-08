import React from 'react';
import { Grid, Paper, Typography, Box } from '@mui/material';
import { RobotData, SensorData } from '../hooks/useWebSocket_simple';
import NavigationPanel from '../components/NavigationPanel';
import MapViewer from '../components/MapViewer';

interface NavigationPageProps {
  robotData: RobotData;
  sensorData: SensorData;
  isConnected: boolean;
  onCommand: (command: string, params?: any) => void;
}

const NavigationPage: React.FC<NavigationPageProps> = ({
  robotData,
  sensorData,
  isConnected,
  onCommand
}) => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        🧭 Navigation
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Path planning and autonomous navigation
      </Typography>

      <Grid container spacing={3}>
        
        {/* Navigation Control */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: '600px' }}>
            <Typography variant="h6" gutterBottom>
              Navigation Control
            </Typography>
            <NavigationPanel
              onCommand={onCommand}
              robotData={robotData}
              isConnected={isConnected}
            />
          </Paper>
        </Grid>

        {/* Map Viewer */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, height: '600px' }}>
            <Typography variant="h6" gutterBottom>
              2D Map View
            </Typography>
            <MapViewer
              robotData={robotData}
              sensorData={sensorData}
              onMapClick={(x: number, y: number) => {
                onCommand('navigate', { x, y, orientation_w: 1.0 });
              }}
            />
          </Paper>
        </Grid>

        {/* Navigation Status */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              📍 Current Position
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body1">
                <strong>X:</strong> {(robotData.odom?.position?.x || 0).toFixed(3)} m
              </Typography>
              <Typography variant="body1">
                <strong>Y:</strong> {(robotData.odom?.position?.y || 0).toFixed(3)} m
              </Typography>
              <Typography variant="body1">
                <strong>Heading:</strong> {robotData.odom ? 
                  (Math.atan2(
                    2 * (robotData.odom.orientation.w * robotData.odom.orientation.z),
                    1 - 2 * (robotData.odom.orientation.z ** 2)
                  ) * 180 / Math.PI).toFixed(1) : 0}°
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* Goal Status */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              🎯 Navigation Goal
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body1">
                <strong>Status:</strong> {'No active goal'}
              </Typography>
              <Typography variant="body1">
                <strong>Goal X:</strong> {'N/A'} m
              </Typography>
              <Typography variant="body1">
                <strong>Goal Y:</strong> {'N/A'} m
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* Quick Navigation */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              ⚡ Quick Navigation
            </Typography>
            <Grid container spacing={2}>
              <Grid item>
                <button 
                  onClick={() => onCommand('navigate', { x: 0, y: 0, orientation_w: 1.0 })}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  🏠 Home (0, 0)
                </button>
              </Grid>
              <Grid item>
                <button 
                  onClick={() => onCommand('navigate', { x: 2, y: 2, orientation_w: 1.0 })}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#2196f3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  📍 Point A (2, 2)
                </button>
              </Grid>
              <Grid item>
                <button 
                  onClick={() => onCommand('navigate', { x: -2, y: 2, orientation_w: 1.0 })}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#ff9800',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  📍 Point B (-2, 2)
                </button>
              </Grid>
              <Grid item>
                <button 
                  onClick={() => onCommand('cancel_navigation')}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#f44336',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  ❌ Cancel Goal
                </button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Navigation Instructions */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              📖 Navigation Instructions
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" gutterBottom>
                  🎯 Setting Goals:
                </Typography>
                <ul>
                  <li>Click on map to set navigation goal</li>
                  <li>Use coordinate input for precise goals</li>
                  <li>Use quick navigation buttons</li>
                  <li>Monitor goal status in real-time</li>
                </ul>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" gutterBottom>
                  🗺️ Map Navigation:
                </Typography>
                <ul>
                  <li>Blue dot shows robot position</li>
                  <li>Green dots show LiDAR scan</li>
                  <li>Click anywhere to navigate</li>
                  <li>Real-time position updates</li>
                </ul>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" gutterBottom>
                  ⚠️ Safety Tips:
                </Typography>
                <ul>
                  <li>Ensure path is clear of obstacles</li>
                  <li>Monitor robot progress</li>
                  <li>Cancel navigation if needed</li>
                  <li>Use emergency stop if required</li>
                </ul>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

      </Grid>
    </Box>
  );
};

export default NavigationPage;
