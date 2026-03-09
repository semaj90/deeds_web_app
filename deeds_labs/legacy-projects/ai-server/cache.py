# Redis Cache Layer
# Multi-tier caching: embeddings (24hr), analysis (1hr), WS messages (5min-1hr)

import redis
import json
import os
from typing import Optional, Any
from datetime import timedelta

# Redis configuration
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "redis")
REDIS_DB = int(os.getenv("REDIS_DB", "0"))

# Initialize Redis client
redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    password=REDIS_PASSWORD,
    db=REDIS_DB,
    decode_responses=True
)

# TTL constants (seconds)
TTL_EMBEDDING = 86400  # 24 hours
TTL_ANALYSIS = 3600    # 1 hour
TTL_WS_UPDATE = 300    # 5 minutes
TTL_WS_ANALYSIS = 3600  # 1 hour
TTL_WS_ERROR = 600     # 10 minutes


def set_cache(key: str, value: Any, ttl: int = 3600) -> bool:
    """Set cache value with TTL"""
    try:
        serialized = json.dumps(value) if not isinstance(value, str) else value
        redis_client.setex(key, ttl, serialized)
        print(f"[Redis] ✅ Cached: {key} (TTL: {ttl}s)")
        return True
    except Exception as e:
        print(f"[Redis] ❌ Cache set failed: {e}")
        return False


def get_cache(key: str) -> Optional[Any]:
    """Get cache value"""
    try:
        value = redis_client.get(key)
        if value is None:
            return None

        # Try to deserialize JSON
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    except Exception as e:
        print(f"[Redis] ❌ Cache get failed: {e}")
        return None


def delete_cache(key: str) -> bool:
    """Delete cache key"""
    try:
        redis_client.delete(key)
        print(f"[Redis] ✅ Deleted: {key}")
        return True
    except Exception as e:
        print(f"[Redis] ❌ Delete failed: {e}")
        return False


def cache_embedding(file_id: str, embedding: list) -> bool:
    """Cache embedding with 24hr TTL"""
    return set_cache(f"embedding:{file_id}", embedding, TTL_EMBEDDING)


def get_cached_embedding(file_id: str) -> Optional[list]:
    """Get cached embedding"""
    return get_cache(f"embedding:{file_id}")


def cache_analysis(file_id: str, analysis: dict) -> bool:
    """Cache analysis result with 1hr TTL"""
    return set_cache(f"analysis:{file_id}", analysis, TTL_ANALYSIS)


def get_cached_analysis(file_id: str) -> Optional[dict]:
    """Get cached analysis"""
    return get_cache(f"analysis:{file_id}")


def cache_ws_update(file_id: str, update: dict, ttl: int = TTL_WS_UPDATE) -> bool:
    """Cache WebSocket update"""
    return set_cache(f"ws:update:{file_id}", update, ttl)


def get_cached_ws_update(file_id: str) -> Optional[dict]:
    """Get cached WebSocket update"""
    return get_cache(f"ws:update:{file_id}")


# Pub/Sub for workflow updates
def publish_workflow_event(channel: str, message: dict) -> bool:
    """Publish workflow event to Redis channel"""
    try:
        serialized = json.dumps(message)
        redis_client.publish(channel, serialized)
        print(f"[Redis] 📡 Published to {channel}: {message}")
        return True
    except Exception as e:
        print(f"[Redis] ❌ Publish failed: {e}")
        return False


def subscribe_workflow_events(channel: str):
    """Subscribe to workflow events channel (generator)"""
    pubsub = redis_client.pubsub()
    pubsub.subscribe(channel)

    print(f"[Redis] 👂 Subscribed to channel: {channel}")

    for message in pubsub.listen():
        if message["type"] == "message":
            try:
                data = json.loads(message["data"])
                yield data
            except json.JSONDecodeError:
                yield message["data"]


# Health check
def redis_health() -> dict:
    """Check Redis connection health"""
    try:
        redis_client.ping()
        return {"status": "healthy", "connected": True}
    except Exception as e:
        return {"status": "unhealthy", "connected": False, "error": str(e)}


# Initialize connection test
try:
    redis_client.ping()
    print(f"[Redis] ✅ Connected to {REDIS_HOST}:{REDIS_PORT}")
except Exception as e:
    print(f"[Redis] ❌ Connection failed: {e}")
