import React, { useState, useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, AppBar, Toolbar, Typography, IconButton, Backdrop } from '@mui/material';
import { Menu as MenuIcon } from '@mui/icons-material';

// Import components
import Sidebar from './components/Sidebar';
import ConnectionDebugger from './components/ConnectionDebugger';

// Import pages
import DashboardPage from './pages/DashboardPage';
import RobotControlPage from './pages/RobotControlPage';
// import NavigationPage from './pages/NavigationPage';
import SensorsPage from './pages/SensorsPage';
import Map2DPage from './pages/Map2DPage';
import Map3DPage from './pages/Map3DPage';
import MapEditorPage from './pages/MapEditorPage';
import MapManagementPage from './pages/MapManagementPage';
import CreateMapPage from './pages/CreateMapPage';
import EditMapPage from './pages/EditMapPage';
import TaskManagementPage from './pages/TaskManagementPage';
import ChartsPage from './pages/ChartsPage';
import DiagnosticsPage from './pages/DiagnosticsPage';
//import TerminalPage from './pages/TerminalPage';
import LogsPage from './pages/LogsPage';
import ParametersPage from './pages/ParametersPage';
import NodesPage from './pages/NodesPage';
import SystemStatusPage from './pages/SystemStatusPage';
import SystemGuidePage from './pages/SystemGuidePage';

// Import WebSocket hook and config
import { useWebSocket } from './hooks/useWebSocket_simple';
import { getWebSocketUrl,getApiUrl } from './config/config';
import { useI18n } from './i18n/i18n';
import LanguageSwitch from './components/LanguageSwitch';

// Create Material-UI theme
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
      dark: '#115293',
      light: '#42a5f5'
    },
    secondary: {
      main: '#dc004e',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff'
    },
    text: {
      primary: '#212121',
      secondary: '#757575'
    }
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h6: {
      fontWeight: 600,
      color: '#212121'
    },
    body1: {
      color: '#424242'
    },
    body2: {
      color: '#616161'
    }
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          border: '1px solid #e0e0e0'
        }
      }
    }
  }
});

