"""
Mirror Service: Sync embeddings to Qdrant + Postgres

Consumes from RabbitMQ mirror queue and:
1. Decompresses fp16 embeddings from Redis
2. Stores in Qdrant (vector search)
3. Stores metadata in Postgres
4. Maintains consistency across systems

Usage:
    service = MirrorService()
    await service.initialize()
    await service.start()
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime

import asyncpg
from qdrant_client.async_qdrant_client import AsyncQdrantClient
from qdrant_client.models import PointStruct, Distance, VectorParams

from backend.mq_client import RabbitMQClient, MQTask
from backend.redis_fp16_cache import RedisFP16Cache
from backend.fp16_codec import FP16Codec

logger = logging.getLogger(__name__)


@dataclass
class MirrorConfig:
    """Mirror service configuration"""

    # Qdrant
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    qdrant_collection: str = "legal_vectors"
    qdrant_vector_size: int = 768

    # Postgres
    postgres_url: str = "postgresql://legal_admin:123456@localhost/legal_ai_db"

    # RabbitMQ
    mq_host: str = "localhost"
    mq_port: int = 5672
    mq_user: str = "legalai"
    mq_password: str = "legalai123"
    mq_vhost: str = "/legalai"

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379

    # Batch settings
    batch_size: int = 32
    batch_timeout: float = 5.0  # seconds


class MirrorService:
    """Mirror embeddings to Qdrant + Postgres"""

    def __init__(self, config: MirrorConfig = None):
        self.config = config or MirrorConfig()

        self.mq_client: Optional[RabbitMQClient] = None
        self.redis_cache: Optional[RedisFP16Cache] = None
        self.qdrant_client: Optional[AsyncQdrantClient] = None
        self.postgres_pool: Optional[asyncpg.Pool] = None

        self.codec = FP16Codec()
        self.batch: List[Dict[str, Any]] = []
        self.batch_lock = asyncio.Lock()

    async def initialize(self) -> None:
        """Initialize all connections"""
        logger.info("🔄 Initializing Mirror Service...")

        # RabbitMQ
        self.mq_client = RabbitMQClient(
            host=self.config.mq_host,
            port=self.config.mq_port,
            user=self.config.mq_user,
            password=self.config.mq_password,
            vhost=self.config.mq_vhost,
        )
        await self.mq_client.connect()
        logger.info("✅ Connected to RabbitMQ")

        # Redis
        self.redis_cache = RedisFP16Cache(
            host=self.config.redis_host,
            port=self.config.redis_port,
        )
        await self.redis_cache.connect()
        logger.info("✅ Connected to Redis")

        # Qdrant
        self.qdrant_client = AsyncQdrantClient(
            host=self.config.qdrant_host,
            port=self.config.qdrant_port,
        )

        # Ensure collection exists
        try:
            await self.qdrant_client.get_collection(self.config.qdrant_collection)
            logger.info(f"✅ Qdrant collection exists: {self.config.qdrant_collection}")
        except Exception:
            logger.info(f"📝 Creating Qdrant collection: {self.config.qdrant_collection}")
            await self.qdrant_client.create_collection(
                collection_name=self.config.qdrant_collection,
                vectors_config=VectorParams(
                    size=self.config.qdrant_vector_size,
                    distance=Distance.COSINE,
                ),
            )
            logger.info("✅ Created Qdrant collection")

        # Postgres
        self.postgres_pool = await asyncpg.create_pool(
            self.config.postgres_url,
            min_size=2,
            max_size=10,
        )
        logger.info("✅ Connected to Postgres")

        # Ensure tables exist
        await self._ensure_tables()

        logger.info("✅ Mirror Service initialized")

    async def _ensure_tables(self) -> None:
        """Ensure Postgres tables exist"""
        async with self.postgres_pool.acquire() as conn:
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS chunk_metadata (
                    chunk_id TEXT PRIMARY KEY,
                    doc_id TEXT NOT NULL,
                    statute_ref TEXT,
                    page INT,
                    token_count INT,
                    semantic_type TEXT,
                    bbox JSONB,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_chunk_statute ON chunk_metadata(statute_ref);
                CREATE INDEX IF NOT EXISTS idx_chunk_doc ON chunk_metadata(doc_id);
                CREATE INDEX IF NOT EXISTS idx_chunk_type ON chunk_metadata(semantic_type);
                CREATE INDEX IF NOT EXISTS idx_chunk_created ON chunk_metadata(created_at);
                """
            )
            logger.info("✅ Ensured Postgres tables")

    async def start(self) -> None:
        """Start consuming mirror tasks"""
        logger.info("🔄 Starting Mirror Service...")

        try:
            await self.mq_client.consume_tasks(
                queue_type="mirror",
                callback=self._process_task,
                prefetch_count=1,
            )
        except KeyboardInterrupt:
            logger.info("Shutting down Mirror Service...")
        finally:
            await self.close()

    async def _process_task(self, task: MQTask) -> dict:
        """Process a mirror task"""
        logger.info(f"📥 Processing mirror task: {task.task_id}")

        try:
            chunk_id = task.payload.get("chunk_id")
            doc_id = task.payload.get("doc_id")
            embedding_hash = task.payload.get("embedding_hash")
            metadata = task.payload.get("metadata", {})

            # Retrieve embedding from Redis
            embedding = await self.redis_cache.get_embedding(chunk_id)
            if not embedding:
                logger.error(f"❌ Embedding not found in Redis: {chunk_id}")
                return {"status": "error", "reason": "embedding_not_found"}

            # Add to batch
            async with self.batch_lock:
                self.batch.append({
                    "chunk_id": chunk_id,
                    "doc_id": doc_id,
                    "embedding": embedding,
                    "metadata": metadata,
                })

                # Flush batch if full
                if len(self.batch) >= self.config.batch_size:
                    await self._flush_batch()

            logger.info(f"✅ Queued for mirroring: {chunk_id}")
            return {"status": "queued", "chunk_id": chunk_id}

        except Exception as e:
            logger.error(f"❌ Error processing mirror task: {e}")
            return {"status": "error", "reason": str(e)}

    async def _flush_batch(self) -> None:
        """Flush batch to Qdrant + Postgres"""
        if not self.batch:
            return

        logger.info(f"💾 Flushing batch: {len(self.batch)} items")

        try:
            # Prepare Qdrant points
            points = []
            for i, item in enumerate(self.batch):
                point = PointStruct(
                    id=hash(item["chunk_id"]) % (2**31),  # Positive integer ID
                    vector=item["embedding"],
                    payload={
                        "chunk_id": item["chunk_id"],
                        "doc_id": item["doc_id"],
                        "statute_ref": item["metadata"].get("statute_ref"),
                        "page": item["metadata"].get("page"),
                        "semantic_type": item["metadata"].get("semantic_type"),
                    },
                )
                points.append(point)

            # Upload to Qdrant
            await self.qdrant_client.upsert(
                collection_name=self.config.qdrant_collection,
                points=points,
            )
            logger.info(f"✅ Uploaded {len(points)} points to Qdrant")

            # Store metadata in Postgres
            async with self.postgres_pool.acquire() as conn:
                for item in self.batch:
                    await conn.execute(
                        """
                        INSERT INTO chunk_metadata
                        (chunk_id, doc_id, statute_ref, page, token_count, semantic_type, bbox)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        ON CONFLICT (chunk_id) DO UPDATE SET
                            updated_at = NOW()
                        """,
                        item["chunk_id"],
                        item["doc_id"],
                        item["metadata"].get("statute_ref"),
                        item["metadata"].get("page"),
                        item["metadata"].get("token_count"),
                        item["metadata"].get("semantic_type"),
                        item["metadata"].get("bbox"),
                    )

            logger.info(f"✅ Stored {len(self.batch)} metadata rows in Postgres")

            # Clear batch
            self.batch.clear()

        except Exception as e:
            logger.error(f"❌ Error flushing batch: {e}")
            raise

    async def close(self) -> None:
        """Close all connections"""
        # Flush remaining batch
        async with self.batch_lock:
            if self.batch:
                await self._flush_batch()

        # Close connections
        if self.mq_client:
            await self.mq_client.close()
        if self.redis_cache:
            await self.redis_cache.close()
        if self.qdrant_client:
            await self.qdrant_client.close()
        if self.postgres_pool:
            await self.postgres_pool.close()

        logger.info("✅ Mirror Service closed")


async def main():
    """Main entry point"""
    config = MirrorConfig()
    service = MirrorService(config)

    try:
        await service.initialize()
        await service.start()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        await service.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
