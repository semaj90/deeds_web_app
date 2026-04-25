#!/usr/bin/env python3
"""
Redis Cache Wrapper - Simple interface for Redis operations.

Supports:
  - JSON get/set
  - List operations (lpush, lrange, ltrim)
  - Key expiration (TTL)
"""

import json
import logging
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

try:
    import redis
except ImportError:
    redis = None

logger = logging.getLogger(__name__)


class RedisCache:
    """Simple Redis cache wrapper."""

    def __init__(self, redis_url: str = "redis://localhost:6379"):
        """
        Initialize Redis cache.

        Args:
            redis_url: Redis connection URL (e.g., "redis://localhost:6379")
        """
        if not redis:
            raise ImportError("redis package not installed. Install with: pip install redis")

        # Parse URL
        parsed = urlparse(redis_url)
        host = parsed.hostname or "localhost"
        port = parsed.port or 6379
        db = int(parsed.path.lstrip("/")) if parsed.path else 0

        self.redis = redis.Redis(
            host=host,
            port=port,
            db=db,
            decode_responses=False,
            socket_connect_timeout=5,
            socket_keepalive=True,
        )

        # Test connection
        try:
            self.redis.ping()
            logger.info(f"✅ Redis connected: {host}:{port}/{db}")
        except Exception as e:
            logger.warning(f"⚠️  Redis connection failed: {e}")

    def get_json(self, key: str) -> Optional[Dict[str, Any]]:
        """Get JSON value from Redis."""
        try:
            val = self.redis.get(key)
            if val is None:
                return None
            return json.loads(val)
        except Exception as e:
            logger.error(f"Error getting JSON from {key}: {e}")
            return None

    def set_json(self, key: str, value: Dict[str, Any], ttl: int = None) -> bool:
        """Set JSON value in Redis."""
        try:
            self.redis.set(key, json.dumps(value))
            if ttl:
                self.redis.expire(key, ttl)
            return True
        except Exception as e:
            logger.error(f"Error setting JSON to {key}: {e}")
            return False

    def lpush_json(self, key: str, value: Dict[str, Any]) -> int:
        """Push JSON value to list (left)."""
        try:
            return self.redis.lpush(key, json.dumps(value))
        except Exception as e:
            logger.error(f"Error lpush_json to {key}: {e}")
            return 0

    def lrange_json(self, key: str, start: int = 0, end: int = -1) -> List[Dict[str, Any]]:
        """Get range of JSON values from list."""
        try:
            vals = self.redis.lrange(key, start, end)
            return [json.loads(v) for v in vals]
        except Exception as e:
            logger.error(f"Error lrange_json from {key}: {e}")
            return []

    def ltrim(self, key: str, start: int, end: int) -> bool:
        """Trim list to range."""
        try:
            self.redis.ltrim(key, start, end)
            return True
        except Exception as e:
            logger.error(f"Error ltrim {key}: {e}")
            return False

    def delete(self, key: str) -> bool:
        """Delete key."""
        try:
            self.redis.delete(key)
            return True
        except Exception as e:
            logger.error(f"Error deleting {key}: {e}")
            return False

    def exists(self, key: str) -> bool:
        """Check if key exists."""
        try:
            return self.redis.exists(key) > 0
        except Exception as e:
            logger.error(f"Error checking existence of {key}: {e}")
            return False

    def expire(self, key: str, ttl: int) -> bool:
        """Set expiration on key."""
        try:
            self.redis.expire(key, ttl)
            return True
        except Exception as e:
            logger.error(f"Error setting expiration on {key}: {e}")
            return False
