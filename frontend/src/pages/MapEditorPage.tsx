import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Alert,
  Snackbar,
  Tabs,
  Tab,
  Paper
} from '@mui/material';

// Types
interface MapElement {
  id: string;
  type: 'line' | 'rectangle' | 'circle';
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  x2?: number;
  y2?: number;
  color: string;
  selected: boolean;
}

interface SavedMap {
  id: string;
  name: string;
  elements: MapElement[];
  width: number;
  height: number;
  resolution: number;
  created: string;
  modified: string;
}

interface MapEditorPageProps {
  isConnected: boolean;
  onNavigate?: (page: string) => void;
}

const MapEditorPage: React.FC<MapEditorPageProps> = ({ isConnected, onNavigate }) => {
  const [savedMaps, setSavedMaps] = useState<SavedMap[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);

  // Load saved maps from backend
  const loadSavedMaps = async () => {
    try {
      setLoading(true);
      console.log('🔍 Loading maps from: /api/maps');
      const response = await fetch('/api/maps');

      console.log('📡 Response status:', response.status, response.statusText);

      if (!response.ok) {
        throw new Error(`Failed to load maps: ${response.statusText}`);
      }

      const maps = await response.json();
      console.log('📊 Loaded maps:', maps);
      setSavedMaps(maps);
      
    } catch (err) {
      console.error('Error loading maps:', err);
      setError(err instanceof Error ? err.message : 'Failed to load maps');
    } finally {
      setLoading(false);
    }
  };

  // Load maps on component mount
  useEffect(() => {
    loadSavedMaps();
  }, []);

  // Publish map to ROS2
  const handlePublishToROS2 = async (mapId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/maps/${mapId}/publish`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to publish map: ${response.statusText}`);
      }
      
      const result = await response.json();
      setSuccess(`Map published to ROS2: ${result.message}`);
      
    } catch (err) {
      console.error('Error publishing map to ROS2:', err);
      setError(err instanceof Error ? err.message : 'Failed to publish map to ROS2');
    } finally {
      setLoading(false);
    }
  };

  // Delete map
  const handleDeleteMap = async (mapId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/maps/${mapId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete map: ${response.statusText}`);
      }
      
      // Remove from local state
      setSavedMaps(prev => prev.filter(m => m.id !== mapId));
      setSuccess('Map deleted successfully!');
      
    } catch (err) {
      console.error('Error deleting map:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete map');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        🎨 Map Editor
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Create and edit 2D maps for robot navigation
      </Typography>

      {/* Connection Status */}
      {!isConnected && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Backend connection lost. Maps will be saved locally but cannot be published to ROS2.
        </Alert>
      )}

      {/* Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="🎨 Map Editor" />
          <Tab label="📊 Map Statistics" />
          <Tab label="🔧 ROS2 Integration" />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      {tabValue === 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            🎨 Map Management
          </Typography>
          
          <Box sx={{ mb: 3 }}>
            <Button
              variant="contained"
              onClick={() => onNavigate?.('maps/create')}
              sx={{ mr: 2 }}
            >
              ➕ Create New Map
            </Button>
          </Box>

          {/* Saved Maps List */}
          <Typography variant="h6" gutterBottom>
            📋 Saved Maps
          </Typography>
          
          {savedMaps.length === 0 ? (
            <Alert severity="info">
              No maps saved yet. Create your first map using the "Create New Map" button.
            </Alert>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {savedMaps.map((map) => (
                <Paper key={map.id} sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {map.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {map.elements.length} elements • {map.width}×{map.height}px • {map.resolution}m/px
                    </Typography>
                    <br />
                    <Typography variant="caption" color="text.secondary">
                      Modified: {new Date(map.modified).toLocaleString()}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="outlined"
                      onClick={() => onNavigate?.(`maps/edit/${map.id}`)}
                      size="small"
                    >
                      ✏️ Edit
                    </Button>
                    <Button
                      onClick={() => handlePublishToROS2(map.id)}
                      disabled={!isConnected || loading}
                      size="small"
                      variant="contained"
                      color="primary"
                    >
                      🚀 Publish to ROS2
                    </Button>
                    <Button
                      onClick={() => handleDeleteMap(map.id)}
                      disabled={loading}
                      size="small"
                      variant="outlined"
                      color="error"
                    >
                      🗑️ Delete
                    </Button>
                  </Box>
                </Paper>
              ))}
            </Box>
          )}
        </Paper>
      )}

      {tabValue === 1 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            📊 Map Statistics
          </Typography>
          
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, mb: 3 }}>
            <Box sx={{ textAlign: 'center', p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="h4" color="primary.main">
                {savedMaps.length}
              </Typography>
              <Typography variant="body2">
                Total Maps
              </Typography>
            </Box>
            
            <Box sx={{ textAlign: 'center', p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="h4" color="secondary.main">
                {savedMaps.reduce((sum, map) => sum + map.elements.length, 0)}
              </Typography>
              <Typography variant="body2">
                Total Elements
              </Typography>
            </Box>
            
            <Box sx={{ textAlign: 'center', p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="h4" color="success.main">
                {savedMaps.length > 0 ? Math.round(savedMaps.reduce((sum, map) => sum + map.elements.length, 0) / savedMaps.length) : 0}
              </Typography>
              <Typography variant="body2">
                Avg Elements/Map
              </Typography>
            </Box>
          </Box>

          {/* Map List */}
          <Typography variant="h6" gutterBottom>
            📋 Saved Maps
          </Typography>
          
          {savedMaps.length === 0 ? (
            <Alert severity="info">
              No maps saved yet. Create your first map using the Map Editor tab.
            </Alert>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {savedMaps.map((map) => (
                <Paper key={map.id} sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {map.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {map.elements.length} elements • {map.width}×{map.height}px • {map.resolution}m/px
                    </Typography>
                    <br />
                    <Typography variant="caption" color="text.secondary">
                      Modified: {new Date(map.modified).toLocaleString()}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <button
                      onClick={() => handlePublishToROS2(map.id)}
                      disabled={!isConnected || loading}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#1976d2',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: isConnected && !loading ? 'pointer' : 'not-allowed',
                        opacity: isConnected && !loading ? 1 : 0.5
                      }}
                    >
                      🚀 Publish to ROS2
                    </button>
                    <button
                      onClick={() => handleDeleteMap(map.id)}
                      disabled={loading}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#d32f2f',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        opacity: loading ? 0.5 : 1
                      }}
                    >
                      🗑️ Delete
                    </button>
                  </Box>
                </Paper>
              ))}
            </Box>
          )}
        </Paper>
      )}

      {tabValue === 2 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            🔧 ROS2 Integration
          </Typography>
          
          <Alert severity="info" sx={{ mb: 2 }}>
            Maps created in the editor are automatically converted to ROS2 OccupancyGrid format when saved.
          </Alert>

          <Typography variant="subtitle2" gutterBottom>
            🔄 Conversion Process:
          </Typography>
          <ul>
            <li><strong>Lines:</strong> Converted to thick walls (occupied cells)</li>
            <li><strong>Rectangles:</strong> Converted to solid obstacles (occupied cells)</li>
            <li><strong>Circles:</strong> Converted to circular obstacles (occupied cells)</li>
            <li><strong>Background:</strong> Converted to free space (free cells)</li>
          </ul>

          <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
            📡 ROS2 Topics:
          </Typography>
          <ul>
            <li><strong>/map_custom:</strong> Published custom maps</li>
            <li><strong>/map:</strong> Standard SLAM-generated maps</li>
            <li><strong>/map_enhanced:</strong> Enhanced maps from SLAM manager</li>
          </ul>

          <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
            ⚙️ Map Parameters:
          </Typography>
          <ul>
            <li><strong>Resolution:</strong> Meters per pixel (default: 0.05m/px)</li>
            <li><strong>Origin:</strong> Map center coordinates</li>
            <li><strong>Frame ID:</strong> 'map' (ROS2 standard)</li>
            <li><strong>Data Format:</strong> OccupancyGrid (0=free, 100=occupied, -1=unknown)</li>
          </ul>
        </Paper>
      )}

      {/* Success/Error Snackbars */}
      <Snackbar
        open={!!success}
        autoHideDuration={4000}
        onClose={() => setSuccess(null)}
      >
        <Alert severity="success" onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
      >
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MapEditorPage;
