#!/usr/bin/env python3

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import os
import uuid
from datetime import datetime
import logging

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()

# Data models
class TaskAction(BaseModel):
    id: str
    type: str  # 'move_to_point', 'wait', 'custom_action', 'loop_start', 'loop_end', 'condition_check'
    name: str
    parameters: Dict[str, Any]
    description: Optional[str] = None
    loopId: Optional[str] = None  # For matching loop start/end pairs

class TaskSequence(BaseModel):
    id: str
    name: str
    description: str
    actions: List[TaskAction]
    status: str  # 'idle', 'running', 'paused', 'completed', 'error'
    created: str
    lastRun: Optional[str] = None
    currentActionIndex: Optional[int] = None  # Index of currently executing action

class TaskSequenceCreate(BaseModel):
    name: str
    description: str
    actions: List[TaskAction]

class TaskSequenceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    actions: Optional[List[TaskAction]] = None
    status: Optional[str] = None
    currentActionIndex: Optional[int] = None

# Storage file path
TASKS_FILE = "data/tasks.json"

def ensure_data_directory():
    """Ensure the data directory exists"""
    os.makedirs(os.path.dirname(TASKS_FILE), exist_ok=True)

def load_tasks() -> List[TaskSequence]:
    """Load tasks from storage"""
    ensure_data_directory()

    if not os.path.exists(TASKS_FILE):
        return []

    try:
        with open(TASKS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return [TaskSequence(**item) for item in data]
    except Exception as e:
        logger.error(f"Error loading tasks: {e}")
        return []

def save_tasks(tasks: List[TaskSequence]):
    """Save tasks to storage"""
    ensure_data_directory()

    try:
        with open(TASKS_FILE, 'w', encoding='utf-8') as f:
            json.dump([task.dict() for task in tasks], f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Error saving tasks: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save tasks: {str(e)}")

@router.get("/tasks", response_model=List[TaskSequence])
async def get_tasks():
    """Get all task sequences"""
    try:
        tasks = load_tasks()
        logger.info(f"Retrieved {len(tasks)} tasks")
        return tasks

    except Exception as e:
        logger.error(f"Error retrieving tasks: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve tasks: {str(e)}")

@router.post("/tasks", response_model=TaskSequence)
async def create_task(task_data: TaskSequenceCreate):
    """Create a new task sequence"""
    try:
        tasks = load_tasks()

        # Create new task
        new_task = TaskSequence(
            id=str(uuid.uuid4()),
            name=task_data.name,
            description=task_data.description,
            actions=task_data.actions,
            status="idle",
            created=datetime.now().isoformat()
        )

        tasks.append(new_task)
        save_tasks(tasks)

        logger.info(f"Created task: {new_task.name} with {len(new_task.actions)} actions")
        return new_task

    except Exception as e:
        logger.error(f"Error creating task: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create task: {str(e)}")

@router.get("/tasks/{task_id}", response_model=TaskSequence)
async def get_task(task_id: str):
    """Get a specific task sequence by ID"""
    try:
        tasks = load_tasks()
        task = next((t for t in tasks if t.id == task_id), None)

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        return task

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving task {task_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve task: {str(e)}")

@router.put("/tasks/{task_id}", response_model=TaskSequence)
async def update_task(task_id: str, task_data: TaskSequenceUpdate):
    """Update a task sequence"""
    try:
        tasks = load_tasks()
        task_index = next((i for i, t in enumerate(tasks) if t.id == task_id), None)

        if task_index is None:
            raise HTTPException(status_code=404, detail="Task not found")

        # Update task
        task = tasks[task_index]
        update_data = task_data.dict(exclude_unset=True)

        for field, value in update_data.items():
            setattr(task, field, value)

        save_tasks(tasks)

        logger.info(f"Updated task: {task.name}")
        return task

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating task {task_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update task: {str(e)}")

@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    """Delete a task sequence"""
    try:
        tasks = load_tasks()
        task_index = next((i for i, t in enumerate(tasks) if t.id == task_id), None)

        if task_index is None:
            raise HTTPException(status_code=404, detail="Task not found")

        deleted_task = tasks.pop(task_index)
        save_tasks(tasks)

        logger.info(f"Deleted task: {deleted_task.name}")
        return {"status": "success", "message": f"Deleted task: {deleted_task.name}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting task {task_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete task: {str(e)}")

@router.post("/tasks/{task_id}/execute")
async def execute_task(task_id: str):
    """Execute a task sequence"""
    try:
        tasks = load_tasks()
        task_index = next((i for i, t in enumerate(tasks) if t.id == task_id), None)

        if task_index is None:
            raise HTTPException(status_code=404, detail="Task not found")

        task = tasks[task_index]

        # Update task status to running
        task.status = "running"
        task.lastRun = datetime.now().isoformat()
        task.currentActionIndex = 0

        save_tasks(tasks)

        # TODO: Integrate with ROS to actually execute the task
        # This would involve sending commands to the robot based on the actions
        logger.info(f"Started executing task: {task.name}")

        return {
            "status": "success",
            "message": f"Started executing task: {task.name}",
            "task": task
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error executing task {task_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to execute task: {str(e)}")

@router.post("/tasks/{task_id}/stop")
async def stop_task(task_id: str):
    """Stop executing a task sequence"""
    try:
        tasks = load_tasks()
        task_index = next((i for i, t in enumerate(tasks) if t.id == task_id), None)

        if task_index is None:
            raise HTTPException(status_code=404, detail="Task not found")

        task = tasks[task_index]

        # Update task status to idle
        task.status = "idle"
        task.currentActionIndex = None

        save_tasks(tasks)

        # TODO: Integrate with ROS to actually stop the robot
        logger.info(f"Stopped executing task: {task.name}")

        return {
            "status": "success",
            "message": f"Stopped executing task: {task.name}",
            "task": task
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error stopping task {task_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to stop task: {str(e)}")

@router.get("/tasks/status/running", response_model=Optional[TaskSequence])
async def get_running_task():
    """Get the currently running task (if any)"""
    try:
        tasks = load_tasks()
        running_task = next((t for t in tasks if t.status == "running"), None)

        return running_task

    except Exception as e:
        logger.error(f"Error getting running task: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get running task: {str(e)}")

@router.post("/tasks/{task_id}/update-progress")
async def update_task_progress(task_id: str, action_index: int):
    """Update the current action index for a running task"""
    try:
        tasks = load_tasks()
        task_index = next((i for i, t in enumerate(tasks) if t.id == task_id), None)

        if task_index is None:
            raise HTTPException(status_code=404, detail="Task not found")

        task = tasks[task_index]

        if task.status != "running":
            raise HTTPException(status_code=400, detail="Task is not currently running")

        if action_index < 0 or action_index >= len(task.actions):
            raise HTTPException(status_code=400, detail="Invalid action index")

        task.currentActionIndex = action_index

        # Check if task is completed
        if action_index >= len(task.actions) - 1:
            task.status = "completed"
            task.currentActionIndex = None

        save_tasks(tasks)

        logger.info(f"Updated progress for task {task.name}: action {action_index}")
        return {
            "status": "success",
            "message": f"Updated task progress",
            "task": task
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating task progress {task_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update task progress: {str(e)}")