import React from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Alert,
  Chip
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  Settings,
  Computer,
  Router,
  Memory,
  Storage,
  Speed,
  Warning,
  CheckCircle,
  Info,
  Terminal,
  Code,
  Build
} from '@mui/icons-material';

const SystemGuidePage: React.FC = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 4, fontWeight: 'bold' }}>
        🚗 HƯỚNG DẪN HỆ THỐNG XE TỰ HÀNH TRONG NHÀ
      </Typography>

      <Grid container spacing={3}>
        
        {/* System Overview */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Info sx={{ mr: 1, color: 'primary.main' }} />
              Tổng Quan Hệ Thống
            </Typography>
            <Typography variant="body1" paragraph>
              Hệ thống xe tự hành trong nhà sử dụng ROS2 Humble với các thành phần chính:
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" gutterBottom>🤖 Robot Simulation</Typography>
                    <Typography variant="body2">
                      • Gazebo simulation environment<br/>
                      • LiDAR sensor (360 độ)<br/>
                      • Odometry và IMU<br/>
                      • Battery monitoring
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" gutterBottom>🗺️ Navigation System</Typography>
                    <Typography variant="body2">
                      • SLAM mapping<br/>
                      • Path planning<br/>
                      • Obstacle avoidance<br/>
                      • Goal navigation
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Installation Requirements */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Build sx={{ mr: 1, color: 'warning.main' }} />
              Yêu Cầu Cài Đặt
            </Typography>
            
            <Alert severity="info" sx={{ mb: 2 }}>
              <strong>Hệ điều hành:</strong> Ubuntu 22.04 LTS (khuyến nghị)
            </Alert>

            <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>📋 Danh Sách Phần Mềm Cần Thiết:</Typography>
            <List>
              <ListItem>
                <ListItemIcon><CheckCircle color="success" /></ListItemIcon>
                <ListItemText 
                  primary="ROS2 Humble" 
                  secondary="Robot Operating System 2 - phiên bản Humble Hawksbill"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon><CheckCircle color="success" /></ListItemIcon>
                <ListItemText 
                  primary="Gazebo Classic" 
                  secondary="Môi trường mô phỏng 3D cho robot"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon><CheckCircle color="success" /></ListItemIcon>
                <ListItemText 
                  primary="Python 3.10+" 
                  secondary="Ngôn ngữ lập trình chính cho backend"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon><CheckCircle color="success" /></ListItemIcon>
                <ListItemText 
                  primary="Node.js 18+" 
                  secondary="Runtime cho React frontend"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon><CheckCircle color="success" /></ListItemIcon>
                <ListItemText 
                  primary="Git" 
                  secondary="Quản lý mã nguồn"
                />
              </ListItem>
            </List>
          </Paper>
        </Grid>

        {/* Quick Start Guide */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <PlayArrow sx={{ mr: 1, color: 'success.main' }} />
              Hướng Dẫn Khởi Động Nhanh
            </Typography>

            <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>🚀 Bước 1: Khởi động ROS2 System</Typography>
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50', mb: 2 }}>
              <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace' }}>
                cd /path/to/indoor_autonomous_vehicle{'\n'}
                ./run_phase2_system.sh
              </Typography>
            </Paper>

            <Typography variant="h6" gutterBottom>🌐 Bước 2: Khởi động Web Interface</Typography>
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50', mb: 2 }}>
              <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace' }}>
                # Terminal 1 - Backend{'\n'}
                cd web_interface/backend/app{'\n'}
                python3 main.py{'\n\n'}
                # Terminal 2 - Frontend{'\n'}
                cd web_interface/frontend{'\n'}
                npm start
              </Typography>
            </Paper>

            <Typography variant="h6" gutterBottom>🎯 Bước 3: Truy cập Web Interface</Typography>
            <Alert severity="success">
              Mở trình duyệt và truy cập: <strong>http://localhost:3000</strong>
            </Alert>
          </Paper>
        </Grid>

        {/* System Architecture */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Computer sx={{ mr: 1, color: 'info.main' }} />
              Kiến Trúc Hệ Thống
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                      <Terminal sx={{ mr: 1 }} />
                      ROS2 Layer
                    </Typography>
                    <List dense>
                      <ListItem><ListItemText primary="• Navigation Stack" /></ListItem>
                      <ListItem><ListItemText primary="• SLAM Toolbox" /></ListItem>
                      <ListItem><ListItemText primary="• Sensor Drivers" /></ListItem>
                      <ListItem><ListItemText primary="• Path Planner" /></ListItem>
                    </List>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} md={4}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                      <Router sx={{ mr: 1 }} />
                      Backend API
                    </Typography>
                    <List dense>
                      <ListItem><ListItemText primary="• FastAPI Server" /></ListItem>
                      <ListItem><ListItemText primary="• WebSocket Bridge" /></ListItem>
                      <ListItem><ListItemText primary="• ROS2 Interface" /></ListItem>
                      <ListItem><ListItemText primary="• Data Processing" /></ListItem>
                    </List>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} md={4}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                      <Code sx={{ mr: 1 }} />
                      Frontend UI
                    </Typography>
                    <List dense>
                      <ListItem><ListItemText primary="• React Application" /></ListItem>
                      <ListItem><ListItemText primary="• Real-time Dashboard" /></ListItem>
                      <ListItem><ListItemText primary="• Map Visualization" /></ListItem>
                      <ListItem><ListItemText primary="• Control Interface" /></ListItem>
                    </List>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Troubleshooting */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Warning sx={{ mr: 1, color: 'error.main' }} />
              Xử Lý Sự Cố Thường Gặp
            </Typography>

            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>❌ ROS2 không khởi động được</Typography>
            <Alert severity="warning" sx={{ mb: 2 }}>
              <strong>Giải pháp:</strong> Kiểm tra ROS2 environment và chạy: <code>source /opt/ros/humble/setup.bash</code>
            </Alert>

            <Typography variant="h6" gutterBottom>❌ Backend không kết nối được với ROS2</Typography>
            <Alert severity="warning" sx={{ mb: 2 }}>
              <strong>Giải pháp:</strong> Đảm bảo ROS2 daemon đang chạy: <code>ros2 daemon start</code>
            </Alert>

            <Typography variant="h6" gutterBottom>❌ Frontend không hiển thị dữ liệu robot</Typography>
            <Alert severity="warning" sx={{ mb: 2 }}>
              <strong>Giải pháp:</strong> Kiểm tra WebSocket connection và khởi động lại backend
            </Alert>
          </Paper>
        </Grid>

        {/* System Status */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Speed sx={{ mr: 1, color: 'success.main' }} />
              Trạng Thái Hệ Thống Hiện Tại
            </Typography>
            
            <Grid container spacing={2}>
              <Grid item xs={6} md={3}>
                <Chip 
                  label="ROS2 System" 
                  color="success" 
                  variant="outlined" 
                  sx={{ width: '100%' }}
                />
              </Grid>
              <Grid item xs={6} md={3}>
                <Chip 
                  label="Backend API" 
                  color="success" 
                  variant="outlined" 
                  sx={{ width: '100%' }}
                />
              </Grid>
              <Grid item xs={6} md={3}>
                <Chip 
                  label="Frontend UI" 
                  color="success" 
                  variant="outlined" 
                  sx={{ width: '100%' }}
                />
              </Grid>
              <Grid item xs={6} md={3}>
                <Chip 
                  label="Robot Data" 
                  color="success" 
                  variant="outlined" 
                  sx={{ width: '100%' }}
                />
              </Grid>
            </Grid>

            <Alert severity="success" sx={{ mt: 2 }}>
              <strong>✅ Hệ thống đang hoạt động bình thường!</strong> Tất cả các thành phần đã được khởi động và kết nối thành công.
            </Alert>
          </Paper>
        </Grid>

      </Grid>
    </Container>
  );
};

export default SystemGuidePage;
