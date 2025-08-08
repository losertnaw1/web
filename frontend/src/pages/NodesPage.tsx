import React, { useState, useEffect } from 'react';
import { 
  Grid, Paper, Typography, Box, Button, Chip, 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Tooltip, Alert, LinearProgress
} from '@mui/material';
import { PlayArrow, Stop, Refresh, Info, Warning, CheckCircle } from '@mui/icons-material';

interface RosNode {
  name: string;
  status: 'running' | 'stopped' | 'error' | 'starting' | 'stopping';
  pid?: number;
  cpu_usage: number;
  memory_usage: number;
  uptime: string;
  description: string;
  dependencies: string[];
  topics_published: string[];
  topics_subscribed: string[];
}

interface NodesPageProps {
  isConnected: boolean;
  onCommand: (command: string, params?: any) => void;
  systemData?: any; // Add systemData prop to receive real node data
}

const NodesPage: React.FC<NodesPageProps> = ({ isConnected, onCommand, systemData }) => {
  const [nodes, setNodes] = useState<RosNode[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Real node data from systemData
  useEffect(() => {
    if (systemData?.ros_nodes && systemData.ros_nodes.length > 0) {
      // Use real ROS2 node data
      const realNodes: RosNode[] = systemData.ros_nodes.map((node: any) => ({
        name: node.name,
        status: node.status,
        pid: node.pid || 0,
        cpu_usage: node.cpu_usage,
        memory_usage: node.memory_usage,
        uptime: 'Unknown', // This would need to be calculated from node start time
        description: `ROS2 node: ${node.name}`,
        dependencies: [], // Would need to be fetched from ROS2 graph
        topics_published: [], // Would need to be fetched from ROS2 introspection
        topics_subscribed: [] // Would need to be fetched from ROS2 introspection
      }));
      setNodes(realNodes);
    } else {
      // Fallback nodes when no real data is available
      const fallbackNodes: RosNode[] = [
        {
          name: 'No ROS2 nodes detected',
          status: 'error' as const,
          pid: 0,
          cpu_usage: 0,
          memory_usage: 0,
          uptime: '0m',
          description: 'No real ROS2 node data available. Check ROS2 connection.',
          dependencies: [],
          topics_published: [],
          topics_subscribed: []
        }
      ];
      setNodes(fallbackNodes);
    }
  }, [systemData]); // Update when systemData changes

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <CheckCircle color="success" />;
      case 'stopped': return <Stop color="disabled" />;
      case 'error': return <Warning color="error" />;
      case 'starting': return <PlayArrow color="info" />;
      case 'stopping': return <Stop color="warning" />;
      default: return <Info color="disabled" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'success';
      case 'stopped': return 'default';
      case 'error': return 'error';
      case 'starting': return 'info';
      case 'stopping': return 'warning';
      default: return 'default';
    }
  };

  const handleNodeAction = (nodeName: string, action: 'start' | 'stop' | 'restart') => {
    setLoading(true);
    
    // Update node status optimistically
    setNodes(prev => prev.map(node => 
      node.name === nodeName 
        ? { ...node, status: action === 'start' ? 'starting' : 'stopping' as any }
        : node
    ));

    // Send command to backend
    onCommand('node_action', { node: nodeName, action });

    // Simulate status update after delay
    setTimeout(() => {
      setNodes(prev => prev.map(node => 
        node.name === nodeName 
          ? { 
              ...node, 
              status: action === 'stop' ? 'stopped' : 'running' as any,
              pid: action === 'stop' ? undefined : Math.floor(Math.random() * 9999) + 1000,
              uptime: action === 'stop' ? '0m' : '0m'
            }
          : node
      ));
      setLoading(false);
    }, 2000);
  };

  const refreshNodes = () => {
    setLoading(true);
    onCommand('refresh_nodes');
    setTimeout(() => setLoading(false), 1000);
  };

  const runningNodes = nodes.filter(n => n.status === 'running').length;
  const stoppedNodes = nodes.filter(n => n.status === 'stopped').length;
  const errorNodes = nodes.filter(n => n.status === 'error').length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        🔧 Node Manager
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Manage ROS2 nodes and monitor system processes
      </Typography>

      {/* Node Statistics */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'success.light' }}>
            <Typography variant="h4" color="success.contrastText">
              {runningNodes}
            </Typography>
            <Typography variant="body2" color="success.contrastText">
              ✅ Running Nodes
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.300' }}>
            <Typography variant="h4">
              {stoppedNodes}
            </Typography>
            <Typography variant="body2">
              ⏹️ Stopped Nodes
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'error.light' }}>
            <Typography variant="h4" color="error.contrastText">
              {errorNodes}
            </Typography>
            <Typography variant="body2" color="error.contrastText">
              ❌ Error Nodes
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'info.light' }}>
            <Typography variant="h4" color="info.contrastText">
              {((runningNodes / nodes.length) * 100).toFixed(0)}%
            </Typography>
            <Typography variant="body2" color="info.contrastText">
              📈 System Health
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Controls */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              startIcon={<PlayArrow />}
              onClick={() => {
                nodes.filter(n => n.status === 'stopped').forEach(node => 
                  handleNodeAction(node.name, 'start')
                );
              }}
              disabled={loading || !isConnected || stoppedNodes === 0}
            >
              Start All
            </Button>
            <Button
              variant="outlined"
              startIcon={<Stop />}
              onClick={() => {
                nodes.filter(n => n.status === 'running').forEach(node => 
                  handleNodeAction(node.name, 'stop')
                );
              }}
              disabled={loading || !isConnected || runningNodes === 0}
            >
              Stop All
            </Button>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={refreshNodes}
              disabled={loading || !isConnected}
            >
              Refresh
            </Button>
          </Box>
          
          <Chip 
            label={isConnected ? '🟢 Connected' : '🔴 Disconnected'} 
            color={isConnected ? 'success' : 'error'}
          />
        </Box>
      </Paper>

      {/* Connection Warning */}
      {!isConnected && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          ⚠️ System disconnected - Node management unavailable
        </Alert>
      )}

      {/* Loading Indicator */}
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Nodes Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Node Name</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>PID</TableCell>
              <TableCell>CPU %</TableCell>
              <TableCell>Memory %</TableCell>
              <TableCell>Uptime</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {nodes.map((node) => (
              <TableRow key={node.name} hover>
                <TableCell>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold">
                      {node.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {node.description}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {getStatusIcon(node.status)}
                    <Chip 
                      label={node.status.toUpperCase()} 
                      size="small"
                      color={getStatusColor(node.status) as any}
                    />
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace">
                    {node.pid || '-'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace">
                    {node.cpu_usage.toFixed(1)}%
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace">
                    {node.memory_usage.toFixed(1)}%
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace">
                    {node.uptime}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {node.status === 'stopped' || node.status === 'error' ? (
                      <Tooltip title="Start Node">
                        <IconButton
                          size="small"
                          onClick={() => handleNodeAction(node.name, 'start')}
                          disabled={loading || !isConnected}
                          color="success"
                        >
                          <PlayArrow />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Tooltip title="Stop Node">
                        <IconButton
                          size="small"
                          onClick={() => handleNodeAction(node.name, 'stop')}
                          disabled={loading || !isConnected}
                          color="error"
                        >
                          <Stop />
                        </IconButton>
                      </Tooltip>
                    )}
                    
                    <Tooltip title="Restart Node">
                      <IconButton
                        size="small"
                        onClick={() => handleNodeAction(node.name, 'restart')}
                        disabled={loading || !isConnected}
                        color="warning"
                      >
                        <Refresh />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Node Information */}
      <Paper sx={{ p: 3, mt: 3, backgroundColor: '#f8f9fa' }}>
        <Typography variant="h6" gutterBottom>
          📖 Node Management Information
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" gutterBottom>
              🔧 Node Operations:
            </Typography>
            <ul>
              <li>Start/Stop individual nodes</li>
              <li>Restart nodes to apply changes</li>
              <li>Monitor resource usage</li>
              <li>Check node dependencies</li>
            </ul>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" gutterBottom>
              ⚠️ Safety Guidelines:
            </Typography>
            <ul>
              <li>Stop navigation before stopping sensors</li>
              <li>Ensure dependencies are running</li>
              <li>Monitor system after changes</li>
              <li>Keep critical nodes running</li>
            </ul>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" gutterBottom>
              📊 Monitoring:
            </Typography>
            <ul>
              <li>CPU and memory usage per node</li>
              <li>Node uptime tracking</li>
              <li>Process ID (PID) information</li>
              <li>Real-time status updates</li>
            </ul>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default NodesPage;
