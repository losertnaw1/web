import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Paper, Typography, FormControl, Select, MenuItem,
  Button, Chip, TextField, IconButton, Tooltip, Tabs, Tab,
  Alert, CircularProgress
} from '@mui/material';
import { Download, Clear, Refresh, Search } from '@mui/icons-material';
import { getApiUrl } from '../config/config';

interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  source: string;
  message: string;
}

interface FrontendLogEntry {
  timestamp: string;
  level: string;
  component: string;
  message: string;
  id: number;
}

interface LogsPageProps {
  isConnected: boolean;
  systemData?: any; // Add systemData prop to receive real logs
}

const LogsPage: React.FC<LogsPageProps> = ({ isConnected, systemData }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [frontendLogs, setFrontendLogs] = useState<FrontendLogEntry[]>([]);
  const [filteredFrontendLogs, setFilteredFrontendLogs] = useState<FrontendLogEntry[]>([]);
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Helper function to convert ROS2 log level to string
  const getROS2LogLevel = (level: number): string => {
    // ROS2 log levels: DEBUG=10, INFO=20, WARN=30, ERROR=40, FATAL=50
    if (level >= 50) return 'FATAL';
    if (level >= 40) return 'ERROR';
    if (level >= 30) return 'WARN';
    if (level >= 20) return 'INFO';
    if (level >= 10) return 'DEBUG';
    return 'INFO'; // Default fallback
  };

  // Fetch frontend logs from backend
  const fetchFrontendLogs = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(getApiUrl('/api/logs'));
      if (!response.ok) {
        throw new Error(`Failed to fetch logs: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.status === 'success') {
        setFrontendLogs(data.logs || []);
      } else {
        setError(data.message || 'Failed to fetch logs');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Clear frontend logs
  const clearFrontendLogs = async () => {
    try {
      const response = await fetch(getApiUrl('/api/logs/clear'), { method: 'POST' });
      if (response.ok) {
        setFrontendLogs([]);
      }
    } catch (err) {
      setError('Failed to clear logs');
    }
  };

  // Real log data from systemData
  useEffect(() => {
    if (systemData?.logs && systemData.logs.length > 0) {
      // Convert ROS2 logs to LogEntry format
      const newLogs: LogEntry[] = systemData.logs.map((log: any) => ({
        timestamp: new Date(log.timestamp * 1000).toISOString(),
        level: getROS2LogLevel(log.level),
        source: log.name,
        message: log.msg
      }));

      // Add new logs and keep last 100
      setLogs(prev => {
        const combined = [...prev, ...newLogs];
        return combined.slice(-100);
      });
    }
  }, [systemData?.logs]);

  // Fallback: Generate sample logs only if no real data and connected
  useEffect(() => {
    if (!systemData?.logs && isConnected && logs.length === 0) {
      // Only generate sample logs if we have no real data
      const sampleLogs: LogEntry[] = [
        {
          timestamp: new Date().toISOString(),
          level: 'INFO',
          source: 'system',
          message: 'Web interface connected - waiting for ROS2 logs...'
        },
        {
          timestamp: new Date().toISOString(),
          level: 'WARN',
          source: 'system',
          message: 'No real log data available. Check ROS2 connection.'
        }
      ];
      setLogs(sampleLogs);
    }
  }, [isConnected, systemData?.logs, logs.length]);

  // Filter logs based on criteria
  useEffect(() => {
    let filtered = logs;

    // Level filter
    if (levelFilter !== 'ALL') {
      filtered = filtered.filter(log => log.level === levelFilter);
    }

    // Source filter
    if (sourceFilter !== 'ALL') {
      filtered = filtered.filter(log => log.source === sourceFilter);
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(log => 
        log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.source.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredLogs(filtered);
  }, [logs, levelFilter, sourceFilter, searchTerm]);

  // Filter frontend logs
  useEffect(() => {
    let filtered = frontendLogs;

    // Filter by level
    if (levelFilter !== 'ALL') {
      filtered = filtered.filter(log => log.level.toUpperCase() === levelFilter);
    }

    // Filter by source (component)
    if (sourceFilter !== 'ALL') {
      filtered = filtered.filter(log => log.component === sourceFilter);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.component.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredFrontendLogs(filtered);
  }, [frontendLogs, levelFilter, sourceFilter, searchTerm]);

  // Fetch frontend logs on component mount and tab change
  useEffect(() => {
    if (tabValue === 1) { // Frontend logs tab
      fetchFrontendLogs();
    }
  }, [tabValue]);

  // Auto scroll to bottom
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs, filteredFrontendLogs, autoScroll]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'DEBUG': return 'default';
      case 'INFO': return 'info';
      case 'WARN': return 'warning';
      case 'ERROR': return 'error';
      case 'FATAL': return 'error';
      default: return 'default';
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'DEBUG': return '🔍';
      case 'INFO': return 'ℹ️';
      case 'WARN': return '⚠️';
      case 'ERROR': return '❌';
      case 'FATAL': return '💀';
      default: return '📝';
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const exportLogs = () => {
    const logText = tabValue === 0
      ? filteredLogs.map(log =>
          `[${log.timestamp}] [${log.level}] [${log.source}] ${log.message}`
        ).join('\n')
      : filteredFrontendLogs.map(log =>
          `[${log.timestamp}] [${log.level}] [${log.component}] ${log.message}`
        ).join('\n');

    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tabValue === 0 ? 'ros' : 'frontend'}_logs_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const uniqueSources = tabValue === 0
    ? Array.from(new Set(logs.map(log => log.source)))
    : Array.from(new Set(frontendLogs.map(log => log.component)));

  return (
    <Box sx={{ p: 3, height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h4" gutterBottom>
        📋 System Logs
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Real-time log monitoring and analysis
      </Typography>

      {/* Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
          <Tab label="ROS Logs" />
          <Tab label="Frontend Logs" />
        </Tabs>
      </Paper>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Loading Indicator */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <CircularProgress size={24} />
        </Box>
      )}

      {/* Log Controls */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Level Filter */}
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Typography variant="caption">Level</Typography>
            <Select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
              <MenuItem value="ALL">All Levels</MenuItem>
              <MenuItem value="DEBUG">🔍 Debug</MenuItem>
              <MenuItem value="INFO">ℹ️ Info</MenuItem>
              <MenuItem value="WARN">⚠️ Warning</MenuItem>
              <MenuItem value="ERROR">❌ Error</MenuItem>
              <MenuItem value="FATAL">💀 Fatal</MenuItem>
            </Select>
          </FormControl>

          {/* Source Filter */}
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Typography variant="caption">Source</Typography>
            <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <MenuItem value="ALL">All Sources</MenuItem>
              {uniqueSources.map(source => (
                <MenuItem key={source} value={source}>{source}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Search */}
          <TextField
            size="small"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />
            }}
            sx={{ minWidth: 200 }}
          />

          {/* Actions */}
          <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
            <Tooltip title="Auto Scroll">
              <Button
                variant={autoScroll ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setAutoScroll(!autoScroll)}
              >
                📜
              </Button>
            </Tooltip>
            
            <Tooltip title="Refresh">
              <IconButton size="small" onClick={tabValue === 0 ? () => window.location.reload() : fetchFrontendLogs}>
                <Refresh />
              </IconButton>
            </Tooltip>

            <Tooltip title="Clear Logs">
              <IconButton size="small" onClick={tabValue === 0 ? clearLogs : clearFrontendLogs}>
                <Clear />
              </IconButton>
            </Tooltip>

            <Tooltip title="Export Logs">
              <IconButton size="small" onClick={exportLogs}>
                <Download />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Log Statistics */}
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          {tabValue === 0 ? (
            <>
              <Chip label={`Total: ${logs.length}`} size="small" />
              <Chip label={`Filtered: ${filteredLogs.length}`} size="small" />
              <Chip
                label={`Errors: ${logs.filter(l => l.level === 'ERROR' || l.level === 'FATAL').length}`}
                size="small"
                color="error"
              />
              <Chip
                label={`Warnings: ${logs.filter(l => l.level === 'WARN').length}`}
                size="small"
                color="warning"
              />
            </>
          ) : (
            <>
              <Chip label={`Total: ${frontendLogs.length}`} size="small" />
              <Chip label={`Filtered: ${filteredFrontendLogs.length}`} size="small" />
              <Chip
                label={`Errors: ${frontendLogs.filter(l => l.level.toLowerCase() === 'error').length}`}
                size="small"
                color="error"
              />
              <Chip
                label={`Warnings: ${frontendLogs.filter(l => l.level.toLowerCase() === 'warn').length}`}
                size="small"
                color="warning"
              />
            </>
          )}
          <Chip
            label={isConnected ? '🟢 Live' : '🔴 Offline'}
            size="small"
            color={isConnected ? 'success' : 'error'}
          />
        </Box>
      </Paper>

      {/* Log Display */}
      <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ 
          flex: 1, 
          overflow: 'auto', 
          p: 1,
          fontFamily: 'monospace',
          fontSize: '14px',
          backgroundColor: '#1e1e1e',
          color: '#ffffff'
        }}>
          {tabValue === 0 ? (
            // ROS Logs
            filteredLogs.length === 0 ? (
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'text.secondary'
              }}>
                <Typography>No ROS logs match the current filters</Typography>
              </Box>
            ) : (
              filteredLogs.map((log, index) => (
              <Box 
                key={index} 
                sx={{ 
                  display: 'flex', 
                  gap: 2, 
                  py: 0.5,
                  borderBottom: '1px solid #333',
                  '&:hover': { backgroundColor: '#2a2a2a' }
                }}
              >
                <Typography 
                  variant="caption" 
                  sx={{ 
                    minWidth: '180px', 
                    color: '#888',
                    fontFamily: 'monospace'
                  }}
                >
                  {new Date(log.timestamp).toLocaleString()}
                </Typography>
                
                <Chip
                  label={`${getLevelIcon(log.level)} ${log.level}`}
                  size="small"
                  color={getLevelColor(log.level) as any}
                  sx={{ minWidth: '80px', fontSize: '10px' }}
                />
                
                <Typography 
                  variant="caption" 
                  sx={{ 
                    minWidth: '100px',
                    color: '#4fc3f7',
                    fontFamily: 'monospace'
                  }}
                >
                  [{log.source}]
                </Typography>
                
                <Typography 
                  variant="body2" 
                  sx={{ 
                    flex: 1,
                    fontFamily: 'monospace',
                    color: log.level === 'ERROR' || log.level === 'FATAL' ? '#ff6b6b' :
                           log.level === 'WARN' ? '#ffd93d' : '#ffffff'
                  }}
                >
                  {log.message}
                </Typography>
              </Box>
            )))
          ) : (
            // Frontend Logs
            filteredFrontendLogs.length === 0 ? (
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'text.secondary'
              }}>
                <Typography>No frontend logs available. Try performing some actions in the frontend.</Typography>
              </Box>
            ) : (
              filteredFrontendLogs.map((log) => (
                <Box
                  key={log.id}
                  sx={{
                    display: 'flex',
                    gap: 2,
                    py: 0.5,
                    borderBottom: '1px solid #333',
                    '&:hover': { backgroundColor: '#2a2a2a' }
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      minWidth: '180px',
                      color: '#888',
                      fontFamily: 'monospace'
                    }}
                  >
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </Typography>
                  <Chip
                    label={log.level.toUpperCase()}
                    size="small"
                    color={getLevelColor(log.level.toUpperCase())}
                    sx={{ minWidth: '80px', fontSize: '11px' }}
                  />
                  <Chip
                    label={log.component}
                    size="small"
                    variant="outlined"
                    sx={{ minWidth: '100px', fontSize: '11px', color: '#aaa' }}
                  />
                  <Typography
                    sx={{
                      flex: 1,
                      fontFamily: 'monospace',
                      color: log.level.toLowerCase() === 'error' ? '#ff6b6b' :
                             log.level.toLowerCase() === 'warn' ? '#ffd93d' : '#ffffff'
                    }}
                  >
                    {log.message}
                  </Typography>
                </Box>
              ))
            )
          )}
          <div ref={logsEndRef} />
        </Box>
      </Paper>

      {/* Log Information */}
      <Paper sx={{ p: 2, mt: 2 }}>
        <Typography variant="h6" gutterBottom>
          📖 Log Information
        </Typography>
        <Box sx={{ display: 'flex', gap: 4, fontSize: '14px' }}>
          <Box>
            <Typography variant="subtitle2">Log Levels:</Typography>
            <ul>
              <li>🔍 DEBUG - Detailed diagnostic information</li>
              <li>ℹ️ INFO - General information messages</li>
              <li>⚠️ WARN - Warning messages</li>
              <li>❌ ERROR - Error conditions</li>
            </ul>
          </Box>
          <Box>
            <Typography variant="subtitle2">Log Sources:</Typography>
            <ul>
              <li>navigation - Path planning and movement</li>
              <li>perception - Sensor data processing</li>
              <li>control - Robot control systems</li>
              <li>system - System-level messages</li>
            </ul>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default LogsPage;
