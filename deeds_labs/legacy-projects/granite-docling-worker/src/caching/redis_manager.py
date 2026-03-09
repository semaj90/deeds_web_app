"""Redis client manager for caching"""

import logging
from typing import Optional, Any
import redis
from redis.connection import ConnectionPool

logger = logging.getLogger(__name__)


class RedisManager:
    """Redis client manager with connection pooling"""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 6379,
        db: int = 0,
        password: Optional[str] = None,
        pool_size: int = 10,
    ):
        self.host = host
        self.port = port
        self.db = db
        self.pool_size = pool_size

        try:
            # Create connection pool
            self.pool = ConnectionPool(
                host=host,
                port=port,
                db=db,
                password=password,
                max_connections=pool_size,
                decode_responses=True,
            )

            # Create Redis client
            self.client = redis.Redis(connection_pool=self.pool)

            # Test connection
            self.client.ping()
            logger.info(f"Redis connected: {host}:{port}")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            self.client = None

    def get(self, key: str) -> Optional[Any]:
        """Get value from Redis"""
        try:
            if not self.client:
                return None
            return self.client.get(key)
        except Exception as e:
            logger.error(f"Redis get failed: {e}")
            return None

    def set(self, key: str, value: Any, ttl: int = 604800) -> bool:
        """Set value in Redis with TTL"""
        try:
            if not self.client:
                return False
            self.client.setex(key, ttl, value)
            return True
        except Exception as e:
            logger.error(f"Redis set failed: {e}")
            return False

    def delete(self, key: str) -> bool:
        """Delete key from Redis"""
        try:
            if not self.client:
                return False
            self.client.delete(key)
            return True
        except Exception as e:
            logger.error(f"Redis delete failed: {e}")
            return False

    def exists(self, key: str) -> bool:
        """Check if key exists"""
        try:
            if not self.client:
                return False
    return self.client.exists(key) > 0
        except Exception as e:
            logger.error(f"Redis exists failed: {e}")
            return False

    def ttl(self, key: str) -> int:
        """Get TTL for key"""
        try:
            if not self.client:
                return -1
            return self.client.ttl(key)
        except Exception as e:
            logger.error(f"Redis ttl failed: {e}")
            return -1

    def expire(self, key: str, ttl: int) -> bool:
        """Set TTL for key"""
        try:
            if not self.client:
                return False
            self.client.expire(key, ttl)
            return True
        except Exception as e:
            logger.error(f"Redis expire failed: {e}")
            return False

    def info(self) -> dict:
        """Get Redis server info"""
        try:
            if not self.client:
                return {}
            return self.client.info()
        except Exception as e:
            logger.error(f"Redis info failed: {e}")
            return {}

    def close(self):
        """Close Redis connection"""
        try:
            if self.pool:
                self.pool.disconnect()
                logger.info("Redis connection closed")
        except Exception as e:
            logger.error(f"Failed to close Redis: {e}")
