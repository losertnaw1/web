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
import { useI18n } from '../i18n/i18n';

interface SidebarProps {
  selectedPage: string;
  onPageChange: (page: string) => void;
  isConnected: boolean;
  open: boolean;
  onClose: () => void;
}

interface MenuItem {
  id: string;
  icon: React.ReactElement;
  labelKey: string;
  descKey: string;
  category: 'main' | 'monitoring' | 'tools' | 'system';
}

const menuItems: MenuItem[] = [
  // Main Control
  {
    id: 'dashboard',
    labelKey: 'page.dashboard',
    icon: <Dashboard />,
    descKey: 'sidebar.dashboard.desc',
    category: 'main'
  },
  {
    id: 'robot-control',
    labelKey: 'page.robot-control',
    icon: <SmartToy />,
    descKey: 'sidebar.robot_control.desc',
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
    labelKey: 'page.sensors',
    icon: <Sensors />,
    descKey: 'sidebar.sensors.desc',
    category: 'monitoring'
  },
  {
    id: 'map-2d',
    labelKey: 'page.map-2d',
    icon: <Map />,
    descKey: 'sidebar.map2d.desc',
    category: 'monitoring'
  },
  {
    id: 'map-3d',
    labelKey: 'page.map-3d',
    icon: <ViewInAr />,
    descKey: 'sidebar.map3d.desc',
    category: 'monitoring'
  },
  {
    id: 'map-editor',
    labelKey: 'page.map-editor',
    icon: <Edit />,
    descKey: 'sidebar.map_editor.desc',
    category: 'tools'
  },
  {
    id: 'charts',
    labelKey: 'page.charts',
    icon: <Assessment />,
    descKey: 'sidebar.charts.desc',
    category: 'monitoring'
  },
  {
    id: 'diagnostics',
    labelKey: 'page.diagnostics',
    icon: <BugReport />,
    descKey: 'sidebar.diagnostics.desc',
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
    labelKey: 'page.logs',
    icon: <Storage />,
    descKey: 'sidebar.logs.desc',
    category: 'tools'
  },
  {
    id: 'parameters',
    labelKey: 'page.parameters',
    icon: <Settings />,
    descKey: 'sidebar.parameters.desc',
    category: 'tools'
  },
  
  // System
  {
    id: 'nodes',
    labelKey: 'page.nodes',
    icon: <Memory />,
    descKey: 'sidebar.nodes.desc',
    category: 'system'
  },
  {
    id: 'system-status',
    labelKey: 'page.system-status',
    icon: <Assessment />,
    descKey: 'sidebar.system_status.desc',
    category: 'system'
  },
  {
    id: 'system-guide',
    labelKey: 'page.system-guide',
    icon: <MenuBook />,
    descKey: 'sidebar.system_guide.desc',
    category: 'system'
  }
];

const categoryLabelKeys = {
  main: 'sidebar.cat.main',
  monitoring: 'sidebar.cat.monitoring',
  tools: 'sidebar.cat.tools',
  system: 'sidebar.cat.system'
};

const Sidebar: React.FC<SidebarProps> = ({ selectedPage, onPageChange, isConnected, open, onClose }) => {
  const { t } = useI18n();
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
            primary={t(item.labelKey)}
            secondary={t(item.descKey)}
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
          🚗 {t('sidebar.header.title', 'Autonomous Vehicle')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('sidebar.header.subtitle', 'Web Control Interface')}
        </Typography>
        
        {/* Connection Status */}
        <Box sx={{ mt: 1 }}>
          <Chip
            label={isConnected ? t('status.connected') : t('status.disconnected')}
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
              {t(categoryLabelKeys.main, '🎮 Main Control')}
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
              {t(categoryLabelKeys.monitoring, '📊 Monitoring')}
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
              {t(categoryLabelKeys.tools, '🔧 Tools')}
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
              {t(categoryLabelKeys.system, '⚙️ System')}
            </Typography>
          </ListItem>
          {renderMenuItems('system')}
          
        </List>
      </Box>
      
      {/* Footer */}
      <Box sx={{ p: 2, borderTop: '1px solid #e0e0e0' }}>
        <Typography variant="caption" color="text.secondary" align="center" display="block">
          {t('app.title')}
        </Typography>
        <Typography variant="caption" color="text.secondary" align="center" display="block">
          v1.0.0 - ROS Noetic
        </Typography>
      </Box>
    </Drawer>
  );
};

export default Sidebar;
