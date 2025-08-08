#!/usr/bin/env python3

from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import List, Optional
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from security.auth import (
    UserCredentials, Token, User,
    login_user, logout_user, refresh_access_token,
    get_current_user, require_admin, require_read,
    get_active_sessions, create_user, update_user_permissions, delete_user,
    users_db, security
)

router = APIRouter()

# Pydantic models
class UserCreate(BaseModel):
    username: str
    password: str
    permissions: List[str] = ["read"]

class UserUpdate(BaseModel):
    permissions: List[str]

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class RefreshTokenRequest(BaseModel):
    refresh_token: str

@router.post("/login", response_model=Token)
async def login(credentials: UserCredentials):
    """
    Login with username and password
    """
    try:
        token = login_user(credentials.username, credentials.password)
        
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return token
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")

@router.post("/logout")
async def logout(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Logout and invalidate token
    """
    try:
        success = logout_user(credentials.credentials)
        
        if success:
            return {"status": "success", "message": "Logged out successfully"}
        else:
            return {"status": "error", "message": "Logout failed"}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Logout failed: {str(e)}")

@router.post("/refresh", response_model=dict)
async def refresh_token(request: RefreshTokenRequest):
    """
    Refresh access token using refresh token
    """
    try:
        new_access_token = refresh_access_token(request.refresh_token)
        
        if not new_access_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        
        return {
            "access_token": new_access_token,
            "token_type": "bearer"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Token refresh failed: {str(e)}")

@router.get("/me", response_model=User)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """
    Get current user information
    """
    try:
        username = current_user["username"]
        user_data = users_db.get(username)
        
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")
        
        return User(
            username=user_data["username"],
            permissions=user_data["permissions"],
            created_at=user_data["created_at"],
            last_login=user_data.get("last_login")
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get user info: {str(e)}")

@router.post("/change-password")
async def change_password(
    password_change: PasswordChange,
    current_user: dict = Depends(get_current_user)
):
    """
    Change current user's password
    """
    try:
        from security.auth import authenticate_user, hash_password
        
        username = current_user["username"]
        
        # Verify current password
        if not authenticate_user(username, password_change.current_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect"
            )
        
        # Update password
        users_db[username]["password_hash"] = hash_password(password_change.new_password)
        
        return {"status": "success", "message": "Password changed successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to change password: {str(e)}")

@router.get("/sessions")
async def get_sessions(current_user: dict = Depends(require_admin)):
    """
    Get active sessions (admin only)
    """
    try:
        return get_active_sessions()
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get sessions: {str(e)}")

@router.get("/users")
async def list_users(current_user: dict = Depends(require_admin)):
    """
    List all users (admin only)
    """
    try:
        users = []
        for username, user_data in users_db.items():
            users.append(User(
                username=user_data["username"],
                permissions=user_data["permissions"],
                created_at=user_data["created_at"],
                last_login=user_data.get("last_login")
            ))
        
        return {"users": users, "total": len(users)}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list users: {str(e)}")

@router.post("/users")
async def create_new_user(
    user_create: UserCreate,
    current_user: dict = Depends(require_admin)
):
    """
    Create new user (admin only)
    """
    try:
        # Validate permissions
        valid_permissions = ["read", "write", "admin", "terminal", "control"]
        for perm in user_create.permissions:
            if perm not in valid_permissions:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid permission: {perm}"
                )
        
        success = create_user(
            user_create.username,
            user_create.password,
            user_create.permissions
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User already exists"
            )
        
        return {
            "status": "success",
            "message": f"User '{user_create.username}' created successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create user: {str(e)}")

@router.put("/users/{username}")
async def update_user(
    username: str,
    user_update: UserUpdate,
    current_user: dict = Depends(require_admin)
):
    """
    Update user permissions (admin only)
    """
    try:
        # Validate permissions
        valid_permissions = ["read", "write", "admin", "terminal", "control"]
        for perm in user_update.permissions:
            if perm not in valid_permissions:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid permission: {perm}"
                )
        
        success = update_user_permissions(username, user_update.permissions)
        
        if not success:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {
            "status": "success",
            "message": f"User '{username}' updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update user: {str(e)}")

@router.delete("/users/{username}")
async def delete_user_endpoint(
    username: str,
    current_user: dict = Depends(require_admin)
):
    """
    Delete user (admin only)
    """
    try:
        # Prevent self-deletion
        if username == current_user["username"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete your own account"
            )
        
        success = delete_user(username)
        
        if not success:
            raise HTTPException(status_code=404, detail="User not found or cannot be deleted")
        
        return {
            "status": "success",
            "message": f"User '{username}' deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(e)}")

@router.get("/permissions")
async def get_available_permissions(current_user: dict = Depends(require_read)):
    """
    Get list of available permissions
    """
    permissions = {
        "read": "View data and status",
        "write": "Modify settings and parameters",
        "control": "Control robot movement and navigation",
        "terminal": "Access terminal interface",
        "admin": "User management and system administration"
    }
    
    return {"permissions": permissions}

@router.get("/check")
async def check_auth(current_user: dict = Depends(get_current_user)):
    """
    Check if current token is valid
    """
    return {
        "status": "authenticated",
        "username": current_user["username"],
        "permissions": current_user["permissions"]
    }
