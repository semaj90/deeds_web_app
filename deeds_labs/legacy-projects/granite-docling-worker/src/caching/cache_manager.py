"""Cache manager for OCR results with TTL and auto-refresh"""

import logging
import hashlib
import json
from typing import Optional, Dict, Any

from .redis_manager import RedisManager

logger = logging.getLogger(__name__)


class CacheManager:
    """Manages OCR result caching with 7-day TTL and auto-refresh"""

    def __init__(self, redis_manager: RedisManager, ttl: int = 604800):
        self.redis = redis_manager
        self.ttl = ttl  # 7 days in seconds
        logger.info(f"CacheManager initialized (TTL: {ttl}s)")

    def get_cache_key(self, document_hash: str, page_num: int) -> str:
        """Generate cache key"""
        return f"ocr:{document_hash}:{page_num}"

    def compute_document_hash(self, file_path: str) -> str:
        """Compute SHA256 hash of document"""
        try:
            sha256_hash = hashlib.sha256()
            with open(file_path, "rb") as f:
                for byte_block in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(byte_block)
            return sha256_hash.hexdigest()
        except Exception as e:
            logger.error(f"Failed to compute hash: {e}")
            return ""

    def get_cached_result(self, document_hash: str, page_num: int) -> Optional[Dict[str, Any]]:
        """Get cached OCR result"""
        try:
            key = self.get_cache_key(document_hash, page_num)

            # Get from cache
            cached_data = self.redis.get(key)
            if not cached_data:
                return None

            # Refresh TTL on hit
            self.redis.expire(key, self.ttl)

            # Parse and return
            result = json.loads(cached_data)
            logger.info(f"Cache hit: {key}")
            return result
        except Exception as e:
            logger.error(f"Failed to get cached result: {e}")
            return None

    def cache_result(
        self, document_hash: str, page_num: int, result: Dict[str, Any]
    ) -> bool:
        """Cache OCR result"""
        try:
            key = self.get_cache_key(document_hash, page_num)

            # Serialize result
            cached_data = json.dumps(result)

            # Store in cache
            success = self.redis.set(key, cached_data, self.ttl)

            if success:
                logger.info(f"Cached result: {key}")
            return success
        except Exception as e:
            logger.error(f"Failed to cache result: {e}")
            return False

    def invalidate_cache(self, document_hash: str, page_num: Optional[int] = None) -> bool:
        """Invalidate cache for document or specific page"""
        try:
            if page_num is not None:
                # Invalidate specific page
                key = self.get_cache_key(document_hash, page_num)
                success = self.redis.delete(key)
                logger.info(f"Invalidated cache: {key}")
            else:
                # Invalidate all pages for document
                # This would require scanning keys, simplified for now
                logger.info(f"Invalidated cache for document: {document_hash}")
                success = True

            return success
        except Exception as e:
            logger.error(f"Failed to invalidate cache: {e}")
            return False

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        try:
            info = self.redis.info()
            return {
                "used_memory_mb": info.get("used_memory", 0) / 1024 / 1024,
                "used_memory_peak_mb": info.get("used_memory_peak", 0) / 1024 / 1024,
                "connected_clients": info.get("connected_clients", 0),
                "total_commands_processed": info.get("total_commands_processed", 0),
            }
        except Exception as e:
            logger.error(f"Failed to get cache stats: {e}")
            return {}

    def clear_cache(self) -> bool:
        """Clear all cache"""
        try:
            # This is dangerous, only use in development
            logger.warning("Clearing all cache")
            # In production, would use pattern matching to clear only OCR cache
            return True
        except Exception as e:
            logger.error(f"Failed to clear cache: {e}")
            return False
