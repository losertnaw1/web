import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Fab,
  Paper,
  Divider,
  Chip
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
  Help as ConditionIcon
} from '@mui/icons-material';
import { useI18n } from '../i18n/i18n';

// Types for task system
interface TaskAction {
  id: string;
  type: 'move_to_point' | 'wait' | 'custom_action' | 'loop_start' | 'loop_end' | 'condition_check';
  name: string;
  parameters: Record<string, any>;
  description?: string;
  loopId?: string; // For matching loop start/end pairs
}

interface TaskSequence {
  id: string;
  name: string;
  description: string;
  actions: TaskAction[];
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  created: string;
  lastRun?: string;
}

interface TaskManagementPageProps {
  isConnected: boolean;
  onCommand?: (command: string, params?: any) => void;
}

const TaskManagementPage: React.FC<TaskManagementPageProps> = ({ isConnected, onCommand }) => {
  const { t } = useI18n();
  const [taskSequences, setTaskSequences] = useState<TaskSequence[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskSequence | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draggedAction, setDraggedAction] = useState<TaskAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
        conditionType: 'button_press', // button_press, time_limit, sensor_value
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

  const createNewTask = () => {
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
  };

  const handleEditTask = (task: TaskSequence) => {
    setSelectedTask(task);
    setIsEditing(true);
  };

  const handleSaveTask = () => {
    if (!selectedTask) return;

    const isNew = !taskSequences.find(t => t.id === selectedTask.id);

    if (isNew) {
      setTaskSequences(prev => [...prev, selectedTask]);
      setSuccess('Đã tạo nhiệm vụ mới thành công!');
    } else {
      setTaskSequences(prev =>
        prev.map(t => t.id === selectedTask.id ? selectedTask : t)
      );
      setSuccess('Đã lưu nhiệm vụ thành công!');
    }

    setIsEditing(false);
    setSelectedTask(null);
  };

  const handleDeleteTask = (taskId: string) => {
    setTaskSequences(prev => prev.filter(t => t.id !== taskId));
    setSuccess('Đã xóa nhiệm vụ thành công!');
  };

  const handleRunTask = async (task: TaskSequence) => {
    if (!isConnected || !onCommand) {
      setError('Chưa kết nối với robot!');
      return;
    }

    try {
      // Update task status
      setTaskSequences(prev =>
        prev.map(t =>
          t.id === task.id
            ? { ...t, status: 'running', lastRun: new Date().toISOString() }
            : t
        )
      );

      // Send task to robot
      onCommand('execute_task_sequence', { task });
      setSuccess(`Đã bắt đầu thực hiện nhiệm vụ: ${task.name}`);
    } catch (err) {
      setError('Không thể thực hiện nhiệm vụ: ' + (err as Error).message);
    }
  };

  const handleStopTask = (task: TaskSequence) => {
    if (onCommand) {
      onCommand('stop_task_sequence', { taskId: task.id });
    }

    setTaskSequences(prev =>
      prev.map(t =>
        t.id === task.id ? { ...t, status: 'idle' } : t
      )
    );
    setSuccess('Đã dừng nhiệm vụ');
  };

  // Drag and drop handlers
  const handleDragStart = (action: TaskAction) => {
    setDraggedAction(action);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    if (!draggedAction || !selectedTask) return;

    const newAction: TaskAction = {
      ...draggedAction,
      id: `action_${Date.now()}`
    };

    setSelectedTask({
      ...selectedTask,
      actions: [...selectedTask.actions, newAction]
    });
    setDraggedAction(null);
  };

  const removeAction = (actionId: string) => {
    if (!selectedTask) return;

    setSelectedTask({
      ...selectedTask,
      actions: selectedTask.actions.filter(a => a.id !== actionId)
    });
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'move_to_point': return <NavIcon />;
      case 'wait': return <StopIcon />;
      case 'custom_action': return <ActionIcon />;
      case 'loop_start':
      case 'loop_end': return <LoopIcon />;
      case 'condition_check': return <ConditionIcon />;
      default: return <ActionIcon />;
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

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
          🎯 Quản lý Nhiệm vụ
        </Typography>
        <Fab color="primary" onClick={createNewTask}>
          <AddIcon />
        </Fab>
      </Box>

      {/* Connection Status */}
      {!isConnected && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Chưa kết nối với robot. Không thể thực hiện nhiệm vụ.
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Task List */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Danh sách Nhiệm vụ
              </Typography>

              {taskSequences.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    Chưa có nhiệm vụ nào. Tạo nhiệm vụ đầu tiên để bắt đầu.
                  </Typography>
                </Box>
              ) : (
                <List>
                  {taskSequences.map((task) => (
                    <ListItem key={task.id} divider>
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
                        <IconButton
                          onClick={() => handleEditTask(task)}
                          size="small"
                        >
                          <EditIcon />
                        </IconButton>
                        {task.status === 'running' ? (
                          <IconButton
                            onClick={() => handleStopTask(task)}
                            size="small"
                            color="error"
                          >
                            <StopIcon />
                          </IconButton>
                        ) : (
                          <IconButton
                            onClick={() => handleRunTask(task)}
                            size="small"
                            color="primary"
                            disabled={!isConnected}
                          >
                            <PlayIcon />
                          </IconButton>
                        )}
                        <IconButton
                          onClick={() => handleDeleteTask(task.id)}
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
            </CardContent>
          </Card>
        </Grid>

        {/* Action Templates */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Thư viện Hành động
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Kéo thả các hành động vào khu vực thiết kế để tạo nhiệm vụ
              </Typography>

              <Grid container spacing={2}>
                {actionTemplates.map((template) => (
                  <Grid item xs={12} sm={6} key={template.id}>
                    <Paper
                      sx={{
                        p: 2,
                        cursor: 'grab',
                        '&:hover': {
                          backgroundColor: 'action.hover',
                        },
                        '&:active': {
                          cursor: 'grabbing',
                        }
                      }}
                      draggable
                      onDragStart={() => handleDragStart(template)}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        {getActionIcon(template.type)}
                        <Typography variant="subtitle2">
                          {template.name}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {template.description}
                      </Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Task Editor Dialog */}
      <Dialog
        open={isEditing}
        onClose={() => setIsEditing(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {selectedTask && taskSequences.find(t => t.id === selectedTask.id)
            ? 'Chỉnh sửa Nhiệm vụ'
            : 'Tạo Nhiệm vụ Mới'
          }
        </DialogTitle>
        <DialogContent>
          {selectedTask && (
            <Box sx={{ mt: 2 }}>
              {/* Task Info */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Tên nhiệm vụ"
                    value={selectedTask.name}
                    onChange={(e) => setSelectedTask({
                      ...selectedTask,
                      name: e.target.value
                    })}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Mô tả"
                    value={selectedTask.description}
                    onChange={(e) => setSelectedTask({
                      ...selectedTask,
                      description: e.target.value
                    })}
                  />
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              {/* Action Sequence */}
              <Typography variant="h6" gutterBottom>
                Chuỗi Hành động
              </Typography>

              <Paper
                sx={{
                  minHeight: 200,
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
                          secondary={
                            <Box>
                              {action.type === 'move_to_point' && (
                                <Typography variant="caption">
                                  Tọa độ: ({action.parameters.x}, {action.parameters.y})
                                  {action.parameters.theta && `, Góc: ${action.parameters.theta}°`}
                                </Typography>
                              )}
                              {action.type === 'wait' && (
                                <Typography variant="caption">
                                  Thời gian chờ: {action.parameters.duration}s
                                </Typography>
                              )}
                              {action.type === 'loop_start' && (
                                <Typography variant="caption">
                                  Điều kiện: {action.parameters.conditionType},
                                  Max: {action.parameters.maxIterations} lần
                                </Typography>
                              )}
                              {action.type === 'condition_check' && (
                                <Typography variant="caption">
                                  Kiểm tra: {action.parameters.sensorType} {action.parameters.operator} {action.parameters.threshold}
                                </Typography>
                              )}
                              {action.type === 'custom_action' && (
                                <Typography variant="caption">
                                  Lệnh: {action.parameters.command}
                                </Typography>
                              )}
                            </Box>
                          }
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
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsEditing(false)}>
            Hủy
          </Button>
          <Button onClick={handleSaveTask} variant="contained">
            Lưu
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

export default TaskManagementPage;