function App() {
  const { t } = useI18n();
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [selectedPage, setSelectedPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // WebSocket connection
  const {
    isConnected,
    robotData,
    sensorData,
    systemData,
    sendCommand
  } = useWebSocket(getWebSocketUrl()); // Dynamic backend URL from config

  useEffect(() => {
    if (isConnected) {
      setConnectionStatus('connected');
    } else {
      setConnectionStatus('disconnected');
    }
  }, [isConnected]);

  // State for map data management
  const [mapFetchAttempts, setMapFetchAttempts] = useState(0);
  const maxMapFetchAttempts = 3;

  // Fetch map data on startup and when connection is established
  const fetchMapData = async (retryCount = 0) => {
    try {
      console.log(`🗺️ [App] Fetching map data (attempt ${retryCount + 1}/${maxMapFetchAttempts})`);

      // Use refresh endpoint for retries to force fresh data
      const useRefresh = retryCount > 0;
      const url = useRefresh ? '/api/map/refresh' : '/api/map';
      const method = useRefresh ? 'POST' : 'GET';

      const response = await fetch(getApiUrl(url), { method });

      if (response.ok) {
        const result = await response.json();
        console.log('🗺️ [App] Map fetch response:', result);

        if (result.status === 'success' && result.map) {
          // Use the WebSocket hook's setSensorData to properly update state
          // We need to trigger a custom event to update sensor data
          const mapUpdateEvent = new CustomEvent('mapDataUpdate', {
            detail: { map: result.map }
          });
          window.dispatchEvent(mapUpdateEvent);
          console.log('🗺️ [App] Map data updated successfully');
          setMapFetchAttempts(0); // Reset attempts on success
        } else {
          throw new Error(result.message || 'No map data available');
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`❌ [App] Failed to fetch map (attempt ${retryCount + 1}):`, error);

      // Retry if we haven't exceeded max attempts
      if (retryCount < maxMapFetchAttempts - 1) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        console.log(`🔄 [App] Retrying map fetch in ${delay}ms...`);
        setTimeout(() => {
          setMapFetchAttempts(retryCount + 1);
          fetchMapData(retryCount + 1);
        }, delay);
      } else {
        console.error('❌ [App] Max map fetch attempts reached, giving up');
      }
    }
  };

  // Fetch map on startup
  useEffect(() => {
    fetchMapData();
  }, []);

  // Retry map fetch when connection is established (if we don't have map data)
  useEffect(() => {
    if (isConnected && !sensorData.map && mapFetchAttempts < maxMapFetchAttempts) {
      console.log('🔄 [App] Connection established, retrying map fetch...');
      fetchMapData(mapFetchAttempts);
    }
  }, [isConnected]);

  // Render current page
  const renderCurrentPage = () => {
    // Handle dynamic routes first
    if (selectedPage.startsWith('maps/edit/')) {
      const mapId = selectedPage.replace('maps/edit/', '');
      return <EditMapPage key={mapId} mapId={mapId} onNavigate={setSelectedPage} />;
    }
    
    switch (selectedPage) {
      case 'dashboard':
        return (
          <DashboardPage
            robotData={robotData}
            sensorData={sensorData}
            systemData={systemData}
            isConnected={isConnected}
            onCommand={sendCommand}
          />
        );
      case 'robot-control':
        return (
          <RobotControlPage
            robotData={robotData}
            sensorData={sensorData}
            isConnected={isConnected}
            onCommand={sendCommand}
          />
        );
      // case 'navigation':
      //   return (
      //     <NavigationPage
      //       robotData={robotData}
      //       sensorData={sensorData}
      //       isConnected={isConnected}
      //       onCommand={sendCommand}
      //     />
      //   );
      case 'sensors':
        return (
          <SensorsPage
            sensorData={sensorData}
            isConnected={isConnected}
          />
        );
      case 'map-2d':
      case 'map-management-status':
        return (
          <Map2DPage
            robotData={robotData}
            sensorData={sensorData}
            isConnected={isConnected}
            onCommand={sendCommand}
          />
        );
      case 'map-management-maps':
        return (
          <MapManagementPage
            isConnected={isConnected}
          />
        );
      case 'map-management-tasks':
        return (
          <TaskManagementPage
            isConnected={isConnected}
            onCommand={sendCommand}
          />
        );
      case 'map-3d':
        return (
          <Map3DPage
            robotData={robotData}
            sensorData={sensorData}
            isConnected={isConnected}
            onCommand={sendCommand}
          />
        );
      case 'map-editor':
        return (
          <MapEditorPage
            isConnected={isConnected}
            onNavigate={setSelectedPage}
          />
        );
      case 'maps/create':
        return <CreateMapPage onNavigate={setSelectedPage} />;
      case 'charts':
        return (
          <ChartsPage
            robotData={robotData}
            sensorData={sensorData}
            systemData={systemData}
          />
        );
      case 'diagnostics':
        return (
          <DiagnosticsPage
            systemData={systemData}
            isConnected={isConnected}
          />
        );
      // case 'terminal':
      //   return <TerminalPage />;
      case 'logs':
        return (
          <LogsPage
            isConnected={isConnected}
            systemData={systemData}
          />
        );
      case 'parameters':
        return (
          <ParametersPage
            isConnected={isConnected}
            onCommand={sendCommand}
          />
        );
      case 'nodes':
        return (
          <NodesPage
            isConnected={isConnected}
            onCommand={sendCommand}
            systemData={systemData}
          />
        );
      case 'system-status':
        return (
          <SystemStatusPage
            systemData={systemData}
            isConnected={isConnected}
          />
        );
      case 'system-guide':
        return <SystemGuidePage />;
      default:
        return (
          <DashboardPage
            robotData={robotData}
            sensorData={sensorData}
            systemData={systemData}
            isConnected={isConnected}
            onCommand={sendCommand}
          />
        );
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex' }}>

        {/* Sidebar Navigation */}
        <Sidebar
          selectedPage={selectedPage}
          onPageChange={setSelectedPage}
          isConnected={isConnected}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Backdrop for blur effect when sidebar is open */}
        <Backdrop
          open={sidebarOpen}
          onClick={() => setSidebarOpen(false)}
          sx={{
            zIndex: (theme) => theme.zIndex.drawer - 1,
            backdropFilter: 'blur(4px)',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            transition: 'all 0.3s ease-in-out',
          }}
        />

        {/* Main Content Area */}
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>

          {/* Top App Bar */}
          <AppBar position="static" sx={{ zIndex: (theme) => theme.zIndex.drawer - 1 }}>
            <Toolbar>
              <IconButton
                color="inherit"
                aria-label="open drawer"
                onClick={() => setSidebarOpen(true)}
                edge="start"
                sx={{
                  mr: 2,
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  }
                }}
              >
                <MenuIcon />
              </IconButton>
              <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                {t('app.title')} - {getPageTitle(selectedPage)}
              </Typography>
              {/* Language switch to the left of status */}
              <LanguageSwitch />
              <Typography variant="body2" color={connectionStatus === 'connected' ? 'lightgreen' : 'orange'}>
                {connectionStatus === 'connected' ? t('status.connected') :
                 connectionStatus === 'connecting' ? t('status.connecting') : t('status.disconnected')}
              </Typography>
            </Toolbar>
          </AppBar>

          {/* Page Content */}
          <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
            {renderCurrentPage()}
          </Box>

        </Box>
      </Box>
    </ThemeProvider>
  );

  // Helper function to get page title
  function getPageTitle(page: string): string {
    const titles: { [key: string]: string } = {
      'dashboard': t('page.dashboard'),
      'robot-control': t('page.robot-control'),
      'navigation': t('page.navigation'),
      'sensors': t('page.sensors'),
      'map-2d': t('page.map-2d'),
      'map-management-status': t('page.map-management-status'),
      'map-management-maps': t('page.map-management-maps'),
      'map-management-tasks': t('page.map-management-tasks'),
      'map-3d': t('page.map-3d'),
      'charts': t('page.charts'),
      'diagnostics': t('page.diagnostics'),
      // 'terminal': 'Terminal',
      'logs': t('page.logs'),
      'parameters': t('page.parameters'),
      'nodes': t('page.nodes'),
      'system-status': t('page.system-status'),
      'system-guide': t('page.system-guide')
    };
    return titles[page] || 'Dashboard';
  }
}

export default App;
