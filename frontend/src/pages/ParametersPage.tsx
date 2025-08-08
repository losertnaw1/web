import React, { useState, useEffect } from 'react';
import { 
  Grid, Paper, Typography, Box, TextField, Button, 
  FormControl, Select, MenuItem, Chip, Alert, Accordion,
  AccordionSummary, AccordionDetails, Switch, FormControlLabel
} from '@mui/material';
import { ExpandMore, Save, Refresh, RestoreFromTrash } from '@mui/icons-material';

interface Parameter {
  name: string;
  value: any;
  type: 'string' | 'int' | 'double' | 'bool' | 'array';
  description: string;
  node: string;
  min?: number;
  max?: number;
  readonly?: boolean;
}

interface ParametersPageProps {
  isConnected: boolean;
  onCommand: (command: string, params?: any) => void;
}

const ParametersPage: React.FC<ParametersPageProps> = ({ isConnected, onCommand }) => {
  const [parameters, setParameters] = useState<Parameter[]>([]);
  const [filteredParameters, setFilteredParameters] = useState<Parameter[]>([]);
  const [nodeFilter, setNodeFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [modifiedParams, setModifiedParams] = useState<Set<string>>(new Set());
  const [selectedPreset, setSelectedPreset] = useState<string>('');

  // Mock parameter data
  useEffect(() => {
    const mockParams: Parameter[] = [
      // 🤖 Robot Physical Parameters
      {
        name: 'wheel_circumference',
        value: 0.628,
        type: 'double',
        description: 'Chu vi bánh xe (m) - Wheel circumference for odometry calculation',
        node: 'robot_physical',
        min: 0.1,
        max: 2.0
      },
      {
        name: 'wheel_base',
        value: 0.3,
        type: 'double',
        description: 'Khoảng cách giữa 2 bánh xe (m) - Distance between wheels',
        node: 'robot_physical',
        min: 0.1,
        max: 1.0
      },
      {
        name: 'robot_radius',
        value: 0.2,
        type: 'double',
        description: 'Bán kính robot (m) - Robot radius for collision detection',
        node: 'robot_physical',
        min: 0.05,
        max: 0.5
      },
      {
        name: 'robot_length',
        value: 0.4,
        type: 'double',
        description: 'Chiều dài robot (m) - Robot length',
        node: 'robot_physical',
        min: 0.1,
        max: 1.0
      },
      {
        name: 'robot_width',
        value: 0.3,
        type: 'double',
        description: 'Chiều rộng robot (m) - Robot width',
        node: 'robot_physical',
        min: 0.1,
        max: 1.0
      },
      {
        name: 'robot_height',
        value: 0.15,
        type: 'double',
        description: 'Chiều cao robot (m) - Robot height',
        node: 'robot_physical',
        min: 0.05,
        max: 0.5
      },
      {
        name: 'max_payload',
        value: 5.0,
        type: 'double',
        description: 'Tải trọng tối đa (kg) - Maximum payload capacity',
        node: 'robot_physical',
        min: 0.0,
        max: 50.0
      },

      // 🏃 Motion Parameters
      {
        name: 'max_vel_x',
        value: 0.5,
        type: 'double',
        description: 'Tốc độ tuyến tính tối đa (m/s) - Maximum linear velocity',
        node: 'motion',
        min: 0.1,
        max: 2.0
      },
      {
        name: 'max_vel_theta',
        value: 1.0,
        type: 'double',
        description: 'Tốc độ góc tối đa (rad/s) - Maximum angular velocity',
        node: 'motion',
        min: 0.1,
        max: 3.14
      },
      {
        name: 'max_acc_x',
        value: 0.5,
        type: 'double',
        description: 'Gia tốc tuyến tính tối đa (m/s²) - Maximum linear acceleration',
        node: 'motion',
        min: 0.1,
        max: 2.0
      },
      {
        name: 'max_acc_theta',
        value: 1.0,
        type: 'double',
        description: 'Gia tốc góc tối đa (rad/s²) - Maximum angular acceleration',
        node: 'motion',
        min: 0.1,
        max: 3.14
      },
      {
        name: 'min_turning_radius',
        value: 0.2,
        type: 'double',
        description: 'Bán kính quay tối thiểu (m) - Minimum turning radius',
        node: 'motion',
        min: 0.05,
        max: 1.0
      },

      // 🎯 Navigation Parameters
      {
        name: 'goal_tolerance_xy',
        value: 0.1,
        type: 'double',
        description: 'Dung sai vị trí đích (m) - Goal position tolerance',
        node: 'navigation',
        min: 0.01,
        max: 0.5
      },
      {
        name: 'goal_tolerance_yaw',
        value: 0.1,
        type: 'double',
        description: 'Dung sai góc đích (rad) - Goal orientation tolerance',
        node: 'navigation',
        min: 0.01,
        max: 1.57
      },
      {
        name: 'path_resolution',
        value: 0.05,
        type: 'double',
        description: 'Độ phân giải đường đi (m) - Path planning resolution',
        node: 'navigation',
        min: 0.01,
        max: 0.2
      },
      {
        name: 'use_sim_time',
        value: true,
        type: 'bool',
        description: 'Sử dụng thời gian mô phỏng - Use simulation time',
        node: 'navigation'
      },

      // 📡 Sensor Parameters
      {
        name: 'lidar_topic',
        value: '/scan',
        type: 'string',
        description: 'Tên topic LiDAR - LiDAR scan topic name',
        node: 'sensors',
        readonly: true
      },
      {
        name: 'lidar_frequency',
        value: 10,
        type: 'int',
        description: 'Tần số quét LiDAR (Hz) - LiDAR scan frequency',
        node: 'sensors',
        min: 1,
        max: 50
      },
      {
        name: 'lidar_range_min',
        value: 0.1,
        type: 'double',
        description: 'Khoảng cách quét tối thiểu (m) - Minimum scan range',
        node: 'sensors',
        min: 0.01,
        max: 1.0
      },
      {
        name: 'lidar_range_max',
        value: 10.0,
        type: 'double',
        description: 'Khoảng cách quét tối đa (m) - Maximum scan range',
        node: 'sensors',
        min: 1.0,
        max: 30.0
      },
      {
        name: 'lidar_angle_min',
        value: -3.14159,
        type: 'double',
        description: 'Góc quét tối thiểu (rad) - Minimum scan angle',
        node: 'sensors',
        min: -3.14159,
        max: 0.0
      },
      {
        name: 'lidar_angle_max',
        value: 3.14159,
        type: 'double',
        description: 'Góc quét tối đa (rad) - Maximum scan angle',
        node: 'sensors',
        min: 0.0,
        max: 3.14159
      },
      {
        name: 'camera_enabled',
        value: false,
        type: 'bool',
        description: 'Bật camera - Enable camera sensor',
        node: 'sensors'
      },
      {
        name: 'imu_enabled',
        value: true,
        type: 'bool',
        description: 'Bật IMU - Enable IMU sensor',
        node: 'sensors'
      },
      {
        name: 'ultrasonic_enabled',
        value: true,
        type: 'bool',
        description: 'Bật cảm biến siêu âm - Enable ultrasonic sensors',
        node: 'sensors'
      },
      {
        name: 'ultrasonic_range_max',
        value: 2.0,
        type: 'double',
        description: 'Tầm xa siêu âm tối đa (m) - Maximum ultrasonic range',
        node: 'sensors',
        min: 0.1,
        max: 5.0
      },

      // 🎮 Control Parameters
      {
        name: 'control_frequency',
        value: 20,
        type: 'int',
        description: 'Tần số điều khiển (Hz) - Control loop frequency',
        node: 'control',
        min: 1,
        max: 100
      },
      {
        name: 'pid_kp_linear',
        value: 1.0,
        type: 'double',
        description: 'PID Kp cho chuyển động thẳng - PID Kp for linear motion',
        node: 'control',
        min: 0.0,
        max: 10.0
      },
      {
        name: 'pid_ki_linear',
        value: 0.1,
        type: 'double',
        description: 'PID Ki cho chuyển động thẳng - PID Ki for linear motion',
        node: 'control',
        min: 0.0,
        max: 5.0
      },
      {
        name: 'pid_kd_linear',
        value: 0.05,
        type: 'double',
        description: 'PID Kd cho chuyển động thẳng - PID Kd for linear motion',
        node: 'control',
        min: 0.0,
        max: 2.0
      },
      {
        name: 'pid_kp_angular',
        value: 2.0,
        type: 'double',
        description: 'PID Kp cho chuyển động quay - PID Kp for angular motion',
        node: 'control',
        min: 0.0,
        max: 10.0
      },
      {
        name: 'pid_ki_angular',
        value: 0.2,
        type: 'double',
        description: 'PID Ki cho chuyển động quay - PID Ki for angular motion',
        node: 'control',
        min: 0.0,
        max: 5.0
      },
      {
        name: 'pid_kd_angular',
        value: 0.1,
        type: 'double',
        description: 'PID Kd cho chuyển động quay - PID Kd for angular motion',
        node: 'control',
        min: 0.0,
        max: 2.0
      },

      // 🛡️ Safety Parameters
      {
        name: 'emergency_stop_enabled',
        value: true,
        type: 'bool',
        description: 'Bật dừng khẩn cấp - Enable emergency stop',
        node: 'safety'
      },
      {
        name: 'safety_distance_front',
        value: 0.3,
        type: 'double',
        description: 'Khoảng cách an toàn phía trước (m) - Front safety distance',
        node: 'safety',
        min: 0.05,
        max: 2.0
      },
      {
        name: 'safety_distance_side',
        value: 0.2,
        type: 'double',
        description: 'Khoảng cách an toàn hai bên (m) - Side safety distance',
        node: 'safety',
        min: 0.05,
        max: 1.0
      },
      {
        name: 'safety_distance_rear',
        value: 0.15,
        type: 'double',
        description: 'Khoảng cách an toàn phía sau (m) - Rear safety distance',
        node: 'safety',
        min: 0.05,
        max: 1.0
      },
      {
        name: 'collision_avoidance_enabled',
        value: true,
        type: 'bool',
        description: 'Bật tránh va chạm - Enable collision avoidance',
        node: 'safety'
      },
      {
        name: 'max_slope_angle',
        value: 0.26,
        type: 'double',
        description: 'Góc dốc tối đa (rad) ~15° - Maximum slope angle',
        node: 'safety',
        min: 0.0,
        max: 0.52
      },
      {
        name: 'battery_low_threshold',
        value: 20.0,
        type: 'double',
        description: 'Ngưỡng pin yếu (%) - Low battery threshold',
        node: 'safety',
        min: 5.0,
        max: 50.0
      },

      // 🗺️ Mapping Parameters
      {
        name: 'map_resolution',
        value: 0.05,
        type: 'double',
        description: 'Độ phân giải bản đồ (m/pixel) - Map resolution',
        node: 'mapping',
        min: 0.01,
        max: 0.2
      },
      {
        name: 'map_update_frequency',
        value: 5.0,
        type: 'double',
        description: 'Tần số cập nhật bản đồ (Hz) - Map update frequency',
        node: 'mapping',
        min: 0.1,
        max: 20.0
      },
      {
        name: 'slam_enabled',
        value: true,
        type: 'bool',
        description: 'Bật SLAM - Enable SLAM mapping',
        node: 'mapping'
      },
      {
        name: 'map_save_interval',
        value: 30.0,
        type: 'double',
        description: 'Khoảng thời gian lưu bản đồ (s) - Map save interval',
        node: 'mapping',
        min: 10.0,
        max: 300.0
      },
      {
        name: 'occupancy_threshold_free',
        value: 0.196,
        type: 'double',
        description: 'Ngưỡng ô trống - Free space threshold',
        node: 'mapping',
        min: 0.0,
        max: 1.0
      },
      {
        name: 'occupancy_threshold_occupied',
        value: 0.65,
        type: 'double',
        description: 'Ngưỡng ô bị chiếm - Occupied space threshold',
        node: 'mapping',
        min: 0.0,
        max: 1.0
      },

      // 🔧 System Parameters
      {
        name: 'log_level',
        value: 'INFO',
        type: 'string',
        description: 'Mức độ log hệ thống - System logging level',
        node: 'system'
      },
      {
        name: 'heartbeat_interval',
        value: 1.0,
        type: 'double',
        description: 'Khoảng thời gian heartbeat (s) - Heartbeat interval',
        node: 'system',
        min: 0.1,
        max: 10.0
      },
      {
        name: 'diagnostic_frequency',
        value: 2.0,
        type: 'double',
        description: 'Tần số chẩn đoán (Hz) - Diagnostic frequency',
        node: 'system',
        min: 0.1,
        max: 10.0
      },
      {
        name: 'auto_recovery_enabled',
        value: true,
        type: 'bool',
        description: 'Bật phục hồi tự động - Enable auto recovery',
        node: 'system'
      },
      {
        name: 'max_recovery_attempts',
        value: 3,
        type: 'int',
        description: 'Số lần thử phục hồi tối đa - Maximum recovery attempts',
        node: 'system',
        min: 1,
        max: 10
      },
      {
        name: 'web_interface_port',
        value: 3001,
        type: 'int',
        description: 'Cổng web interface - Web interface port',
        node: 'system',
        min: 3000,
        max: 9999
      },
      {
        name: 'ros_domain_id',
        value: 0,
        type: 'int',
        description: 'ROS Domain ID - ROS Domain ID',
        node: 'system',
        min: 0,
        max: 232
      }
    ];

    setParameters(mockParams);
  }, []);

  // Filter parameters
  useEffect(() => {
    let filtered = parameters;

    if (nodeFilter !== 'ALL') {
      filtered = filtered.filter(param => param.node === nodeFilter);
    }

    if (searchTerm) {
      filtered = filtered.filter(param => 
        param.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        param.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredParameters(filtered);
  }, [parameters, nodeFilter, searchTerm]);

  const handleParameterChange = (paramName: string, newValue: any) => {
    setParameters(prev => prev.map(param => 
      param.name === paramName ? { ...param, value: newValue } : param
    ));
    setModifiedParams(prev => new Set(prev).add(paramName));
  };

  const saveParameters = () => {
    const modifiedParamsList = parameters.filter(param => modifiedParams.has(param.name));
    
    modifiedParamsList.forEach(param => {
      onCommand('set_parameter', {
        node: param.node,
        name: param.name,
        value: param.value,
        type: param.type
      });
    });

    setModifiedParams(new Set());
  };

  const resetParameters = () => {
    // Reset to default values (would normally fetch from server)
    setModifiedParams(new Set());
    window.location.reload(); // Simple reset for demo
  };

  const loadPreset = (presetName: string) => {
    // Load preset configurations
    if (presetName === 'conservative') {
      // 🐌 Conservative - An toàn, chậm
      handleParameterChange('max_vel_x', 0.3);
      handleParameterChange('max_vel_theta', 0.5);
      handleParameterChange('max_acc_x', 0.3);
      handleParameterChange('max_acc_theta', 0.5);
      handleParameterChange('safety_distance_front', 0.5);
      handleParameterChange('safety_distance_side', 0.3);
      handleParameterChange('safety_distance_rear', 0.2);
      handleParameterChange('goal_tolerance_xy', 0.15);
      handleParameterChange('control_frequency', 15);
    } else if (presetName === 'aggressive') {
      // 🚀 Aggressive - Nhanh, hiệu suất cao
      handleParameterChange('max_vel_x', 1.0);
      handleParameterChange('max_vel_theta', 2.0);
      handleParameterChange('max_acc_x', 1.0);
      handleParameterChange('max_acc_theta', 2.0);
      handleParameterChange('safety_distance_front', 0.2);
      handleParameterChange('safety_distance_side', 0.15);
      handleParameterChange('safety_distance_rear', 0.1);
      handleParameterChange('goal_tolerance_xy', 0.05);
      handleParameterChange('control_frequency', 30);
    } else if (presetName === 'indoor') {
      // 🏠 Indoor - Tối ưu cho trong nhà
      handleParameterChange('max_vel_x', 0.5);
      handleParameterChange('max_vel_theta', 1.0);
      handleParameterChange('safety_distance_front', 0.3);
      handleParameterChange('lidar_range_max', 5.0);
      handleParameterChange('map_resolution', 0.05);
      handleParameterChange('goal_tolerance_xy', 0.1);
    } else if (presetName === 'outdoor') {
      // 🌳 Outdoor - Tối ưu cho ngoài trời
      handleParameterChange('max_vel_x', 0.8);
      handleParameterChange('max_vel_theta', 1.5);
      handleParameterChange('safety_distance_front', 0.4);
      handleParameterChange('lidar_range_max', 10.0);
      handleParameterChange('map_resolution', 0.1);
      handleParameterChange('goal_tolerance_xy', 0.2);
    }
  };

  const renderParameterInput = (param: Parameter) => {
    switch (param.type) {
      case 'bool':
        return (
          <FormControlLabel
            control={
              <Switch
                checked={param.value}
                onChange={(e) => handleParameterChange(param.name, e.target.checked)}
                disabled={param.readonly || !isConnected}
              />
            }
            label={param.value ? 'Enabled' : 'Disabled'}
          />
        );
      
      case 'int':
      case 'double':
        return (
          <TextField
            type="number"
            value={param.value}
            onChange={(e) => handleParameterChange(param.name, 
              param.type === 'int' ? parseInt(e.target.value) : parseFloat(e.target.value)
            )}
            inputProps={{
              min: param.min,
              max: param.max,
              step: param.type === 'int' ? 1 : 0.1
            }}
            disabled={param.readonly || !isConnected}
            size="small"
            fullWidth
          />
        );
      
      case 'string':
        return (
          <TextField
            value={param.value}
            onChange={(e) => handleParameterChange(param.name, e.target.value)}
            disabled={param.readonly || !isConnected}
            size="small"
            fullWidth
          />
        );
      
      default:
        return (
          <TextField
            value={JSON.stringify(param.value)}
            disabled
            size="small"
            fullWidth
          />
        );
    }
  };

  const uniqueNodes = Array.from(new Set(parameters.map(param => param.node)));

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        ⚙️ Parameters
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Configure ROS2 node parameters and system settings
      </Typography>

      {/* Parameter Controls */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <Typography variant="caption">Filter by Node</Typography>
              <Select value={nodeFilter} onChange={(e) => setNodeFilter(e.target.value)}>
                <MenuItem value="ALL">All Nodes</MenuItem>
                {uniqueNodes.map(node => (
                  <MenuItem key={node} value={node}>{node}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search parameters..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </Grid>

          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <Typography variant="caption">Load Preset</Typography>
              <Select
                value={selectedPreset}
                onChange={(e) => {
                  setSelectedPreset(e.target.value);
                  loadPreset(e.target.value);
                }}
              >
                <MenuItem value="">Chọn cấu hình...</MenuItem>
                <MenuItem value="conservative">🐌 An toàn (Conservative)</MenuItem>
                <MenuItem value="aggressive">🚀 Hiệu suất cao (Aggressive)</MenuItem>
                <MenuItem value="indoor">🏠 Trong nhà (Indoor)</MenuItem>
                <MenuItem value="outdoor">🌳 Ngoài trời (Outdoor)</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={3}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                startIcon={<Save />}
                onClick={saveParameters}
                disabled={modifiedParams.size === 0 || !isConnected}
                size="small"
              >
                Save ({modifiedParams.size})
              </Button>
              <Button
                variant="outlined"
                startIcon={<RestoreFromTrash />}
                onClick={resetParameters}
                size="small"
              >
                Reset
              </Button>
            </Box>
          </Grid>
        </Grid>

        {/* Status */}
        <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
          <Chip 
            label={`${filteredParameters.length} parameters`} 
            size="small" 
          />
          <Chip 
            label={`${modifiedParams.size} modified`} 
            size="small" 
            color={modifiedParams.size > 0 ? 'warning' : 'default'}
          />
          <Chip 
            label={isConnected ? '🟢 Connected' : '🔴 Disconnected'} 
            size="small" 
            color={isConnected ? 'success' : 'error'}
          />
        </Box>
      </Paper>

      {/* Connection Warning */}
      {!isConnected && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          ⚠️ System disconnected - Parameter changes will not be applied
        </Alert>
      )}

      {/* Parameters by Node */}
      {uniqueNodes.filter(node => 
        nodeFilter === 'ALL' || nodeFilter === node
      ).map(node => (
        <Accordion key={node} defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="h6">
              📦 {node.charAt(0).toUpperCase() + node.slice(1)} Node
            </Typography>
            <Chip 
              label={`${filteredParameters.filter(p => p.node === node).length} params`}
              size="small"
              sx={{ ml: 2 }}
            />
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              {filteredParameters
                .filter(param => param.node === node)
                .map(param => (
                <Grid item xs={12} md={6} key={param.name}>
                  <Paper sx={{ p: 2, height: '100%' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle1" fontWeight="bold">
                        {param.name}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Chip label={param.type} size="small" />
                        {modifiedParams.has(param.name) && (
                          <Chip label="Modified" size="small" color="warning" />
                        )}
                        {param.readonly && (
                          <Chip label="Read-only" size="small" color="default" />
                        )}
                      </Box>
                    </Box>
                    
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {param.description}
                    </Typography>
                    
                    {renderParameterInput(param)}
                    
                    {(param.min !== undefined || param.max !== undefined) && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        Range: {param.min ?? '∞'} - {param.max ?? '∞'}
                      </Typography>
                    )}
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </AccordionDetails>
        </Accordion>
      ))}

      {/* Parameter Information */}
      <Paper sx={{ p: 3, mt: 3, backgroundColor: '#f8f9fa' }}>
        <Typography variant="h6" gutterBottom>
          📖 Parameter Information
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" gutterBottom>
              🔧 Parameter Types:
            </Typography>
            <ul>
              <li><strong>string</strong> - Text values</li>
              <li><strong>int</strong> - Integer numbers</li>
              <li><strong>double</strong> - Decimal numbers</li>
              <li><strong>bool</strong> - True/False values</li>
            </ul>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" gutterBottom>
              ⚠️ Safety Notes:
            </Typography>
            <ul>
              <li>Test parameter changes carefully</li>
              <li>Some changes require node restart</li>
              <li>Keep backups of working configurations</li>
              <li>Monitor robot behavior after changes</li>
            </ul>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" gutterBottom>
              💡 Tips:
            </Typography>
            <ul>
              <li>Use presets for common configurations</li>
              <li>Save changes before testing</li>
              <li>Reset to defaults if issues occur</li>
              <li>Document custom parameter sets</li>
            </ul>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default ParametersPage;
