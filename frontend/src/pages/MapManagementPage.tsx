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
  Chip,
  Tooltip
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Map as MapIcon,
  Visibility as ViewIcon,
  Publish as DeployIcon,
  GetApp as ExportIcon
} from '@mui/icons-material';
import { getApiUrl } from '../config/config';
import { useI18n } from '../i18n/i18n';
import MapEditor from '../components/MapEditor';
import MapMiniPreview from '../components/MapMiniPreview';

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
  ros_files?: {
    yaml_file: string;
    pgm_file: string;
    full_path: string;
    exported_at?: string;
  };
  waypoints?: Waypoint[];
  paths?: PathInfo[];
}

interface MapImageData {
  width: number;
  height: number;
  data: string;
  max_value: number;
}

interface Waypoint {
  id: string;
  name: string;
  description?: string;
  x: number;
  y: number;
  z?: number;
  yaw?: number;
}

interface PathInfo {
  id: string;
  name: string;
  type: 'direct' | 'winding';
  waypoint_ids: string[];
  intermediate_points?: { x: number; y: number }[];
  description?: string;
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
  const [activeMapInfo, setActiveMapInfo] = useState<any>(null);
  const [mapImages, setMapImages] = useState<Record<string, MapImageData | null>>({});

  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedMap, setSelectedMap] = useState<SavedMap | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mapToDelete, setMapToDelete] = useState<SavedMap | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewMap, setPreviewMap] = useState<SavedMap | null>(null);

  const closeEditDialog = () => {
    setEditDialogOpen(false);
    setSelectedMap(null);
  };

  const closePreviewDialog = () => {
    setPreviewDialogOpen(false);
    setPreviewMap(null);
  };

  const fetchMapImage = async (mapId: string) => {
    try {
      const response = await fetch(getApiUrl(`/api/maps/${mapId}/image`));
      if (!response.ok) {
        setMapImages(prev => ({ ...prev, [mapId]: null }));
        return;
      }
      const data = await response.json();
      setMapImages(prev => ({ ...prev, [mapId]: data.image }));
    } catch (error) {
      setMapImages(prev => ({ ...prev, [mapId]: null }));
    }
  };

  // Load saved maps from backend
  useEffect(() => {
    loadSavedMaps();
    loadActiveMapInfo();
  }, []);

  useEffect(() => {
    savedMaps.forEach(map => {
      if (map.ros_files && !(map.id in mapImages)) {
        fetchMapImage(map.id);
      }
    });
  }, [savedMaps, mapImages]);

  useEffect(() => {
    savedMaps.forEach(map => {
      if (map.ros_files && !(map.id in mapImages)) {
        fetchMapImage(map.id);
      }
    });
  }, [savedMaps, mapImages]);

  useEffect(() => {
    if (previewDialogOpen && previewMap && !(previewMap.id in mapImages)) {
      fetchMapImage(previewMap.id);
    }
  }, [previewDialogOpen, previewMap, mapImages]);

  const loadSavedMaps = async () => {
    try {
      setLoading(true);
      const response = await fetch(getApiUrl('/api/maps'));

      if (response.ok) {
        const data = await response.json();
        setSavedMaps(data.maps || []);
        setMapImages({});
      } else {
        throw new Error('Failed to load maps');
      }
    } catch (err) {
      setError('Không thể tải danh sách maps: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadActiveMapInfo = async () => {
    try {
      const response = await fetch(getApiUrl('/api/maps/active'));
      if (response.ok) {
        const data = await response.json();
        setActiveMapInfo(data);
      }
    } catch (err) {
      console.log('Could not load active map info:', err);
    }
  };

  const handleEditMap = (map: SavedMap) => {
    setSelectedMap(map);
    setEditDialogOpen(true);
  };

  const handlePreviewMap = (map: SavedMap) => {
    setPreviewMap(map);
    setPreviewDialogOpen(true);
    if (!(map.id in mapImages)) {
      fetchMapImage(map.id);
    }
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

  const handleExportMap = async (map: SavedMap) => {
    try {
      setLoading(true);
      const response = await fetch(getApiUrl(`/api/maps/${map.id}/export`), {
        method: 'POST'
      });

      if (response.ok) {
        const result = await response.json();
        if (result.status === 'already_exported') {
          setSuccess(`Map "${map.name}" đã được export trước đó. Có thể deploy ngay.`);
        } else {
          setSuccess(`Map "${map.name}" đã được export thành .pgm và .yaml thành công! Bây giờ có thể deploy được.`);
        }
        // Reload maps to get updated ros_files info
        await loadSavedMaps();
      } else {
        const errorData = await response.text();
        throw new Error(`Failed to export map: ${errorData}`);
      }
    } catch (err) {
      setError('Không thể export map: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeployMap = async (map: SavedMap) => {
    try {
      setLoading(true);
      const response = await fetch(getApiUrl(`/api/maps/${map.id}/deploy`), {
        method: 'POST'
      });

      if (response.ok) {
        const result = await response.json();
        setSuccess(`Map "${map.name}" đã được deploy thành công! Bây giờ đây là map active cho ROS navigation.`);
        // Reload active map info
        loadActiveMapInfo();
      } else {
        const errorData = await response.text();
        throw new Error(`Failed to deploy map: ${errorData}`);
      }
    } catch (err) {
      setError('Không thể deploy map: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewMap = () => {
    const newMap: SavedMap = {
      id: `map_${Date.now()}`,
      name: '', // Empty name để user nhập tên mới
      elements: [],
      width: 800,
      height: 600,
      resolution: 0.05,
      created: new Date().toISOString(),
      modified: new Date().toISOString()
    };
    console.log("Creating new map");
    
    setSelectedMap(newMap);
    setEditDialogOpen(true);
  };

  const handleSaveMap = async (mapData: SavedMap) => {
    try {
      setLoading(true);
      const isNew = !savedMaps.find(map => map.id === mapData.id);

      console.log("Calling Api with data: ", mapData);

      const response = await fetch(getApiUrl('/api/maps'), {
        method: 'POST', // Backend chỉ có POST cho cả create và update
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(mapData)
      });

      if (response.ok) {
        const result = await response.json();
        // Check if result is the map data itself or wrapped in an object
        const savedMapData = result.map || result;
        
        if (isNew) {
          setSavedMaps(prev => [...prev, savedMapData]);
        } else {
          setSavedMaps(prev => prev.map(map =>
            map.id === mapData.id ? savedMapData : map
          ));
        }
        setSuccess(isNew ? 'Đã tạo map mới thành công!' : 'Đã lưu map thành công!');
        setEditDialogOpen(false);
        setSelectedMap(null);
      } else {
        const errorData = await response.text();
        throw new Error(`Failed to save map: ${errorData}`);
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
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
            🗺️ Quản lý Maps
          </Typography>
          {activeMapInfo && activeMapInfo.status === 'active_map_found' && (
            <Typography variant="body2" sx={{ mt: 1, color: 'success.main' }}>
              ✅ Map active hiện tại: {activeMapInfo.active_map.yaml_file} 
              (modified: {new Date(activeMapInfo.active_map.yaml_modified).toLocaleString('vi-VN')})
            </Typography>
          )}
          {activeMapInfo && activeMapInfo.status === 'no_active_map' && (
            <Typography variant="body2" sx={{ mt: 1, color: 'warning.main' }}>
              ⚠️ Chưa có map active nào
            </Typography>
          )}
        </Box>
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
                <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                  <Box
                    sx={{
                      mb: 2,
                      borderRadius: 2,
                      overflow: 'hidden',
                      border: '1px solid #e0e0e0',
                      backgroundColor: '#f5f5f5'
                    }}
                  >
                    <MapMiniPreview
                      elements={map.elements}
                      width={map.width}
                      height={map.height}
                      canvasWidth={320}
                      canvasHeight={220}
                      showGrid
                      gridSize={40}
                      image={mapImages[map.id] ?? undefined}
                    />
                    {map.elements.length === 0 && !mapImages[map.id] && (
                      <Typography variant="caption" color="text.secondary" align="center" sx={{ py: 1 }}>
                        Đang tải dữ liệu map...
                      </Typography>
                    )}
                  </Box>
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
                    {map.ros_files ? (
                      <Chip
                        label="✅ Ready to Deploy"
                        size="small"
                        color="success"
                        variant="filled"
                      />
                    ) : (
                      <Chip
                        label="⚠️ Needs Export"
                        size="small"
                        color="warning"
                        variant="outlined"
                      />
                    )}
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
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                      startIcon={<ViewIcon />}
                      size="small"
                      onClick={() => handlePreviewMap(map)}
                    >
                      Xem
                    </Button>
                    
                    {/* Export button - show if map doesn't have ROS files */}
                    {!map.ros_files && (
                      <Tooltip title="Export map vẽ tay thành files .pgm và .yaml để có thể deploy">
                        <span>
                          <Button
                            startIcon={<ExportIcon />}
                            size="small"
                            variant="outlined"
                            color="primary"
                            onClick={() => handleExportMap(map)}
                            disabled={loading || !isConnected}
                          >
                            Export
                          </Button>
                        </span>
                      </Tooltip>
                    )}
                    
                    {/* Deploy button - show if map has ROS files */}
                    <Tooltip title={
                      map.ros_files 
                        ? "Deploy map này thành map active cho ROS navigation. Map hiện tại sẽ được ghi đè."
                        : "Cần export map trước khi deploy"
                    }>
                      <span>
                        <Button
                          startIcon={<DeployIcon />}
                          size="small"
                          variant="contained"
                          color="success"
                          onClick={() => handleDeployMap(map)}
                          disabled={loading || !isConnected || !map.ros_files}
                        >
                          Deploy
                        </Button>
                      </span>
                    </Tooltip>
                  </Box>
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

      {/* Preview Map Dialog */}
      <Dialog
        open={previewDialogOpen}
        onClose={closePreviewDialog}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>{previewMap?.name ?? 'Xem Map'}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
            {previewMap ? (
              <Box sx={{ width: '100%', maxWidth: 960 }}>
                <MapMiniPreview
                  elements={previewMap.elements}
                  width={previewMap.width}
                  height={previewMap.height}
                  canvasWidth={960}
                  canvasHeight={600}
                  showGrid
                  gridSize={40}
                  image={mapImages[previewMap.id] ?? undefined}
                />
                {previewMap.elements.length === 0 && !mapImages[previewMap.id] && (
                  <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 1 }}>
                    Đang tải dữ liệu map...
                  </Typography>
                )}
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', color: 'text.secondary' }}>
                <MapIcon sx={{ fontSize: 80, mb: 2 }} />
                <Typography variant="body2">
                  Không có dữ liệu map để hiển thị.
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closePreviewDialog}>
            Đóng
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Map Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={closeEditDialog}
        maxWidth="lg"
        fullWidth
        disableRestoreFocus
        keepMounted={false}
        disableEnforceFocus
      >
        <DialogTitle>
          {selectedMap ? (savedMaps.find(m => m.id === selectedMap.id) ? 'Chỉnh sửa Map' : 'Tạo Map Mới') : ''}
        </DialogTitle>
        <DialogContent sx={{ height: '70vh' }}>
          {selectedMap && (
            <MapEditor
              key={selectedMap?.id ?? 'new-map'}
              initialElements={selectedMap.elements}
              width={selectedMap.width}
              height={selectedMap.height}
              savedMaps={savedMaps}
              initialMapData={selectedMap}
              onMapMetadataUpdate={(mapData) => {
                setSavedMaps(prev => prev.map(map => {
                  if (map.id !== mapData.id) return map;
                  return { ...map, ...mapData };
                }));
                setSelectedMap(prev => {
                  if (!prev || prev.id !== mapData.id) return prev;
                  return { ...prev, ...mapData };
                });
              }}
              onSave={(elements) => {
                const updatedMap = {
                  ...selectedMap,
                  elements,
                  modified: new Date().toISOString()
                };
                handleSaveMap(updatedMap);
              }}
              onSaveMap={(mapData) => {
                // Update the selected map name when saved
                const updatedMap = {
                  ...selectedMap,
                  ...mapData,
                  modified: new Date().toISOString()
                };
                handleSaveMap(updatedMap);
              }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={closeEditDialog}
            tabIndex={editDialogOpen ? 0 : -1}
          >
            Hủy
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog 
        open={deleteDialogOpen} 
        onClose={() => setDeleteDialogOpen(false)}
        disableRestoreFocus
        keepMounted={false}
        disableEnforceFocus
      >
        <DialogTitle>Xác nhận xóa</DialogTitle>
        <DialogContent>
          <Typography>
            Bạn có chắc chắn muốn xóa map "{mapToDelete?.name}"?
            Hành động này không thể hoàn tác.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setDeleteDialogOpen(false)}
            tabIndex={deleteDialogOpen ? 0 : -1}
          >
            Hủy
          </Button>
          <Button 
            onClick={confirmDeleteMap} 
            color="error" 
            variant="contained"
            tabIndex={deleteDialogOpen ? 0 : -1}
          >
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
