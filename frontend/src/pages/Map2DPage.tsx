import React, { useState, useEffect, useCallback, useRef, use } from 'react';
import {
  Grid, Paper, Typography, Box, Button, FormControlLabel, Switch,
  Card, CardContent, Divider, Alert, Snackbar, IconButton, Tooltip, Collapse
} from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Refresh as RefreshIcon,
  ArrowUpward,
  ArrowDownward,
  ArrowBack,
  ArrowForward,
  Stop
} from '@mui/icons-material';
import { RobotData, SensorData } from '../hooks/useWebSocket_simple';
import MapViewer from '../components/MapViewer';
import { getApiUrl } from '../config/config';
import { logInfo, logWarn, logError } from '../utils/backendLogger';

interface Map2DPageProps {
  robotData: RobotData;
  sensorData: SensorData;
  isConnected: boolean;
  onCommand: (command: string, params?: any) => void;
}

const Map2DPage: React.FC<Map2DPageProps> = ({
  robotData,
  sensorData,
  isConnected,
  onCommand
}) => {
  const [showLidar, setShowLidar] = useState(false);  // Default LiDAR OFF
  const [showPath, setShowPath] = useState(true);
  const [showGoals, setShowGoals] = useState(true);
  const [autoCenter, setAutoCenter] = useState(true);

  // Switch states
  const [mapSource, setMapSource] = useState<'static_map' | 'dynamic_map'>('static_map');
  const [positionMode, setPositionMode] = useState<'receive_from_ros' | 'send_to_ros'>('receive_from_ros');
  const [runningMode, setRunningMode] = useState<'line_following' | 'slam_auto'>('line_following');

  // Robot control states
  const [linearSpeed, setLinearSpeed] = useState(0.2);
  const [angularSpeed, setAngularSpeed] = useState(0.5);
  const [isMoving, setIsMoving] = useState(false);

  // UI states
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' as 'success' | 'error' | 'info' });

  // Height state
  const mainRef = useRef(null);
  const [mainHeight, setMainHeight] = useState("auto");

  // Control collapse button
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (mainRef.current) {
      setMainHeight(mainRef.current.clientHeight + "px");
    }
  }, [mainRef]);

  // Load current switch states and map data on component mount
  useEffect(() => {
    loadSwitchStates();
    fetchMapData();
  }, []);

  // Fetch map data for this page
  const fetchMapData = async (forceRefresh = false) => {
    try {
      setLoading(true);
      logInfo(`${forceRefresh ? 'Force refreshing' : 'Fetching'} map data...`, 'Map2D');

      let response;
      if (forceRefresh) {
        // Use the refresh endpoint to force new map data
        response = await fetch(getApiUrl('/api/map/refresh'), { method: 'POST' });
      } else {
        // Use regular map endpoint
        response = await fetch(getApiUrl('/api/map'));
      }

      if (response.ok) {
        const result = await response.json();
        // logInfo('Map fetch response received', 'Map2D', result);

        if (result.status === 'success' && result.map) {
          // Trigger map update event for the WebSocket hook
          const mapUpdateEvent = new CustomEvent('mapDataUpdate', {
            detail: { map: result.map }
          });
          window.dispatchEvent(mapUpdateEvent);
          logInfo('Map data updated successfully', 'Map2D');

          setSnackbar({
            open: true,
            message: forceRefresh ? 'Map refreshed successfully!' : 'Map loaded successfully!',
            severity: 'success'
          });
        } else {
          logWarn('No map data available:', 'Map2D', result.message);
          setSnackbar({
            open: true,
            message: result.message || 'No map data available',
            severity: 'error'
          });
        }
      } else {
        logError(`Failed to fetch map: ${response.status} ${response.statusText}`, 'Map2D');
        setSnackbar({
          open: true,
          message: `Failed to fetch map: ${response.statusText}`,
          severity: 'error'
        });
      }
    } catch (error) {
      logError('Error fetching map:', 'Map2D', error);
      setSnackbar({
        open: true,
        message: `Error fetching map: ${error.message}`,
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSwitchStates = async () => {
    try {
      // Load map source
      const mapSourceResponse = await fetch(getApiUrl('/api/navigation/map-source'));
      if (mapSourceResponse.ok) {
        const mapSourceData = await mapSourceResponse.json();
        setMapSource(mapSourceData.current_source);
      }

      // Load position mode
      const positionModeResponse = await fetch(getApiUrl('/api/navigation/position-mode'));
      if (positionModeResponse.ok) {
        const positionModeData = await positionModeResponse.json();
        setPositionMode(positionModeData.current_mode);
      }

      // Load running mode
      const runningModeResponse = await fetch(getApiUrl('/api/robot/running-mode'));
      if (runningModeResponse.ok) {
        const runningModeData = await runningModeResponse.json();
        setRunningMode(runningModeData.current_mode);
      }
    } catch (error) {
      logError('Failed to load switch states:', 'Map2D', error);
    }
  };

  // Robot movement control functions (same as RobotControl component)
  const handleMove = useCallback((linear_x: number, linear_y: number, angular_z: number) => {
    if (!isConnected) {
      logInfo('Movement command ignored - not connected', 'Map2D-Control');
      return;
    }

    const moveParams = {
      linear_x: linear_x * linearSpeed,
      linear_y: linear_y * linearSpeed,
      angular_z: angular_z * angularSpeed
    };

    logInfo(`WASD movement command`, 'Map2D-Control', moveParams);
    onCommand('move', moveParams);
    setIsMoving(linear_x !== 0 || linear_y !== 0 || angular_z !== 0);
  }, [isConnected, linearSpeed, angularSpeed, onCommand]);

  const handleStop = useCallback(() => {
    logInfo('Stop command (WASD)', 'Map2D-Control');
    onCommand('move', { linear_x: 0, linear_y: 0, angular_z: 0 });
    setIsMoving(false);
  }, [onCommand]);

  // Keyboard event handling for WASD controls
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle WASD keys when connected and not typing in input fields
      if (!isConnected || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Prevent default behavior for WASD keys
      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key)) {
        event.preventDefault();

        switch (key) {
          case 'w': // Forward
            handleMove(1, 0, 0);
            break;
          case 's': // Backward
            handleMove(-1, 0, 0);
            break;
          case 'a': // Left
            handleMove(0, 1, 0);
            break;
          case 'd': // Right
            handleMove(0, -1, 0);
            break;
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      // Stop movement when WASD keys are released
      if (!isConnected || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key)) {
        event.preventDefault();
        handleStop();
      }
    };

    // Add event listeners
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [isConnected, handleMove, handleStop]);

  const handleMapClick = (x: number, y: number, theta?: number) => {
    const timestamp = new Date().toISOString();
    logInfo(`${timestamp} - Map clicked at (${x.toFixed(2)}, ${y.toFixed(2)})${theta !== undefined ? `, theta: ${theta.toFixed(3)}` : ''}`, 'Map2D');

    if (positionMode === 'send_to_ros') {
      // Send initial pose with direction
      const finalTheta = theta !== undefined ? theta : 0.0;
      logInfo(`Sending initial pose to (${x.toFixed(2)}, ${y.toFixed(2)}, ${finalTheta.toFixed(3)})`, 'Map2D');
      handleSetInitialPose(x, y, finalTheta);
    } else {
      // Send navigate command
      logInfo(`Sending navigate command with params:`, 'Map2D', { x, y, orientation_w: 1.0 });
      handleNavigateToGoal(x, y);
    }
  };

  const handleSetInitialPose = async (x: number, y: number, theta: number = 0.0) => {
    try {
      setLoading(true);
      const response = await fetch(getApiUrl('/api/navigation/set-initial-pose'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y, theta })
      });

      if (response.ok) {
        const result = await response.json();
        setSnackbar({
          open: true,
          message: `Initial pose set to (${x.toFixed(2)}, ${y.toFixed(2)})`,
          severity: 'success'
        });
        logInfo(`Initial pose set successfully to (${x.toFixed(2)}, ${y.toFixed(2)}, ${theta.toFixed(3)})`, 'Map2D');
      } else {
        throw new Error('Failed to set initial pose');
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'Failed to set initial pose',
        severity: 'error'
      });
      logError(`Error setting initial pose:`, 'Map2D', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToGoal = async (x: number, y: number, orientation_w: number = 1.0) => {
    try {
      setLoading(true);
      logInfo(`Sending navigation goal to (${x.toFixed(2)}, ${y.toFixed(2)})`, 'Map2D');

      const response = await fetch(getApiUrl('/api/navigation/navigate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y, orientation_w })
      });

      if (response.ok) {
        const result = await response.json();
        setSnackbar({
          open: true,
          message: `🎯 Navigation goal set to (${x.toFixed(2)}, ${y.toFixed(2)})`,
          severity: 'success'
        });
        logInfo(`✅ Navigation goal sent successfully to (${x.toFixed(2)}, ${y.toFixed(2)})`, 'Map2D');
      } else {
        setSnackbar({
          open: true,
          message: `❌ Failed to set navigation goal: ${response.statusText}`,
          severity: 'error'
        });
        logError(`Failed to set navigation goal: ${response.statusText}`, 'Map2D');
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: `❌ Error sending navigation goal: ${error.message}`,
        severity: 'error'
      });
      logError(`Error sending navigation goal:`, 'Map2D', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMapSourceSwitch = async (newSource: 'static_map' | 'dynamic_map') => {
    try {
      setLoading(true);
      const response = await fetch(getApiUrl('/api/navigation/map-source'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: newSource })
      });

      if (response.ok) {
        const result = await response.json();
        setMapSource(newSource);
        setSnackbar({
          open: true,
          message: `Map source switched to ${newSource === 'static_map' ? 'Static Map' : 'Dynamic Map'}`,
          severity: 'success'
        });
      } else {
        throw new Error('Failed to switch map source');
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'Failed to switch map source',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePositionModeSwitch = async (newMode: 'receive_from_ros' | 'send_to_ros') => {
    try {
      setLoading(true);
      const response = await fetch(getApiUrl('/api/navigation/position-mode'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode })
      });

      if (response.ok) {
        const result = await response.json();
        setPositionMode(newMode);
        setSnackbar({
          open: true,
          message: `Position mode switched to ${newMode === 'receive_from_ros' ? 'Receive from ROS' : 'Send to ROS'}`,
          severity: 'success'
        });
      } else {
        throw new Error('Failed to switch position mode');
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'Failed to switch position mode',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRunningModeSwitch = async (newMode: 'line_following' | 'slam_auto') => {
    try {
      setLoading(true);
      const response = await fetch(getApiUrl('/api/robot/running-mode'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode })
      });

      if (response.ok) {
        const result = await response.json();
        setRunningMode(newMode);
        setSnackbar({
          open: true,
          message: `Running mode switched to ${newMode === 'line_following' ? 'Line Following' : 'SLAM Auto'}`,
          severity: 'success'
        });
      } else {
        throw new Error('Failed to switch running mode');
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'Failed to switch running mode',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        🗺️ 2D Map View
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={9} mt={0}>
        {/* Main Map Display */}
        <Grid>
          <Paper ref={mainRef} sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Tooltip title="Force Refresh Map Data">
                <IconButton
                  onClick={() => fetchMapData(true)}
                  disabled={loading}
                  color="primary"
                >
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </Box>
            <MapViewer
              robotData={robotData}
              sensorData={sensorData}
              onMapClick={handleMapClick}
              showLidar={showLidar}
              isSettingInitialPose={positionMode === 'send_to_ros'}
            />

            {/* Embedded Robot Control - Bottom Right Corner */}
            <Paper
              sx={{
                position: 'fixed',
                bottom: 16,
                right: 16,
                p: 2,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(0, 0, 0, 0.1)',
                borderRadius: 2,
                minWidth: 200
              }}
            >
              {/* Header + nút thu gọn */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <Typography
                  variant="subtitle2"
                  gutterBottom
                  sx={{ textAlign: 'center', fontWeight: 'bold', m: 0 }}
                >
                  🎮 Robot Control (WASD)
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setCollapsed(prev => !prev)}
                >
                  {collapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
                </IconButton>
              </Box>

              {/* Visual WASD Layout - Non-interactive */}
              <Collapse in={!collapsed}>
                <Grid container spacing={0.5} sx={{ mb: 1 }}>
                  <Grid item xs={4}></Grid>
                  <Grid item xs={4}>
                    <IconButton
                      disabled={!isConnected}
                      color={isMoving ? "secondary" : "primary"}
                      size="small"
                      sx={{
                        width: '100%',
                        aspectRatio: '1',
                        border: '1px solid #ccc',
                        borderRadius: 1,
                        fontSize: '10px',
                        '&:disabled': { opacity: 0.5 }
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <ArrowUpward fontSize="small" />
                        <Typography variant="caption" sx={{ fontSize: '8px' }}>W</Typography>
                      </Box>
                    </IconButton>
                  </Grid>
                  <Grid item xs={4}></Grid>

                  <Grid item xs={4}>
                    <IconButton
                      disabled={!isConnected}
                      color={isMoving ? "secondary" : "primary"}
                      size="small"
                      sx={{
                        width: '100%',
                        aspectRatio: '1',
                        border: '1px solid #ccc',
                        borderRadius: 1,
                        fontSize: '10px',
                        '&:disabled': { opacity: 0.5 }
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <ArrowBack fontSize="small" />
                        <Typography variant="caption" sx={{ fontSize: '8px' }}>A</Typography>
                      </Box>
                    </IconButton>
                  </Grid>
                  <Grid item xs={4}>
                    <IconButton
                      onClick={handleStop}
                      disabled={!isConnected}
                      color="error"
                      size="small"
                      sx={{
                        width: '100%',
                        aspectRatio: '1',
                        border: '1px solid #ccc',
                        borderRadius: 1,
                        fontSize: '10px',
                        '&:disabled': { opacity: 0.5 }
                      }}
                    >
                      <Stop fontSize="small" />
                    </IconButton>
                  </Grid>
                  <Grid item xs={4}>
                    <IconButton
                      disabled={!isConnected}
                      color={isMoving ? "secondary" : "primary"}
                      size="small"
                      sx={{
                        width: '100%',
                        aspectRatio: '1',
                        border: '1px solid #ccc',
                        borderRadius: 1,
                        fontSize: '10px',
                        '&:disabled': { opacity: 0.5 }
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <ArrowForward fontSize="small" />
                        <Typography variant="caption" sx={{ fontSize: '8px' }}>D</Typography>
                      </Box>
                    </IconButton>
                  </Grid>

                  <Grid item xs={4}></Grid>
                  <Grid item xs={4}>
                    <IconButton
                      disabled={!isConnected}
                      color={isMoving ? "secondary" : "primary"}
                      size="small"
                      sx={{
                        width: '100%',
                        aspectRatio: '1',
                        border: '1px solid #ccc',
                        borderRadius: 1,
                        fontSize: '10px',
                        '&:disabled': { opacity: 0.5 }
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <ArrowDownward fontSize="small" />
                        <Typography variant="caption" sx={{ fontSize: '8px' }}>S</Typography>
                      </Box>
                    </IconButton>
                  </Grid>
                  <Grid item xs={4}></Grid>
                </Grid>

                <Typography variant="caption" sx={{
                  display: 'block',
                  textAlign: 'center',
                  color: isConnected ? 'text.secondary' : 'error.main',
                  fontSize: '10px'
                }}>
                  {isConnected ? 'Press WASD keys to move' : 'Not connected'}
                </Typography>
              </Collapse>
            </Paper>
          </Paper>
          </Grid>
        </Grid>

        {/* Map Controls */}
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 3, overflow: 'auto' , height: mainHeight }}>
            <Typography variant="h6" gutterBottom>
              🎛️ Map Controls
            </Typography>

            {/* System Switch Controls */}
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  🗺️ Map Data Source
                </Typography>
                <FormControlLabel
                  control={
                    <Switch
                      checked={mapSource === 'dynamic_map'}
                      onChange={(e) => handleMapSourceSwitch(e.target.checked ? 'dynamic_map' : 'static_map')}
                      disabled={loading}
                    />
                  }
                  label={mapSource === 'static_map' ? 'Static Map' : 'Dynamic Map'}
                />
                <Typography variant="caption" display="block" color="text.secondary">
                  {mapSource === 'static_map'
                    ? 'Using pre-built static map'
                    : 'Using real-time SLAM map'}
                </Typography>
              </CardContent>
            </Card>

            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  📍 Robot Position Mode
                </Typography>
                <FormControlLabel
                  control={
                    <Switch
                      checked={positionMode === 'send_to_ros'}
                      onChange={(e) => handlePositionModeSwitch(e.target.checked ? 'send_to_ros' : 'receive_from_ros')}
                      disabled={loading}
                    />
                  }
                  label={positionMode === 'receive_from_ros' ? 'Receive from ROS' : 'Send to ROS'}
                />
                <Typography variant="caption" display="block" color="text.secondary">
                  {positionMode === 'receive_from_ros'
                    ? 'Robot position updates from ROS'
                    : 'Click map to set initial pose'}
                </Typography>
                {positionMode === 'send_to_ros' && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    Click on the map to set robot initial position
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  🤖 Robot Running Mode
                </Typography>
                <FormControlLabel
                  control={
                    <Switch
                      checked={runningMode === 'slam_auto'}
                      onChange={(e) => handleRunningModeSwitch(e.target.checked ? 'slam_auto' : 'line_following')}
                      disabled={loading}
                    />
                  }
                  label={runningMode === 'line_following' ? 'Line Following' : 'SLAM Auto'}
                />
                <Typography variant="caption" display="block" color="text.secondary">
                  {runningMode === 'line_following'
                    ? 'Robot follows predefined paths'
                    : 'Autonomous navigation with SLAM'}
                </Typography>
              </CardContent>
            </Card>

            <Divider sx={{ my: 2 }} />

            {/* Existing Map Display Controls */}
            <Typography variant="subtitle1" gutterBottom>
              🎨 Display Options
            </Typography>
            
            {/* Display Options */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Display Options:
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={showLidar}
                    onChange={(e) => setShowLidar(e.target.checked)}
                  />
                }
                label="Show LiDAR Scan"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={showPath}
                    onChange={(e) => setShowPath(e.target.checked)}
                  />
                }
                label="Show Path"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={showGoals}
                    onChange={(e) => setShowGoals(e.target.checked)}
                  />
                }
                label="Show Goals"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={autoCenter}
                    onChange={(e) => setAutoCenter(e.target.checked)}
                  />
                }
                label="Auto Center on Robot"
              />
            </Box>

            {/* Quick Navigation */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Quick Navigation:
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => handleMapClick(0, 0)}
                  disabled={!isConnected}
                >
                  🏠 Go Home (0, 0)
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => handleMapClick(2, 2)}
                  disabled={!isConnected}
                >
                  📍 Point A (2, 2)
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => handleMapClick(-2, 2)}
                  disabled={!isConnected}
                >
                  📍 Point B (-2, 2)
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => handleMapClick(0, -2)}
                  disabled={!isConnected}
                >
                  📍 Point C (0, -2)
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  size="small"
                  onClick={() => onCommand('cancel_navigation')}
                  disabled={!isConnected}
                >
                  ❌ Cancel Goal
                </Button>
              </Box>
            </Box>

            {/* Robot Status */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Robot Status:
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="body2">
                  <strong>Position:</strong>
                </Typography>
                <Typography variant="caption" fontFamily="monospace">
                  X: {(robotData.pose?.position?.x || 0).toFixed(3)} m
                </Typography>
                <Typography variant="caption" fontFamily="monospace">
                  Y: {(robotData.pose?.position?.y || 0).toFixed(3)} m
                </Typography>
                <Typography variant="caption" fontFamily="monospace">
                  θ: {robotData.pose?.orientation ?
                    (Math.atan2(2 * (robotData.pose.orientation.w * robotData.pose.orientation.z),
                    1 - 2 * (robotData.pose.orientation.z ** 2)) * 180 / Math.PI).toFixed(1) : 0}°
                </Typography>
              </Box>
            </Box>

            {/* Map Information */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Map Information:
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="caption">
                  <strong>Resolution:</strong> 0.05 m/pixel
                </Typography>
                <Typography variant="caption">
                  <strong>Size:</strong> 100×100 pixels
                </Typography>
                <Typography variant="caption">
                  <strong>Area:</strong> 5×5 meters
                </Typography>
                <Typography variant="caption">
                  <strong>Origin:</strong> (-2.5, -2.5)
                </Typography>
              </Box>
            </Box>

            {/* Connection Status */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Connection:
              </Typography>
              <Typography 
                variant="body2" 
                color={isConnected ? 'success.main' : 'error.main'}
              >
                {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
              </Typography>
            </Box>

            {/* LiDAR Status */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                LiDAR Status:
              </Typography>
              <Typography 
                variant="body2" 
                color={sensorData.scan ? 'success.main' : 'error.main'}
              >
                {sensorData.scan ? 
                  `🟢 Active (${sensorData.scan.ranges.filter(r => r !== null).length} points)` : 
                  '🔴 No Data'}
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* Map Legend */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              🗂️ Map Legend & Instructions
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" gutterBottom>
                  🎨 Map Elements:
                </Typography>
                <ul>
                  <li><strong>🟢 Green Circle:</strong> Robot position</li>
                  <li><strong>🔵 Blue Line:</strong> Robot direction</li>
                  <li><strong>🟢 Green Dots:</strong> LiDAR scan points</li>
                  <li><strong>🟤 Brown Rectangles:</strong> Obstacles/walls</li>
                  <li><strong>⚪ White Areas:</strong> Free space</li>
                  <li><strong>🔲 Gray Areas:</strong> Unknown space</li>
                </ul>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" gutterBottom>
                  🖱️ Interaction:
                </Typography>
                <ul>
                  <li><strong>Click:</strong> Set navigation goal</li>
                  <li><strong>WASD Keys:</strong> Move robot directly</li>
                  <li><strong>Control Panel:</strong> Visual WASD in bottom-right</li>
                  <li><strong>Fullscreen:</strong> Open in fullscreen mode</li>
                </ul>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" gutterBottom>
                  ⚠️ Control Tips:
                </Typography>
                <ul>
                  <li><strong>WASD:</strong> W=Forward, S=Back, A=Left, D=Right</li>
                  <li><strong>Stop Button:</strong> Click red stop or release keys</li>
                  <li><strong>Navigation:</strong> Click on free (white) areas</li>
                  <li><strong>Manual Control:</strong> Use WASD for precise positioning</li>
                  <li><strong>Map Building:</strong> Move robot to explore areas</li>
                  <li>Monitor robot progress and avoid obstacles</li>
                </ul>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Map Statistics */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, backgroundColor: '#f8f9fa' }}>
            <Typography variant="h6" gutterBottom>
              📊 Map Statistics
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h4" color="success.main">
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
                  <Typography variant="h4" color="warning.main">
                    {sensorData.scan?.ranges.filter(r => r !== null && r >= 3.0).length || 0}
                  </Typography>
                  <Typography variant="body2">
                    Far Objects (&gt;3m)
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} md={3}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h4" color="primary.main">
                    {Math.sqrt(
                      Math.pow(robotData.pose?.position?.x || 0, 2) +
                      Math.pow(robotData.pose?.position?.y || 0, 2)
                    ).toFixed(1)}m
                  </Typography>
                  <Typography variant="body2">
                    Distance from Origin
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

      </Grid>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Map2DPage;
