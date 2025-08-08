import React, { useState, useEffect } from 'react';
import { 
  Grid, Paper, Typography, Box, LinearProgress, Chip, 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Alert, Card, CardContent
} from '@mui/material';
import { SystemData } from '../hooks/useWebSocket_simple';

interface SystemStatusPageProps {
  systemData: SystemData;
  isConnected: boolean;
}

interface NetworkInterface {
  name: string;
  ip: string;
  status: 'up' | 'down';
  bytes_sent: number;
  bytes_recv: number;
}

interface Process {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_percent: number;
  status: string;
}

const SystemStatusPage: React.FC<SystemStatusPageProps> = ({
  systemData,
  isConnected
}) => {
  const [networkInterfaces, setNetworkInterfaces] = useState<NetworkInterface[]>([]);
  const [topProcesses, setTopProcesses] = useState<Process[]>([]);

  useEffect(() => {
    // Debug: Log received system data
    console.log('🖥️ System Status Data:', systemData);

    // Use real network interfaces from systemData if available
    if (systemData?.network_interfaces) {
      const realInterfaces: NetworkInterface[] = Object.entries(systemData.network_interfaces).map(([name, data]: [string, any]) => ({
        name,
        ip: data.ip,
        status: (data.status === 'up' || data.status === 'down') ? data.status : 'down',
        bytes_sent: data.bytes_sent,
        bytes_recv: data.bytes_recv
      }));
      setNetworkInterfaces(realInterfaces);
    } else {
      // Fallback to basic interfaces if no real data
      const fallbackInterfaces: NetworkInterface[] = [
        {
          name: 'eth0',
          ip: 'No data',
          status: 'down' as const,
          bytes_sent: 0,
          bytes_recv: 0
        }
      ];
      setNetworkInterfaces(fallbackInterfaces);
    }

    // Use real ROS2 nodes from systemData if available
    if (systemData?.ros_nodes) {
      const realProcesses: Process[] = systemData.ros_nodes.map(node => ({
        pid: node.pid || 0,
        name: node.name,
        cpu_percent: node.cpu_usage,
        memory_percent: node.memory_usage,
        status: node.status
      }));
      setTopProcesses(realProcesses.sort((a, b) => b.cpu_percent - a.cpu_percent));
    } else {
      // Show message when no real data is available
      setTopProcesses([
        { pid: 0, name: 'No ROS2 nodes detected', cpu_percent: 0, memory_percent: 0, status: 'unknown' }
      ]);
    }
  }, [systemData]); // Update when systemData changes

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getHealthStatus = () => {
    const cpu = systemData.cpu_usage || 0;
    const memory = systemData.memory_usage || 0;
    const disk = systemData.disk_usage || 0;

    if (cpu > 80 || memory > 85 || disk > 90) return { status: 'critical', color: 'error' };
    if (cpu > 60 || memory > 70 || disk > 75) return { status: 'warning', color: 'warning' };
    return { status: 'healthy', color: 'success' };
  };

  const healthStatus = getHealthStatus();

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        💻 System Status
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Hardware and software system monitoring
      </Typography>

      {/* Overall Health */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12}>
          <Card sx={{ bgcolor: `${healthStatus.color}.light` }}>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h5" color={`${healthStatus.color}.contrastText`}>
                {healthStatus.status === 'healthy' ? '✅' : 
                 healthStatus.status === 'warning' ? '⚠️' : '❌'} 
                System Status: {healthStatus.status.toUpperCase()}
              </Typography>
              <Typography variant="body2" color={`${healthStatus.color}.contrastText`}>
                {isConnected ? 'Real-time monitoring active' : 'Monitoring offline'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Connection Status */}
      {!isConnected && (
        <Alert severity="error" sx={{ mb: 3 }}>
          🔴 System disconnected - Status information may be outdated
        </Alert>
      )}

      {/* System Resources */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              🖥️ CPU Usage
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                <LinearProgress 
                  variant="determinate" 
                  value={systemData.cpu_usage || 0}
                  color={systemData.cpu_usage && systemData.cpu_usage > 80 ? 'error' : 
                         systemData.cpu_usage && systemData.cpu_usage > 60 ? 'warning' : 'success'}
                  sx={{ height: 10, borderRadius: 5 }}
                />
              </Box>
              <Typography variant="h6" fontWeight="bold">
                {(systemData.cpu_usage || 0).toFixed(1)}%
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Cores: {systemData.cpu_cores || 'Unknown'}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              🧠 Memory Usage
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                <LinearProgress 
                  variant="determinate" 
                  value={systemData.memory_usage || 0}
                  color={systemData.memory_usage && systemData.memory_usage > 85 ? 'error' : 
                         systemData.memory_usage && systemData.memory_usage > 70 ? 'warning' : 'success'}
                  sx={{ height: 10, borderRadius: 5 }}
                />
              </Box>
              <Typography variant="h6" fontWeight="bold">
                {(systemData.memory_usage || 0).toFixed(1)}%
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {systemData.total_memory ? 
                `${formatBytes(systemData.total_memory)} total` : 'Unknown total'}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              💾 Disk Usage
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                <LinearProgress 
                  variant="determinate" 
                  value={systemData.disk_usage || 0}
                  color={systemData.disk_usage && systemData.disk_usage > 90 ? 'error' : 
                         systemData.disk_usage && systemData.disk_usage > 75 ? 'warning' : 'success'}
                  sx={{ height: 10, borderRadius: 5 }}
                />
              </Box>
              <Typography variant="h6" fontWeight="bold">
                {(systemData.disk_usage || 0).toFixed(1)}%
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Root filesystem
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* System Information */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              📋 System Information
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2"><strong>Operating System:</strong></Typography>
                <Typography variant="body2">Ubuntu 22.04 LTS</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2"><strong>Kernel:</strong></Typography>
                <Typography variant="body2">5.15.0-generic</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2"><strong>Architecture:</strong></Typography>
                <Typography variant="body2">x86_64</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2"><strong>Uptime:</strong></Typography>
                <Typography variant="body2">{systemData.uptime || 'Unknown'}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2"><strong>Load Average:</strong></Typography>
                <Typography variant="body2">{systemData.load_average || 'Unknown'}</Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              🤖 ROS2 Information
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2"><strong>ROS2 Distribution:</strong></Typography>
                <Typography variant="body2">Humble Hawksbill</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2"><strong>Python Version:</strong></Typography>
                <Typography variant="body2">3.10.x</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2"><strong>Active Nodes:</strong></Typography>
                <Typography variant="body2">
                  {systemData.ros_nodes ? systemData.ros_nodes.length : 0}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2"><strong>DDS Middleware:</strong></Typography>
                <Typography variant="body2">Fast-RTPS</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2"><strong>Domain ID:</strong></Typography>
                <Typography variant="body2">0</Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Network Interfaces */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              🌐 Network Interfaces
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Interface</TableCell>
                    <TableCell>IP Address</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Bytes Sent</TableCell>
                    <TableCell>Bytes Received</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {networkInterfaces.map((iface) => (
                    <TableRow key={iface.name}>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {iface.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">
                          {iface.ip}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={iface.status.toUpperCase()} 
                          size="small"
                          color={iface.status === 'up' ? 'success' : 'error'}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">
                          {formatBytes(iface.bytes_sent)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">
                          {formatBytes(iface.bytes_recv)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Top Processes */}
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              ⚡ Top Processes
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>PID</TableCell>
                    <TableCell>Process Name</TableCell>
                    <TableCell>CPU %</TableCell>
                    <TableCell>Memory %</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {topProcesses.slice(0, 8).map((process) => (
                    <TableRow key={process.pid}>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">
                          {process.pid}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {process.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">
                          {process.cpu_percent.toFixed(1)}%
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">
                          {process.memory_percent.toFixed(1)}%
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={process.status} 
                          size="small"
                          color="success"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default SystemStatusPage;
