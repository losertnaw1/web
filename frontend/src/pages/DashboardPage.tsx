import React from 'react';
import { Grid, Paper, Typography, Box, Card, CardContent, LinearProgress } from '@mui/material';
import { RobotData, SensorData, SystemData } from '../hooks/useWebSocket_simple';
import { safeNumber, safeToFixed, safeSpeed } from '../utils/numberUtils';
import { useI18n } from '../i18n/i18n';

interface DashboardPageProps {
  robotData: RobotData;
  sensorData: SensorData;
  systemData: SystemData;
  isConnected: boolean;
  onCommand: (command: string, params?: any) => void;
}

const DashboardPage: React.FC<DashboardPageProps> = ({
  robotData,
  sensorData,
  systemData,
  isConnected,
  onCommand
}) => {
  const { t } = useI18n();
  // Calculate some quick stats
  const batteryLevel = safeNumber(robotData.battery?.percentage);
  const speed = robotData.odom ?
    safeSpeed(robotData.odom.linear_velocity?.x, robotData.odom.linear_velocity?.y) : 0;
  const lidarPoints = sensorData.scan?.ranges?.filter(r => r !== null && r !== undefined).length || 0;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        🎮 {t('dashboard.title', 'Dashboard')}
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        {t('dashboard.subtitle', 'Quick overview and essential controls')}
      </Typography>

      <Grid container spacing={3}>
        
        {/* Quick Stats Cards */}
        <Grid item xs={12}>
          <Grid container spacing={2}>
            
            {/* Battery Status */}
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    🔋 {t('dashboard.battery', 'Battery')}
                  </Typography>
                  <Typography variant="h4" color={batteryLevel > 20 ? 'success.main' : 'error.main'}>
                    {batteryLevel.toFixed(0)}%
                  </Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={batteryLevel} 
                    color={batteryLevel > 25 ? 'success' : 'error'}
                    sx={{ mt: 1 }}
                  />
                </CardContent>
              </Card>
            </Grid>

            {/* Speed */}
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    🏃 {t('dashboard.speed', 'Speed')}
                  </Typography>
                  <Typography variant="h4" color="primary.main">
                    {speed.toFixed(2)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    m/s
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Position */}
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    📍 {t('dashboard.position', 'Position')}
                  </Typography>
                  <Typography variant="body1">
                    X: {(robotData.odom?.position?.x || 0).toFixed(2)}
                  </Typography>
                  <Typography variant="body1">
                    Y: {(robotData.odom?.position?.y || 0).toFixed(2)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* LiDAR */}
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    📡 {t('dashboard.lidar', 'LiDAR')}
                  </Typography>
                  <Typography variant="h4" color="info.main">
                    {lidarPoints}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('dashboard.lidar_points', 'points detected')}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

          </Grid>
        </Grid>

        {/* Robot Status Summary */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '400px' }}>
            <Typography variant="h6" gutterBottom>
              🤖 {t('dashboard.robot_status', 'Robot Status')}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  📍 {t('dashboard.current_position', 'Current Position')}
                </Typography>
                <Typography variant="body1">
                  X: {safeToFixed(robotData.odom?.position?.x, 2)} m
                </Typography>
                <Typography variant="body1">
                  Y: {safeToFixed(robotData.odom?.position?.y, 2)} m
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  🏃 {t('dashboard.movement', 'Movement')}
                </Typography>
                <Typography variant="body1">
                  {t('dashboard.speed_label', 'Speed')}: {speed.toFixed(2)} m/s
                </Typography>
                <Typography variant="body1">
                  {t('dashboard.status', 'Status')}: {speed > 0.01 ? t('dashboard.moving', '🟢 Moving') : t('dashboard.stopped', '⏸️ Stopped')}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  🔋 {t('dashboard.power', 'Power')}
                </Typography>
                <Typography variant="body1" color={batteryLevel > 20 ? 'success.main' : 'error.main'}>
                  Battery: {batteryLevel.toFixed(0)}%
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Navigation Summary */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '400px' }}>
            <Typography variant="h6" gutterBottom>
              🧭 {t('dashboard.nav_status', 'Navigation Status')}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  📍 {t('dashboard.current_goal', 'Current Goal')}
                </Typography>
                <Typography variant="body1">
                  {t('dashboard.goal_status', 'Status')}: {t('dashboard.no_active_goal', 'No active goal')}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  🗺️ {t('dashboard.map_status', 'Map Status')}
                </Typography>
                <Typography variant="body1" color={sensorData.map ? 'success.main' : 'error.main'}>
                  {sensorData.map ? t('dashboard.map_loaded', '🟢 Map loaded') : t('dashboard.no_map', '🔴 No map')}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  🎯 {t('dashboard.path_planning', 'Path Planning')}
                </Typography>
                <Typography variant="body1">
                  {t('dashboard.ready_for_nav', 'Ready for navigation')}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* System Health */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '400px' }}>
            <Typography variant="h6" gutterBottom>
              ⚙️ {t('dashboard.system_health', 'System Health')}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  🔗 {t('dashboard.connections', 'Connections')}
                </Typography>
                <Typography variant="body1" color={isConnected ? 'success.main' : 'error.main'}>
                  WebSocket: {isConnected ? t('status.connected', '🟢 Connected') : t('status.disconnected', '🔴 Disconnected')}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  🤖 {t('dashboard.ros_nodes', 'ROS Nodes')}
                </Typography>
                <Typography variant="body1" color={systemData?.node_status ? 'success.main' : 'warning.main'}>
                  {t('dashboard.active_nodes', 'Active')}: {Object.keys(systemData?.node_status || {}).length} {t('dashboard.nodes', 'nodes')}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  📊 {t('dashboard.diagnostics', 'Diagnostics')}
                </Typography>
                <Typography variant="body1" color={systemData?.diagnostics ? 'success.main' : 'warning.main'}>
                  {systemData?.diagnostics ? t('dashboard.all_ok', '🟢 All systems OK') : t('dashboard.no_diag', '🟡 No diagnostics')}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Quick Actions */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              ⚡ {t('dashboard.quick_actions', 'Quick Actions')}
            </Typography>
            <Grid container spacing={2}>
              <Grid item>
                <button 
                  className="btn btn-danger"
                  onClick={() => onCommand('emergency_stop')}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#f44336',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  {t('dashboard.emergency_stop', '🛑 Emergency Stop')}
                </button>
              </Grid>
              <Grid item>
                <button 
                  className="btn btn-primary"
                  onClick={() => onCommand('navigate', { x: 0, y: 0, orientation_w: 1.0 })}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#2196f3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  {t('dashboard.go_home', '🏠 Go Home')}
                </button>
              </Grid>
              <Grid item>
                <button 
                  className="btn btn-success"
                  onClick={() => onCommand('start_navigation')}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  {t('dashboard.start_nav', '🚀 Start Navigation')}
                </button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* System Overview */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              📊 {t('dashboard.system_overview', 'System Overview')}
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h6" color={isConnected ? 'success.main' : 'error.main'}>
                    {isConnected ? '🟢' : '🔴'}
                  </Typography>
                  <Typography variant="body2">
                    {t('dashboard.websocket_conn', 'WebSocket Connection')}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h6" color={systemData?.node_status ? 'success.main' : 'warning.main'}>
                    {systemData?.node_status ? '🟢' : '🟡'}
                  </Typography>
                  <Typography variant="body2">
                    {t('dashboard.ros_nodes_count', 'ROS Nodes')} ({Object.keys(systemData?.node_status || {}).length})
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h6" color={sensorData.scan ? 'success.main' : 'error.main'}>
                    {sensorData.scan ? '🟢' : '🔴'}
                  </Typography>
                  <Typography variant="body2">
                    {t('dashboard.lidar_sensor', 'LiDAR Sensor')}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h6" color={robotData.odom ? 'success.main' : 'error.main'}>
                    {robotData.odom ? '🟢' : '🔴'}
                  </Typography>
                  <Typography variant="body2">
                    {t('dashboard.odometry', 'Odometry')}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

      </Grid>
    </Box>
  );
};

export default DashboardPage;
