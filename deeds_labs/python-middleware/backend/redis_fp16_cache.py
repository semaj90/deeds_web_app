"""
Redis FP16 Cache: Store/retrieve embeddings with fp16 compression

Manages Redis keyspace for S-M scale:
- Database 1: FP16 embeddings (14-day TTL)
- Database 2: Layout/DocTags (60-day TTL)
- Database 3: MQ buffers (24-hour TTL)

Usage:
    cache = RedisFP16Cache()
    await cache.connect()

    # Store embedding
    await cache.store_embedding(chunk_id, embedding_fp32)

    # Retrieve embedding
    embedding = await cache.get_embedding(chunk_id)

    # Store layout
    await cache.store_layout(doc_id, doctags_json)

    # Retrieve layout
    layout = await cache.get_layout(doc_id)
"""

import asyncio
import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta

import redis.asyncio as redis
from backend.fp16_codec import FP16Codec

logger = logging.getLogger(__name__)


class RedisFP16Cache:
    """Redis cache with FP16 compression for embeddings"""

    # Database numbers
    DB_FP16 = 1  # FP16 embeddings
    DB_LAYOUT = 2  # Layout/DocTags
    DB_QUEUE = 3  # MQ buffers

    # TTL values (seconds)
    TTL_FP16 = 1209600  # 14 days
    TTL_LAYOUT = 5184000  # 60 days
    TTL_QUEUE = 86400  # 24 hours

    def __init__(
        self,
        host: str = "localhost",
        port: int = 6379,
        password: Optional[str] = None,
        db: int = 0,
    ):
        self.host = host
        self.port = port
        self.password = password
        self.db = db

        self.redis_fp16: Optional[redis.Redis] = None
        self.redis_layout: Optional[redis.Redis] = None
        self.redis_queue: Optional[redis.Redis] = None

        self.codec = FP16Codec()

    async def connect(self) -> None:
        """Connect to Redis and select databases"""
        try:
            # Connect to DB 1 (FP16 embeddings)
            self.redis_fp16 = await redis.Redis(
                host=self.host,
                port=self.port,
                password=self.password,
                db=self.DB_FP16,
                decode_responses=False,
            )

            # Connect to DB 2 (Layout)
            self.redis_layout = await redis.Redis(
                host=self.host,
                port=self.port,
                password=self.password,
                db=self.DB_LAYOUT,
                decode_responses=True,
            )

            # Connect to DB 3 (Queue)
            self.redis_queue = await redis.Redis(
                host=self.host,
                port=self.port,
                password=self.password,
                db=self.DB_QUEUE,
                decode_responses=True,
            )

            # Test connections
            await self.redis_fp16.ping()
            await self.redis_layout.ping()
            await self.redis_queue.ping()

            logger.info("✅ Connected to Redis (3 databases)")

        except Exception as e:
            logger.error(f"❌ Redis connection failed: {e}")
            raise

    async def close(self) -> None:
        """Close Redis connections"""
        if self.redis_fp16:
            await self.redis_fp16.close()
        if self.redis_layout:
            await self.redis_layout.close()
        if self.redis_queue:
            await self.redis_queue.close()
        logger.info("✅ Closed Redis connections")

    # ========================================================================
    # FP16 Embedding Storage (Database 1)
    # ========================================================================

    async def store_embedding(
        self,
        chunk_id: str,
        embedding: List[float],
        ttl: int = TTL_FP16,
    ) -> bool:
        """
        Store embedding as fp16 in Redis.

        Args:
            chunk_id: Unique chunk identifier
            embedding: List of float32 values (768-dim)
            ttl: Time-to-live in seconds

        Returns:
            True if stored successfully
        """
        try:
            # Compress to fp16
            fp16_bytes = self.codec.encode(embedding)

            # Store in Redis
            key = f"embed:fp16:{chunk_id}"
            await self.redis_fp16.setex(key, ttl, fp16_bytes)

            logger.debug(f"📦 Stored embedding: {chunk_id} ({len(fp16_bytes)} bytes)")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to store embedding {chunk_id}: {e}")
            return False

    async def get_embedding(self, chunk_id: str) -> Optional[List[float]]:
        """
        Retrieve embedding from Redis and decompress.

        Args:
            chunk_id: Unique chunk identifier

        Returns:
            List of float32 values, or None if not found
        """
        try:
            key = f"embed:fp16:{chunk_id}"
            fp16_bytes = await self.redis_fp16.get(key)

            if not fp16_bytes:
                logger.debug(f"⚠️ Embedding not found: {chunk_id}")
                return None

            # Decompress from fp16
            embedding = self.codec.decode(fp16_bytes)

            logger.debug(f"📦 Retrieved embedding: {chunk_id} ({len(fp16_bytes)} bytes)")
            return embedding

        except Exception as e:
            logger.error(f"❌ Failed to retrieve embedding {chunk_id}: {e}")
            return None

    async def batch_store_embeddings(
        self,
        embeddings: Dict[str, List[float]],
        ttl: int = TTL_FP16,
    ) -> int:
        """
        Store multiple embeddings efficiently.

        Args:
            embeddings: Dict of {chunk_id: embedding}
            ttl: Time-to-live in seconds

        Returns:
            Number of embeddings stored
        """
        try:
            pipe = self.redis_fp16.pipeline()

            for chunk_id, embedding in embeddings.items():
                fp16_bytes = self.codec.encode(embedding)
                key = f"embed:fp16:{chunk_id}"
                pipe.setex(key, ttl, fp16_bytes)

            await pipe.execute()

            logger.info(f"📦 Stored {len(embeddings)} embeddings")
            return len(embeddings)

        except Exception as e:
            logger.error(f"❌ Batch store failed: {e}")
            return 0

    async def batch_get_embeddings(self, chunk_ids: List[str]) -> Dict[str, List[float]]:
        """
        Retrieve multiple embeddings efficiently.

        Args:
            chunk_ids: List of chunk identifiers

        Returns:
            Dict of {chunk_id: embedding}
        """
        try:
            pipe = self.redis_fp16.pipeline()

            for chunk_id in chunk_ids:
                key = f"embed:fp16:{chunk_id}"
                pipe.get(key)

            results = await pipe.execute()

            embeddings = {}
            for chunk_id, fp16_bytes in zip(chunk_ids, results):
                if fp16_bytes:
                    embeddings[chunk_id] = self.codec.decode(fp16_bytes)

            logger.debug(f"📦 Retrieved {len(embeddings)}/{len(chunk_ids)} embeddings")
            return embeddings

        except Exception as e:
            logger.error(f"❌ Batch get failed: {e}")
            return {}

    # ========================================================================
    # Layout/DocTags Storage (Database 2)
    # ========================================================================

    async def store_layout(
        self,
        doc_id: str,
        layout: Dict[str, Any],
        ttl: int = TTL_LAYOUT,
    ) -> bool:
        """
        Store DocTags layout in Redis.

        Args:
            doc_id: Document identifier
            layout: DocTags JSON object
            ttl: Time-to-live in seconds

        Returns:
            True if stored successfully
        """
        try:
            key = f"layout:{doc_id}"
            value = json.dumps(layout)
            await self.redis_layout.setex(key, ttl, value)

            logger.debug(f"📄 Stored layout: {doc_id}")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to store layout {doc_id}: {e}")
            return False

    async def get_layout(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve DocTags layout from Redis.

        Args:
            doc_id: Document identifier

        Returns:
            DocTags JSON object, or None if not found
        """
        try:
            key = f"layout:{doc_id}"
            value = await self.redis_layout.get(key)

            if not value:
                logger.debug(f"⚠️ Layout not found: {doc_id}")
                return None

            layout = json.loads(value)

            logger.debug(f"📄 Retrieved layout: {doc_id}")
            return layout

        except Exception as e:
            logger.error(f"❌ Failed to retrieve layout {doc_id}: {e}")
            return None

    async def store_bbox(
        self,
        chunk_id: str,
        bbox: Dict[str, Any],
        ttl: int = TTL_LAYOUT,
    ) -> bool:
        """
        Store bounding box coordinates.

        Args:
            chunk_id: Chunk identifier
            bbox: Bounding box data
            ttl: Time-to-live in seconds

        Returns:
            True if stored successfully
        """
        try:
            key = f"layout:bbox:{chunk_id}"
            value = json.dumps(bbox)
            await self.redis_layout.setex(key, ttl, value)

            logger.debug(f"📍 Stored bbox: {chunk_id}")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to store bbox {chunk_id}: {e}")
            return False

    async def get_bbox(self, chunk_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve bounding box coordinates.

        Args:
            chunk_id: Chunk identifier

        Returns:
            Bounding box data, or None if not found
        """
        try:
            key = f"layout:bbox:{chunk_id}"
            value = await self.redis_layout.get(key)

            if not value:
                return None

            bbox = json.loads(value)

            logger.debug(f"📍 Retrieved bbox: {chunk_id}")
            return bbox

        except Exception as e:
            logger.error(f"❌ Failed to retrieve bbox {chunk_id}: {e}")
            return None

    # ========================================================================
    # MQ Buffer Storage (Database 3)
    # ========================================================================

    async def store_task(
        self,
        task_id: str,
        task_data: Dict[str, Any],
        ttl: int = TTL_QUEUE,
    ) -> bool:
        """
        Store task metadata in MQ buffer.

        Args:
            task_id: Task identifier
            task_data: Task metadata
            ttl: Time-to-live in seconds

        Returns:
            True if stored successfully
        """
        try:
            key = f"mq:task:{task_id}"
            value = json.dumps(task_data)
            await self.redis_queue.setex(key, ttl, value)

            logger.debug(f"📋 Stored task: {task_id}")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to store task {task_id}: {e}")
            return False

    async def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve task metadata from MQ buffer.

        Args:
            task_id: Task identifier

        Returns:
            Task metadata, or None if not found
        """
        try:
            key = f"mq:task:{task_id}"
            value = await self.redis_queue.get(key)

            if not value:
                return None

            task_data = json.loads(value)

            logger.debug(f"📋 Retrieved task: {task_id}")
            return task_data

        except Exception as e:
            logger.error(f"❌ Failed to retrieve task {task_id}: {e}")
            return None

    async def mark_ack(self, task_id: str, ttl: int = TTL_QUEUE) -> bool:
        """
        Mark task as acknowledged.

        Args:
            task_id: Task identifier
            ttl: Time-to-live in seconds

        Returns:
            True if marked successfully
        """
        try:
            key = f"mq:ack:{task_id}"
            await self.redis_queue.setex(key, ttl, "1")

            logger.debug(f"✅ Marked ACK: {task_id}")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to mark ACK {task_id}: {e}")
            return False

    async def is_acked(self, task_id: str) -> bool:
        """
        Check if task is acknowledged.

        Args:
            task_id: Task identifier

        Returns:
            True if acknowledged
        """
        try:
            key = f"mq:ack:{task_id}"
            value = await self.redis_queue.get(key)
            return value is not None

        except Exception as e:
            logger.error(f"❌ Failed to check ACK {task_id}: {e}")
            return False

    # ========================================================================
    # Utility Methods
    # ========================================================================

    async def get_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics.

        Returns:
            Dict with cache stats
        """
        try:
            info_fp16 = await self.redis_fp16.info()
            info_layout = await self.redis_layout.info()
            info_queue = await self.redis_queue.info()

            return {
                "fp16": {
                    "keys": info_fp16.get("db1", {}).get("keys", 0),
                    "memory": info_fp16.get("used_memory_human", "N/A"),
                },
                "layout": {
                    "keys": info_layout.get("db2", {}).get("keys", 0),
                    "memory": info_layout.get("used_memory_human", "N/A"),
                },
                "queue": {
                    "keys": info_queue.get("db3", {}).get("keys", 0),
                    "memory": info_queue.get("used_memory_human", "N/A"),
                },
            }

        except Exception as e:
            logger.error(f"❌ Failed to get stats: {e}")
            return {}

    async def flush_all(self) -> bool:
        """
        Flush all databases (use with caution!).

        Returns:
            True if flushed successfully
        """
        try:
            await self.redis_fp16.flushdb()
            await self.redis_layout.flushdb()
            await self.redis_queue.flushdb()

            logger.warning("🗑️ Flushed all Redis databases")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to flush: {e}")
            return False


# Example usage
async def example():
    cache = RedisFP16Cache()
    await cache.connect()

    # Store embedding
    embedding = [0.1 * i for i in range(768)]
    await cache.store_embedding("chunk_001", embedding)

    # Retrieve embedding
    retrieved = await cache.get_embedding("chunk_001")
    print(f"Retrieved embedding: {len(retrieved)} dims")

    # Store layout
    layout = {"pages": 10, "chunks": 50}
    await cache.store_layout("doc_001", layout)

    # Get stats
    stats = await cache.get_stats()
    print(f"Cache stats: {stats}")

    await cache.close()


if __name__ == "__main__":
    asyncio.run(example())
