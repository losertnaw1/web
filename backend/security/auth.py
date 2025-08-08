#!/usr/bin/env python3

import jwt
import hashlib
import secrets
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

# Configuration
SECRET_KEY = secrets.token_urlsafe(32)  # In production, use environment variable
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Security scheme
security = HTTPBearer()

# Pydantic models
class UserCredentials(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

class TokenData(BaseModel):
    username: Optional[str] = None
    permissions: list = []

class User(BaseModel):
    username: str
    permissions: list = []
    created_at: float
    last_login: Optional[float] = None

# In-memory user storage (in production, use database)
users_db: Dict[str, Dict[str, Any]] = {
    "admin": {
        "username": "admin",
        "password_hash": hashlib.sha256("admin123".encode()).hexdigest(),  # Default password
        "permissions": ["read", "write", "admin", "terminal", "control"],
        "created_at": time.time(),
        "last_login": None
    },
    "operator": {
        "username": "operator", 
        "password_hash": hashlib.sha256("operator123".encode()).hexdigest(),
        "permissions": ["read", "write", "control"],
        "created_at": time.time(),
        "last_login": None
    },
    "viewer": {
        "username": "viewer",
        "password_hash": hashlib.sha256("viewer123".encode()).hexdigest(),
        "permissions": ["read"],
        "created_at": time.time(),
        "last_login": None
    }
}

# Active sessions
active_sessions: Dict[str, Dict[str, Any]] = {}

def hash_password(password: str) -> str:
    """Hash password with salt"""
    salt = secrets.token_hex(16)
    password_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return f"{salt}:{password_hash.hex()}"

def verify_password(password: str, password_hash: str) -> bool:
    """Verify password against hash"""
    try:
        if ":" in password_hash:
            # New format with salt
            salt, hash_hex = password_hash.split(":", 1)
            expected_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
            return hash_hex == expected_hash.hex()
        else:
            # Legacy format (simple SHA256)
            return password_hash == hashlib.sha256(password.encode()).hexdigest()
    except Exception:
        return False

def authenticate_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    """Authenticate user credentials"""
    user = users_db.get(username)
    if not user:
        return None
    
    if not verify_password(password, user["password_hash"]):
        return None
    
    # Update last login
    user["last_login"] = time.time()
    
    return user

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire, "type": "access"})
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: Dict[str, Any]) -> str:
    """Create JWT refresh token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """Verify and decode JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        
        if username is None:
            return None
        
        return payload
    except jwt.PyJWTError:
        return None

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    """Get current authenticated user"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = verify_token(credentials.credentials)
        if payload is None:
            raise credentials_exception
        
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        
        # Check if user still exists
        user = users_db.get(username)
        if user is None:
            raise credentials_exception
        
        return {
            "username": username,
            "permissions": user["permissions"],
            "token_data": payload
        }
        
    except Exception:
        raise credentials_exception

def require_permission(permission: str):
    """Decorator to require specific permission"""
    def permission_checker(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if permission not in current_user["permissions"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{permission}' required"
            )
        return current_user
    
    return permission_checker

# Permission shortcuts
require_read = require_permission("read")
require_write = require_permission("write") 
require_admin = require_permission("admin")
require_terminal = require_permission("terminal")
require_control = require_permission("control")

def login_user(username: str, password: str) -> Optional[Token]:
    """Login user and return tokens"""
    user = authenticate_user(username, password)
    if not user:
        return None
    
    # Create tokens
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": username, "permissions": user["permissions"]},
        expires_delta=access_token_expires
    )
    
    refresh_token = create_refresh_token(
        data={"sub": username}
    )
    
    # Store session
    session_id = secrets.token_urlsafe(32)
    active_sessions[session_id] = {
        "username": username,
        "created_at": time.time(),
        "last_activity": time.time(),
        "access_token": access_token,
        "refresh_token": refresh_token
    }
    
    logger.info(f"User '{username}' logged in successfully")
    
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )

def refresh_access_token(refresh_token: str) -> Optional[str]:
    """Refresh access token using refresh token"""
    try:
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        
        if payload.get("type") != "refresh":
            return None
        
        username = payload.get("sub")
        if not username:
            return None
        
        user = users_db.get(username)
        if not user:
            return None
        
        # Create new access token
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        new_access_token = create_access_token(
            data={"sub": username, "permissions": user["permissions"]},
            expires_delta=access_token_expires
        )
        
        return new_access_token
        
    except jwt.PyJWTError:
        return None

def logout_user(token: str) -> bool:
    """Logout user and invalidate session"""
    try:
        payload = verify_token(token)
        if not payload:
            return False
        
        username = payload.get("sub")
        
        # Remove from active sessions
        sessions_to_remove = []
        for session_id, session in active_sessions.items():
            if session["username"] == username:
                sessions_to_remove.append(session_id)
        
        for session_id in sessions_to_remove:
            del active_sessions[session_id]
        
        logger.info(f"User '{username}' logged out")
        return True
        
    except Exception:
        return False

def get_active_sessions() -> Dict[str, Any]:
    """Get information about active sessions"""
    return {
        "total_sessions": len(active_sessions),
        "sessions": [
            {
                "username": session["username"],
                "created_at": session["created_at"],
                "last_activity": session["last_activity"]
            }
            for session in active_sessions.values()
        ]
    }

def create_user(username: str, password: str, permissions: list) -> bool:
    """Create new user"""
    if username in users_db:
        return False
    
    users_db[username] = {
        "username": username,
        "password_hash": hash_password(password),
        "permissions": permissions,
        "created_at": time.time(),
        "last_login": None
    }
    
    logger.info(f"Created new user: {username}")
    return True

def update_user_permissions(username: str, permissions: list) -> bool:
    """Update user permissions"""
    if username not in users_db:
        return False
    
    users_db[username]["permissions"] = permissions
    logger.info(f"Updated permissions for user: {username}")
    return True

def delete_user(username: str) -> bool:
    """Delete user"""
    if username not in users_db:
        return False
    
    # Don't allow deleting admin
    if username == "admin":
        return False
    
    del users_db[username]
    
    # Remove active sessions
    sessions_to_remove = []
    for session_id, session in active_sessions.items():
        if session["username"] == username:
            sessions_to_remove.append(session_id)
    
    for session_id in sessions_to_remove:
        del active_sessions[session_id]
    
    logger.info(f"Deleted user: {username}")
    return True
