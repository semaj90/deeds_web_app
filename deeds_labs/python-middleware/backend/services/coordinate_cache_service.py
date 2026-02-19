#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - Coordinate Cache Service
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Redis caching for tensor coordinates with TTL
Task: 8.1 - Create coordinate cache service
Task: 8.2 - Create cache retrieval API
═══════════════════════════════════════════════════════════════════════
"""

import os
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
import redis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class CachedCoordinate:
    """Cached 3D coordinate for a tag."""
    id: str
    x: float
    y: float
    z: float
    method: str  # 'pca', 'tsne', 'umap'
    cached_at: str
    expires_at: str


class CoordinateCacheService:
    """
    Coordinate Cache Service - Redis caching for 3D coordinates.

    Features:
    - Fast coordinate lookup (< 10ms target)
    - 24-hour TTL with automatic expiration
    - Batch coordinate retrieval
    - Cache invalidation on update
    """

    CACHE_PREFIX = "kb:v2:coords"
    DEFAULT_TTL = 86400  # 24 hours in seconds

    def __init__(self, redis_url: Optional[str] = None):
        """Initialize coordinate cache service."""
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")
        self.redis_client = redis.from_url(self.redis_url, decode_responses=True)
        self.ttl = int(os.getenv("COORDINATE_CACHE_TTL", self.DEFAULT_TTL))

        logger.info(f"📍 CoordinateCacheService initialized (TTL: {self.ttl}s)")

    def _make_key(self, tag_id: str) -> str:
        """Generate Redis key for a tag coordinate."""
        return f"{self.CACHE_PREFIX}:{tag_id}"

    def set_coordinate(
        self,
        tag_id: str,
        x: float,
        y: float,
        z: float,
        method: str = "pca"
    ) -> bool:
        """
        Cache a coordinate for a tag.

        Args:
            tag_id: Tag ID
            x, y, z: 3D coordinates
            method: Dimensionality reduction method used

        Returns:
            True if cached successfully
        """
        try:
            now = datetime.now()
            coord = CachedCoordinate(
                id=tag_id,
                x=x,
                y=y,
                z=z,
                method=method,
                cached_at=now.isoformat(),
                expires_at=(now.timestamp() + self.ttl).__str__()
            )

            key = self._make_key(tag_id)
            self.redis_client.setex(
                key,
                self.ttl,
                json.dumps(asdict(coord))
            )

            logger.debug(f"  ✓ Cached coordinate: {tag_id}")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to cache coordinate: {e}")
            return False

    def get_coordinate(self, tag_id: str) -> Optional[CachedCoordinate]:
        """
        Get cached coordinate for a tag.

        Args:
            tag_id: Tag ID

        Returns:
            CachedCoordinate or None if not found/expired
        """
        try:
            key = self._make_key(tag_id)
            data = self.redis_client.get(key)

            if not data:
                return None

            coord_dict = json.loads(data)
            return CachedCoordinate(**coord_dict)

        except Exception as e:
            logger.error(f"❌ Failed to get coordinate: {e}")
            return None

    def get_coordinates_batch(
        self,
        tag_ids: List[str]
    ) -> Dict[str, Optional[CachedCoordinate]]:
        """
        Get cached coordinates for multiple tags.

        Args:
            tag_ids: List of tag IDs

        Returns:
            Dict mapping tag_id to CachedCoordinate (or None if not cached)
        """
        results = {}

        try:
            # Use pipeline for batch retrieval
            pipe = self.redis_client.pipeline()
            for tag_id in tag_ids:
                pipe.get(self._make_key(tag_id))

            values = pipe.execute()

            for tag_id, data in zip(tag_ids, values):
                if data:
                    coord_dict = json.loads(data)
                    results[tag_id] = CachedCoordinate(**coord_dict)
                else:
                    results[tag_id] = None

        except Exception as e:
            logger.error(f"❌ Failed to get batch coordinates: {e}")
            for tag_id in tag_ids:
                results[tag_id] = None

        return results

    def set_coordinates_batch(
        self,
        coordinates: List[Dict[str, Any]]
    ) -> int:
        """
        Cache multiple coordinates at once.

        Args:
            coordinates: List of dicts with id, x, y, z, method

        Returns:
            Number of coordinates cached
        """
        cached = 0

        try:
            pipe = self.redis_client.pipeline()
            now = datetime.now()

            for coord in coordinates:
                cached_coord = CachedCoordinate(
                    id=coord['id'],
                    x=coord['x'],
                    y=coord['y'],
                    z=coord['z'],
                    method=coord.get('method', 'pca'),
                    cached_at=now.isoformat(),
                    expires_at=(now.timestamp() + self.ttl).__str__()
                )

                key = self._make_key(coord['id'])
                pipe.setex(key, self.ttl, json.dumps(asdict(cached_coord)))
                cached += 1

            pipe.execute()
            logger.info(f"  ✓ Batch cached {cached} coordinates")

        except Exception as e:
            logger.error(f"❌ Failed to batch cache coordinates: {e}")

        return cached

    def invalidate(self, tag_id: str) -> bool:
        """
        Invalidate cached coordinate for a tag.

        Args:
            tag_id: Tag ID

        Returns:
            True if invalidated
        """
        try:
            key = self._make_key(tag_id)
            self.redis_client.delete(key)
            logger.debug(f"  ✓ Invalidated coordinate: {tag_id}")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to invalidate coordinate: {e}")
            return False

    def invalidate_batch(self, tag_ids: List[str]) -> int:
        """
        Invalidate cached coordinates for multiple tags.

        Args:
            tag_ids: List of tag IDs

        Returns:
            Number of coordinates invalidated
        """
        try:
            keys = [self._make_key(tag_id) for tag_id in tag_ids]
            deleted = self.redis_client.delete(*keys)
            logger.info(f"  ✓ Invalidated {deleted} coordinates")
            return deleted
        except Exception as e:
            logger.error(f"❌ Failed to batch invalidate: {e}")
            return 0

    def invalidate_all(self) -> int:
        """
        Invalidate all cached coordinates.

        Returns:
            Number of coordinates invalidated
        """
        try:
            pattern = f"{self.CACHE_PREFIX}:*"
            keys = list(self.redis_client.scan_iter(match=pattern))
            if keys:
                deleted = self.redis_client.delete(*keys)
                logger.info(f"  ✓ Invalidated all {deleted} coordinates")
                return deleted
            return 0
        except Exception as e:
            logger.error(f"❌ Failed to invalidate all: {e}")
            return 0

    def get_cache_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics.

        Returns:
            Dict with cache stats
        """
        try:
            pattern = f"{self.CACHE_PREFIX}:*"
            keys = list(self.redis_client.scan_iter(match=pattern))

            return {
                "total_cached": len(keys),
                "ttl_seconds": self.ttl,
                "prefix": self.CACHE_PREFIX,
                "redis_connected": self.redis_client.ping(),
            }
        except Exception as e:
            return {
                "error": str(e),
                "redis_connected": False,
            }

    def get_ttl(self, tag_id: str) -> int:
        """
        Get remaining TTL for a cached coordinate.

        Args:
            tag_id: Tag ID

        Returns:
            Remaining TTL in seconds, -1 if not found, -2 if no TTL
        """
        try:
            key = self._make_key(tag_id)
            return self.redis_client.ttl(key)
        except Exception as e:
            logger.error(f"❌ Failed to get TTL: {e}")
            return -1


