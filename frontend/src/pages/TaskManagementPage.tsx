import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Button,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Fab,
  Paper,
  Divider,
  Chip,
  Typography
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Edit as EditIcon,
  DragIndicator as DragIcon,
  Loop as LoopIcon,
  Navigation as NavIcon,
  Build as ActionIcon,
  Help as ConditionIcon,
  CheckCircle as CompleteIcon,
  Save as SaveIcon,
  Cancel as CancelIcon
} from '@mui/icons-material';
import { useI18n } from '../i18n/i18n';

// Types for task system
interface TaskAction {
  id: string;
  type: 'move_to_point' | 'wait' | 'custom_action' | 'loop_start' | 'loop_end' | 'condition_check';
  name: string;
  parameters: Record<string, any>;
  description?: string;
  loopId?: string;
}

interface TaskSequence {
  id: string;
  name: string;
  description: string;
  actions: TaskAction[];
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  created: string;
  lastRun?: string;
  currentActionIndex?: number;
}

interface TaskManagementPageProps {
  isConnected: boolean;
  onCommand?: (command: string, params?: any) => void;
}

const TaskManagementPageNew: React.FC<TaskManagementPageProps> = ({ isConnected, onCommand }) => {
  const { t } = useI18n();

  // State management
  const [taskSequences, setTaskSequences] = useState<TaskSequence[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskSequence | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isNewTask, setIsNewTask] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [draggedAction, setDraggedAction] = useState<TaskAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [exitWarningOpen, setExitWarningOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Available action templates
  const actionTemplates: TaskAction[] = [
    {
      id: 'template_move',
      type: 'move_to_point',
      name: 'Di chuyển đến điểm',
      parameters: { x: 0, y: 0, theta: 0 },
      description: 'Robot di chuyển đến tọa độ được chỉ định'
    },
    {
      id: 'template_wait',
      type: 'wait',
      name: 'Chờ đợi',
      parameters: { duration: 5 },
      description: 'Robot dừng và chờ trong thời gian được chỉ định'
    },
    {
      id: 'template_action',
      type: 'custom_action',
      name: 'Hành động tùy chỉnh',
      parameters: { command: '', params: {} },
      description: 'Thực hiện lệnh tùy chỉnh'
    },
    {
      id: 'template_loop_start',
      type: 'loop_start',
      name: 'Bắt đầu vòng lặp',
      parameters: {
        condition: 'button_press',
        maxIterations: 10,
        conditionType: 'button_press',
        buttonId: 'stop_button',
        timeLimit: 60,
        sensorType: 'battery',
        sensorThreshold: 20
      },
      description: 'Bắt đầu vòng lặp với điều kiện dừng'
    },
    {
      id: 'template_loop_end',
      type: 'loop_end',
      name: 'Kết thúc vòng lặp',
      parameters: {},
      description: 'Kết thúc khối vòng lặp'
    },
    {
      id: 'template_condition',
      type: 'condition_check',
      name: 'Kiểm tra điều kiện',
      parameters: {
        conditionType: 'sensor_value',
        sensorType: 'battery',
        operator: 'less_than',
        threshold: 30,
        actionIfTrue: 'continue',
        actionIfFalse: 'break'
      },
      description: 'Kiểm tra điều kiện và quyết định hành động tiếp theo'
    }
  ];

  // Mock data with running task
  // Load tasks from backend API
  useEffect(() => {
    loadTasksFromBackend();
  }, []);

  const loadTasksFromBackend = async () => {
    try {
      const response = await fetch('/api/tasks');
      if (response.ok) {
        const tasks = await response.json();
        setTaskSequences(tasks);
      } else {
        console.error('Failed to load tasks from backend');
        // Fallback to mock data for development
        setTaskSequences([
          {
            id: 'task_1',
            name: 'Patrol Route A',
            description: 'Tuần tra khu vực A với 3 điểm dừng',
            status: 'running',
            currentActionIndex: 1,
            actions: [
              {
                id: 'action_1',
                type: 'move_to_point',
                name: 'Di chuyển đến điểm 1',
                parameters: { x: 2, y: 2, theta: 0 }
              },
              {
                id: 'action_2',
                type: 'wait',
                name: 'Chờ tại điểm 1',
                parameters: { duration: 10 }
              }
            ],
            created: new Date().toISOString(),
            lastRun: new Date().toISOString()
          },
          {
            id: 'task_2',
            name: 'Delivery Task',
            description: 'Giao hàng từ kho đến văn phòng',
            status: 'idle',
            actions: [
              {
                id: 'action_3',
                type: 'move_to_point',
                name: 'Di chuyển đến kho',
                parameters: { x: -3, y: 1, theta: 0 }
              }
            ],
            created: new Date().toISOString()
          }
        ]);
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
      setError('Failed to load tasks from server');
    }
  };

  // Helper functions
  const checkUnsavedChanges = () => {
    return hasUnsavedChanges;
  };

  const handleExitWarning = (action: () => void) => {
    if (checkUnsavedChanges()) {
      setPendingAction(() => action);
      setExitWarningOpen(true);
    } else {
      action();
    }
  };

  const confirmExit = () => {
    setExitWarningOpen(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
    setHasUnsavedChanges(false);
  };

  const cancelExit = () => {
    setExitWarningOpen(false);
    setPendingAction(null);
  };

  // Task management
  const handleSelectTask = (task: TaskSequence) => {
    handleExitWarning(() => {
      setSelectedTask(task);
      setIsEditing(false);
      setIsNewTask(false);
    });
  };

  const handleCreateNewTask = () => {
    handleExitWarning(() => {
      const newTask: TaskSequence = {
        id: `task_${Date.now()}`,
        name: 'Nhiệm vụ mới',
        description: 'Mô tả nhiệm vụ',
        actions: [],
        status: 'idle',
        created: new Date().toISOString()
      };
      setSelectedTask(newTask);
      setIsEditing(true);
      setIsNewTask(true);
      setHasUnsavedChanges(false);
    });
  };

  const handleEditTask = () => {
    if (selectedTask) {
      setIsEditing(true);
      setIsNewTask(false);
      setHasUnsavedChanges(false);
    }
  };

  const handleSaveTask = async () => {
    if (!selectedTask) return;

    try {
      if (isNewTask) {
        await saveTaskToBackend(selectedTask);
        setTaskSequences(prev => [...prev, selectedTask]);
        setSuccess('Đã tạo nhiệm vụ mới thành công!');
      } else {
        await updateTaskInBackend(selectedTask);
        setTaskSequences(prev =>
          prev.map(t => t.id === selectedTask.id ? selectedTask : t)
        );
        setSuccess('Đã lưu nhiệm vụ thành công!');
      }

      setIsEditing(false);
      setIsNewTask(false);
      setHasUnsavedChanges(false);
    } catch (error) {
      setError('Không thể lưu nhiệm vụ: ' + error.message);
    }
  };

  const handleCancelEdit = () => {
    if (isNewTask) {
      setSelectedTask(null);
    }
    setIsEditing(false);
    setIsNewTask(false);
    setHasUnsavedChanges(false);
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteTaskFromBackend(taskId);
      setTaskSequences(prev => prev.filter(t => t.id !== taskId));
      if (selectedTask && selectedTask.id === taskId) {
        setSelectedTask(null);
        setIsEditing(false);
        setIsNewTask(false);
      }
      setSuccess('Đã xóa nhiệm vụ thành công!');
    } catch (error) {
      setError('Không thể xóa nhiệm vụ: ' + error.message);
    }
  };

  // Backend API functions
  const saveTaskToBackend = async (task: TaskSequence) => {
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: task.name,
        description: task.description,
        actions: task.actions
      })
    });

    if (!response.ok) {
      throw new Error('Failed to save task to backend');
    }

    return response.json();
  };

  const updateTaskInBackend = async (task: TaskSequence) => {
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: task.name,
        description: task.description,
        actions: task.actions,
        status: task.status
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update task in backend');
    }

    return response.json();
  };

  const deleteTaskFromBackend = async (taskId: string) => {
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete task from backend');
    }
  };

  const executeTaskInBackend = async (taskId: string) => {
    const response = await fetch(`/api/tasks/${taskId}/execute`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error('Failed to execute task');
    }

    return response.json();
  };

  const stopTaskInBackend = async (taskId: string) => {
    const response = await fetch(`/api/tasks/${taskId}/stop`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error('Failed to stop task');
    }

    return response.json();
  };

  // Task execution
  const handleRunTask = async (task: TaskSequence) => {
    if (!isConnected) {
      setError('Chưa kết nối với robot!');
      return;
    }

    try {
      await executeTaskInBackend(task.id);

      setTaskSequences(prev =>
        prev.map(t =>
          t.id === task.id
            ? { ...t, status: 'running', lastRun: new Date().toISOString() }
            : t
        )
      );

      setSuccess(`Đã bắt đầu thực hiện nhiệm vụ: ${task.name}`);
    } catch (err) {
      setError('Không thể thực hiện nhiệm vụ: ' + (err as Error).message);
    }
  };

  const handleStopTask = async (task: TaskSequence) => {
    try {
      await stopTaskInBackend(task.id);

      setTaskSequences(prev =>
        prev.map(t =>
          t.id === task.id ? { ...t, status: 'idle' } : t
        )
      );
      setSuccess('Đã dừng nhiệm vụ');
    } catch (err) {
      setError('Không thể dừng nhiệm vụ: ' + (err as Error).message);
    }
  };

  // Drag and drop
  const handleDragStart = (action: TaskAction) => {
    setDraggedAction(action);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    if (!draggedAction || !selectedTask || !isEditing) return;

    const newAction: TaskAction = {
      ...draggedAction,
      id: `action_${Date.now()}`
    };

    setSelectedTask({
      ...selectedTask,
      actions: [...selectedTask.actions, newAction]
    });
    setDraggedAction(null);
    setHasUnsavedChanges(true);
  };

  const removeAction = (actionId: string) => {
    if (!selectedTask || !isEditing) return;

    setSelectedTask({
      ...selectedTask,
      actions: selectedTask.actions.filter(a => a.id !== actionId)
    });
    setHasUnsavedChanges(true);
  };

  // Helper functions for display
  const getActionIcon = (type: string) => {
    switch (type) {
      case 'move_to_point': return <NavIcon fontSize="small" />;
      case 'wait': return <StopIcon fontSize="small" />;
      case 'custom_action': return <ActionIcon fontSize="small" />;
      case 'loop_start':
      case 'loop_end': return <LoopIcon fontSize="small" />;
      case 'condition_check': return <ConditionIcon fontSize="small" />;
      default: return <ActionIcon fontSize="small" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'primary';
      case 'completed': return 'success';
      case 'error': return 'error';
      case 'paused': return 'warning';
      default: return 'default';
    }
  };

  const formatActionDescription = (action: TaskAction) => {
    switch (action.type) {
      case 'move_to_point':
        return `Tọa độ: (${action.parameters.x}, ${action.parameters.y})`;
      case 'wait':
        return `Chờ: ${action.parameters.duration}s`;
      case 'loop_start':
        return `Vòng lặp: ${action.parameters.conditionType}`;
      case 'condition_check':
        return `Kiểm tra: ${action.parameters.sensorType}`;
      case 'custom_action':
        return `Lệnh: ${action.parameters.command}`;
      default:
        return action.description || '';
    }
  };

  // Render helper for right panel
  const renderRightPanel = () => {
    if (selectedTask && isEditing) {
      return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Task Editor Header */}
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="h6" gutterBottom>
              {isNewTask ? 'Tạo Nhiệm vụ Mới' : 'Chỉnh sửa Nhiệm vụ'}
            </Typography>

            {/* Task Info */}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Tên nhiệm vụ"
                  value={selectedTask.name}
                  onChange={(e) => {
                    setSelectedTask({ ...selectedTask, name: e.target.value });
                    setHasUnsavedChanges(true);
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Mô tả"
                  value={selectedTask.description}
                  onChange={(e) => {
                    setSelectedTask({ ...selectedTask, description: e.target.value });
                    setHasUnsavedChanges(true);
                  }}
                />
              </Grid>
            </Grid>

            {/* Action Buttons */}
            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSaveTask}
                disabled={!hasUnsavedChanges}
              >
                Lưu
              </Button>
              <Button
                variant="outlined"
                startIcon={<CancelIcon />}
                onClick={handleCancelEdit}
              >
                Hủy
              </Button>
            </Box>
          </Box>

          {/* Drag Drop Area */}
          <Box sx={{ flexGrow: 1, p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Chuỗi Hành động
            </Typography>

            <Paper
              sx={{
                minHeight: 300,
                p: 2,
                border: '2px dashed',
                borderColor: 'primary.main',
                backgroundColor: 'action.hover'
              }}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {selectedTask.actions.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    Kéo thả hành động từ thư viện vào đây để tạo nhiệm vụ
                  </Typography>
                </Box>
              ) : (
                <List>
                  {selectedTask.actions.map((action, index) => (
                    <ListItem key={action.id} divider>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <DragIcon />
                        <Typography variant="body2" sx={{ minWidth: 30 }}>
                          {index + 1}.
                        </Typography>
                      </Box>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {getActionIcon(action.type)}
                            <Typography>{action.name}</Typography>
                          </Box>
                        }
                        secondary={formatActionDescription(action)}
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          onClick={() => removeAction(action.id)}
                          size="small"
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
            </Paper>
          </Box>
        </Box>
      );
    }

    if (selectedTask && !isEditing) {
      return (
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">{selectedTask.name}</Typography>
            <Chip
              label={selectedTask.status}
              color={getStatusColor(selectedTask.status) as any}
              size="small"
            />
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {selectedTask.description}
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
            <Button
              variant="contained"
              startIcon={<EditIcon />}
              onClick={handleEditTask}
            >
              Chỉnh sửa
            </Button>
            {selectedTask.status === 'running' ? (
              <Button
                variant="outlined"
                startIcon={<StopIcon />}
                onClick={() => handleStopTask(selectedTask)}
                color="error"
              >
                Dừng
              </Button>
            ) : (
              <Button
                variant="outlined"
                startIcon={<PlayIcon />}
                onClick={() => handleRunTask(selectedTask)}
                disabled={!isConnected}
                color="primary"
              >
                Chạy
              </Button>
            )}
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle1" gutterBottom>
            Danh sách hành động ({selectedTask.actions.length})
          </Typography>

          <List>
            {selectedTask.actions.map((action, index) => (
              <ListItem key={action.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2 }}>
                  <Typography variant="body2">{index + 1}.</Typography>
                  {getActionIcon(action.type)}
                </Box>
                <ListItemText
                  primary={action.name}
                  secondary={formatActionDescription(action)}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      );
    }

    return (
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        textAlign: 'center'
      }}>
        <Box>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Chọn nhiệm vụ để xem chi tiết
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            hoặc tạo mới bằng nút + bên trên
          </Typography>
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ p: 3, height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
          🎯 Quản lý Nhiệm vụ
        </Typography>
        <Fab color="primary" onClick={handleCreateNewTask}>
          <AddIcon />
        </Fab>
      </Box>

      {/* Connection Status */}
      {!isConnected && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Chưa kết nối với robot. Không thể thực hiện nhiệm vụ.
        </Alert>
      )}

      {/* Main Layout */}
      <Grid container spacing={3} sx={{ flexGrow: 1, overflow: 'hidden' }}>
        {/* Left Panel */}
        <Grid item xs={12} md={6}>
          <Grid container direction="column" spacing={2} sx={{ height: '100%' }}>
            {/* Task List - Top Half */}
            <Grid item sx={{ height: '50%' }}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="h6" gutterBottom>
                    Danh sách Nhiệm vụ
                  </Typography>

                  <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                    <List>
                      {taskSequences
                        .sort((a, b) => a.status === 'running' ? -1 : 1)
                        .map((task) => (
                        <ListItem
                          key={task.id}
                          button
                          onClick={() => handleSelectTask(task)}
                          selected={selectedTask?.id === task.id}
                          sx={{
                            borderRadius: 1,
                            mb: 1,
                            backgroundColor: task.status === 'running' ? 'lime' : 'transparent',
                            '&.Mui-selected': {
                              backgroundColor: task.status === 'running' ? 'lime' : 'action.selected',
                            }
                          }}
                        >
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="subtitle1">{task.name}</Typography>
                                <Chip
                                  label={task.status}
                                  size="small"
                                  color={getStatusColor(task.status) as any}
                                />
                              </Box>
                            }
                            secondary={
                              <Box>
                                <Typography variant="body2" color="text.secondary">
                                  {task.description}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {task.actions.length} hành động
                                </Typography>
                              </Box>
                            }
                          />
                          <ListItemSecondaryAction>
                            {task.status === 'running' ? (
                              <IconButton
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStopTask(task);
                                }}
                                size="small"
                                color="error"
                              >
                                <StopIcon />
                              </IconButton>
                            ) : (
                              <IconButton
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRunTask(task);
                                }}
                                size="small"
                                color="primary"
                                disabled={!isConnected}
                              >
                                <PlayIcon />
                              </IconButton>
                            )}
                            <IconButton
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTask(task.id);
                              }}
                              size="small"
                              color="error"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </ListItemSecondaryAction>
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Action Library - Bottom Half */}
            <Grid item sx={{ height: '50%' }}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="h6" gutterBottom>
                    Thư viện Hành động
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Kéo thả các hành động vào khu vực thiết kế để tạo nhiệm vụ
                  </Typography>

                  <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                    <Grid container spacing={1}>
                      {actionTemplates.map((template) => (
                        <Grid item xs={12} sm={6} key={template.id}>
                          <Paper
                            sx={{
                              p: 1,
                              cursor: isEditing ? 'grab' : 'default',
                              opacity: isEditing ? 1 : 0.6,
                              '&:hover': {
                                backgroundColor: isEditing ? 'action.hover' : 'transparent',
                              },
                              '&:active': {
                                cursor: isEditing ? 'grabbing' : 'default',
                              }
                            }}
                            draggable={isEditing}
                            onDragStart={() => isEditing && handleDragStart(template)}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                              {getActionIcon(template.type)}
                              <Typography variant="subtitle2" sx={{ fontSize: '0.8rem' }}>
                                {template.name}
                              </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                              {template.description}
                            </Typography>
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Grid>

        {/* Right Panel */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            {renderRightPanel()}
          </Card>
        </Grid>
      </Grid>

      {/* Exit Warning Dialog */}
      <Dialog open={exitWarningOpen} onClose={cancelExit}>
        <DialogTitle>Cảnh báo</DialogTitle>
        <DialogContent>
          <Typography>
            Dữ liệu sẽ bị mất nếu thực hiện hành động này mà chưa lưu.
            Bạn có muốn tiếp tục?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelExit}>Ở lại</Button>
          <Button onClick={confirmExit} color="warning" variant="contained">
            Vẫn thoát
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

export default TaskManagementPageNew;