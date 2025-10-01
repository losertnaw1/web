import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Chip,
  Alert,
  Snackbar
} from '@mui/material';
import {
  Save as SaveIcon,
  Clear as ClearIcon,
  Undo as UndoIcon,
  Redo as RedoIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import MapCanvas, { MapElement, ShapeType } from '../components/MapCanvas';

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

interface CreateMapPageProps {
  onNavigate?: (page: string) => void;
}

const CreateMapPage: React.FC<CreateMapPageProps> = ({ onNavigate }) => {
  
  // Map state
  const [elements, setElements] = useState<MapElement[]>([]);
  const [selectedTool, setSelectedTool] = useState<ShapeType>('line');
  const [mapName, setMapName] = useState('');
  
  // Map properties
  const [mapWidth, setMapWidth] = useState(800);
  const [mapHeight, setMapHeight] = useState(600);
  const [mapResolution, setMapResolution] = useState(0.05);
  const [gridSize, setGridSize] = useState(20);
  const [showGrid, setShowGrid] = useState(true);
  
  // History for undo/redo
  const [history, setHistory] = useState<MapElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Handle elements change with history
  const handleElementsChange = (newElements: MapElement[]) => {
    setElements(newElements);
    
    // Add to history if it's a significant change
    const lastElements = history[historyIndex];
    if (JSON.stringify(lastElements) !== JSON.stringify(newElements)) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push([...newElements]);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  };

  // Undo/Redo
  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setElements(history[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setElements(history[historyIndex + 1]);
    }
  };

  // Clear map
  const clearMap = () => {
    setElements([]);
    setHistory([[]]);
    setHistoryIndex(0);
  };

  // Delete selected element
  const deleteSelected = () => {
    const newElements = elements.filter(el => !el.selected);
    handleElementsChange(newElements);
  };

  // Save map
  const saveMap = async () => {
    if (!mapName.trim()) {
      setError('Please enter a map name');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const mapData: SavedMap = {
        id: Date.now().toString(),
        name: mapName.trim(),
        elements: [...elements],
        width: mapWidth,
        height: mapHeight,
        resolution: mapResolution,
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      };

      const response = await fetch('/api/maps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mapData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save map: ${response.statusText}`);
      }

      setSuccess(`Map "${mapName}" created successfully!`);
      
      // Navigate back to map management after success
      setTimeout(() => {
        onNavigate?.('map-editor');
      }, 1500);

    } catch (err) {
      console.error('Error creating map:', err);
      setError(err instanceof Error ? err.message : 'Failed to create map');
    } finally {
      setLoading(false);
    }
  };

  const selectedElement = elements.find(el => el.selected);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        🎨 Create New Map
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Draw and design a new map for robot navigation
      </Typography>

      <Grid container spacing={2}>
        {/* Toolbar */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Map Name */}
              <TextField
                label="Map Name"
                value={mapName}
                onChange={(e) => setMapName(e.target.value)}
                size="small"
                sx={{ minWidth: 200 }}
                placeholder="Enter map name..."
                required
              />

              {/* Tool Selection */}
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Drawing Tool</InputLabel>
                <Select
                  value={selectedTool}
                  onChange={(e) => setSelectedTool(e.target.value as ShapeType)}
                  label="Drawing Tool"
                >
                  <MenuItem value="line">📏 Line/Wall</MenuItem>
                  <MenuItem value="rectangle">⬜ Rectangle</MenuItem>
                  <MenuItem value="circle">⭕ Circle</MenuItem>
                </Select>
              </FormControl>

              {/* Action Buttons */}
              <Button
                variant="outlined"
                startIcon={<UndoIcon />}
                onClick={undo}
                disabled={historyIndex <= 0}
                size="small"
              >
                Undo
              </Button>
              
              <Button
                variant="outlined"
                startIcon={<RedoIcon />}
                onClick={redo}
                disabled={historyIndex >= history.length - 1}
                size="small"
              >
                Redo
              </Button>

              <Button
                variant="outlined"
                startIcon={<DeleteIcon />}
                onClick={deleteSelected}
                disabled={!selectedElement}
                color="error"
                size="small"
              >
                Delete
              </Button>

              <Button
                variant="outlined"
                startIcon={<ClearIcon />}
                onClick={clearMap}
                color="warning"
                size="small"
              >
                Clear All
              </Button>

              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={saveMap}
                size="small"
                disabled={!mapName.trim() || loading}
                color="primary"
              >
                {loading ? 'Saving...' : 'Create Map'}
              </Button>

              <Button
                variant="outlined"
                onClick={() => onNavigate?.('map-editor')}
                size="small"
              >
                Cancel
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Canvas Area */}
        <Grid item xs={12} md={9}>
          <Paper sx={{ p: 1 }}>
            <MapCanvas
              elements={elements}
              onElementsChange={handleElementsChange}
              selectedTool={selectedTool}
              mapWidth={mapWidth}
              mapHeight={mapHeight}
              showGrid={showGrid}
              gridSize={gridSize}
            />
          </Paper>
        </Grid>

        {/* Properties Panel */}
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              🔧 Properties
            </Typography>
            
            {/* Map Settings */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Map Settings:
              </Typography>
              
              <TextField
                label="Width (px)"
                type="number"
                value={mapWidth}
                onChange={(e) => setMapWidth(Number(e.target.value))}
                size="small"
                fullWidth
                sx={{ mb: 1 }}
              />
              
              <TextField
                label="Height (px)"
                type="number"
                value={mapHeight}
                onChange={(e) => setMapHeight(Number(e.target.value))}
                size="small"
                fullWidth
                sx={{ mb: 1 }}
              />
              
              <TextField
                label="Resolution (m/px)"
                type="number"
                inputProps={{ step: 0.01 }}
                value={mapResolution}
                onChange={(e) => setMapResolution(Number(e.target.value))}
                size="small"
                fullWidth
                sx={{ mb: 1 }}
              />
            </Box>

            {/* Grid Settings */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Grid Settings:
              </Typography>
              
              <Typography variant="caption">Grid Size: {gridSize}px</Typography>
              <Slider
                value={gridSize}
                onChange={(_, value) => setGridSize(value as number)}
                min={10}
                max={50}
                step={5}
                size="small"
              />
              
              <Button
                variant="outlined"
                size="small"
                onClick={() => setShowGrid(!showGrid)}
                fullWidth
              >
                {showGrid ? 'Hide Grid' : 'Show Grid'}
              </Button>
            </Box>

            {/* Element Info */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Elements: {elements.length}
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip 
                  label={`Lines: ${elements.filter(e => e.type === 'line').length}`}
                  size="small"
                  color="primary"
                />
                <Chip 
                  label={`Rectangles: ${elements.filter(e => e.type === 'rectangle').length}`}
                  size="small"
                  color="secondary"
                />
                <Chip 
                  label={`Circles: ${elements.filter(e => e.type === 'circle').length}`}
                  size="small"
                  color="success"
                />
              </Box>
            </Box>

            {/* Instructions */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Instructions:
              </Typography>
              <Typography variant="caption" component="div">
                1. Enter a map name<br/>
                2. Select a drawing tool<br/>
                3. Click and drag to draw<br/>
                4. Click elements to select<br/>
                5. Drag handles to resize/edit<br/>
                6. Drag borders to move<br/>
                7. Click "Create Map" when done
              </Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>

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

export default CreateMapPage;