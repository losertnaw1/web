#!/usr/bin/env python3

import time
from typing import Dict, Tuple
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
import logging

logger = logging.getLogger(__name__)

class RateLimiter:
    """
    Simple in-memory rate limiter
    """
    
    def __init__(self):
        # Store: {client_ip: {endpoint: [(timestamp, count), ...]}}
        self.requests: Dict[str, Dict[str, list]] = {}
        
        # Rate limits per endpoint (requests per minute)
        self.limits = {
            "/api/robot/move": 60,      # 1 per second
            "/api/robot/stop": 10,      # 10 per minute
            "/api/navigation/goal": 30, # 30 per minute
            "/api/auth/login": 5,       # 5 per minute
            "/api/logs/": 120,          # 2 per second
            "default": 300              # 5 per second default
        }
        
        # Cleanup interval
        self.last_cleanup = time.time()
        self.cleanup_interval = 300  # 5 minutes
    
    def _cleanup_old_requests(self):
        """Remove old request records"""
        current_time = time.time()
        
        if current_time - self.last_cleanup < self.cleanup_interval:
            return
        
        cutoff_time = current_time - 60  # Keep last minute
        
        for client_ip in list(self.requests.keys()):
            for endpoint in list(self.requests[client_ip].keys()):
                # Filter out old requests
                self.requests[client_ip][endpoint] = [
                    (timestamp, count) for timestamp, count in self.requests[client_ip][endpoint]
                    if timestamp > cutoff_time
                ]
                
                # Remove empty endpoints
                if not self.requests[client_ip][endpoint]:
                    del self.requests[client_ip][endpoint]
            
            # Remove empty clients
            if not self.requests[client_ip]:
                del self.requests[client_ip]
        
        self.last_cleanup = current_time
    
    def _get_rate_limit(self, endpoint: str) -> int:
        """Get rate limit for endpoint"""
        # Check for exact match
        if endpoint in self.limits:
            return self.limits[endpoint]
        
        # Check for prefix match
        for pattern, limit in self.limits.items():
            if pattern != "default" and endpoint.startswith(pattern):
                return limit
        
        return self.limits["default"]
    
    def is_allowed(self, client_ip: str, endpoint: str) -> Tuple[bool, Dict[str, any]]:
        """
        Check if request is allowed
        Returns: (is_allowed, rate_limit_info)
        """
        current_time = time.time()
        
        # Cleanup old requests periodically
        self._cleanup_old_requests()
        
        # Initialize client if not exists
        if client_ip not in self.requests:
            self.requests[client_ip] = {}
        
        if endpoint not in self.requests[client_ip]:
            self.requests[client_ip][endpoint] = []
        
        # Get rate limit for this endpoint
        limit = self._get_rate_limit(endpoint)
        
        # Count requests in last minute
        cutoff_time = current_time - 60
        recent_requests = [
            (timestamp, count) for timestamp, count in self.requests[client_ip][endpoint]
            if timestamp > cutoff_time
        ]
        
        total_requests = sum(count for _, count in recent_requests)
        
        # Check if limit exceeded
        if total_requests >= limit:
            rate_limit_info = {
                "limit": limit,
                "remaining": 0,
                "reset_time": int(cutoff_time + 60),
                "retry_after": 60
            }
            return False, rate_limit_info
        
        # Add current request
        self.requests[client_ip][endpoint] = recent_requests + [(current_time, 1)]
        
        rate_limit_info = {
            "limit": limit,
            "remaining": limit - total_requests - 1,
            "reset_time": int(cutoff_time + 60),
            "retry_after": 0
        }
        
        return True, rate_limit_info

# Global rate limiter instance
rate_limiter = RateLimiter()

async def rate_limit_middleware(request: Request, call_next):
    """
    Rate limiting middleware
    """
    try:
        # Get client IP
        client_ip = request.client.host
        if not client_ip:
            client_ip = request.headers.get("X-Forwarded-For", "unknown")
        
        # Get endpoint path
        endpoint = request.url.path
        
        # Skip rate limiting for certain endpoints
        skip_endpoints = [
            "/docs", "/redoc", "/openapi.json", 
            "/health", "/", "/static"
        ]
        
        should_skip = any(endpoint.startswith(skip) for skip in skip_endpoints)
        
        if not should_skip:
            # Check rate limit
            is_allowed, rate_info = rate_limiter.is_allowed(client_ip, endpoint)
            
            if not is_allowed:
                logger.warning(f"Rate limit exceeded for {client_ip} on {endpoint}")
                
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={
                        "error": "Rate limit exceeded",
                        "message": f"Too many requests to {endpoint}",
                        "limit": rate_info["limit"],
                        "retry_after": rate_info["retry_after"]
                    },
                    headers={
                        "X-RateLimit-Limit": str(rate_info["limit"]),
                        "X-RateLimit-Remaining": str(rate_info["remaining"]),
                        "X-RateLimit-Reset": str(rate_info["reset_time"]),
                        "Retry-After": str(rate_info["retry_after"])
                    }
                )
        
        # Process request
        response = await call_next(request)
        
        # Add rate limit headers to response
        if not should_skip:
            _, rate_info = rate_limiter.is_allowed(client_ip, endpoint)
            response.headers["X-RateLimit-Limit"] = str(rate_info["limit"])
            response.headers["X-RateLimit-Remaining"] = str(rate_info["remaining"])
            response.headers["X-RateLimit-Reset"] = str(rate_info["reset_time"])
        
        return response
        
    except Exception as e:
        logger.error(f"Rate limiting middleware error: {e}")
        # Continue without rate limiting if error occurs
        return await call_next(request)

def get_rate_limit_stats() -> Dict[str, any]:
    """Get rate limiting statistics"""
    total_clients = len(rate_limiter.requests)
    total_endpoints = sum(len(endpoints) for endpoints in rate_limiter.requests.values())
    
    # Count recent requests
    current_time = time.time()
    cutoff_time = current_time - 60
    recent_requests = 0
    
    for client_requests in rate_limiter.requests.values():
        for endpoint_requests in client_requests.values():
            recent_requests += sum(
                count for timestamp, count in endpoint_requests
                if timestamp > cutoff_time
            )
    
    return {
        "total_clients": total_clients,
        "total_endpoints": total_endpoints,
        "recent_requests": recent_requests,
        "rate_limits": rate_limiter.limits
    }

def update_rate_limits(new_limits: Dict[str, int]) -> bool:
    """Update rate limits"""
    try:
        rate_limiter.limits.update(new_limits)
        logger.info(f"Updated rate limits: {new_limits}")
        return True
    except Exception as e:
        logger.error(f"Failed to update rate limits: {e}")
        return False
