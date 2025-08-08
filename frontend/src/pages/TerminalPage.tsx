import React, { useState } from 'react';
import { Grid, Paper, Typography, Box, Button, Alert } from '@mui/material';
import Terminal from '../components/Terminal';
import { terminalManager } from '../utils/terminalManager';

const TerminalPage: React.FC = () => {
  const [showTips, setShowTips] = useState(true);

  const handleReconnect = () => {
    //terminalManager.connect();
  };

  const handleClearTerminal = () => {
    terminalManager.clearOutput();
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        💻 Terminal
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Command line interface for ROS2 and system commands
      </Typography>

      {showTips && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          onClose={() => setShowTips(false)}
        >
          <strong>Terminal Tips:</strong> Click inside the terminal to focus. Type commands and press Enter to execute.
          If you have issues with spaces or special characters, try clicking inside the terminal first.
          <Button
            size="small"
            variant="outlined"
            color="primary"
            sx={{ ml: 2 }}
            onClick={handleReconnect}
          >
            Reconnect Terminal
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="secondary"
            sx={{ ml: 1 }}
            onClick={handleClearTerminal}
          >
            Clear Terminal
          </Button>
        </Alert>
      )}

      <Grid container spacing={3}>

        {/* Main Terminal */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2, height: '600px' }}>
            <Terminal height={550} />
          </Paper>
        </Grid>

        {/* Terminal Instructions */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              📖 Terminal Usage
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body1">
                <strong>⌨️ Keyboard Shortcuts:</strong>
              </Typography>
              <ul>
                <li><kbd>↑</kbd> <kbd>↓</kbd> - Navigate command history</li>
                <li><kbd>Tab</kbd> - Basic command completion</li>
                <li><kbd>Ctrl+C</kbd> - Interrupt current command</li>
                <li><kbd>Enter</kbd> - Execute command</li>
              </ul>
              
              <Typography variant="body1">
                <strong>🎮 Interface Controls:</strong>
              </Typography>
              <ul>
                <li>Clear button - Clear terminal output</li>
                <li>Fullscreen button - Expand terminal</li>
                <li>Auto-scroll to latest output</li>
                <li>Connection status indicator</li>
              </ul>
            </Box>
          </Paper>
        </Grid>

        {/* Common Commands */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              🤖 Common ROS2 Commands
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body1">
                <strong>📡 Topic Commands:</strong>
              </Typography>
              <ul>
                <li><code>ros2 topic list</code> - List all topics</li>
                <li><code>ros2 topic echo /scan</code> - Monitor LiDAR data</li>
                <li><code>ros2 topic echo /odom</code> - Monitor odometry</li>
                <li><code>ros2 topic pub /cmd_vel ...</code> - Send movement commands</li>
              </ul>
              
              <Typography variant="body1">
                <strong>🔧 Node Commands:</strong>
              </Typography>
              <ul>
                <li><code>ros2 node list</code> - List running nodes</li>
                <li><code>ros2 node info /node_name</code> - Node information</li>
                <li><code>ros2 launch package launch_file</code> - Launch nodes</li>
                <li><code>ros2 param list</code> - List parameters</li>
              </ul>
            </Box>
          </Paper>
        </Grid>

        {/* System Commands */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              🖥️ System Commands
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body1">
                <strong>📁 File System:</strong>
              </Typography>
              <ul>
                <li><code>ls</code> - List directory contents</li>
                <li><code>cd directory</code> - Change directory</li>
                <li><code>pwd</code> - Show current directory</li>
                <li><code>cat file.txt</code> - Display file contents</li>
              </ul>
              
              <Typography variant="body1">
                <strong>⚙️ Process Management:</strong>
              </Typography>
              <ul>
                <li><code>ps aux</code> - List running processes</li>
                <li><code>top</code> - System resource monitor</li>
                <li><code>kill PID</code> - Terminate process</li>
                <li><code>sudo systemctl status service</code> - Service status</li>
              </ul>
            </Box>
          </Paper>
        </Grid>

        {/* Navigation Commands */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              🧭 Navigation Commands
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body1">
                <strong>🗺️ SLAM & Mapping:</strong>
              </Typography>
              <ul>
                <li><code>ros2 launch slam_toolbox online_async_launch.py</code></li>
                <li><code>ros2 run map_server map_saver_cli -f map_name</code></li>
                <li><code>ros2 service call /slam_toolbox/save_map ...</code></li>
              </ul>
              
              <Typography variant="body1">
                <strong>🎯 Navigation Stack:</strong>
              </Typography>
              <ul>
                <li><code>ros2 launch nav2_bringup navigation_launch.py</code></li>
                <li><code>ros2 action send_goal /navigate_to_pose ...</code></li>
                <li><code>ros2 topic pub /initialpose ...</code></li>
              </ul>
            </Box>
          </Paper>
        </Grid>

        {/* Safety & Tips */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, backgroundColor: '#fff3e0' }}>
            <Typography variant="h6" gutterBottom color="warning.main">
              ⚠️ Safety & Best Practices
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" gutterBottom>
                  🛡️ Safety Commands:
                </Typography>
                <ul>
                  <li><code>ros2 topic pub /cmd_vel geometry_msgs/Twist "{}"</code> - Stop robot</li>
                  <li><code>killall -9 ros2</code> - Emergency stop all ROS2</li>
                  <li><code>sudo reboot</code> - System restart if needed</li>
                </ul>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" gutterBottom>
                  📝 Best Practices:
                </Typography>
                <ul>
                  <li>Always test commands in simulation first</li>
                  <li>Monitor robot behavior when running commands</li>
                  <li>Keep emergency stop accessible</li>
                  <li>Use <code>--help</code> flag for command info</li>
                </ul>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" gutterBottom>
                  🔍 Debugging Tips:
                </Typography>
                <ul>
                  <li>Use <code>ros2 doctor</code> for system health check</li>
                  <li>Check logs with <code>ros2 log</code> commands</li>
                  <li>Monitor topics with <code>ros2 topic hz</code></li>
                  <li>Verify node connections with <code>ros2 node info</code></li>
                </ul>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

      </Grid>
    </Box>
  );
};

export default TerminalPage;
