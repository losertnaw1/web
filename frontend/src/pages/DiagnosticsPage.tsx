import React, { useState, useEffect } from 'react';
import { Grid, Paper, Typography, Box, LinearProgress, Chip, Alert } from '@mui/material';
import { SystemData } from '../hooks/useWebSocket_simple';

interface DiagnosticsPageProps {
  systemData: SystemData;
  isConnected: boolean;
}

interface DiagnosticItem {
  name: string;
  status: 'healthy' | 'warning' | 'error';
  value: string;
  description: string;
}

const DiagnosticsPage: React.FC<DiagnosticsPageProps> = ({
  systemData,
  isConnected
}) => {
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);

  useEffect(() => {
    // Generate diagnostic items based on system data
    const items: DiagnosticItem[] = [
      {
        name: 'CPU Usage',
        status: (systemData.cpu_usage || 0) > 80 ? 'error' : (systemData.cpu_usage || 0) > 60 ? 'warning' : 'healthy',
        value: `${(systemData.cpu_usage || 0).toFixed(1)}%`,
        description: 'System processor utilization'
      },
      {
        name: 'Memory Usage',
        status: (systemData.memory_usage || 0) > 85 ? 'error' : (systemData.memory_usage || 0) > 70 ? 'warning' : 'healthy',
        value: `${(systemData.memory_usage || 0).toFixed(1)}%`,
        description: 'System memory utilization'
      },
      {
        name: 'Disk Usage',
        status: (systemData.disk_usage || 0) > 90 ? 'error' : (systemData.disk_usage || 0) > 75 ? 'warning' : 'healthy',
        value: `${(systemData.disk_usage || 0).toFixed(1)}%`,
        description: 'Storage space utilization'
      },
      {
        name: 'Network Interface',
        status: systemData.network_interfaces && Object.keys(systemData.network_interfaces).length > 0 ? 'healthy' : 'warning',
        value: systemData.network_interfaces ? `${Object.keys(systemData.network_interfaces).length} active` : 'No data',
        description: 'Network connectivity status'
      },
      {
        name: 'ROS2 Nodes',
        status: systemData.ros_nodes && systemData.ros_nodes.length > 0 ? 'healthy' : 'error',
        value: systemData.ros_nodes ? `${systemData.ros_nodes.length} running` : '0 running',
        description: 'Active ROS2 node count'
      },
      {
        name: 'System Temperature',
        status: 'healthy', // Mock data
        value: '45°C',
        description: 'CPU temperature monitoring'
      }
    ];

    setDiagnostics(items);
  }, [systemData]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'success';
      case 'warning': return 'warning';
      case 'error': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      default: return '❓';
    }
  };

  const healthyCount = diagnostics.filter(d => d.status === 'healthy').length;
  const warningCount = diagnostics.filter(d => d.status === 'warning').length;
  const errorCount = diagnostics.filter(d => d.status === 'error').length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        🔍 System Diagnostics
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Real-time system health monitoring and performance analysis
      </Typography>

      {/* Overall Health Status */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              📊 Overall System Health
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
                  <Typography variant="h4" color="success.contrastText">
                    {healthyCount}
                  </Typography>
                  <Typography variant="body2" color="success.contrastText">
                    ✅ Healthy
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} md={3}>
                <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'warning.light', borderRadius: 1 }}>
                  <Typography variant="h4" color="warning.contrastText">
                    {warningCount}
                  </Typography>
                  <Typography variant="body2" color="warning.contrastText">
                    ⚠️ Warnings
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} md={3}>
                <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'error.light', borderRadius: 1 }}>
                  <Typography variant="h4" color="error.contrastText">
                    {errorCount}
                  </Typography>
                  <Typography variant="body2" color="error.contrastText">
                    ❌ Errors
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} md={3}>
                <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
                  <Typography variant="h4" color="info.contrastText">
                    {((healthyCount / diagnostics.length) * 100).toFixed(0)}%
                  </Typography>
                  <Typography variant="body2" color="info.contrastText">
                    📈 Health Score
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      {/* Connection Status Alert */}
      {!isConnected && (
        <Alert severity="error" sx={{ mb: 3 }}>
          🔴 System disconnected - Diagnostic data may be outdated
        </Alert>
      )}

      {/* Diagnostic Items */}
      <Grid container spacing={3}>
        {diagnostics.map((item, index) => (
          <Grid item xs={12} md={6} key={index}>
            <Paper sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  {getStatusIcon(item.status)} {item.name}
                </Typography>
                <Chip 
                  label={item.status.toUpperCase()} 
                  color={getStatusColor(item.status) as any}
                  size="small"
                />
              </Box>
              
              <Typography variant="h4" color={`${getStatusColor(item.status)}.main`} gutterBottom>
                {item.value}
              </Typography>
              
              <Typography variant="body2" color="text.secondary">
                {item.description}
              </Typography>

              {/* Progress bar for percentage values */}
              {item.value.includes('%') && (
                <Box sx={{ mt: 2 }}>
                  <LinearProgress 
                    variant="determinate" 
                    value={parseFloat(item.value)} 
                    color={getStatusColor(item.status) as any}
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                </Box>
              )}
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* System Information */}
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              💻 System Information
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body2">
                <strong>OS:</strong> Ubuntu 22.04 LTS
              </Typography>
              <Typography variant="body2">
                <strong>ROS2:</strong> Humble Hawksbill
              </Typography>
              <Typography variant="body2">
                <strong>Python:</strong> 3.10.x
              </Typography>
              <Typography variant="body2">
                <strong>Uptime:</strong> {systemData.uptime || 'Unknown'}
              </Typography>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              🔧 Hardware Status
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body2">
                <strong>CPU Cores:</strong> {systemData.cpu_cores || 'Unknown'}
              </Typography>
              <Typography variant="body2">
                <strong>Total Memory:</strong> {systemData.total_memory ? `${(systemData.total_memory / 1024 / 1024 / 1024).toFixed(1)} GB` : 'Unknown'}
              </Typography>
              <Typography variant="body2">
                <strong>Available Memory:</strong> {systemData.available_memory ? `${(systemData.available_memory / 1024 / 1024 / 1024).toFixed(1)} GB` : 'Unknown'}
              </Typography>
              <Typography variant="body2">
                <strong>Load Average:</strong> {systemData.load_average || 'Unknown'}
              </Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Diagnostic Actions */}
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12}>
          <Paper sx={{ p: 3, backgroundColor: '#f8f9fa' }}>
            <Typography variant="h6" gutterBottom>
              🛠️ Diagnostic Actions
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" gutterBottom>
                  🔄 System Maintenance:
                </Typography>
                <ul>
                  <li>Monitor resource usage trends</li>
                  <li>Check for system updates</li>
                  <li>Review log files for errors</li>
                  <li>Restart services if needed</li>
                </ul>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" gutterBottom>
                  ⚠️ Warning Resolution:
                </Typography>
                <ul>
                  <li>Investigate high resource usage</li>
                  <li>Free up disk space if needed</li>
                  <li>Check network connectivity</li>
                  <li>Verify ROS2 node health</li>
                </ul>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" gutterBottom>
                  🚨 Error Handling:
                </Typography>
                <ul>
                  <li>Restart failed services</li>
                  <li>Check hardware connections</li>
                  <li>Review system logs</li>
                  <li>Contact system administrator</li>
                </ul>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DiagnosticsPage;
