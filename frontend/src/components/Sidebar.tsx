import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  Box,
  Chip
} from '@mui/material';
import {
  Dashboard,
  SmartToy,
  Navigation,
  Sensors,
  Map,
  Terminal,
  Settings,
  Assessment,
  ViewInAr,
  BugReport,
  Storage,
  Memory,
  Edit,
  MenuBook
} from '@mui/icons-material';

interface SidebarProps {
  selectedPage: string;
  onPageChange: (page: string) => void;
  isConnected: boolean;
  open: boolean;
  onClose: () => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactElement;
  description: string;
  category: 'main' | 'monitoring' | 'tools' | 'system';
}

const menuItems: MenuItem[] = [
  // Main Control
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <Dashboard />,
    description: 'Overview & Quick Controls',
    category: 'main'
  },
  {
    id: 'robot-control',
    label: 'Robot Control',
    icon: <SmartToy />,
    description: 'Manual Movement & Commands',
    category: 'main'
  },
  // {
  //   id: 'navigation',
  //   label: 'Navigation',
  //   icon: <Navigation />,
  //   description: 'Path Planning & Goals',
  //   category: 'main'
  // },
  
  // Monitoring
  {
    id: 'sensors',
    label: 'Sensors',
    icon: <Sensors />,
    description: 'LiDAR, Camera, IMU Data',
    category: 'monitoring'
  },
  {
    id: 'map-2d',
    label: '2D Map View',
    icon: <Map />,
    description: 'Traditional Map Visualization',
    category: 'monitoring'
  },
  {
    id: 'map-3d',
    label: '3D Visualization',
    icon: <ViewInAr />,
    description: 'Virtual Gazebo Environment',
    category: 'monitoring'
  },
  {
    id: 'map-editor',
    label: 'Map Editor',
    icon: <Edit />,
    description: 'Create & Edit 2D Maps',
    category: 'tools'
  },
  {
    id: 'charts',
    label: 'Real-time Charts',
    icon: <Assessment />,
    description: 'Live Data Visualization',
    category: 'monitoring'
  },
  {
    id: 'diagnostics',
    label: 'Diagnostics',
    icon: <BugReport />,
    description: 'System Health & Performance',
    category: 'monitoring'
  },
  
  // Tools
  // {
  //   id: 'terminal',
  //   label: 'Terminal',
  //   icon: <Terminal />,
  //   description: 'Command Line Interface',
  //   category: 'tools'
  // },
  {
    id: 'logs',
    label: 'System Logs',
    icon: <Storage />,
    description: 'Real-time Log Monitoring',
    category: 'tools'
  },
  {
    id: 'parameters',
    label: 'Parameters',
    icon: <Settings />,
    description: 'Node Configuration',
    category: 'tools'
  },
  
  // System
  {
    id: 'nodes',
    label: 'Node Manager',
    icon: <Memory />,
    description: 'Start/Stop ROS2 Nodes',
    category: 'system'
  },
  {
    id: 'system-status',
    label: 'System Status',
    icon: <Assessment />,
    description: 'Hardware & Software Status',
    category: 'system'
  },
  {
    id: 'system-guide',
    label: 'HƯỚNG DẪN HỆ THỐNG',
    icon: <MenuBook />,
    description: 'Installation & Setup Guide',
    category: 'system'
  }
];

const categoryLabels = {
  main: '🎮 Main Control',
  monitoring: '📊 Monitoring',
  tools: '🔧 Tools',
  system: '⚙️ System'
};

