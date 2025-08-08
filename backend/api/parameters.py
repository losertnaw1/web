#!/usr/bin/env python3

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from ros_bridge.ros_interface_noetic import get_ros_bridge

router = APIRouter()

# Pydantic models
class ParameterValue(BaseModel):
    name: str
    value: Any
    type: str  # 'int', 'float', 'string', 'bool', 'array'
    description: Optional[str] = None

class ParameterUpdate(BaseModel):
    parameters: Dict[str, Any]

class NodeParameterResponse(BaseModel):
    node_name: str
    parameters: List[ParameterValue]
    timestamp: float

@router.get("/nodes")
async def get_all_nodes_with_parameters():
    """
    Get list of all nodes that have parameters
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        # Get list of active nodes
        nodes = ros_bridge.get_node_list()
        
        return {
            "status": "success",
            "nodes": nodes,
            "count": len(nodes)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get nodes: {str(e)}")

@router.get("/nodes/{node_name}")
async def get_node_parameters(node_name: str):
    """
    Get all parameters for a specific node
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        # Get node parameters
        parameters = ros_bridge.get_node_parameters(node_name)
        
        if parameters is None:
            raise HTTPException(status_code=404, detail=f"Node '{node_name}' not found or has no parameters")
        
        return {
            "status": "success",
            "node_name": node_name,
            "parameters": parameters
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get parameters for node '{node_name}': {str(e)}")

@router.post("/nodes/{node_name}")
async def update_node_parameters(node_name: str, update: ParameterUpdate):
    """
    Update parameters for a specific node
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        # Update parameters
        success = ros_bridge.set_node_parameters(node_name, update.parameters)
        
        if not success:
            raise HTTPException(status_code=400, detail=f"Failed to update parameters for node '{node_name}'")
        
        return {
            "status": "success",
            "message": f"Parameters updated for node '{node_name}'",
            "updated_parameters": update.parameters
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update parameters for node '{node_name}': {str(e)}")

@router.get("/nodes/{node_name}/parameter/{param_name}")
async def get_specific_parameter(node_name: str, param_name: str):
    """
    Get a specific parameter value from a node
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        # Get specific parameter
        value = ros_bridge.get_node_parameter(node_name, param_name)
        
        if value is None:
            raise HTTPException(status_code=404, detail=f"Parameter '{param_name}' not found in node '{node_name}'")
        
        return {
            "status": "success",
            "node_name": node_name,
            "parameter_name": param_name,
            "value": value
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get parameter '{param_name}' from node '{node_name}': {str(e)}")

@router.post("/nodes/{node_name}/parameter/{param_name}")
async def update_specific_parameter(node_name: str, param_name: str, value: Dict[str, Any]):
    """
    Update a specific parameter in a node
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        # Update specific parameter
        success = ros_bridge.set_node_parameter(node_name, param_name, value.get('value'))
        
        if not success:
            raise HTTPException(status_code=400, detail=f"Failed to update parameter '{param_name}' in node '{node_name}'")
        
        return {
            "status": "success",
            "message": f"Parameter '{param_name}' updated in node '{node_name}'",
            "parameter_name": param_name,
            "new_value": value.get('value')
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update parameter '{param_name}' in node '{node_name}': {str(e)}")

# Predefined parameter presets
@router.get("/presets")
async def get_parameter_presets():
    """
    Get predefined parameter presets for common configurations
    """
    presets = {
        "navigation_conservative": {
            "description": "Conservative navigation settings for safe indoor movement",
            "parameters": {
                "max_vel_x": 0.2,
                "max_vel_theta": 0.5,
                "min_obstacle_dist": 0.5,
                "inflation_radius": 0.3
            }
        },
        "navigation_aggressive": {
            "description": "Aggressive navigation settings for faster movement",
            "parameters": {
                "max_vel_x": 0.5,
                "max_vel_theta": 1.0,
                "min_obstacle_dist": 0.3,
                "inflation_radius": 0.2
            }
        },
        "localization_precise": {
            "description": "High precision localization settings",
            "parameters": {
                "min_particles": 500,
                "max_particles": 2000,
                "update_min_d": 0.1,
                "update_min_a": 0.1
            }
        }
    }
    
    return {
        "status": "success",
        "presets": presets
    }

@router.post("/presets/{preset_name}/apply")
async def apply_parameter_preset(preset_name: str, target_nodes: Optional[List[str]] = None):
    """
    Apply a parameter preset to specified nodes
    """
    try:
        ros_bridge = get_ros_bridge()
        if not ros_bridge:
            raise HTTPException(status_code=503, detail="ROS2 bridge not available")
        
        # Get preset configuration
        presets_response = await get_parameter_presets()
        presets = presets_response["presets"]
        
        if preset_name not in presets:
            raise HTTPException(status_code=404, detail=f"Preset '{preset_name}' not found")
        
        preset = presets[preset_name]
        
        # Apply to target nodes or auto-detect
        if not target_nodes:
            target_nodes = ["navigation_node", "localization_node"]  # Default nodes
        
        results = {}
        for node_name in target_nodes:
            try:
                success = ros_bridge.set_node_parameters(node_name, preset["parameters"])
                results[node_name] = "success" if success else "failed"
            except Exception as e:
                results[node_name] = f"error: {str(e)}"
        
        return {
            "status": "success",
            "preset_name": preset_name,
            "applied_to": target_nodes,
            "results": results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to apply preset '{preset_name}': {str(e)}")
