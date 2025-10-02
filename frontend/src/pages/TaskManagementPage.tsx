import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText
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
  trueBranchActions?: TaskAction[];
  falseBranchActions?: TaskAction[];
}

interface Waypoint {
  id: string;
  name: string;
  x: number;
  y: number;
  description?: string;
}

interface SavedMap {
  id: string;
  name: string;
  waypoints?: Waypoint[];
  [key: string]: any;
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
  mapId: string;
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
  const [maps, setMaps] = useState<SavedMap[]>([]);
  const [selectedMapId, setSelectedMapId] = useState<string>('');
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);

  const handleSelectMenuClose = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.requestAnimationFrame(() => {
      const activeElement = document.activeElement as HTMLElement | null;
      if (!activeElement) {
        return;
      }

      if (activeElement.closest('[aria-hidden="true"]') && typeof activeElement.blur === 'function') {
        activeElement.blur();
      }
    });
  }, []);

  const filteredTasks = useMemo(() => {
    const base = selectedMapId
      ? taskSequences.filter(task => task.mapId === selectedMapId)
      : [...taskSequences];

    const sorted = [...base];
    sorted.sort((a, b) => {
      if (a.status === 'running' && b.status !== 'running') return -1;
      if (b.status === 'running' && a.status !== 'running') return 1;
      return new Date(b.created).getTime() - new Date(a.created).getTime();
    });

    return sorted;
  }, [selectedMapId, taskSequences]);

  // Available action templates
  const actionTemplates: TaskAction[] = [
    {
      id: 'template_move',
      type: 'move_to_point',
      name: 'Di chuyển đến điểm',
      parameters: { waypointId: '', waypointName: '', theta: 0 },
      description: 'Robot di chuyển đến waypoint đã chọn'
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
        target: 'battery',
        operator: 'less_than',
        value: 30
      },
      description: 'Kiểm tra điều kiện và quyết định hành động tiếp theo',
      trueBranchActions: [],
      falseBranchActions: []
    }
  ];

  // Mock data with running task
  // Load tasks from backend API
  useEffect(() => {
    loadTasksFromBackend();
  }, []);

  useEffect(() => {
    loadMapsFromBackend();
  }, []);

  useEffect(() => {
    if (selectedMapId && !maps.some(map => map.id === selectedMapId)) {
      setSelectedMapId('');
    }
  }, [maps, selectedMapId]);

  const loadTasksFromBackend = async () => {
    try {
      const response = await fetch('/api/tasks');
      if (response.ok) {
        const tasks = await response.json();
        const normalizedTasks: TaskSequence[] = (tasks || []).map((task: any) => normalizeTaskFromBackend(task));
        setTaskSequences(normalizedTasks);
      } else {
        console.error('Failed to load tasks from backend');
        // Fallback to mock data for development
        const fallbackTasks: TaskSequence[] = [
          {
            id: 'task_1',
            name: 'Patrol Route A',
            description: 'Tuần tra khu vực A với 3 điểm dừng',
            status: 'running',
            currentActionIndex: 1,
            mapId: 'mock_map',
            actions: normalizeActionTree([
              {
                id: 'action_1',
                type: 'move_to_point',
                name: 'Di chuyển đến điểm 1',
                parameters: { waypointId: 'wp_1', waypointName: 'Điểm 1', theta: 0 }
              },
              {
                id: 'action_2',
                type: 'wait',
                name: 'Chờ tại điểm 1',
                parameters: { duration: 10 }
              }
            ]),
            created: new Date().toISOString(),
            lastRun: new Date().toISOString()
          },
          {
            id: 'task_2',
            name: 'Delivery Task',
            description: 'Giao hàng từ kho đến văn phòng',
            status: 'idle',
            mapId: 'mock_map',
            actions: normalizeActionTree([
              {
                id: 'action_3',
                type: 'move_to_point',
                name: 'Di chuyển đến kho',
                parameters: { waypointId: 'wp_kho', waypointName: 'Kho hàng', theta: 0 }
              }
            ]),
            created: new Date().toISOString()
          }
        ];
        setTaskSequences(fallbackTasks);
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
      setError('Failed to load tasks from server');
    }
  };

  const loadMapsFromBackend = async () => {
    try {
      const response = await fetch('/api/maps');
      if (response.ok) {
        const data = await response.json();
        const normalizedMaps: SavedMap[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.maps)
            ? data.maps
            : [];

        if (normalizedMaps.length === 0) {
          console.warn('No maps returned from backend, using empty array');
        }

        setMaps(normalizedMaps);
        return;
      }

      console.error('Failed to load maps');
      setMaps([
        {
          id: 'mock_map',
          name: 'Bản đồ mẫu',
          waypoints: [
            { id: 'wp_1', name: 'Điểm 1', x: 2, y: 2 },
            { id: 'wp_kho', name: 'Kho hàng', x: -3, y: 1 }
          ]
        }
      ]);
    } catch (error) {
      console.error('Error loading maps:', error);
      setMaps([
        {
          id: 'mock_map',
          name: 'Bản đồ mẫu',
          waypoints: [
            { id: 'wp_1', name: 'Điểm 1', x: 2, y: 2 },
            { id: 'wp_kho', name: 'Kho hàng', x: -3, y: 1 }
          ]
        }
      ]);
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
      setSelectedActionId(null);
    });
  };

  const handleCreateNewTask = () => {
    if (!selectedMapId) {
      setError('Vui lòng chọn bản đồ trước khi tạo nhiệm vụ mới.');
      return;
    }

    if (!maps.some(map => map.id === selectedMapId)) {
      setError('Bản đồ được chọn không hợp lệ.');
      return;
    }

    handleExitWarning(() => {
      const newTask: TaskSequence = {
        id: `task_${Date.now()}`,
        name: 'Nhiệm vụ mới',
        description: 'Mô tả nhiệm vụ',
        actions: [],
        status: 'idle',
        created: new Date().toISOString(),
        mapId: selectedMapId
      };
      setSelectedTask(newTask);
      setIsEditing(true);
      setIsNewTask(true);
      setHasUnsavedChanges(false);
      setSelectedActionId(null);
    });
  };

  const handleEditTask = () => {
    if (selectedTask) {
      setIsEditing(true);
      setIsNewTask(false);
      setHasUnsavedChanges(false);
      setSelectedActionId(null);
    }
  };

  const handleSaveTask = async () => {
    if (!selectedTask) return;

    if (!selectedTask.mapId) {
      setError('Vui lòng chọn bản đồ cho nhiệm vụ trước khi lưu.');
      return;
    }

    try {
      if (isNewTask) {
        const savedTask = await saveTaskToBackend(selectedTask);
        const normalizedTask = normalizeTaskFromBackend(savedTask, selectedTask);
        setTaskSequences(prev => [...prev, normalizedTask]);
        setSelectedTask(normalizedTask);
        setSuccess('Đã tạo nhiệm vụ mới thành công!');
      } else {
        const updatedTask = await updateTaskInBackend(selectedTask);
        const normalizedTask = normalizeTaskFromBackend(updatedTask, selectedTask);
        setTaskSequences(prev =>
          prev.map(t => t.id === normalizedTask.id ? normalizedTask : t)
        );
        setSelectedTask(normalizedTask);
        setSuccess('Đã lưu nhiệm vụ thành công!');
      }

      setIsEditing(false);
      setIsNewTask(false);
      setHasUnsavedChanges(false);
    } catch (error) {
      const err = error as Error;
      setError('Không thể lưu nhiệm vụ: ' + (err?.message || 'Không rõ lỗi'));
    }
  };

  const handleCancelEdit = () => {
    if (isNewTask) {
      setSelectedTask(null);
    }
    setIsEditing(false);
    setIsNewTask(false);
    setHasUnsavedChanges(false);
    setSelectedActionId(null);
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteTaskFromBackend(taskId);
      setTaskSequences(prev => prev.filter(t => t.id !== taskId));
      if (selectedTask && selectedTask.id === taskId) {
        setSelectedTask(null);
        setIsEditing(false);
        setIsNewTask(false);
        setSelectedActionId(null);
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
        actions: task.actions,
        mapId: task.mapId,
        map_id: task.mapId
      })
    });

    if (!response.ok) {
      throw new Error('Failed to save task to backend');
    }

    const data = await response.json();
    return data?.task ?? data;
  };

  const updateTaskInBackend = async (task: TaskSequence) => {
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: task.name,
        description: task.description,
        actions: task.actions,
        status: task.status,
        mapId: task.mapId,
        map_id: task.mapId
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update task in backend');
    }

    const data = await response.json();
    return data?.task ?? data;
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
      let message = 'Failed to execute task';
      try {
        const data = await response.json();
        if (typeof data?.detail === 'string') {
          message = data.detail;
        } else if (data?.detail?.message) {
          message = data.detail.message;
        }
      } catch (parseError) {
        // Ignore JSON parse errors and keep default message
      }
      throw new Error(message);
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

  const handleBranchDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    if (!draggedAction || !selectedTask || !isEditing) return;

    const newAction = createActionInstance(draggedAction);

    setSelectedTask(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        actions: [...prev.actions, newAction]
      };
    });
    setDraggedAction(null);
    setHasUnsavedChanges(true);
    setSelectedActionId(newAction.id);
  };

  const handleBranchDrop = (event: React.DragEvent, conditionId: string, branch: BranchKey) => {
    event.preventDefault();
    event.stopPropagation();
    if (!draggedAction || !isEditing) return;

    const newAction = createActionInstance(draggedAction);
    let didChange = false;

    setSelectedTask(prev => {
      if (!prev) return prev;
      const { updated, changed } = insertActionIntoConditionBranch(prev.actions, conditionId, branch, newAction);
      if (!changed) {
        return prev;
      }
      didChange = true;
      return {
        ...prev,
        actions: updated
      };
    });

    if (didChange) {
      setHasUnsavedChanges(true);
      setSelectedActionId(newAction.id);
    }

    setDraggedAction(null);
  };

  const removeAction = (actionId: string) => {
    if (!isEditing) return;

    let didChange = false;

    setSelectedTask(prev => {
      if (!prev) return prev;
      const { updated, changed } = removeActionFromTree(prev.actions, actionId);
      if (!changed) {
        return prev;
      }
      didChange = true;
      return {
        ...prev,
        actions: updated
      };
    });

    if (didChange) {
      setHasUnsavedChanges(true);
      if (selectedActionId === actionId) {
        setSelectedActionId(null);
      }
    }
  };

  const updateAction = (actionId: string, updater: (action: TaskAction) => TaskAction) => {
    if (!isEditing) return;
    let didChange = false;
    setSelectedTask(prev => {
      if (!prev) return prev;
      const { updated, changed } = updateActionsTree(prev.actions, actionId, updater);
      if (!changed) {
        return prev;
      }
      didChange = true;
      return {
        ...prev,
        actions: updated
      };
    });
    if (didChange) {
      setHasUnsavedChanges(true);
    }
  };

  const updateActionParameters = (actionId: string, params: Record<string, any>) => {
    updateAction(actionId, action => ({
      ...action,
      parameters: {
        ...action.parameters,
        ...params
      }
    }));
  };

  const conditionTargets = [
    { value: 'battery', label: 'Mức pin (%)' },
    { value: 'temperature', label: 'Nhiệt độ (°C)' },
    { value: 'task_progress', label: 'Tiến độ nhiệm vụ (%)' },
    { value: 'custom', label: 'Giá trị cảm biến khác' }
  ];

  const comparisonOperators = [
    { value: 'less_than', label: 'Nhỏ hơn' },
    { value: 'less_than_or_equal', label: 'Nhỏ hơn hoặc bằng' },
    { value: 'equal', label: 'Bằng' },
    { value: 'greater_than_or_equal', label: 'Lớn hơn hoặc bằng' },
    { value: 'greater_than', label: 'Lớn hơn' },
    { value: 'not_equal', label: 'Khác' }
  ];

  type BranchKey = 'trueBranchActions' | 'falseBranchActions';

  const createActionInstance = (template: TaskAction): TaskAction => ({
    ...template,
    id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    parameters: { ...template.parameters },
    trueBranchActions: template.trueBranchActions ? [] : undefined,
    falseBranchActions: template.falseBranchActions ? [] : undefined
  });

  const findActionInTree = (
    actions: TaskAction[],
    actionId: string,
    parent: TaskAction | null = null,
    viaBranch?: BranchKey
  ): { action: TaskAction; parent: TaskAction | null; viaBranch?: BranchKey } | null => {
    for (const action of actions) {
      if (action.id === actionId) {
        return { action, parent, viaBranch };
      }

      if (action.trueBranchActions) {
        const found = findActionInTree(action.trueBranchActions, actionId, action, 'trueBranchActions');
        if (found) return found;
      }

      if (action.falseBranchActions) {
        const found = findActionInTree(action.falseBranchActions, actionId, action, 'falseBranchActions');
        if (found) return found;
      }
    }

    return null;
  };

  const updateActionsTree = (
    actions: TaskAction[],
    actionId: string,
    updater: (action: TaskAction) => TaskAction
  ): { updated: TaskAction[]; changed: boolean } => {
    let changed = false;

    const updatedActions = actions.map(action => {
      if (action.id === actionId) {
        changed = true;
        return updater(action);
      }

      let branchChanged = false;
      let newTrue = action.trueBranchActions;
      if (action.trueBranchActions) {
        const result = updateActionsTree(action.trueBranchActions, actionId, updater);
        if (result.changed) {
          branchChanged = true;
          newTrue = result.updated;
        }
      }

      let newFalse = action.falseBranchActions;
      if (action.falseBranchActions) {
        const result = updateActionsTree(action.falseBranchActions, actionId, updater);
        if (result.changed) {
          branchChanged = true;
          newFalse = result.updated;
        }
      }

      if (branchChanged) {
        changed = true;
        return {
          ...action,
          trueBranchActions: newTrue,
          falseBranchActions: newFalse
        };
      }

      return action;
    });

    return {
      updated: changed ? updatedActions : actions,
      changed
    };
  };

  const removeActionFromTree = (
    actions: TaskAction[],
    actionId: string
  ): { updated: TaskAction[]; changed: boolean } => {
    let changed = false;

    const filtered = actions.reduce<TaskAction[]>((acc, action) => {
      if (action.id === actionId) {
        changed = true;
        return acc;
      }

      let branchChanged = false;
      let newTrue = action.trueBranchActions;
      if (action.trueBranchActions) {
        const result = removeActionFromTree(action.trueBranchActions, actionId);
        if (result.changed) {
          branchChanged = true;
          newTrue = result.updated;
        }
      }

      let newFalse = action.falseBranchActions;
      if (action.falseBranchActions) {
        const result = removeActionFromTree(action.falseBranchActions, actionId);
        if (result.changed) {
          branchChanged = true;
          newFalse = result.updated;
        }
      }

      if (branchChanged) {
        changed = true;
        acc.push({
          ...action,
          trueBranchActions: newTrue,
          falseBranchActions: newFalse
        });
      } else {
        acc.push(action);
      }

      return acc;
    }, []);

    return {
      updated: changed ? filtered : actions,
      changed
    };
  };

  const insertActionIntoConditionBranch = (
    actions: TaskAction[],
    conditionId: string,
    branch: BranchKey,
    actionToInsert: TaskAction
  ): { updated: TaskAction[]; changed: boolean } => {
    let changed = false;

    const updated = actions.map(action => {
      if (action.id === conditionId) {
        const branchActions = action[branch] || [];
        changed = true;
        return {
          ...action,
          [branch]: [...branchActions, actionToInsert]
        } as TaskAction;
      }

      let branchChanged = false;
      let newTrue = action.trueBranchActions;
      if (action.trueBranchActions) {
        const result = insertActionIntoConditionBranch(action.trueBranchActions, conditionId, branch, actionToInsert);
        if (result.changed) {
          branchChanged = true;
          newTrue = result.updated;
        }
      }

      let newFalse = action.falseBranchActions;
      if (action.falseBranchActions) {
        const result = insertActionIntoConditionBranch(action.falseBranchActions, conditionId, branch, actionToInsert);
        if (result.changed) {
          branchChanged = true;
          newFalse = result.updated;
        }
      }

      if (branchChanged) {
        changed = true;
        return {
          ...action,
          trueBranchActions: newTrue,
          falseBranchActions: newFalse
        };
      }

      return action;
    });

    return {
      updated: changed ? updated : actions,
      changed
    };
  };

  const normalizeActionTree = (actions: TaskAction[] = []): TaskAction[] =>
    actions.map(action => {
      const normalized: TaskAction = {
        ...action,
        parameters: { ...action.parameters }
      };

      if (action.trueBranchActions && action.trueBranchActions.length > 0) {
        normalized.trueBranchActions = normalizeActionTree(action.trueBranchActions);
      } else if (action.type === 'condition_check') {
        normalized.trueBranchActions = [];
      }

      if (action.falseBranchActions && action.falseBranchActions.length > 0) {
        normalized.falseBranchActions = normalizeActionTree(action.falseBranchActions);
      } else if (action.type === 'condition_check') {
        normalized.falseBranchActions = [];
      }

      return normalized;
    });

  const normalizeTaskFromBackend = (task: any, fallback?: TaskSequence): TaskSequence => {
    const base: Partial<TaskSequence> = fallback ? { ...fallback } : {};
    const resolvedActions = normalizeActionTree(task?.actions ?? base.actions ?? []);
    const resolvedCreated = task?.created ?? base.created ?? new Date().toISOString();
    const resolvedStatus = task?.status ?? base.status ?? 'idle';

    return {
      ...(base as TaskSequence),
      ...(task || {}),
      actions: resolvedActions,
      created: resolvedCreated,
      status: resolvedStatus,
      mapId: task?.mapId ?? task?.map_id ?? task?.map?.id ?? base.mapId ?? ''
    };
  };

  const renderActionConfiguration = (action: TaskAction, map?: SavedMap) => {
    switch (action.type) {
      case 'move_to_point': {
        if (!selectedTask?.mapId) {
          return (
            <Alert severity="info">
              Hãy chọn bản đồ cho nhiệm vụ trước khi cấu hình waypoint.
            </Alert>
          );
        }

        if (!map) {
          return (
            <Alert severity="warning">
              Không tìm thấy thông tin bản đồ. Vui lòng tải lại danh sách map.
            </Alert>
          );
        }

        const waypoints = map.waypoints || [];
        const selectedWaypoint = waypoints.find(wp => wp.id === action.parameters.waypointId);

        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth size="small" disabled={waypoints.length === 0}>
              <InputLabel>Waypoint đích</InputLabel>
              <Select
                label="Waypoint đích"
                value={action.parameters.waypointId || ''}
                MenuProps={{ onClose: () => handleSelectMenuClose() }}
                onChange={(e) => {
                  const waypointId = e.target.value as string;
                  const wp = waypoints.find(w => w.id === waypointId);
                  if (wp) {
                    updateAction(action.id, current => ({
                      ...current,
                      name: `Di chuyển đến ${wp.name}`,
                      parameters: {
                        ...current.parameters,
                        waypointId: wp.id,
                        waypointName: wp.name,
                        x: wp.x,
                        y: wp.y
                      }
                    }));
                  } else {
                    updateActionParameters(action.id, { waypointId: '', waypointName: '' });
                  }
                }}
              >
                {waypoints.length === 0 && (
                  <MenuItem value="" disabled>
                    Map chưa có waypoint nào
                  </MenuItem>
                )}
                {waypoints.map(wp => (
                  <MenuItem key={wp.id} value={wp.id}>
                    {wp.name}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                {waypoints.length === 0
                  ? 'Thêm waypoint trong Map Editor trước khi cấu hình hành động này'
                  : 'Chọn waypoint mà robot sẽ di chuyển tới'}
              </FormHelperText>
            </FormControl>
            {selectedWaypoint && (
              <Typography variant="body2" color="text.secondary">
                Tọa độ: x = {selectedWaypoint.x.toFixed(2)}, y = {selectedWaypoint.y.toFixed(2)}
              </Typography>
            )}
          </Box>
        );
      }
      case 'wait': {
        const duration = action.parameters.duration ?? 0;
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Thời gian chờ (giây)"
              type="number"
              size="small"
              value={duration}
              onChange={(e) => {
                const value = Number(e.target.value);
                const safeValue = Number.isNaN(value) ? 0 : Math.max(0, value);
                updateActionParameters(action.id, { duration: safeValue });
              }}
              InputProps={{ inputProps: { min: 0 } }}
            />
            <FormHelperText>Robot sẽ dừng lại trong thời gian được chỉ định.</FormHelperText>
          </Box>
        );
      }
      case 'condition_check': {
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Giá trị cần kiểm tra</InputLabel>
              <Select
                label="Giá trị cần kiểm tra"
                value={action.parameters.target || ''}
                MenuProps={{ onClose: () => handleSelectMenuClose() }}
                onChange={(e) => updateActionParameters(action.id, { target: e.target.value })}
              >
                {conditionTargets.map(target => (
                  <MenuItem key={target.value} value={target.value}>
                    {target.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel>Điều kiện</InputLabel>
              <Select
                label="Điều kiện"
                value={action.parameters.operator || 'less_than'}
                MenuProps={{ onClose: () => handleSelectMenuClose() }}
                onChange={(e) => updateActionParameters(action.id, { operator: e.target.value })}
              >
                {comparisonOperators.map(op => (
                  <MenuItem key={op.value} value={op.value}>
                    {op.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Giá trị so sánh"
              type="number"
              size="small"
              value={action.parameters.value ?? ''}
              onChange={(e) => {
                if (e.target.value === '') {
                  updateActionParameters(action.id, { value: '' });
                  return;
                }
                const numericValue = Number(e.target.value);
                if (Number.isNaN(numericValue)) {
                  return;
                }
                updateActionParameters(action.id, { value: numericValue });
              }}
            />
            <FormHelperText>
              Hành động tiếp theo sẽ phụ thuộc vào việc điều kiện này đúng hay sai.
              Thêm các bước cho từng nhánh trong chuỗi hành động phía trên.
            </FormHelperText>
          </Box>
        );
      }
      default:
        return (
          <Typography variant="body2" color="text.secondary">
            Hành động này hiện chưa có phần cấu hình chi tiết.
          </Typography>
        );
    }
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

  const mapOperatorLabel = (operator: string) => {
    const operatorMap: Record<string, string> = {
      less_than: 'nhỏ hơn',
      greater_than: 'lớn hơn',
      equal: 'bằng',
      not_equal: 'khác',
      less_than_or_equal: '≤',
      greater_than_or_equal: '≥'
    };

    return operatorMap[operator] || operator;
  };

  const formatActionDescription = (action: TaskAction) => {
    switch (action.type) {
      case 'move_to_point':
        if (action.parameters.waypointName) {
          return `Waypoint: ${action.parameters.waypointName}`;
        }
        if (action.parameters.waypointId) {
          return `Waypoint ID: ${action.parameters.waypointId}`;
        }
        return 'Chưa chọn waypoint đích';
      case 'wait':
        return `Chờ: ${action.parameters.duration}s`;
      case 'loop_start':
        return `Vòng lặp: ${action.parameters.conditionType}`;
      case 'condition_check':
        if (
          action.parameters.target &&
          action.parameters.operator &&
          action.parameters.value !== undefined &&
          action.parameters.value !== ''
        ) {
          const trueCount = action.trueBranchActions?.length ?? 0;
          const falseCount = action.falseBranchActions?.length ?? 0;
          const segments = [] as string[];
          if (trueCount > 0) segments.push(`Đúng: ${trueCount} bước`);
          if (falseCount > 0) segments.push(`Sai: ${falseCount} bước`);
          const branchInfo = segments.length > 0 ? ` (${segments.join(' | ')})` : '';
          return `Kiểm tra ${action.parameters.target} ${mapOperatorLabel(action.parameters.operator)} ${action.parameters.value}${branchInfo}`;
        }
        return 'Chưa cấu hình điều kiện';
      case 'custom_action':
        return `Lệnh: ${action.parameters.command}`;
      default:
        return action.description || '';
    }
  };

  const renderActionNode = (
    action: TaskAction,
    index: number,
    level = 0,
    branchLabel?: string
  ): React.ReactNode => {
    const indexLabel = branchLabel ? `${branchLabel} ${index + 1}.` : `${index + 1}.`;

    return (
      <React.Fragment key={action.id}>
        <ListItem
          divider
          button
          selected={selectedActionId === action.id}
          onClick={() => setSelectedActionId(action.id)}
          sx={{
            borderRadius: 1,
            mb: 1,
            pl: level * 2,
            '&.Mui-selected': {
              backgroundColor: 'action.selected'
            }
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DragIcon />
            <Typography variant="body2" sx={{ minWidth: 40 }}>
              {indexLabel}
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
            primaryTypographyProps={{ component: 'span' }}
            secondaryTypographyProps={{ component: 'span' }}
          />
          <ListItemSecondaryAction>
            <IconButton
              onClick={(event) => {
                event.stopPropagation();
                removeAction(action.id);
              }}
              size="small"
              color="error"
            >
              <DeleteIcon />
            </IconButton>
          </ListItemSecondaryAction>
        </ListItem>

        {action.type === 'condition_check' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pl: (level + 1) * 2, mb: 2 }}>
            {(['trueBranchActions', 'falseBranchActions'] as BranchKey[]).map((branchKey) => {
              const branchActions = action[branchKey] || [];
              const label = branchKey === 'trueBranchActions' ? 'ĐÚNG' : 'SAI';

              return (
                <Box key={`${action.id}-${branchKey}`} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Khi điều kiện {label}
                  </Typography>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: branchActions.length > 0 ? 0 : 1.5,
                      borderStyle: 'dashed',
                      borderColor: 'divider',
                      minHeight: branchActions.length > 0 ? undefined : 72,
                      backgroundColor: 'background.paper'
                    }}
                    onDragOver={handleBranchDragOver}
                    onDrop={(event) => handleBranchDrop(event, action.id, branchKey)}
                  >
                    {branchActions.length === 0 ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 60 }}>
                        <Typography variant="body2" color="text.secondary" textAlign="center">
                          Kéo hành động vào đây
                        </Typography>
                      </Box>
                    ) : (
                      <List disablePadding sx={{ pl: 0, pr: 0 }}>
                        {branchActions.map((childAction, childIndex) =>
                          renderActionNode(
                            childAction,
                            childIndex,
                            level + 1,
                            branchKey === 'trueBranchActions' ? 'Đúng' : 'Sai'
                          )
                        )}
                      </List>
                    )}
                  </Paper>
                </Box>
              );
            })}
          </Box>
        )}
      </React.Fragment>
    );
  };

  const renderActionNodeReadOnly = (
    action: TaskAction,
    index: number,
    level = 0,
    branchLabel?: string
  ): React.ReactNode => {
    const indexLabel = branchLabel ? `${branchLabel} ${index + 1}.` : `${index + 1}.`;

    return (
      <React.Fragment key={action.id}>
        <ListItem sx={{ alignItems: 'flex-start', pl: level * 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2 }}>
            <Typography variant="body2">{indexLabel}</Typography>
            {getActionIcon(action.type)}
          </Box>
          <ListItemText
            primary={action.name}
            secondary={formatActionDescription(action)}
            primaryTypographyProps={{ component: 'span' }}
            secondaryTypographyProps={{ component: 'span' }}
          />
        </ListItem>

        {action.type === 'condition_check' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pl: (level + 1) * 2, mb: 2 }}>
            {(['trueBranchActions', 'falseBranchActions'] as BranchKey[]).map((branchKey) => {
              const branchActions = action[branchKey] || [];
              const label = branchKey === 'trueBranchActions' ? 'ĐÚNG' : 'SAI';

              if (branchActions.length === 0) {
                return (
                  <Typography
                    key={`${action.id}-${branchKey}`}
                    variant="caption"
                    color="text.secondary"
                  >
                    Khi điều kiện {label}: Chưa có hành động
                  </Typography>
                );
              }

              return (
                <Box key={`${action.id}-${branchKey}`} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Khi điều kiện {label}
                  </Typography>
                  <List disablePadding>
                    {branchActions.map((childAction, childIndex) =>
                      renderActionNodeReadOnly(
                        childAction,
                        childIndex,
                        level + 1,
                        branchKey === 'trueBranchActions' ? 'Đúng' : 'Sai'
                      )
                    )}
                  </List>
                </Box>
              );
            })}
          </Box>
        )}
      </React.Fragment>
    );
  };

  // Render helper for right panel
  const renderRightPanel = () => {
    if (selectedTask && isEditing) {
      const actionInfo = selectedActionId ? findActionInTree(selectedTask.actions, selectedActionId) : null;
      const actionBeingEdited = actionInfo?.action;
      const mapForTask = maps.find(map => map.id === selectedTask.mapId);
      const filterMapName = maps.find(map => map.id === selectedMapId)?.name;

      return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Task Editor Header */}
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="h6" gutterBottom>
              {isNewTask ? 'Tạo Nhiệm vụ Mới' : 'Chỉnh sửa Nhiệm vụ'}
            </Typography>

            {/* Task Info */}
            <Grid container spacing={2}>
              <Grid item xs={12}>
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
                <FormControl
                  fullWidth
                  size="small"
                  disabled
                >
                  <InputLabel>Bản đồ</InputLabel>
                  <Select
                    label="Bản đồ"
                    value={selectedTask.mapId || ''}
                    MenuProps={{ onClose: () => handleSelectMenuClose() }}
                  >
                    {maps.length === 0 && (
                      <MenuItem value="" disabled>
                        Không có bản đồ khả dụng
                      </MenuItem>
                    )}
                    {maps.map(map => (
                      <MenuItem key={map.id} value={map.id}>
                        {map.name}
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>
                    {'Bản đồ được chọn từ bộ lọc phía trên và không thể thay đổi tại đây'}
                  </FormHelperText>
                </FormControl>
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

          {selectedMapId && selectedTask.mapId && selectedTask.mapId !== selectedMapId && (
            <Alert severity="warning" sx={{ mx: 2, mt: 2 }}>
              Nhiệm vụ thuộc bản đồ "{mapForTask?.name || selectedTask.mapId}" nhưng bộ lọc đang đặt ở
              "{filterMapName || 'tất cả bản đồ'}".
            </Alert>
          )}

          {!selectedTask.mapId && (
            <Alert severity="info" sx={{ mx: 2, mt: 2 }}>
              Vui lòng chọn bản đồ trước khi cấu hình chuỗi hành động.
            </Alert>
          )}

          {/* Drag Drop Area */}
          <Box sx={{ flexGrow: 1, p: 2, overflow:'auto' }}>
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
                <List disablePadding>
                  {selectedTask.actions.map((action, index) =>
                    renderActionNode(action, index)
                  )}
                </List>
              )}
            </Paper>
          </Box>

          {actionBeingEdited ? (
            <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle1" gutterBottom>
                Cấu hình hành động: {actionBeingEdited.name}
              </Typography>
              {renderActionConfiguration(actionBeingEdited, mapForTask)}
            </Box>
          ) : (
            selectedTask.actions.length > 0 && (
              <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="body2" color="text.secondary">
                  Chọn một hành động trong danh sách để cấu hình chi tiết.
                </Typography>
              </Box>
            )
          )}
        </Box>
      );
    }

    if (selectedTask && !isEditing) {
      const taskMapName = maps.find(map => map.id === selectedTask.mapId)?.name || 'Chưa gán bản đồ';
      const filterMapName = maps.find(map => map.id === selectedMapId)?.name;
      return (
        <Box sx={{ p: 2 }}>
          {selectedMapId && selectedTask.mapId && selectedTask.mapId !== selectedMapId && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Nhiệm vụ này thuộc bản đồ "{taskMapName}" nhưng bộ lọc đang đặt ở
              "{filterMapName || 'tất cả bản đồ'}".
            </Alert>
          )}
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

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Bản đồ: {taskMapName}
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

          <List disablePadding>
            {selectedTask.actions.map((action, index) =>
              renderActionNodeReadOnly(action, index)
            )}
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
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column' }}>
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

      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel>Lọc theo bản đồ</InputLabel>
          <Select
            label="Lọc theo bản đồ"
            value={selectedMapId}
            MenuProps={{ onClose: () => handleSelectMenuClose() }}
            onChange={(e) => setSelectedMapId(e.target.value as string)}
          >
            <MenuItem value="">
              Tất cả bản đồ
            </MenuItem>
            {maps.map(map => (
              <MenuItem key={map.id} value={map.id}>
                {map.name}
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>
            Chỉ những nhiệm vụ thuộc bản đồ đang chọn mới có thể tạo mới.
          </FormHelperText>
        </FormControl>
        <Typography variant="body2" color="text.secondary">
          Hiện có {maps.length} bản đồ và {taskSequences.length} nhiệm vụ.
        </Typography>
      </Box>

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
                      {filteredTasks.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                          Chưa có nhiệm vụ nào cho bản đồ đã chọn. Nhấn nút + để tạo mới.
                        </Typography>
                      ) : (
                        filteredTasks.map((task) => (
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
                              disableTypography
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
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    Bản đồ: {maps.find(map => map.id === task.mapId)?.name || 'Chưa gán'}
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
                                disabled={task.status === 'running'}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </ListItemSecondaryAction>
                          </ListItem>
                        ))
                      )}
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
