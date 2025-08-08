import React, { useState, useEffect } from 'react';
import { Grid, Paper, Typography, Box, FormControl, Select, MenuItem, SelectChangeEvent } from '@mui/material';
import RealTimeChart from '../components/RealTimeChart';

interface DataPoint {
  timestamp: number;
  value: number;
}

interface ChartsPageProps {
  robotData?: any;
  sensorData?: any;
  systemData?: any;
}

const ChartsPage: React.FC<ChartsPageProps> = ({ robotData, sensorData, systemData }) => {
  // Chart data storage
  const [batteryData, setBatteryData] = useState<DataPoint[]>([]);
  const [cpuData, setCpuData] = useState<DataPoint[]>([]);
  const [memoryData, setMemoryData] = useState<DataPoint[]>([]);
  const [velocityData, setVelocityData] = useState<DataPoint[]>([]);
  const [lidarData, setLidarData] = useState<DataPoint[]>([]);
  const [updateInterval, setUpdateInterval] = useState<number>(1000); // ms

  // Real-time data updates from WebSocket
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now() / 1000;

      // Debug: Log received data
      console.log('📊 Charts Page Data:', {
        robotData: robotData,
        sensorData: sensorData,
        systemData: systemData
      });

      // Battery data - use real data from robotData, fallback to last known value
      setBatteryData(prev => {
        const newValue = robotData?.battery?.percentage;
        if (newValue !== undefined && newValue !== null) {
          return [...prev, { timestamp: now, value: Math.max(0, Math.min(100, newValue)) }].slice(-100);
        }
        // Keep last value if no new data
        return prev;
      });

      // CPU data - use real system data
      setCpuData(prev => {
        const newValue = systemData?.cpu_usage;
        if (newValue !== undefined && newValue !== null) {
          return [...prev, { timestamp: now, value: Math.max(0, Math.min(100, newValue)) }].slice(-100);
        }
        return prev;
      });

      // Memory data - use real system data
      setMemoryData(prev => {
        const newValue = systemData?.memory_usage;
        if (newValue !== undefined && newValue !== null) {
          return [...prev, { timestamp: now, value: Math.max(0, Math.min(100, newValue)) }].slice(-100);
        }
        return prev;
      });

      // Velocity data - use real robot velocity
      setVelocityData(prev => {
        const newValue = robotData?.odom?.linear_velocity?.x;
        if (newValue !== undefined && newValue !== null) {
          return [...prev, { timestamp: now, value: newValue }].slice(-100);
        }
        return prev;
      });

      // LiDAR data - use real sensor data
      setLidarData(prev => {
        const ranges = sensorData?.scan?.ranges;
        if (ranges && ranges.length > 0) {
          // Use front-facing LiDAR reading (middle of array)
          const frontIndex = Math.floor(ranges.length / 2);
          const newValue = ranges[frontIndex];
          if (newValue !== undefined && newValue !== null && newValue > 0.1) {
            return [...prev, { timestamp: now, value: newValue }].slice(-100);
          }
        }
        return prev;
      });

    }, updateInterval);

    return () => clearInterval(interval);
  }, [updateInterval, robotData, sensorData, systemData]);

  const handleIntervalChange = (event: SelectChangeEvent<number>) => {
    setUpdateInterval(event.target.value as number);
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Page Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          📊 Real-time Charts
        </Typography>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <Typography variant="caption" sx={{ mb: 1 }}>Update Interval</Typography>
          <Select value={updateInterval} onChange={handleIntervalChange}>
            <MenuItem value={500}>500ms</MenuItem>
            <MenuItem value={1000}>1 second</MenuItem>
            <MenuItem value={2000}>2 seconds</MenuItem>
            <MenuItem value={5000}>5 seconds</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Charts Grid */}
      <Grid container spacing={3}>
        {/* Battery Level Chart */}
        <Grid item xs={12} md={6}>
          <RealTimeChart
            title="🔋 Battery Level"
            data={batteryData}
            color="#4caf50"
            unit="%"
            min={0}
            max={100}
            height={250}
          />
        </Grid>

        {/* CPU Usage Chart */}
        <Grid item xs={12} md={6}>
          <RealTimeChart
            title="💻 CPU Usage"
            data={cpuData}
            color="#ff9800"
            unit="%"
            min={0}
            max={100}
            height={250}
          />
        </Grid>

        {/* Memory Usage Chart */}
        <Grid item xs={12} md={6}>
          <RealTimeChart
            title="🧠 Memory Usage"
            data={memoryData}
            color="#2196f3"
            unit="%"
            min={0}
            max={100}
            height={250}
          />
        </Grid>

        {/* Robot Velocity Chart */}
        <Grid item xs={12} md={6}>
          <RealTimeChart
            title="🚀 Robot Velocity"
            data={velocityData}
            color="#9c27b0"
            unit=" m/s"
            min={-1}
            max={1}
            height={250}
          />
        </Grid>

        {/* LiDAR Distance Chart */}
        <Grid item xs={12}>
          <RealTimeChart
            title="📡 LiDAR Front Distance"
            data={lidarData}
            color="#f44336"
            unit=" m"
            min={0}
            max={5}
            height={300}
          />
        </Grid>
      </Grid>

      {/* Chart Statistics */}
      <Paper sx={{ p: 2, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          📈 Chart Statistics
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'success.light', borderRadius: 1 }}>
              <Typography variant="h6" color="success.contrastText">
                {batteryData.length > 0 ? batteryData[batteryData.length - 1].value.toFixed(1) : '0'}%
              </Typography>
              <Typography variant="caption" color="success.contrastText">
                Current Battery
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'warning.light', borderRadius: 1 }}>
              <Typography variant="h6" color="warning.contrastText">
                {cpuData.length > 0 ? cpuData[cpuData.length - 1].value.toFixed(1) : '0'}%
              </Typography>
              <Typography variant="caption" color="warning.contrastText">
                Current CPU
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'info.light', borderRadius: 1 }}>
              <Typography variant="h6" color="info.contrastText">
                {memoryData.length > 0 ? memoryData[memoryData.length - 1].value.toFixed(1) : '0'}%
              </Typography>
              <Typography variant="caption" color="info.contrastText">
                Current Memory
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'error.light', borderRadius: 1 }}>
              <Typography variant="h6" color="error.contrastText">
                {lidarData.length > 0 ? lidarData[lidarData.length - 1].value.toFixed(2) : '0'}m
              </Typography>
              <Typography variant="caption" color="error.contrastText">
                Front Distance
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Chart Controls */}
      <Paper sx={{ p: 2, mt: 2 }}>
        <Typography variant="h6" gutterBottom>
          📋 Chart Information
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" gutterBottom>
              📊 Data Points
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Each chart displays up to 100 recent data points. Data is updated every {updateInterval}ms.
            </Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" gutterBottom>
              🎯 Interactions
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Use the time range selector on each chart to view different time periods. Charts auto-scroll to show latest data.
            </Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" gutterBottom>
              🔄 Real-time Updates
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Charts update automatically with live data from the robot sensors and system monitoring.
            </Typography>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default ChartsPage;
