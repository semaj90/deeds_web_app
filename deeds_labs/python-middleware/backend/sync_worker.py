"""
Background Reconciliation Worker: Postgres ↔ Qdrant Consistency

Periodically reconciles Postgres and Qdrant to ensure consistency.
Handles failures, retries, and eventual consistency.

Responsibilities:
1. Verify all Postgres embeddings exist in Qdrant
2. Verify all Qdrant points have Postgres metadata
3. Detect and repair inconsistencies
4. Log metrics and health status
"""

import asyncio
import logging
from typing import Dict, List, Optional, Set
from datetime import datetime, timedelta
from dataclasses import dataclass
import json

import asyncpg
from qdrant_client.async_client import AsyncQdrantClient
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


@dataclass
class ReconciliationStats:
    """Statistics from reconciliation run"""
    timestamp: datetime
    postgres_count: int
    qdrant_count: int
    missing_in_qdrant: int
    missing_in_postgres: int
    repaired: int
    errors: int


class PostgresQdrantReconciler:
    """
    Reconciles Postgres and Qdrant to ensure consistency.

    Strategy:
    1. Get all chunk_ids from Postgres
    2. Get all chunk_ids from Qdrant
    3. Find differences
    4. Repair missing entries
    5. Log metrics
    """

    def __init__(
        self,
        postgres_url: str = "postgresql://user:password@localhost/legal_db",
        qdrant_url: str = "http://localhost:6333",
        redis_url: str = "redis://localhost:6379/0",
    ):
        self.postgres_url = postgres_url
        self.qdrant_url = qdrant_url
        self.redis_url = redis_url

        self.postgres_pool: Optional[asyncpg.Pool] = None
        self.qdrant_client: Optional[AsyncQdrantClient] = None
        self.redis_client: Optional[aioredis.Redis] = None

        self.reconcile_interval = 3600  # 1 hour
        self.batch_size = 100

    async def initialize(self) -> None:
        """Initialize connections"""
        # Postgres
        self.postgres_pool = await asyncpg.create_pool(
            self.postgres_url,
            min_size=5,
            max_size=20,
        )
        logger.info("✅ Postgres connected")

        # Qdrant
        self.qdrant_client = AsyncQdrantClient(url=self.qdrant_url)
        logger.info("✅ Qdrant connected")

        # Redis
        self.redis_client = await aioredis.from_url(
            self.redis_url,
            encoding="utf8",
            decode_responses=False,
        )
        logger.info("✅ Redis connected")

    async def start_reconciliation_loop(self) -> None:
        """Start continuous reconciliation loop"""
        logger.info("🔄 Starting Postgres ↔ Qdrant reconciliation loop")
        while True:
            try:
                stats = await self.reconcile()
                await self._log_stats(stats)
                await asyncio.sleep(self.reconcile_interval)
            except Exception as e:
                logger.error(f"Error in reconciliation loop: {e}")
                await asyncio.sleep(self.reconcile_interval)

    async def reconcile(self) -> ReconciliationStats:
        """Run full reconciliation"""
        start_time = datetime.now()
        stats = ReconciliationStats(
            timestamp=start_time,
            postgres_count=0,
            qdrant_count=0,
            missing_in_qdrant=0,
            missing_in_postgres=0,
            repaired=0,
            errors=0,
        )

        try:
            # Get chunk IDs from both sources
            postgres_chunks = await self._get_postgres_chunks()
            qdrant_chunks = await self._get_qdrant_chunks()

            stats.postgres_count = len(postgres_chunks)
            stats.qdrant_count = len(qdrant_chunks)

            # Find differences
            missing_in_qdrant = postgres_chunks - qdrant_chunks
            missing_in_postgres = qdrant_chunks - postgres_chunks

            stats.missing_in_qdrant = len(missing_in_qdrant)
            stats.missing_in_postgres = len(missing_in_postgres)

            logger.info(
                f"Reconciliation: Postgres={stats.postgres_count}, "
                f"Qdrant={stats.qdrant_count}, "
                f"Missing in Qdrant={stats.missing_in_qdrant}, "
                f"Missing in Postgres={stats.missing_in_postgres}"
            )

            # Repair missing entries
            if missing_in_qdrant:
                repaired = await self._repair_missing_in_qdrant(missing_in_qdrant)
                stats.repaired += repaired

            if missing_in_postgres:
                repaired = await self._repair_missing_in_postgres(missing_in_postgres)
                stats.repaired += repaired

        except Exception as e:
            logger.error(f"Error during reconciliation: {e}")
            stats.errors += 1

        return stats

    async def _get_postgres_chunks(self) -> Set[str]:
        """Get all chunk IDs from Postgres"""
        if not self.postgres_pool:
            return set()

        try:
            async with self.postgres_pool.acquire() as conn:
                rows = await conn.fetch("SELECT chunk_id FROM embeddings")
                return {row["chunk_id"] for row in rows}
        except Exception as e:
            logger.error(f"Error getting Postgres chunks: {e}")
            return set()

    async def _get_qdrant_chunks(self) -> Set[str]:
        """Get all chunk IDs from Qdrant"""
        if not self.qdrant_client:
            return set()

        try:
            chunks = set()
            # Scroll through all points
            points, _ = await self.qdrant_client.scroll(
                collection_name="legal_embeddings",
                limit=1000,
            )

            for point in points:
                if "chunk_id" in point.payload:
                    chunks.add(point.payload["chunk_id"])

            return chunks
        except Exception as e:
            logger.error(f"Error getting Qdrant chunks: {e}")
            return set()

    async def _repair_missing_in_qdrant(self, chunk_ids: Set[str]) -> int:
        """Repair chunks missing in Qdrant"""
        if not self.postgres_pool or not self.qdrant_client:
            return 0

        repaired = 0
        try:
            async with self.postgres_pool.acquire() as conn:
                # Fetch embeddings from Postgres
                placeholders = ",".join(f"${i+1}" for i in range(len(chunk_ids)))
                query = f"""
                    SELECT id, chunk_id, doc_id, embedding, page, bbox, metadata
                    FROM embeddings
                    WHERE chunk_id IN ({placeholders})
                """

                rows = await conn.fetch(query, *list(chunk_ids))

                # Insert into Qdrant
                from qdrant_client.models import PointStruct
                import hashlib

                points = []
                for row in rows:
                    try:
                        point_id = int(
                            hashlib.md5(row["chunk_id"].encode()).hexdigest(), 16
                        ) % (2**31)

                        point = PointStruct(
                            id=point_id,
                            vector=row["embedding"],
                            payload={
                                "chunk_id": row["chunk_id"],
                                "doc_id": row["doc_id"],
                                "page": row["page"],
                                "bbox": row["bbox"],
                                "metadata": row["metadata"],
                            },
                        )
                        points.append(point)
                    except Exception as e:
                        logger.error(f"Error creating point for {row['chunk_id']}: {e}")

                if points:
                    await self.qdrant_client.upsert(
                        collection_name="legal_embeddings",
                        points=points,
                    )
                    repaired = len(points)
                    logger.info(f"✅ Repaired {repaired} missing entries in Qdrant")

        except Exception as e:
            logger.error(f"Error repairing missing in Qdrant: {e}")

        return repaired

    async def _repair_missing_in_postgres(self, chunk_ids: Set[str]) -> int:
        """Repair chunks missing in Postgres (log only, don't delete from Qdrant)"""
        logger.warning(
            f"⚠️  Found {len(chunk_ids)} chunks in Qdrant but not in Postgres. "
            f"These may be orphaned. Manual review recommended."
        )
        return 0  # Don't auto-repair, requires manual intervention

    async def _log_stats(self, stats: ReconciliationStats) -> None:
        """Log reconciliation statistics"""
        if not self.redis_client:
            return

        try:
            stats_dict = {
                "timestamp": stats.timestamp.isoformat(),
                "postgres_count": stats.postgres_count,
                "qdrant_count": stats.qdrant_count,
                "missing_in_qdrant": stats.missing_in_qdrant,
                "missing_in_postgres": stats.missing_in_postgres,
                "repaired": stats.repaired,
                "errors": stats.errors,
            }

            await self.redis_client.set(
                "reconciliation:latest",
                json.dumps(stats_dict),
                ex=86400,  # 24 hours
            )

            # Log to list for history
            await self.redis_client.lpush(
                "reconciliation:history",
                json.dumps(stats_dict),
            )
            await self.redis_client.ltrim("reconciliation:history", 0, 99)  # Keep last 100

        except Exception as e:
            logger.error(f"Error logging stats: {e}")

    async def get_latest_stats(self) -> Optional[Dict]:
        """Get latest reconciliation statistics"""
        if not self.redis_client:
            return None

        try:
            data = await self.redis_client.get("reconciliation:latest")
            if data:
                return json.loads(data)
        except Exception as e:
            logger.error(f"Error getting latest stats: {e}")

        return None

    async def close(self) -> None:
        """Close connections"""
        if self.postgres_pool:
            await self.postgres_pool.close()
        if self.qdrant_client:
            await self.qdrant_client.close()
        if self.redis_client:
            await self.redis_client.close()


async def main():
    """Main entry point"""
    reconciler = PostgresQdrantReconciler(
        postgres_url="postgresql://postgres:password@localhost/legal_db",
        qdrant_url="http://localhost:6333",
        redis_url="redis://localhost:6379/0",
    )

    try:
        await reconciler.initialize()
        await reconciler.start_reconciliation_loop()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        await reconciler.close()


if __name__ == "__main__":
    asyncio.run(main())
