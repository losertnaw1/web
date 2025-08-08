import React, { useState, useCallback } from 'react';
import { Grid, Paper, Typography, Box, Tabs, Tab, Snackbar, Alert } from '@mui/material';
import { RobotData, SensorData } from '../hooks/useWebSocket_simple';
import RobotControl from '../components/RobotControl';
import VirtualJoystick from '../components/VirtualJoystick';
import ContinuousJoystick from '../components/ContinuousJoystick';
import { safeDistance, safeToFixed, safeVelocity, safeAngularVelocity, safeVoltage, safePercentage } from '../utils/numberUtils';
import { logInfo, logWarn, logError } from '../utils/backendLogger';

interface RobotControlPageProps {
  robotData: RobotData;
  sensorData: SensorData;
  isConnected: boolean;
  onCommand: (command: string, params?: any) => void;
}

const RobotControlPage: React.FC<RobotControlPageProps> = ({
  robotData,
  sensorData,
  isConnected,
  onCommand
}) => {
  const [controlMode, setControlMode] = useState(0); // 0: Buttons, 1: Joystick, 2: Advanced Joystick
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'info'
  });

  // Enhanced command handler with logging and feedback
  const handleCommand = useCallback((command: string, params?: any) => {
    try {
      logInfo(`Sending robot command: ${command}`, 'RobotControl', params);
      onCommand(command, params);

      // Show success feedback for movement commands
      if (command === 'move' && params) {
        const { linear_x, linear_y, angular_z } = params;
        if (linear_x !== 0 || linear_y !== 0 || angular_z !== 0) {
          setSnackbar({
            open: true,
            message: `🎮 Moving: linear=(${linear_x.toFixed(2)}, ${linear_y.toFixed(2)}), angular=${angular_z.toFixed(2)}`,
            severity: 'info'
          });
        }
      } else if (command === 'stop') {
        setSnackbar({
          open: true,
          message: '⏹️ Robot stopped',
          severity: 'success'
        });
      } else if (command === 'navigate') {
        setSnackbar({
          open: true,
          message: '🏠 Returning home...',
          severity: 'info'
        });
      }
    } catch (error) {
      logError(`Error sending robot command: ${command}`, 'RobotControl', error);
      setSnackbar({
        open: true,
        message: `❌ Error sending command: ${command}`,
        severity: 'error'
      });
    }
  }, [onCommand]);

  // Handle joystick movement
  const handleJoystickMove = useCallback((position: { x: number; y: number }) => {
    // Convert joystick position to robot velocity
    const linearVel = position.y * 0.5; // Max 0.5 m/s forward/backward
    const angularVel = -position.x * 1.0; // Max 1.0 rad/s left/right

    handleCommand('move', {
      linear_x: linearVel,
      linear_y: 0,
      angular_z: angularVel
    });
  }, [handleCommand]);

  // Handle joystick stop
  const handleJoystickStop = useCallback(() => {
    handleCommand('stop');
  }, [handleCommand]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        🎮 Robot Control
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Manual control and movement commands
      </Typography>

      {/* Control Mode Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={controlMode} onChange={(_, newValue) => setControlMode(newValue)}>
          <Tab label="🔘 Button Control" />
          <Tab label="🎮 Basic Joystick" />
          <Tab label="🚀 Advanced Joystick" />
        </Tabs>
      </Box>

      <Grid container spacing={3}>
        
        {/* Main Control Panel */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {controlMode === 0 ? '🔘 Button Control' :
               controlMode === 1 ? '🎮 Basic Joystick' : '🚀 Advanced Joystick'}
            </Typography>

            {controlMode === 0 ? (
              <RobotControl
                onCommand={handleCommand}
                robotData={robotData}
                isConnected={isConnected}
              />
            ) : controlMode === 1 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '500px' }}>
                <VirtualJoystick
                  onMove={handleJoystickMove}
                  onStop={handleJoystickStop}
                  disabled={!isConnected}
                  size={250}
                  maxDistance={100}
                />
              </Box>
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <ContinuousJoystick
                  onMove={handleJoystickMove}
                  onStop={handleJoystickStop}
                  disabled={!isConnected}
                  size={220}
                  maxDistance={90}
                  continuousMode={true}
                  updateRate={20}
                />
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Robot Status */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Robot Status
            </Typography>
            
            {/* Position */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                📍 Position
              </Typography>
              <Typography variant="body1">
                X: {safeDistance(robotData.odom?.position?.x)}
              </Typography>
              <Typography variant="body1">
                Y: {safeDistance(robotData.odom?.position?.y)}
              </Typography>
              <Typography variant="body1">
                Z: {safeDistance(robotData.odom?.position?.z)}
              </Typography>
            </Box>

            {/* Orientation */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                🧭 Orientation
              </Typography>
              <Typography variant="body1">
                X: {safeToFixed(robotData.odom?.orientation?.x, 3)}
              </Typography>
              <Typography variant="body1">
                Y: {safeToFixed(robotData.odom?.orientation?.y, 3)}
              </Typography>
              <Typography variant="body1">
                Z: {safeToFixed(robotData.odom?.orientation?.z, 3)}
              </Typography>
              <Typography variant="body1">
                W: {safeToFixed(robotData.odom?.orientation?.w, 3, 1)}
              </Typography>
            </Box>

            {/* Velocity */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                🏃 Velocity
              </Typography>
              <Typography variant="body1">
                Linear X: {safeVelocity(robotData.odom?.linear_velocity?.x)}
              </Typography>
              <Typography variant="body1">
                Linear Y: {safeVelocity(robotData.odom?.linear_velocity?.y)}
              </Typography>
              <Typography variant="body1">
                Angular Z: {safeAngularVelocity(robotData.odom?.angular_velocity?.z)}
              </Typography>
            </Box>

            {/* Battery */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                🔋 Battery
              </Typography>
              <Typography variant="body1">
                Level: {safePercentage(robotData.battery?.percentage)}
              </Typography>
              <Typography variant="body1">
                Voltage: {safeVoltage(robotData.battery?.voltage)}
              </Typography>
            </Box>

            {/* Sensors */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                📡 Sensors
              </Typography>
              <Typography variant="body1">
                LiDAR Points: {sensorData.scan?.ranges?.filter(r => r !== null && r !== undefined).length || 0}
              </Typography>
              <Typography variant="body1">
                Ultrasonic: {Array.isArray(sensorData.ultrasonic) ?
                  sensorData.ultrasonic.map((u: any) => safeToFixed(u.distance, 2)).join(', ') :
                  sensorData.ultrasonic?.range ? safeToFixed(sensorData.ultrasonic.range, 2) : 'N/A'} cm
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* Emergency Controls */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, backgroundColor: '#ffebee' }}>
            <Typography variant="h6" gutterBottom color="error">
              🚨 Emergency Controls
            </Typography>
            <Grid container spacing={2}>
              <Grid item>
                <button 
                  onClick={() => onCommand('emergency_stop')}
                  style={{
                    padding: '15px 30px',
                    backgroundColor: '#f44336',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '18px',
                    fontWeight: 'bold'
                  }}
                >
                  🛑 EMERGENCY STOP
                </button>
              </Grid>
              <Grid item>
                <button 
                  onClick={() => handleCommand('stop')}
                  style={{
                    padding: '15px 30px',
                    backgroundColor: '#ff9800',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '18px'
                  }}
                >
                  ⏹️ Stop Movement
                </button>
              </Grid>
              <Grid item>
                <button 
                  onClick={() => handleCommand('navigate', { x: 0, y: 0, orientation_w: 1.0 })}
                  style={{
                    padding: '15px 30px',
                    backgroundColor: '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '18px'
                  }}
                >
                  🏠 Return Home
                </button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Control Instructions */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              📖 Control Instructions
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>
                  🎮 Manual Control:
                </Typography>
                <ul>
                  <li>Use arrow buttons for movement</li>
                  <li>Adjust speed with sliders</li>
                  <li>Emergency stop always available</li>
                  <li>Real-time feedback on robot status</li>
                </ul>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>
                  ⚠️ Safety Notes:
                </Typography>
                <ul>
                  <li>Always monitor robot surroundings</li>
                  <li>Use emergency stop if needed</li>
                  <li>Check battery level regularly</li>
                  <li>Ensure clear path before movement</li>
                </ul>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

      </Grid>

      {/* Snackbar for feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default RobotControlPage;
