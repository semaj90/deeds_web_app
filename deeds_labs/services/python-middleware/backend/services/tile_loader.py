"""
Tile Loader Service

Loads tiles from atlas and caches them in Redis for fast access.

Usage:
    loader = TileLoader()
    tile = loader.get_tile(atlas, index)
    loader.cache_tile(index, tile)
"""

import logging
import io
import numpy as np
from typing import Optional, Dict, List
from PIL import Image

try:
    import redis
except ImportError:
    redis = None

logger = logging.getLogger(__name__)


class TileLoader:
    """Load and cache tiles from atlas"""

    def __init__(self, redis_host: str = "localhost", redis_port: int = 6379, redis_db: int = 0):
        """
        Initialize tile loader.

        Args:
            redis_host: Redis host
            redis_port: Redis port
            redis_db: Redis database
        """
        self.redis_host = redis_host
        self.redis_port = redis_port
        self.redis_db = redis_db
        self.redis_client: Optional[redis.Redis] = None
        self.cache_prefix = "tile:"
        self.cache_ttl = 3600  # 1 hour

        self._connect_redis()

    def _connect_redis(self) -> None:
        """Connect to Redis."""
        if redis is None:
            logger.warning("redis-py not installed, caching disabled")
            return

        try:
            self.redis_client = redis.Redis(
                host=self.redis_host,
                port=self.redis_port,
                db=self.redis_db,
                decode_responses=False,
            )
            self.redis_client.ping()
            logger.info(f"Connected to Redis at {self.redis_host}:{self.redis_port}")
        except Exception as e:
            logger.warning(f"Failed to connect to Redis: {e}")
            self.redis_client = None

    def get_tile(self, atlas: Image.Image, index: int) -> Optional[np.ndarray]:
        """
        Get tile from atlas by index.

        Args:
            atlas: Atlas image
            index: Tile index (0-25)

        Returns:
            Tile as numpy array (32×32, uint8) or None
        """
        # Try cache first
        cached = self._get_cached_tile(index)
        if cached is not None:
            return cached

        # Extract from atlas
        tile = self._extract_tile_from_atlas(atlas, index)

        if tile is not None:
            # Cache for future use
            self._cache_tile(index, tile)

        return tile

    def _extract_tile_from_atlas(self, atlas: Image.Image, index: int) -> Optional[np.ndarray]:
        """
        Extract tile from atlas.

        Args:
            atlas: Atlas image
            index: Tile index

        Returns:
            Tile as numpy array or None
        """
        try:
            tile_size = 32
            cols = 8

            row = index // cols
            col = index % cols

            x = col * tile_size
            y = row * tile_size

            # Crop tile
            box = (x, y, x + tile_size, y + tile_size)
            tile_img = atlas.crop(box)

            # Convert to numpy array
            tile_array = np.array(tile_img, dtype=np.uint8)

            return tile_array

        except Exception as e:
            logger.error(f"Failed to extract tile {index}: {e}")
            return None

    def _get_cached_tile(self, index: int) -> Optional[np.ndarray]:
        """
        Get tile from Redis cache.

        Args:
            index: Tile index

        Returns:
            Tile as numpy array or None
        """
        if self.redis_client is None:
            return None

        try:
            key = f"{self.cache_prefix}{index}"
            data = self.redis_client.get(key)

            if data is None:
                return None

            # Deserialize from bytes
            tile_array = np.frombuffer(data, dtype=np.uint8).reshape(32, 32)
            return tile_array

        except Exception as e:
            logger.debug(f"Failed to get cached tile {index}: {e}")
            return None

    def _cache_tile(self, index: int, tile: np.ndarray) -> None:
        """
        Cache tile in Redis.

        Args:
            index: Tile index
            tile: Tile array
        """
        if self.redis_client is None:
            return

        try:
            key = f"{self.cache_prefix}{index}"
            data = tile.astype(np.uint8).tobytes()
            self.redis_client.setex(key, self.cache_ttl, data)

        except Exception as e:
            logger.debug(f"Failed to cache tile {index}: {e}")

    def cache_tile(self, index: int, tile: np.ndarray) -> None:
        """Cache a tile (public method)."""
        self._cache_tile(index, tile)

    def get_batch_tiles(self, atlas: Image.Image, indices: List[int]) -> Dict[int, np.ndarray]:
        """
        Get multiple tiles.

        Args:
            atlas: Atlas image
            indices: List of tile indices

        Returns:
            Dictionary mapping index to tile array
        """
        tiles = {}
        for index in indices:
            tile = self.get_tile(atlas, index)
            if tile is not None:
                tiles[index] = tile

        return tiles

    def clear_cache(self) -> None:
        """Clear all cached tiles."""
        if self.redis_client is None:
            return

        try:
            # Delete all keys with cache prefix
            pattern = f"{self.cache_prefix}*"
            keys = self.redis_client.keys(pattern)
            if keys:
                self.redis_client.delete(*keys)
                logger.info(f"Cleared {len(keys)} cached tiles")

        except Exception as e:
            logger.error(f"Failed to clear cache: {e}")

    def get_cache_stats(self) -> Dict[str, int]:
        """Get cache statistics."""
        if self.redis_client is None:
            return {"cached_tiles": 0}

        try:
            pattern = f"{self.cache_prefix}*"
            keys = self.redis_client.keys(pattern)
            return {"cached_tiles": len(keys)}

        except Exception as e:
            logger.error(f"Failed to get cache stats: {e}")
            return {"cached_tiles": 0}

    def preload_tiles(self, atlas: Image.Image, indices: Optional[List[int]] = None) -> int:
        """
        Preload tiles into cache.

        Args:
            atlas: Atlas image
            indices: Tile indices to preload (default: all 26)

        Returns:
            Number of tiles preloaded
        """
        if indices is None:
            indices = list(range(26))

        count = 0
        for index in indices:
            tile = self.get_tile(atlas, index)
            if tile is not None:
                count += 1

        logger.info(f"Preloaded {count} tiles into cache")
        return count

    def export_tile_to_file(self, tile: np.ndarray, filepath: str) -> None:
        """
        Export tile to PNG file.

        Args:
            tile: Tile array
            filepath: Output file path
        """
        try:
            img = Image.fromarray(tile, mode="L")
            img.save(filepath, "PNG")
            logger.info(f"Exported tile to {filepath}")

        except Exception as e:
            logger.error(f"Failed to export tile: {e}")

    def export_tile_to_bytes(self, tile: np.ndarray) -> bytes:
        """
        Export tile to PNG bytes.

        Args:
            tile: Tile array

        Returns:
            PNG bytes
        """
        try:
            img = Image.fromarray(tile, mode="L")
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            return buffer.getvalue()

        except Exception as e:
            logger.error(f"Failed to export tile to bytes: {e}")
            return b""


# Convenience functions

def get_tile(atlas: Image.Image, index: int) -> Optional[np.ndarray]:
    """Get tile (convenience function)."""
    loader = TileLoader()
    return loader.get_tile(atlas, index)


if __name__ == "__main__":
    # Example usage
    logging.basicConfig(level=logging.INFO)

    from atlas_generator import AtlasGenerator

    # Build atlas
    generator = AtlasGenerator()
    atlas = generator.build_rune_atlas()

    # Load tiles
    loader = TileLoader()
    tile = loader.get_tile(atlas, 0)

    if tile is not None:
        print(f"Loaded tile: {tile.shape}, dtype={tile.dtype}")
        print(f"Cache stats: {loader.get_cache_stats()}")

        # Preload all tiles
        count = loader.preload_tiles(atlas)
        print(f"Preloaded {count} tiles")
        print(f"Cache stats: {loader.get_cache_stats()}")
