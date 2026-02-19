#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - Redis Caching Setup
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Configure Redis caching with key namespacing and TTL policies
═══════════════════════════════════════════════════════════════════════
"""

import os
import sys
import json
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Any, Dict
import redis


# Configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
REDIS_DB = int(os.getenv("REDIS_DB", "0"))

# TTL policies (in seconds)
TTL_POLICIES = {
    "coordinates": 86400,      # 24 hours
    "embedding": 604800,        # 7 days
    "cluster": 43200,           # 12 hours
    "search": 3600,             # 1 hour
    "ast": 86400,               # 24 hours
    "analysis": 7200,           # 2 hours
    "pattern": 3600,            # 1 hour
}

# Key prefixes
KEY_PREFIXES = {
    "coordinates": "kb:v2:coordinates:",
    "embedding": "kb:v2:embedding:",
    "cluster": "kb:v2:cluster:",
    "search": "kb:v2:search:",
    "ast": "kb:v2:ast:",
    "analysis": "kb:v2:analysis:",
    "pattern": "kb:v2:pattern:",
}


class RedisCache:
    """Redis cache manager with key namespacing and TTL policies."""

    def __init__(self, url: str = REDIS_URL, db: int = REDIS_DB):
        """Initialize Redis connection."""
        self.client = redis.from_url(url, db=db, decode_responses=True)
        self.binary_client = redis.from_url(url, db=db, decode_responses=False)

    def _make_key(self, namespace: str, identifier: str) -> str:
        """Create a namespaced key."""
        prefix = KEY_PREFIXES.get(namespace, f"kb:v2:{namespace}:")
        return f"{prefix}{identifier}"

    def _get_ttl(self, namespace: str) -> int:
        """Get TTL for a namespace."""
        return TTL_POLICIES.get(namespace, 3600)

    def set(
        self,
        namespace: str,
        identifier: str,
        value: Any,
        ttl: Optional[int] = None,
    ) -> bool:
        """Set a value in cache with TTL."""
        key = self._make_key(namespace, identifier)
        ttl = ttl or self._get_ttl(namespace)

        if isinstance(value, (dict, list)):
            value = json.dumps(value)

        return self.client.setex(key, ttl, value)

    def get(self, namespace: str, identifier: str) -> Optional[Any]:
        """Get a value from cache."""
        key = self._make_key(namespace, identifier)
        value = self.client.get(key)

        if value is None:
            return None

        # Try to parse as JSON
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return value

    def set_binary(
        self,
        namespace: str,
        identifier: str,
        value: bytes,
        ttl: Optional[int] = None,
    ) -> bool:
        """Set binary data in cache with TTL."""
        key = self._make_key(namespace, identifier)
        ttl = ttl or self._get_ttl(namespace)
        return self.binary_client.setex(key, ttl, value)

    def get_binary(self, namespace: str, identifier: str) -> Optional[bytes]:
        """Get binary data from cache."""
        key = self._make_key(namespace, identifier)
        return self.binary_client.get(key)

    def delete(self, namespace: str, identifier: str) -> bool:
        """Delete a key from cache."""
        key = self._make_key(namespace, identifier)
        return bool(self.client.delete(key))

    def exists(self, namespace: str, identifier: str) -> bool:
        """Check if a key exists in cache."""
        key = self._make_key(namespace, identifier)
        return bool(self.client.exists(key))

    def get_ttl(self, namespace: str, identifier: str) -> int:
        """Get remaining TTL for a key."""
        key = self._make_key(namespace, identifier)
        return self.client.ttl(key)

    def invalidate_pattern(self, namespace: str, pattern: str = "*") -> int:
        """Invalidate all keys matching a pattern in a namespace."""
        key_pattern = self._make_key(namespace, pattern)
        keys = self.client.keys(key_pattern)
        if keys:
            return self.client.delete(*keys)
        return 0

    def get_stats(self, namespace: str) -> Dict[str, Any]:
        """Get cache statistics for a namespace."""
        key_pattern = self._make_key(namespace, "*")
        keys = self.client.keys(key_pattern)

        total_keys = len(keys)
        total_memory = 0
        ttl_distribution = {"expired": 0, "1h": 0, "6h": 0, "24h": 0, "7d": 0}

        for key in keys:
            # Get memory usage
            try:
                memory = self.client.memory_usage(key)
                if memory:
                    total_memory += memory
            except:
                pass

            # Get TTL distribution
            ttl = self.client.ttl(key)
            if ttl < 0:
                ttl_distribution["expired"] += 1
            elif ttl < 3600:
                ttl_distribution["1h"] += 1
            elif ttl < 21600:
                ttl_distribution["6h"] += 1
            elif ttl < 86400:
                ttl_distribution["24h"] += 1
            else:
                ttl_distribution["7d"] += 1

        return {
            "namespace": namespace,
            "total_keys": total_keys,
            "total_memory_bytes": total_memory,
            "total_memory_mb": round(total_memory / 1024 / 1024, 2),
            "ttl_distribution": ttl_distribution,
            "default_ttl_seconds": self._get_ttl(namespace),
        }


def setup_redis():
    """Set up Redis caching with test data."""
    print(f"Connecting to Redis at {REDIS_URL}...")
    cache = RedisCache()

    # Test connection
    try:
        cache.client.ping()
        print("✅ Redis connection successful!")
    except Exception as e:
        print(f"❌ Redis connection failed: {e}")
        sys.exit(1)

    # Display configuration
    print("\n📋 Redis Cache Configuration:")
    print(f"   - URL: {REDIS_URL}")
    print(f"   - Database: {REDIS_DB}")
    print(f"\n🔑 Key Namespaces:")
    for namespace, prefix in KEY_PREFIXES.items():
        ttl = TTL_POLICIES.get(namespace, 3600)
        ttl_hours = ttl / 3600
        print(f"   - {namespace:12} → {prefix:30} (TTL: {ttl_hours:.1f}h)")

    # Create test data
    print("\n🧪 Creating test data...")

    # Test 1: Coordinates cache
    test_tag_id = "test-tag-123"
    coordinates = {"x": 0.123, "y": 0.456, "z": 0.789, "timestamp": datetime.now().isoformat()}
    cache.set("coordinates", test_tag_id, coordinates)
    print(f"   ✅ Stored coordinates for tag: {test_tag_id}")

    # Test 2: Embedding cache
    test_text_hash = hashlib.sha256(b"test text").hexdigest()[:16]
    embedding = [0.1] * 384  # 384-dim vector
    cache.set("embedding", test_text_hash, embedding)
    print(f"   ✅ Stored embedding for hash: {test_text_hash}")

    # Test 3: Cluster cache
    test_cluster_id = "cluster-abc"
    cluster_data = {
        "summary": "Test cluster summary",
        "tags": ["tag1", "tag2", "tag3"],
        "centroid": [0.5] * 384,
        "size": 3,
    }
    cache.set("cluster", test_cluster_id, cluster_data)
    print(f"   ✅ Stored cluster data for: {test_cluster_id}")

    # Test 4: Search cache
    test_query_hash = hashlib.sha256(b"test query").hexdigest()[:16]
    search_results = {
        "query": "test query",
        "results": [
            {"id": "1", "score": 0.95},
            {"id": "2", "score": 0.87},
        ],
        "timestamp": datetime.now().isoformat(),
    }
    cache.set("search", test_query_hash, search_results)
    print(f"   ✅ Stored search results for: {test_query_hash}")

    # Test 5: AST cache
    test_file_hash = hashlib.sha256(b"test file content").hexdigest()[:16]
    ast_data = {
        "filePath": "/test/file.ts",
        "imports": ["react", "svelte"],
        "exports": ["Component"],
        "functions": ["handleClick"],
        "errors": [],
    }
    cache.set("ast", test_file_hash, ast_data)
    print(f"   ✅ Stored AST data for: {test_file_hash}")

    # Verify test data
    print("\n🔍 Verifying test data...")
    retrieved_coords = cache.get("coordinates", test_tag_id)
    if retrieved_coords and retrieved_coords["x"] == 0.123:
        print("   ✅ Coordinates retrieval successful")
    else:
        print("   ❌ Coordinates retrieval failed")

    retrieved_embedding = cache.get("embedding", test_text_hash)
    if retrieved_embedding and len(retrieved_embedding) == 384:
        print("   ✅ Embedding retrieval successful")
    else:
        print("   ❌ Embedding retrieval failed")

    # Display statistics
    print("\n📊 Cache Statistics:")
    for namespace in KEY_PREFIXES.keys():
        stats = cache.get_stats(namespace)
        if stats["total_keys"] > 0:
            print(f"\n   {namespace.upper()}:")
            print(f"      - Keys: {stats['total_keys']}")
            print(f"      - Memory: {stats['total_memory_mb']} MB")
            print(f"      - Default TTL: {stats['default_ttl_seconds']}s")

    print("\n✅ Redis caching setup complete!")
    print("\n💡 Usage Example:")
    print("   from backend.scripts.setup_redis_v2 import RedisCache")
    print("   cache = RedisCache()")
    print("   cache.set('coordinates', 'tag-id', {'x': 1, 'y': 2, 'z': 3})")
    print("   coords = cache.get('coordinates', 'tag-id')")


def verify_redis():
    """Verify Redis configuration and display statistics."""
    print(f"Connecting to Redis at {REDIS_URL}...")
    cache = RedisCache()

    try:
        cache.client.ping()
        print("✅ Redis connection successful!")
    except Exception as e:
        print(f"❌ Redis connection failed: {e}")
        return False

    print("\n📊 Cache Statistics by Namespace:")
    total_keys = 0
    total_memory = 0

    for namespace in KEY_PREFIXES.keys():
        stats = cache.get_stats(namespace)
        total_keys += stats["total_keys"]
        total_memory += stats["total_memory_bytes"]

        if stats["total_keys"] > 0:
            print(f"\n   {namespace.upper()}:")
            print(f"      - Keys: {stats['total_keys']}")
            print(f"      - Memory: {stats['total_memory_mb']} MB")
            print(f"      - TTL Distribution: {stats['ttl_distribution']}")

    print(f"\n📈 Total Statistics:")
    print(f"   - Total Keys: {total_keys}")
    print(f"   - Total Memory: {round(total_memory / 1024 / 1024, 2)} MB")

    # Redis info
    info = cache.client.info()
    print(f"\n🔧 Redis Server Info:")
    print(f"   - Version: {info.get('redis_version', 'unknown')}")
    print(f"   - Used Memory: {round(info.get('used_memory', 0) / 1024 / 1024, 2)} MB")
    print(f"   - Connected Clients: {info.get('connected_clients', 0)}")
    print(f"   - Total Commands: {info.get('total_commands_processed', 0)}")

    return True


if __name__ == "__main__":
    try:
        if len(sys.argv) > 1 and sys.argv[1] == "verify":
            verify_redis()
        else:
            setup_redis()
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