# Example usage
def example_usage():
    """Example of using the CoordinateCacheService."""
    service = CoordinateCacheService()

    # Cache a coordinate
    service.set_coordinate(
        tag_id="test-tag-1",
        x=0.5,
        y=-0.3,
        z=0.8,
        method="pca"
    )
    print("✅ Coordinate cached")

    # Retrieve coordinate
    coord = service.get_coordinate("test-tag-1")
    if coord:
        print(f"✅ Retrieved: ({coord.x}, {coord.y}, {coord.z})")

    # Batch operations
    coords = [
        {"id": "tag-1", "x": 0.1, "y": 0.2, "z": 0.3},
        {"id": "tag-2", "x": 0.4, "y": 0.5, "z": 0.6},
        {"id": "tag-3", "x": 0.7, "y": 0.8, "z": 0.9},
    ]
    cached = service.set_coordinates_batch(coords)
    print(f"✅ Batch cached: {cached}")

    # Batch retrieve
    results = service.get_coordinates_batch(["tag-1", "tag-2", "tag-3", "tag-missing"])
    print(f"✅ Batch retrieved: {len([r for r in results.values() if r])}")

    # Stats
    stats = service.get_cache_stats()
    print(f"✅ Cache stats: {stats}")


if __name__ == "__main__":
    example_usage()
