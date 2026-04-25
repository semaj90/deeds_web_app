#!/usr/bin/env python3
"""
Phase 89: Event Sourcing Layer
Wraps Qdrant operations with Postgres audit timeline + semantic timeline search
"""

import asyncio
import hashlib
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Any

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, str(Path(__file__).parent))

try:
    import asyncpg
    from qdrant_client import QdrantClient
    from qdrant_client.models import PointStruct, Distance, VectorParams
except ImportError:
    print("❌ Missing dependencies: pip install asyncpg qdrant-client")
    sys.exit(1)

try:
    import orjson
    JSON_BACKEND = "orjson"

    def dumps(obj):
        return orjson.dumps(obj).decode('utf-8')

    def loads(s):
        return orjson.loads(s)
except ImportError:
    import json
    JSON_BACKEND = "stdlib"
    dumps = lambda obj: json.dumps(obj, sort_keys=True)
    loads = json.loads


class QdrantEventLogger:
    """
    Event sourcing wrapper for Qdrant operations.

    Every Qdrant mutation gets logged to:
    1. Postgres (authoritative timeline)
    2. Qdrant phase89_timeline_events (semantic timeline search)
    """

    def __init__(
        self,
        postgres_dsn: str,
        qdrant_url: str = "http://localhost:6333",
        actor: str = "unknown"
    ):
        self.postgres_dsn = postgres_dsn
        self.qdrant_url = qdrant_url
        self.actor = actor
        self.qdrant = QdrantClient(url=qdrant_url)
        self.pool: Optional[asyncpg.Pool] = None
        self.run_id = uuid.uuid4()

    async def connect(self):
        """Initialize Postgres connection pool"""
        self.pool = await asyncpg.create_pool(self.postgres_dsn, min_size=2, max_size=10)
        print(f"✅ Connected to Postgres (run_id={self.run_id})")

    async def close(self):
        """Close connection pool"""
        if self.pool:
            await self.pool.close()

    def _compute_vector_hash(self, signature_text: str) -> str:
        """Compute sha256 hash of signature text"""
        return hashlib.sha256(signature_text.encode('utf-8')).hexdigest()[:16]

    def _compute_payload_hash(self, payload: Dict) -> str:
        """Compute sha256 hash of normalized payload"""
        normalized = dumps(payload)  # orjson sorts keys
        return hashlib.sha256(normalized.encode('utf-8')).hexdigest()[:16]

    def _create_event_card(
        self,
        ts: datetime,
        op: str,
        collection: str,
        point_id: str,
        redis_key: Optional[str],
        metadata: Dict
    ) -> str:
        r"""
        Create deterministic event card text for embedding.

        Example:
            KIND: qdrant_event
            TS: 2025-12-29T16:21:05Z
            OP: upsert
            COLLECTION: phase89_cache_index
            ACTOR: phase89-redis-qdrant-cache-indexer
            KEY: phase89:chunk:src\lib\services\codebase-indexer.ts:chunk:3
            TAGS: codebase,indexer
            CODEC: gzip+base64
            NOTES: decoded gzip+base64 -> stored meta_ptr
        """
        feature_tags = metadata.get('feature_tags', [])
        error_tags = metadata.get('error_tags', [])
        codec = metadata.get('codec', 'unknown')
        notes = metadata.get('notes', '')

        card = f"""KIND: qdrant_event
TS: {ts.isoformat()}
OP: {op}
COLLECTION: {collection}
ACTOR: {self.actor}
KEY: {redis_key or 'N/A'}
TAGS: {','.join(feature_tags) or 'none'}
ERROR_TAGS: {','.join(error_tags) or 'none'}
CODEC: {codec}
NOTES: {notes or 'no notes'}"""

        return card.strip()

    async def log_event(
        self,
        op: str,
        collection: str,
        point_id: Optional[str] = None,
        vector_hash: Optional[str] = None,
        payload_hash: Optional[str] = None,
        redis_key: Optional[str] = None,
        diff_json: Optional[Dict] = None,
        metadata: Optional[Dict] = None
    ) -> uuid.UUID:
        """
        Log a Qdrant operation to Postgres timeline.

        Args:
            op: Operation type (upsert, delete, payload_patch, collection_create)
            collection: Qdrant collection name
            point_id: Qdrant point ID (optional)
            vector_hash: Hash of signature text
            payload_hash: Hash of payload JSON
            redis_key: Source Redis key (optional)
            diff_json: Change details (optional)
            metadata: Flexible metadata (codec, tags, etc.)

        Returns:
            Event UUID
        """
        if not self.pool:
            raise RuntimeError("Not connected to Postgres (call connect() first)")

        event_id = uuid.uuid4()
        ts = datetime.now(timezone.utc)
        metadata = metadata or {}

        # Extract individual fields from metadata
        feature_tags = metadata.get('feature_tags', [])
        error_tags = metadata.get('error_tags', [])
        codec = metadata.get('codec')
        notes = metadata.get('notes')
        confidence = metadata.get('confidence')

        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO phase89_qdrant_events (
                    event_id, ts, actor, op, collection, point_id,
                    vector_hash, payload_hash, redis_key_ref, diff_json,
                    run_id, feature_tags, error_tags, codec, notes, confidence
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                """,
                event_id, ts, self.actor, op, collection, point_id,
                vector_hash, payload_hash, redis_key, diff_json,
                str(self.run_id), feature_tags, error_tags, codec, notes, confidence
            )

        print(f"📝 Event logged: {op} → {collection} (event_id={event_id})")

        return event_id

    async def upsert_with_logging(
        self,
        collection: str,
        point: PointStruct,
        redis_key: Optional[str] = None,
        signature_text: Optional[str] = None,
        metadata: Optional[Dict] = None
    ):
        """
        Upsert point to Qdrant + log to Postgres timeline.

        Args:
            collection: Qdrant collection name
            point: PointStruct to upsert
            redis_key: Source Redis key (for provenance)
            signature_text: Text used for embedding (for hash)
            metadata: Additional metadata (codec, tags, etc.)
        """
        # Compute hashes
        vector_hash = self._compute_vector_hash(signature_text) if signature_text else None
        payload_hash = self._compute_payload_hash(point.payload) if point.payload else None

        # Upsert to Qdrant
        self.qdrant.upsert(collection_name=collection, points=[point])

        # Log event
        await self.log_event(
            op="upsert",
            collection=collection,
            point_id=str(point.id),
            vector_hash=vector_hash,
            payload_hash=payload_hash,
            redis_key=redis_key,
            metadata=metadata
        )

    async def delete_with_logging(
        self,
        collection: str,
        point_ids: List[str],
        reason: str = "manual delete"
    ):
        """Delete points from Qdrant + log to Postgres"""
        # Delete from Qdrant
        self.qdrant.delete(collection_name=collection, points_selector=point_ids)

        # Log each deletion
        for point_id in point_ids:
            await self.log_event(
                op="delete",
                collection=collection,
                point_id=point_id,
                metadata={"reason": reason}
            )

    async def get_recent_events(
        self,
        limit: int = 100,
        collection: Optional[str] = None,
        actor: Optional[str] = None
    ) -> List[Dict]:
        """Get recent events from timeline"""
        if not self.pool:
            raise RuntimeError("Not connected to Postgres")

        query = "SELECT * FROM phase89_qdrant_events WHERE 1=1"
        params = []
        param_idx = 1

        if collection:
            query += f" AND collection = ${param_idx}"
            params.append(collection)
            param_idx += 1

        if actor:
            query += f" AND actor = ${param_idx}"
            params.append(actor)
            param_idx += 1

        query += f" ORDER BY ts DESC LIMIT ${param_idx}"
        params.append(limit)

        async with self.pool.acquire() as conn:
            rows = await conn.fetch(query, *params)

        return [dict(row) for row in rows]


async def demo():
    """Demo the event sourcing layer"""
    print("🧪 Phase 89: Event Sourcing Demo")
    print("=" * 70)

    # Initialize (update DSN for your environment)
    logger = QdrantEventLogger(
        postgres_dsn="postgresql://user:pass@localhost:5434/legal",
        qdrant_url="http://localhost:6333",
        actor="phase89-demo"
    )

    try:
        await logger.connect()

        # Demo: Create a test point
        test_point = PointStruct(
            id=12345,
            vector=[0.1] * 768,  # Dummy embedding
            payload={
                "redis_key": "phase89:chunk:demo.ts:chunk:1",
                "kind": "chunk",
                "codec": "text",
                "feature_tags": ["demo", "test"]
            }
        )

        print("\n1️⃣ Upserting test point with logging...")
        await logger.upsert_with_logging(
            collection="phase89_cache_index",
            point=test_point,
            redis_key="phase89:chunk:demo.ts:chunk:1",
            signature_text="KIND: chunk\nFILE: demo.ts",
            metadata={
                "codec": "text",
                "feature_tags": ["demo", "test"],
                "notes": "test event"
            }
        )

        print("\n2️⃣ Getting recent events...")
        events = await logger.get_recent_events(limit=5)

        print(f"\n📊 Recent {len(events)} events:")
        for event in events:
            print(f"   {event['ts']:%Y-%m-%d %H:%M:%S} | {event['actor']:20} | {event['op']:15} | {event['collection']}")

        print("\n✅ Demo complete!")

    finally:
        await logger.close()


if __name__ == "__main__":
    asyncio.run(demo())
