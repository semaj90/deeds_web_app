"""
Search Cache Manager: Redis-based caching for search results

Provides:
- Query hash computation for cache keys
- Redis cache storage with 24-hour TTL
- Cache hit/miss tracking
- Cache invalidation on new uploads
- Cache statistics
"""

import hashlib
import json
import logging
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from typing import Optional, Dict, List

import redis
from .search_service import SearchResult

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


@dataclass
class CacheStats:
    """Cache statistics"""
    total_hits: int
    total_misses: int
    hit_rate: float
    cached_queries: int
    cache_size_bytes: int
    last_updated: datetime


class CacheManager:
    """Redis-based search result caching"""

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379",
        ttl_seconds: int = 86400,  # 24 hours
        cache_prefix: str = "search:",
    ):
        self.redis_url = redis_url
        self.ttl_seconds = ttl_seconds
        self.cache_prefix = cache_prefix

        # Initialize Redis
        self.redis_client = redis.from_url(redis_url)

        # Statistics
        self.stats_key = f"{cache_prefix}stats"
        self._init_stats()

        logger.info(f"✅ Cache Manager initialized")
        logger.info(f"   Redis: {redis_url}")
        logger.info(f"   TTL: {ttl_seconds}s ({ttl_seconds // 3600}h)")
        logger.info(f"   Prefix: {cache_prefix}")

    def _init_stats(self):
        """Initialize cache statistics"""
        try:
            stats = self.redis_client.hgetall(self.stats_key)
            if not stats:
                self.redis_client.hset(
                    self.stats_key,
                    mapping={
                        "total_hits": 0,
                        "total_misses": 0,
                        "cached_queries": 0,
                        "last_updated": datetime.now().isoformat(),
                    },
                )
        except Exception as e:
            logger.warning(f"Error initializing stats: {e}")

    def _compute_query_hash(self, query: str, filters: Optional[Dict] = None) -> str:
        """Compute hash for query + filters"""
        # Create cache key from query and filters
        cache_key_data = {
            "query": query.lower().strip(),
            "filters": filters or {},
        }

        # Hash the JSON representation
        cache_key_json = json.dumps(cache_key_data, sort_keys=True)
        query_hash = hashlib.sha256(cache_key_json.encode()).hexdigest()

        return query_hash

    def _get_cache_key(self, query_hash: str) -> str:
        """Get full Redis cache key"""
        return f"{self.cache_prefix}{query_hash}"

    async def get(self, query: str, filters: Optional[Dict] = None) -> Optional[SearchResult]:
        """Get cached search result"""
        try:
            query_hash = self._compute_query_hash(query, filters)
            cache_key = self._get_cache_key(query_hash)

            # Try to get from cache
            cached_data = self.redis_client.get(cache_key)

            if cached_data:
                # Cache hit
                logger.info(f"✅ Cache hit for query: {query[:50]}...")
                self._increment_stat("total_hits")

                # Deserialize
                result_dict = json.loads(cached_data)
                result = SearchResult(**result_dict)
                result.cached = True

                return result
            else:
                # Cache miss
                logger.info(f"❌ Cache miss for query: {query[:50]}...")
                self._increment_stat("total_misses")
                return None

        except Exception as e:
            logger.warning(f"Cache get error: {e}")
            return None

    async def set(
        self,
        query: str,
        result: SearchResult,
        filters: Optional[Dict] = None,
    ) -> bool:
        """Cache search result"""
        try:
            query_hash = self._compute_query_hash(query, filters)
            cache_key = self._get_cache_key(query_hash)

            # Serialize result
            result_dict = asdict(result)
            result_dict["timestamp"] = result_dict["timestamp"].isoformat()
            result_json = json.dumps(result_dict)

            # Store in Redis with TTL
            self.redis_client.setex(
                cache_key,
                self.ttl_seconds,
                result_json,
            )

            logger.info(f"✅ Cached result for query: {query[:50]}...")
            self._increment_stat("cached_queries")

            return True

        except Exception as e:
            logger.warning(f"Cache set error: {e}")
            return False

    async def invalidate_doc(self, doc_id: str) -> int:
        """Invalidate all cached results for a document"""
        try:
            # Find all cache keys that reference this doc_id
            pattern = f"{self.cache_prefix}*"
            keys = self.redis_client.keys(pattern)

            invalidated = 0
            for key in keys:
                try:
                    cached_data = self.redis_client.get(key)
                    if cached_data:
                        result_dict = json.loads(cached_data)
                        # Check if any result references this doc_id
                        for result in result_dict.get("results", []):
                            if result.get("doc_id") == doc_id:
                                self.redis_client.delete(key)
                                invalidated += 1
                                logger.debug(f"  ✅ Invalidated cache key: {key}")
                                break

                except Exception as e:
                    logger.warning(f"Error checking cache key {key}: {e}")
                    continue

            logger.info(f"✅ Invalidated {invalidated} cache entries for doc {doc_id}")
            return invalidated

        except Exception as e:
            logger.error(f"Cache invalidation error: {e}")
            return 0

    async def clear_all(self) -> int:
        """Clear all cached results"""
        try:
            pattern = f"{self.cache_prefix}*"
            keys = self.redis_client.keys(pattern)

            if keys:
                deleted = self.redis_client.delete(*keys)
                logger.info(f"✅ Cleared {deleted} cache entries")
                return deleted
            else:
                logger.info("Cache is empty")
                return 0

        except Exception as e:
            logger.error(f"Cache clear error: {e}")
            return 0

    def _increment_stat(self, stat_name: str):
        """Increment cache statistic"""
        try:
            self.redis_client.hincrby(self.stats_key, stat_name, 1)
            self.redis_client.hset(
                self.stats_key,
                "last_updated",
                datetime.now().isoformat(),
            )
        except Exception as e:
            logger.warning(f"Error updating stats: {e}")

    async def get_stats(self) -> CacheStats:
        """Get cache statistics"""
        try:
            stats_dict = self.redis_client.hgetall(self.stats_key)

            total_hits = int(stats_dict.get(b"total_hits", 0))
            total_misses = int(stats_dict.get(b"total_misses", 0))
            cached_queries = int(stats_dict.get(b"cached_queries", 0))

            total_requests = total_hits + total_misses
            hit_rate = (total_hits / total_requests * 100) if total_requests > 0 else 0

            # Get cache size
            pattern = f"{self.cache_prefix}*"
            keys = self.redis_client.keys(pattern)
            cache_size_bytes = sum(
                self.redis_client.memory_usage(key) or 0 for key in keys
            )

            return CacheStats(
                total_hits=total_hits,
                total_misses=total_misses,
                hit_rate=hit_rate,
                cached_queries=cached_queries,
                cache_size_bytes=cache_size_bytes,
                last_updated=datetime.now(),
            )

        except Exception as e:
            logger.error(f"Error getting stats: {e}")
            return CacheStats(
                total_hits=0,
                total_misses=0,
                hit_rate=0,
                cached_queries=0,
                cache_size_bytes=0,
                last_updated=datetime.now(),
            )

    async def close(self):
        """Close Redis connection"""
        try:
            self.redis_client.close()
            logger.info("✅ Cache Manager closed")
        except Exception as e:
            logger.warning(f"Error closing cache: {e}")


# Global cache instance
cache_manager: Optional[CacheManager] = None


async def get_cache_manager() -> CacheManager:
    """Get or create cache manager instance"""
    global cache_manager

    if cache_manager is None:
        cache_manager = CacheManager()

    return cache_manager


async def close_cache_manager():
    """Close cache manager"""
    global cache_manager

    if cache_manager:
        await cache_manager.close()
        cache_manager = None