const Sidebar: React.FC<SidebarProps> = ({ selectedPage, onPageChange, isConnected, open, onClose }) => {
  const drawerWidth = 280;
  
  const renderMenuItems = (category: string) => {
    const items = menuItems.filter(item => item.category === category);
    
    return items.map((item) => (
      <ListItem key={item.id} disablePadding>
        <ListItemButton
          selected={selectedPage === item.id}
          onClick={() => {
            onPageChange(item.id);
            onClose(); // Close sidebar when page is selected
          }}
          sx={{
            borderRadius: 1,
            margin: '2px 8px',
            color: '#333',
            backgroundColor: 'transparent',
            border: '1px solid transparent',
            '&:hover': {
              backgroundColor: '#e3f2fd',
              border: '1px solid #bbdefb',
              '& .MuiListItemIcon-root': {
                color: 'primary.main',
              }
            },
            '&.Mui-selected': {
              backgroundColor: 'primary.main',
              color: 'white',
              border: '1px solid primary.main',
              '&:hover': {
                backgroundColor: 'primary.dark',
              },
              '& .MuiListItemIcon-root': {
                color: 'white',
              }
            },
            '& .MuiListItemIcon-root': {
              color: selectedPage === item.id ? 'white' : '#666',
              transition: 'color 0.2s ease'
            }
          }}
        >
          <ListItemIcon sx={{ minWidth: 40 }}>
            {item.icon}
          </ListItemIcon>
          <ListItemText
            primary={item.label}
            secondary={item.description}
            secondaryTypographyProps={{
              fontSize: '0.75rem',
              color: selectedPage === item.id ? 'rgba(255,255,255,0.7)' : 'text.secondary'
            }}
          />
        </ListItemButton>
      </ListItem>
    ));
  };

  return (
    <Drawer
      variant="temporary"
      open={open}
      onClose={onClose}
      ModalProps={{
        keepMounted: true, // Better open performance on mobile.
      }}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          backgroundColor: '#ffffff',
          borderRight: '2px solid #e0e0e0',
          boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
          transition: 'transform 0.3s ease-in-out',
        },
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
          🚗 Autonomous Vehicle
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Web Control Interface
        </Typography>
        
        {/* Connection Status */}
        <Box sx={{ mt: 1 }}>
          <Chip
            label={isConnected ? 'Connected' : 'Disconnected'}
            color={isConnected ? 'success' : 'error'}
            size="small"
            variant="outlined"
          />
        </Box>
      </Box>
      
      <Divider />
      
      {/* Navigation Menu */}
      <Box sx={{ overflow: 'auto', flex: 1 }}>
        <List sx={{ pt: 1 }}>
          
          {/* Main Control Section */}
          <ListItem>
            <Typography variant="subtitle2" sx={{
              fontWeight: 'bold',
              color: '#1976d2',
              fontSize: '0.85rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              {categoryLabels.main}
            </Typography>
          </ListItem>
          {renderMenuItems('main')}
          
          <Divider sx={{ my: 1 }} />
          
          {/* Monitoring Section */}
          <ListItem>
            <Typography variant="subtitle2" sx={{
              fontWeight: 'bold',
              color: '#388e3c',
              fontSize: '0.85rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              {categoryLabels.monitoring}
            </Typography>
          </ListItem>
          {renderMenuItems('monitoring')}

          <Divider sx={{ my: 1 }} />

          {/* Tools Section */}
          <ListItem>
            <Typography variant="subtitle2" sx={{
              fontWeight: 'bold',
              color: '#f57c00',
              fontSize: '0.85rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              {categoryLabels.tools}
            </Typography>
          </ListItem>
          {renderMenuItems('tools')}

          <Divider sx={{ my: 1 }} />

          {/* System Section */}
          <ListItem>
            <Typography variant="subtitle2" sx={{
              fontWeight: 'bold',
              color: '#7b1fa2',
              fontSize: '0.85rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              {categoryLabels.system}
            </Typography>
          </ListItem>
          {renderMenuItems('system')}
          
        </List>
      </Box>
      
      {/* Footer */}
      <Box sx={{ p: 2, borderTop: '1px solid #e0e0e0' }}>
        <Typography variant="caption" color="text.secondary" align="center" display="block">
          Indoor Autonomous Vehicle
        </Typography>
        <Typography variant="caption" color="text.secondary" align="center" display="block">
          v1.0.0 - ROS2 Humble
        </Typography>
      </Box>
    </Drawer>
  );
};

export default Sidebar;
