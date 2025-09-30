import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardMedia,
  CardActions,
  Button,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Fab,
  IconButton,
  Chip
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Map as MapIcon,
  Visibility as ViewIcon
} from '@mui/icons-material';
import { getApiUrl } from '../config/config';
import { useI18n } from '../i18n/i18n';
import MapEditor from '../components/MapEditor';

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
  preview?: string; // Base64 image preview
}

interface MapManagementPageProps {
  isConnected: boolean;
}

const MapManagementPage: React.FC<MapManagementPageProps> = ({ isConnected }) => {
  const { t } = useI18n();
  const [savedMaps, setSavedMaps] = useState<SavedMap[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedMap, setSelectedMap] = useState<SavedMap | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mapToDelete, setMapToDelete] = useState<SavedMap | null>(null);

  // Load saved maps from backend
  useEffect(() => {
    loadSavedMaps();
  }, []);

  const loadSavedMaps = async () => {
    try {
      setLoading(true);
      const response = await fetch(getApiUrl('/api/maps'));

      if (response.ok) {
        const data = await response.json();
        setSavedMaps(data.maps || []);
      } else {
        throw new Error('Failed to load maps');
      }
    } catch (err) {
      setError('Không thể tải danh sách maps: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditMap = (map: SavedMap) => {
    setSelectedMap(map);
    setEditDialogOpen(true);
  };

  const handleDeleteMap = (map: SavedMap) => {
    setMapToDelete(map);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteMap = async () => {
    if (!mapToDelete) return;

    try {
      setLoading(true);
      const response = await fetch(getApiUrl(`/api/maps/${mapToDelete.id}`), {
        method: 'DELETE'
      });

      if (response.ok) {
        setSavedMaps(prev => prev.filter(map => map.id !== mapToDelete.id));
        setSuccess('Đã xóa map thành công!');
      } else {
        throw new Error('Failed to delete map');
      }
    } catch (err) {
      setError('Không thể xóa map: ' + (err as Error).message);
    } finally {
      setLoading(false);
      setDeleteDialogOpen(false);
      setMapToDelete(null);
    }
  };

  const handleCreateNewMap = () => {
    const newMap: SavedMap = {
      id: `map_${Date.now()}`,
      name: 'Map mới',
      elements: [],
      width: 800,
      height: 600,
      resolution: 0.05,
      created: new Date().toISOString(),
      modified: new Date().toISOString()
    };
    setSelectedMap(newMap);
    setEditDialogOpen(true);
  };

  const handleSaveMap = async (mapData: SavedMap) => {
    try {
      setLoading(true);
      const isNew = !savedMaps.find(map => map.id === mapData.id);

      const response = await fetch(getApiUrl('/api/maps'), {
        method: isNew ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(mapData)
      });

      if (response.ok) {
        const result = await response.json();
        if (isNew) {
          setSavedMaps(prev => [...prev, result.map]);
        } else {
          setSavedMaps(prev => prev.map(map =>
            map.id === mapData.id ? result.map : map
          ));
        }
        setSuccess(isNew ? 'Đã tạo map mới thành công!' : 'Đã lưu map thành công!');
        setEditDialogOpen(false);
        setSelectedMap(null);
      } else {
        throw new Error('Failed to save map');
      }
    } catch (err) {
      setError('Không thể lưu map: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN');
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
          🗺️ Quản lý Maps
        </Typography>
        <Fab
          color="primary"
          onClick={handleCreateNewMap}
          sx={{ ml: 2 }}
        >
          <AddIcon />
        </Fab>
      </Box>

      {/* Connection Status */}
      {!isConnected && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Chưa kết nối với hệ thống. Một số chức năng có thể bị hạn chế.
        </Alert>
      )}

      {/* Maps Grid */}
      {loading ? (
        <Typography>Đang tải...</Typography>
      ) : (
        <Grid container spacing={3}>
          {savedMaps.map((map) => (
            <Grid item xs={12} sm={6} md={4} key={map.id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* Map Preview */}
                <CardMedia
                  sx={{
                    height: 200,
                    backgroundColor: '#f5f5f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {map.preview ? (
                    <img
                      src={map.preview}
                      alt={map.name}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <MapIcon sx={{ fontSize: 60, color: 'grey.400' }} />
                  )}
                </CardMedia>

                {/* Map Info */}
                <CardContent sx={{ flexGrow: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
                    {map.name}
                  </Typography>

                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                    <Chip
                      label={`${map.width}x${map.height}`}
                      size="small"
                      variant="outlined"
                    />
                    <Chip
                      label={`${map.elements.length} elements`}
                      size="small"
                      variant="outlined"
                    />
                  </Box>

                  <Typography variant="body2" color="text.secondary">
                    Tạo: {formatDate(map.created)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Sửa: {formatDate(map.modified)}
                  </Typography>
                </CardContent>

                {/* Actions */}
                <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
                  <Button
                    startIcon={<ViewIcon />}
                    size="small"
                    onClick={() => handleEditMap(map)}
                  >
                    Xem
                  </Button>
                  <Box>
                    <IconButton
                      onClick={() => handleEditMap(map)}
                      color="primary"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      onClick={() => handleDeleteMap(map)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </CardActions>
              </Card>
            </Grid>
          ))}

          {/* Empty State */}
          {savedMaps.length === 0 && !loading && (
            <Grid item xs={12}>
              <Card sx={{ textAlign: 'center', py: 6 }}>
                <CardContent>
                  <MapIcon sx={{ fontSize: 80, color: 'grey.400', mb: 2 }} />
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    Chưa có map nào
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Tạo map đầu tiên để bắt đầu quản lý bản đồ của bạn
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleCreateNewMap}
                  >
                    Tạo Map Mới
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      )}

      {/* Edit Map Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          {selectedMap ? (savedMaps.find(m => m.id === selectedMap.id) ? 'Chỉnh sửa Map' : 'Tạo Map Mới') : ''}
        </DialogTitle>
        <DialogContent sx={{ height: '70vh' }}>
          {selectedMap && (
            <MapEditor
              initialElements={selectedMap.elements}
              width={selectedMap.width}
              height={selectedMap.height}
              onSave={(elements) => {
                const updatedMap = {
                  ...selectedMap,
                  elements,
                  modified: new Date().toISOString()
                };
                handleSaveMap(updatedMap);
              }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>
            Hủy
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Xác nhận xóa</DialogTitle>
        <DialogContent>
          <Typography>
            Bạn có chắc chắn muốn xóa map "{mapToDelete?.name}"?
            Hành động này không thể hoàn tác.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            Hủy
          </Button>
          <Button onClick={confirmDeleteMap} color="error" variant="contained">
            Xóa
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
      >
        <Alert onClose={() => setError(null)} severity="error">
          {error}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!success}
        autoHideDuration={4000}
        onClose={() => setSuccess(null)}
      >
        <Alert onClose={() => setSuccess(null)} severity="success">
          {success}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MapManagementPage;