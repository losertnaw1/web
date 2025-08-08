import React from 'react';
import { Grid, Paper, Typography, Box } from '@mui/material';
import { RobotData, SensorData } from '../hooks/useWebSocket_simple';
import Robot3DViewer from '../components/Robot3DViewer';

interface Map3DPageProps {
  robotData: RobotData;
  sensorData: SensorData;
  isConnected: boolean;
  onCommand: (command: string, params?: any) => void;
}

const Map3DPage: React.FC<Map3DPageProps> = ({
  robotData,
  sensorData,
  isConnected: _isConnected, // Prefix with underscore to indicate intentionally unused
  onCommand
}) => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        🎮 3D Visualization
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Virtual Gazebo environment in your browser
      </Typography>

      <Grid container spacing={3}>
        
        {/* Main 3D Viewer */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2, height: '700px' }}>
            <Typography variant="h6" gutterBottom>
              Virtual Gazebo Environment
            </Typography>
            <Robot3DViewer
              robotData={robotData}
              sensorData={sensorData}
              onMapClick={(x: number, y: number) => {
                onCommand('navigate', { x, y, orientation_w: 1.0 });
              }}
            />
          </Paper>
        </Grid>

        {/* 3D Controls & Info */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              🎮 3D Controls
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body1">
                <strong>🖱️ Mouse Controls:</strong>
              </Typography>
              <ul>
                <li>Drag to orbit camera around robot</li>
                <li>Scroll up ↑ to zoom out, scroll down ↓ to zoom in</li>
                <li>Click on ground to set navigation goal</li>
              </ul>
              
              <Typography variant="body1">
                <strong>🎯 Navigation:</strong>
              </Typography>
              <ul>
                <li>Click anywhere on the ground plane</li>
                <li>Robot will navigate to clicked position</li>
                <li>Real-time path visualization</li>
              </ul>
            </Box>
          </Paper>
        </Grid>

        {/* 3D Features */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              ✨ 3D Features
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body1">
                <strong>🤖 Robot Model:</strong>
              </Typography>
              <ul>
                <li>3D robot with realistic proportions</li>
                <li>Direction indicator (orange cone)</li>
                <li>Real-time position updates</li>
              </ul>
              
              <Typography variant="body1">
                <strong>📡 Sensor Visualization:</strong>
              </Typography>
              <ul>
                <li>LiDAR points as green spheres</li>
                <li>Real-time scan data updates</li>
                <li>Toggle LiDAR display on/off</li>
              </ul>
            </Box>
          </Paper>
        </Grid>

        {/* Environment Info */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              🌍 Virtual Environment
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h6">🏢</Typography>
                  <Typography variant="body2">
                    Walls & Obstacles
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Brown rectangular structures
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} md={3}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h6">🌐</Typography>
                  <Typography variant="body2">
                    Ground Grid
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    20x20 meter navigation area
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} md={3}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h6">💡</Typography>
                  <Typography variant="body2">
                    Realistic Lighting
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Ambient + directional lighting
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} md={3}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h6">🎯</Typography>
                  <Typography variant="body2">
                    Coordinate System
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    X(red), Y(green), Z(blue) axes
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Performance Info */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, backgroundColor: '#f8f9fa' }}>
            <Typography variant="h6" gutterBottom>
              ⚡ Performance & Compatibility
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" gutterBottom>
                  🚀 Performance:
                </Typography>
                <ul>
                  <li>60 FPS smooth rendering</li>
                  <li>WebGL hardware acceleration</li>
                  <li>Optimized point cloud display</li>
                  <li>Efficient memory management</li>
                </ul>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" gutterBottom>
                  🌐 Browser Support:
                </Typography>
                <ul>
                  <li>Chrome/Chromium (recommended)</li>
                  <li>Firefox (good performance)</li>
                  <li>Safari (good performance)</li>
                  <li>Edge (good performance)</li>
                </ul>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" gutterBottom>
                  📱 Device Support:
                </Typography>
                <ul>
                  <li>Desktop computers</li>
                  <li>Laptops with dedicated GPU</li>
                  <li>Tablets (limited performance)</li>
                  <li>Modern smartphones</li>
                </ul>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

      </Grid>
    </Box>
  );
};

export default Map3DPage;
