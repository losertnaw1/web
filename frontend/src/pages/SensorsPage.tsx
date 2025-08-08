import React from 'react';
import { Grid, Paper, Typography, Box } from '@mui/material';
import { SensorData } from '../hooks/useWebSocket_simple';
import SensorDisplay from '../components/SensorDisplay';

interface SensorsPageProps {
  sensorData: SensorData;
  isConnected: boolean;
}

const SensorsPage: React.FC<SensorsPageProps> = ({
  sensorData,
  isConnected
}) => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        📡 Sensors
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Real-time sensor data monitoring and visualization
      </Typography>

      <Grid container spacing={3}>
        
        {/* Main Sensor Display */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, height: '600px' }}>
            <Typography variant="h6" gutterBottom>
              Sensor Data Display
            </Typography>
            <SensorDisplay
              sensorData={sensorData}
              isConnected={isConnected}
            />
          </Paper>
        </Grid>

        {/* Sensor Status */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: '600px' }}>
            <Typography variant="h6" gutterBottom>
              📊 Sensor Status
            </Typography>
            
            {/* LiDAR Status */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                🔍 LiDAR Scanner
              </Typography>
              <Typography variant="body2" color={sensorData.scan ? 'success.main' : 'error.main'}>
                Status: {sensorData.scan ? '🟢 Active' : '🔴 Inactive'}
              </Typography>
              {sensorData.scan && (
                <>
                  <Typography variant="body2">
                    Points: {sensorData.scan.ranges.filter(r => r !== null).length}
                  </Typography>
                  <Typography variant="body2">
                    Range: {sensorData.scan.range_min.toFixed(2)} - {sensorData.scan.range_max.toFixed(2)} m
                  </Typography>
                  <Typography variant="body2">
                    Angle: {(sensorData.scan.angle_min * 180 / Math.PI).toFixed(0)}° - {(sensorData.scan.angle_max * 180 / Math.PI).toFixed(0)}°
                  </Typography>
                </>
              )}
            </Box>

            {/* Ultrasonic Status */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                📏 Ultrasonic Sensors
              </Typography>
              <Typography variant="body2" color={Array.isArray(sensorData.ultrasonic) && sensorData.ultrasonic.length > 0 ? 'success.main' : 'error.main'}>
                Status: {Array.isArray(sensorData.ultrasonic) && sensorData.ultrasonic.length > 0 ? '🟢 Active' : '🔴 Inactive'}
              </Typography>
              {Array.isArray(sensorData.ultrasonic) && sensorData.ultrasonic.map((sensor: any, index: number) => (
                <Typography key={index} variant="body2">
                  Sensor {index + 1}: {sensor.distance?.toFixed(2) || 'N/A'} cm
                </Typography>
              ))}
            </Box>

            {/* Camera Status */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                📷 Camera
              </Typography>
              <Typography variant="body2" color="warning.main">
                Status: 🟡 Not implemented
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Camera integration coming soon
              </Typography>
            </Box>

            {/* IMU Status */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                🧭 IMU (Inertial Measurement Unit)
              </Typography>
              <Typography variant="body2" color="warning.main">
                Status: 🟡 Not implemented
              </Typography>
              <Typography variant="body2" color="text.secondary">
                IMU integration coming soon
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* LiDAR Visualization */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              🔍 LiDAR Visualization
            </Typography>
            <Box sx={{ 
              height: '300px', 
              border: '1px solid #ccc', 
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#f8f9fa'
            }}>
              {sensorData.scan ? (
                <Typography variant="body1" color="success.main">
                  📡 LiDAR data available
                  <br />
                  {sensorData.scan.ranges.filter(r => r !== null).length} points detected
                  <br />
                  <Typography variant="caption" color="text.secondary">
                    See 3D Visualization page for visual display
                  </Typography>
                </Typography>
              ) : (
                <Typography variant="body1" color="text.secondary">
                  No LiDAR data available
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Sensor Configuration */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              ⚙️ Sensor Configuration
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body1">
                <strong>🔍 LiDAR Settings:</strong>
              </Typography>
              <ul>
                <li>Scan frequency: 10 Hz</li>
                <li>Angular resolution: 1°</li>
                <li>Range: 0.1 - 10.0 meters</li>
                <li>360° field of view</li>
              </ul>
              
              <Typography variant="body1">
                <strong>📏 Ultrasonic Settings:</strong>
              </Typography>
              <ul>
                <li>Update frequency: 20 Hz</li>
                <li>Range: 2 - 400 cm</li>
                <li>Multiple sensor array</li>
                <li>Obstacle detection</li>
              </ul>
            </Box>
          </Paper>
        </Grid>

        {/* Sensor Data Analysis */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              📈 Sensor Data Analysis
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h4" color="primary.main">
                    {sensorData.scan?.ranges.filter(r => r !== null && r < 1.0).length || 0}
                  </Typography>
                  <Typography variant="body2">
                    Close Objects (&lt;1m)
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} md={3}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h4" color="info.main">
                    {sensorData.scan?.ranges.filter(r => r !== null && r >= 1.0 && r < 3.0).length || 0}
                  </Typography>
                  <Typography variant="body2">
                    Medium Range (1-3m)
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} md={3}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h4" color="success.main">
                    {sensorData.scan?.ranges.filter(r => r !== null && r >= 3.0).length || 0}
                  </Typography>
                  <Typography variant="body2">
                    Far Objects (&gt;3m)
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} md={3}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h4" color="warning.main">
                    {Array.isArray(sensorData.ultrasonic) ?
                      sensorData.ultrasonic.filter((u: any) => u.distance && u.distance < 50).length : 0}
                  </Typography>
                  <Typography variant="body2">
                    Ultrasonic Alerts
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Sensor Instructions */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, backgroundColor: '#f0f7ff' }}>
            <Typography variant="h6" gutterBottom>
              📖 Sensor Information
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" gutterBottom>
                  🔍 LiDAR Scanner:
                </Typography>
                <ul>
                  <li>360° laser range finder</li>
                  <li>High-precision distance measurement</li>
                  <li>Real-time obstacle detection</li>
                  <li>SLAM and navigation support</li>
                </ul>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" gutterBottom>
                  📏 Ultrasonic Array:
                </Typography>
                <ul>
                  <li>Close-range obstacle detection</li>
                  <li>Backup safety system</li>
                  <li>Low-cost proximity sensing</li>
                  <li>Collision avoidance</li>
                </ul>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" gutterBottom>
                  📊 Data Usage:
                </Typography>
                <ul>
                  <li>Real-time visualization in 3D view</li>
                  <li>Navigation path planning</li>
                  <li>Obstacle avoidance algorithms</li>
                  <li>Safety monitoring systems</li>
                </ul>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

      </Grid>
    </Box>
  );
};

export default SensorsPage;
