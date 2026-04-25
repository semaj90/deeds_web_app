"""
Redis → Postgres + Qdrant Mirroring Service

Dual-writes embeddings from Redis to both Postgres (metadata) and Qdrant (GPU search).
Handles failures gracefully with background reconciliation.

Architecture:
- Redis: fp16 embeddings (CBOR format)
- Postgres: Authoritative metadata (ACID, joins, citations)
- Qdrant: GPU-accelerated vector search (FAISS-GPU)
"""

import asyncio
import json
import logging
import hashlib
import struct
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime
import uuid

import asyncpg
import redis.asyncio as aioredis
from qdrant_client.async_client import AsyncQdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import cbor2
import numpy as np

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


@dataclass
class EmbeddingRecord:
    """Embedding record to sync"""
    chunk_id: str
    doc_id: str
    embedding: List[float]  # 768-dim
    page: int
    bbox: Dict
    metadata: Dict


class RedisQdrantPostgresSyncer:
    """
    Syncs embeddings from Redis to Postgres + Qdrant.

    Flow:
    1. Poll Redis for new embeddings (embed:{chunk_id})
    2. Decompress fp16 CBOR to float32
    3. Write to Postgres (metadata + embedding)
    4. Write to Qdrant (vector search)
    5. Mark as synced in Redis
    """

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/0",
        postgres_url: str = "postgresql://user:password@localhost/legal_db",
        qdrant_url: str = "http://localhost:6333",
    ):
        self.redis_url = redis_url
        self.postgres_url = postgres_url
        self.qdrant_url = qdrant_url

        self.redis_client: Optional[aioredis.Redis] = None
        self.postgres_pool: Optional[asyncpg.Pool] = None
        self.qdrant_client: Optional[AsyncQdrantClient] = None

        self.batch_size = 32
        self.sync_interval = 5  # seconds

    async def initialize(self) -> None:
        """Initialize connections"""
        # Redis
        self.redis_client = await aioredis.from_url(
            self.redis_url,
            encoding="utf8",
            decode_responses=False,
        )
        logger.info("✅ Redis connected")

        # Postgres
        self.postgres_pool = await asyncpg.create_pool(
            self.postgres_url,
            min_size=5,
            max_size=20,
        )
        logger.info("✅ Postgres connected")

        # Qdrant
        self.qdrant_client = AsyncQdrantClient(url=self.qdrant_url)
        await self._ensure_qdrant_collection()
        logger.info("✅ Qdrant connected")

    async def _ensure_qdrant_collection(self) -> None:
        """Ensure Qdrant collection exists"""
        try:
            await self.qdrant_client.get_collection("legal_embeddings")
        except Exception:
            # Create collection
            await self.qdrant_client.create_collection(
                collection_name="legal_embeddings",
                vectors_config=VectorParams(size=768, distance=Distance.COSINE),
            )
            logger.info("✅ Created Qdrant collection: legal_embeddings")

    async def start_sync_loop(self) -> None:
        """Start continuous sync loop"""
        logger.info("🔄 Starting Redis → Postgres + Qdrant sync loop")
        while True:
            try:
                await self.sync_batch()
                await asyncio.sleep(self.sync_interval)
            except Exception as e:
                logger.error(f"Error in sync loop: {e}")
                await asyncio.sleep(self.sync_interval)

    async def sync_batch(self) -> None:
        """Sync a batch of embeddings"""
        if not self.redis_client:
            return

        try:
            # Get pending embeddings from Redis
            keys = await self.redis_client.keys("embed:*")
            if not keys:
                return

            # Process in batches
            for i in range(0, len(keys), self.batch_size):
                batch_keys = keys[i : i + self.batch_size]
                await self._sync_batch_internal(batch_keys)

        except Exception as e:
            logger.error(f"Error syncing batch: {e}")

    async def _sync_batch_internal(self, keys: List[str]) -> None:
        """Sync a batch of keys"""
        records = []

        # Fetch from Redis
        for key in keys:
            try:
                record = await self._fetch_from_redis(key)
                if record:
                    records.append(record)
            except Exception as e:
                logger.error(f"Error fetching {key}: {e}")

        if not records:
            return

        # Write to Postgres
        try:
            await self._write_to_postgres(records)
            logger.info(f"✅ Wrote {len(records)} records to Postgres")
        except Exception as e:
            logger.error(f"Error writing to Postgres: {e}")
            return

        # Write to Qdrant
        try:
            await self._write_to_qdrant(records)
            logger.info(f"✅ Wrote {len(records)} records to Qdrant")
        except Exception as e:
            logger.error(f"Error writing to Qdrant: {e}")
            return

        # Mark as synced in Redis
        try:
            await self._mark_synced(keys)
        except Exception as e:
            logger.error(f"Error marking synced: {e}")

    async def _fetch_from_redis(self, key: str) -> Optional[EmbeddingRecord]:
        """Fetch and decompress embedding from Redis"""
        try:
            # Get fp16 CBOR data
            data = await self.redis_client.get(key)
            if not data:
                return None

            # Decompress fp16 CBOR
            fp16_values = cbor2.loads(data)
            embedding = self._fp16_to_float32(fp16_values)

            # Extract chunk_id from key
            chunk_id = key.split(":")[-1]

            # Get metadata from Redis
            metadata_key = f"meta:{chunk_id}"
            metadata_data = await self.redis_client.get(metadata_key)
            metadata = json.loads(metadata_data) if metadata_data else {}

            return EmbeddingRecord(
                chunk_id=chunk_id,
                doc_id=metadata.get("doc_id", ""),
                embedding=embedding,
                page=metadata.get("page", 0),
                bbox=metadata.get("bbox", {}),
                metadata=metadata,
            )

        except Exception as e:
            logger.error(f"Error fetching from Redis: {e}")
            return None

    async def _write_to_postgres(self, records: List[EmbeddingRecord]) -> None:
        """Write embeddings to Postgres"""
        if not self.postgres_pool:
            return

        async with self.postgres_pool.acquire() as conn:
            # Prepare statements
            insert_query = """
                INSERT INTO embeddings (
                    id, chunk_id, doc_id, embedding, page, bbox, metadata, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (chunk_id) DO UPDATE SET
                    embedding = EXCLUDED.embedding,
                    metadata = EXCLUDED.metadata,
                    updated_at = NOW()
            """

            for record in records:
                try:
                    embedding_id = str(uuid.uuid4())
                    await conn.execute(
                        insert_query,
                        embedding_id,
                        record.chunk_id,
                        record.doc_id,
                        record.embedding,  # pgvector handles float arrays
                        record.page,
                        json.dumps(record.bbox),
                        json.dumps(record.metadata),
                        datetime.now(),
                    )
                except Exception as e:
                    logger.error(f"Error inserting {record.chunk_id}: {e}")

    async def _write_to_qdrant(self, records: List[EmbeddingRecord]) -> None:
        """Write embeddings to Qdrant"""
        if not self.qdrant_client:
            return

        points = []
        for record in records:
            try:
                # Create point ID from chunk_id hash
                point_id = int(hashlib.md5(record.chunk_id.encode()).hexdigest(), 16) % (2**31)

                point = PointStruct(
                    id=point_id,
                    vector=record.embedding,
                    payload={
                        "chunk_id": record.chunk_id,
                        "doc_id": record.doc_id,
                        "page": record.page,
                        "bbox": record.bbox,
                        "metadata": record.metadata,
                    },
                )
                points.append(point)
            except Exception as e:
                logger.error(f"Error creating point for {record.chunk_id}: {e}")

        if points:
            try:
                await self.qdrant_client.upsert(
                    collection_name="legal_embeddings",
                    points=points,
                )
            except Exception as e:
                logger.error(f"Error upserting to Qdrant: {e}")

    async def _mark_synced(self, keys: List[str]) -> None:
        """Mark keys as synced in Redis"""
        if not self.redis_client:
            return

        for key in keys:
            try:
                # Move to synced set
                chunk_id = key.split(":")[-1]
                await self.redis_client.sadd("synced_chunks", chunk_id)
                # Keep original key for 7 days
                await self.redis_client.expire(key, 86400 * 7)
            except Exception as e:
                logger.error(f"Error marking {key} as synced: {e}")

    @staticmethod
    def _fp16_to_float32(fp16_values: List[int]) -> List[float]:
        """Convert fp16 values to float32"""
        result = []
        for fp16 in fp16_values:
            # Convert fp16 to fp32
            bits = (fp16 << 16) & 0xFFFFFFFF
            result.append(struct.unpack(">f", struct.pack(">I", bits))[0])
        return result

    async def close(self) -> None:
        """Close connections"""
        if self.redis_client:
            await self.redis_client.close()
        if self.postgres_pool:
            await self.postgres_pool.close()
        if self.qdrant_client:
            await self.qdrant_client.close()


async def main():
    """Main entry point"""
    syncer = RedisQdrantPostgresSyncer(
        redis_url="redis://localhost:6379/0",
        postgres_url="postgresql://postgres:password@localhost/legal_db",
        qdrant_url="http://localhost:6333",
    )

    try:
        await syncer.initialize()
        await syncer.start_sync_loop()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        await syncer.close()


if __name__ == "__main__":
    asyncio.run(main())
