import React, { useState } from 'react';
import {
  Box,
  Button,
  Grid,
  Typography,
  Slider,
  Paper,
  IconButton,
  Chip,
  Alert
} from '@mui/material';
import {
  ArrowUpward,
  ArrowDownward,
  ArrowBack,
  ArrowForward,
  RotateLeft,
  RotateRight,
  Stop,
  Home,
  PlayArrow,
  Pause
} from '@mui/icons-material';
import { RobotData } from '../hooks/useWebSocket_simple';
import { safeNumber, safeToFixed, safeSpeed } from '../utils/numberUtils';
import { logInfo } from '../utils/backendLogger';

interface RobotControlProps {
  onCommand: (command: string, params?: any) => void;
  robotData: RobotData;
  isConnected: boolean;
}

const RobotControl: React.FC<RobotControlProps> = ({ onCommand, robotData, isConnected }) => {
  const [linearSpeed, setLinearSpeed] = useState(0.2);
  const [angularSpeed, setAngularSpeed] = useState(0.5);
  const [isMoving, setIsMoving] = useState(false);

  const handleMove = (linear_x: number, linear_y: number, angular_z: number) => {
    if (!isConnected) {
      logInfo('Movement command ignored - not connected', 'RobotControl');
      return;
    }

    const moveParams = {
      linear_x: linear_x * linearSpeed,
      linear_y: linear_y * linearSpeed,
      angular_z: angular_z * angularSpeed
    };

    logInfo(`Button movement command`, 'RobotControl', moveParams);
    onCommand('move', moveParams);
    setIsMoving(linear_x !== 0 || linear_y !== 0 || angular_z !== 0);
  };

  const handleStop = () => {
    logInfo('Stop button pressed', 'RobotControl');
    onCommand('move', { linear_x: 0, linear_y: 0, angular_z: 0 });
    setIsMoving(false);
  };

  const handleHome = () => {
    logInfo('Home button pressed', 'RobotControl');
    onCommand('navigate', { x: 0, y: 0, orientation_w: 1.0 });
  };

  const handleSetInitialPose = () => {
    onCommand('set_initial_pose', { x: 0, y: 0, orientation_w: 1.0 });
  };

  // Calculate robot speed from odometry
  const currentSpeed = robotData.odom ?
    safeSpeed(robotData.odom.linear_velocity?.x, robotData.odom.linear_velocity?.y) : 0;

  const currentAngularSpeed = robotData.odom ?
    Math.abs(safeNumber(robotData.odom.angular_velocity?.z)) : 0;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* Connection Status */}
      {!isConnected && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Robot not connected
        </Alert>
      )}

      {/* Robot Status */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Robot Status
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip 
            label={isConnected ? "Connected" : "Disconnected"} 
            color={isConnected ? "success" : "error"} 
            size="small" 
          />
          <Chip 
            label={isMoving ? "Moving" : "Stopped"} 
            color={isMoving ? "warning" : "default"} 
            size="small" 
          />
          {robotData.battery && (
            <Chip
              label={`Battery: ${safeToFixed(robotData.battery.percentage, 0)}%`}
              color={safeNumber(robotData.battery.percentage) > 20 ? "success" : "error"}
              size="small"
            />
          )}
        </Box>
      </Box>

      {/* Speed Controls */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Speed Settings
        </Typography>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" gutterBottom>
            Linear Speed: {linearSpeed.toFixed(1)} m/s
          </Typography>
          <Slider
            value={linearSpeed}
            onChange={(_, value) => setLinearSpeed(value as number)}
            min={0.1}
            max={1.0}
            step={0.1}
            disabled={!isConnected}
            size="small"
          />
        </Box>
        <Box>
          <Typography variant="body2" gutterBottom>
            Angular Speed: {angularSpeed.toFixed(1)} rad/s
          </Typography>
          <Slider
            value={angularSpeed}
            onChange={(_, value) => setAngularSpeed(value as number)}
            min={0.1}
            max={2.0}
            step={0.1}
            disabled={!isConnected}
            size="small"
          />
        </Box>
      </Paper>

      {/* Movement Controls */}
      <Paper sx={{ p: 2, mb: 2, flexGrow: 1 }}>
        <Typography variant="subtitle2" gutterBottom>
          Movement Control
        </Typography>
        
        {/* Directional Pad */}
        <Grid container spacing={1} sx={{ mb: 2 }}>
          <Grid item xs={4}></Grid>
          <Grid item xs={4}>
            <IconButton
              onMouseDown={() => handleMove(1, 0, 0)}
              onMouseUp={handleStop}
              onMouseLeave={handleStop}
              disabled={!isConnected}
              color="primary"
              size="large"
            >
              <ArrowUpward />
            </IconButton>
          </Grid>
          <Grid item xs={4}></Grid>
          
          <Grid item xs={4}>
            <IconButton
              onMouseDown={() => handleMove(0, 1, 0)}
              onMouseUp={handleStop}
              onMouseLeave={handleStop}
              disabled={!isConnected}
              color="primary"
              size="large"
            >
              <ArrowBack />
            </IconButton>
          </Grid>
          <Grid item xs={4}>
            <IconButton
              onClick={handleStop}
              disabled={!isConnected}
              color="error"
              size="large"
            >
              <Stop />
            </IconButton>
          </Grid>
          <Grid item xs={4}>
            <IconButton
              onMouseDown={() => handleMove(0, -1, 0)}
              onMouseUp={handleStop}
              onMouseLeave={handleStop}
              disabled={!isConnected}
              color="primary"
              size="large"
            >
              <ArrowForward />
            </IconButton>
          </Grid>
          
          <Grid item xs={4}>
            <IconButton
              onMouseDown={() => handleMove(0, 0, 1)}
              onMouseUp={handleStop}
              onMouseLeave={handleStop}
              disabled={!isConnected}
              color="secondary"
              size="large"
            >
              <RotateLeft />
            </IconButton>
          </Grid>
          <Grid item xs={4}>
            <IconButton
              onMouseDown={() => handleMove(-1, 0, 0)}
              onMouseUp={handleStop}
              onMouseLeave={handleStop}
              disabled={!isConnected}
              color="primary"
              size="large"
            >
              <ArrowDownward />
            </IconButton>
          </Grid>
          <Grid item xs={4}>
            <IconButton
              onMouseDown={() => handleMove(0, 0, -1)}
              onMouseUp={handleStop}
              onMouseLeave={handleStop}
              disabled={!isConnected}
              color="secondary"
              size="large"
            >
              <RotateRight />
            </IconButton>
          </Grid>
        </Grid>

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            color="error"
            startIcon={<Stop />}
            onClick={handleStop}
            disabled={!isConnected}
            size="small"
          >
            Stop
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Home />}
            onClick={handleHome}
            disabled={!isConnected}
            size="small"
          >
            Home
          </Button>
          <Button
            variant="outlined"
            onClick={handleSetInitialPose}
            disabled={!isConnected}
            size="small"
          >
            Set Pose
          </Button>
        </Box>
      </Paper>

      {/* Current Speed Display */}
      <Paper sx={{ p: 1 }}>
        <Typography variant="caption" display="block">
          Current Speed: {currentSpeed.toFixed(2)} m/s
        </Typography>
        <Typography variant="caption" display="block">
          Angular: {currentAngularSpeed.toFixed(2)} rad/s
        </Typography>
      </Paper>
    </Box>
  );
};

export default RobotControl;
