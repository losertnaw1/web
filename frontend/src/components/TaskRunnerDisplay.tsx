import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  LinearProgress,
  Divider,
  Button,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Navigation as NavIcon,
  Stop as StopIcon,
  Loop as LoopIcon,
  Build as ActionIcon,
  Help as ConditionIcon,
  CheckCircle as CompleteIcon,
  LocationOn as SavePointIcon,
  Add as AddPointIcon
} from '@mui/icons-material';
import { useI18n } from '../i18n/i18n';

// Import types from TaskManagementPage
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
  currentActionIndex?: number; // Index of currently executing action
}

interface TaskRunnerDisplayProps {
  currentTask?: TaskSequence | null;
  isMinimized?: boolean;
  onSaveCurrentPosition?: () => void;
  robotPosition?: { x: number; y: number; theta: number };
}

const TaskRunnerDisplay: React.FC<TaskRunnerDisplayProps> = ({
  currentTask,
  isMinimized = false,
  onSaveCurrentPosition,
  robotPosition
}) => {
  const { t } = useI18n();

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

  if (!currentTask) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: isMinimized ? 120 : 300,
          textAlign: 'center'
        }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            🤖 Trạng thái nhiệm vụ
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Không có nhiệm vụ nào đang chạy
          </Typography>

          {/* Quick Point Saving */}
          {onSaveCurrentPosition && robotPosition && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Vị trí hiện tại: ({robotPosition.x.toFixed(2)}, {robotPosition.y.toFixed(2)})
              </Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<SavePointIcon />}
                onClick={onSaveCurrentPosition}
              >
                Lưu điểm hiện tại
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    );
  }

  const progress = currentTask.currentActionIndex !== undefined
    ? ((currentTask.currentActionIndex + 1) / currentTask.actions.length) * 100
    : 0;

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        {/* Task Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PlayIcon color="primary" />
            {currentTask.name}
          </Typography>
          <Chip
            label={currentTask.status}
            color={getStatusColor(currentTask.status) as any}
            size="small"
          />
        </Box>

        {/* Progress Bar */}
        {currentTask.status === 'running' && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Tiến độ: {currentTask.currentActionIndex !== undefined ? currentTask.currentActionIndex + 1 : 0} / {currentTask.actions.length}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{ mt: 0.5, height: 8, borderRadius: 4 }}
            />
          </Box>
        )}

        {/* Task Description */}
        {!isMinimized && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {currentTask.description}
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Action List */}
        <Typography variant="subtitle2" gutterBottom>
          Chuỗi hành động:
        </Typography>

        <List dense sx={{ maxHeight: isMinimized ? 200 : 400, overflow: 'auto' }}>
          {currentTask.actions.map((action, index) => {
            const isCurrent = currentTask.currentActionIndex === index;
            const isCompleted = currentTask.currentActionIndex !== undefined && index < currentTask.currentActionIndex;

            return (
              <ListItem
                key={action.id}
                sx={{
                  backgroundColor: isCurrent ? 'primary.light' : isCompleted ? 'success.light' : 'transparent',
                  borderRadius: 1,
                  mb: 0.5,
                  '&:hover': {
                    backgroundColor: isCurrent ? 'primary.light' : isCompleted ? 'success.light' : 'action.hover',
                  }
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {isCompleted ? (
                    <CompleteIcon color="success" fontSize="small" />
                  ) : (
                    getActionIcon(action.type)
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: isCurrent ? 'bold' : 'normal' }}>
                        {index + 1}. {action.name}
                      </Typography>
                      {isCurrent && (
                        <Chip label="Đang thực hiện" size="small" color="primary" />
                      )}
                    </Box>
                  }
                  secondary={!isMinimized && formatActionDescription(action)}
                />
              </ListItem>
            );
          })}
        </List>

        {/* Task Stats */}
        {!isMinimized && (
          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" display="block">
              Tổng số hành động: {currentTask.actions.length}
            </Typography>
            {currentTask.lastRun && (
              <Typography variant="caption" color="text.secondary" display="block">
                Lần chạy cuối: {new Date(currentTask.lastRun).toLocaleString('vi-VN')}
              </Typography>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default TaskRunnerDisplay;