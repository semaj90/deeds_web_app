#!/usr/bin/env python3
"""
Phase 92: Timeline Event Embedder
Extracts events from Postgres → LangExtract metadata → EmbeddingGemma → Qdrant timeline

Pipeline:
1. Query Postgres for recent unprocessed events
2. Extract metadata with LangExtract (task_type="retrieval_document")
3. Generate embeddings with EmbeddingGemma (768-d)
4. Upsert to phase92_timeline_events with payload
5. Mark events as processed in Postgres
"""

import asyncio
import hashlib
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, str(Path(__file__).parent))

try:
    import asyncpg
    import httpx
    from qdrant_client import QdrantClient
    from qdrant_client.models import PointStruct
except ImportError:
    print("❌ Missing dependencies: pip install asyncpg httpx qdrant-client")
    sys.exit(1)

try:
    import orjson
    JSON_BACKEND = "orjson"
    dumps = lambda obj: orjson.dumps(obj).decode('utf-8')
    loads = orjson.loads
except ImportError:
    import json
    JSON_BACKEND = "stdlib"
    dumps = lambda obj: json.dumps(obj, sort_keys=True)
    loads = json.loads


class TimelineEventEmbedder:
    """
    Processes Postgres events → LangExtract → EmbeddingGemma → Qdrant timeline
    """

    def __init__(
        self,
        postgres_dsn: str,
        ollama_url: str = "http://localhost:11434",
        langextract_url: str = "http://localhost:8095",
        qdrant_url: str = "http://localhost:6333"
    ):
        self.postgres_dsn = postgres_dsn
        self.ollama_url = ollama_url
        self.langextract_url = langextract_url
        self.qdrant_url = qdrant_url
        self.pool: Optional[asyncpg.Pool] = None
        self.qdrant = QdrantClient(url=qdrant_url)
        self.http = httpx.AsyncClient(timeout=30.0)

    async def connect(self):
        """Initialize Postgres connection pool"""
        self.pool = await asyncpg.create_pool(self.postgres_dsn, min_size=2, max_size=10)
        print(f"✅ Connected to Postgres")

    async def close(self):
        """Close connections"""
        if self.pool:
            await self.pool.close()
        await self.http.aclose()

    def _create_event_signature(self, event: Dict) -> str:
        """
        Create deterministic signature text for embedding.

        This is the "retrieval_document" version - optimized for storage.
        """
        ts = event['ts'].isoformat() if isinstance(event['ts'], datetime) else event['ts']
        redis_key = event.get('redis_key_ref', 'N/A')
        feature_tags = event.get('feature_tags', []) or []
        error_tags = event.get('error_tags', []) or []
        codec = event.get('codec', 'unknown')
        notes = event.get('notes', '')

        signature = f"""KIND: qdrant_event
TS: {ts}
OP: {event['op']}
COLLECTION: {event['collection']}
ACTOR: {event['actor']}
POINT_ID: {event.get('point_id', 'N/A')}
KEY: {redis_key}
TAGS: {','.join(feature_tags) or 'none'}
ERROR_TAGS: {','.join(error_tags) or 'none'}
CODEC: {codec}
NOTES: {notes or 'no notes'}"""

        return signature.strip()

    async def extract_metadata(self, signature_text: str) -> Dict:
        """
        Extract structured metadata from event signature using LangExtract.

        Uses task_type="retrieval_document" paradigm from Google video.
        """
        try:
            response = await self.http.post(
                f"{self.langextract_url}/extract",
                json={
                    "content": signature_text,
                    "document_type": "event_log",
                    "extract_entities": True,
                    "extract_structure": True,
                    "language": "en"
                }
            )

            if response.status_code == 200:
                result = response.json()
                return {
                    "entities": result.get("entities", []),
                    "structure": result.get("structure", {}),
                    "confidence": 1.0
                }
            else:
                print(f"⚠️  LangExtract failed: {response.status_code}")
                return {"entities": [], "structure": {}, "confidence": 0.0}

        except Exception as e:
            print(f"⚠️  LangExtract error: {e}")
            return {"entities": [], "structure": {}, "confidence": 0.0}

    async def generate_embedding(self, text: str, task_type: str = "retrieval_document") -> List[float]:
        """
        Generate embedding using EmbeddingGemma via Ollama.

        Args:
            text: Text to embed
            task_type: "retrieval_document" (storage) or "retrieval_query" (search)
        """
        # Prepend task type prefix (Google video recommendation)
        if task_type == "retrieval_query":
            prefixed = f"search_query: {text}"
        else:  # retrieval_document
            prefixed = f"search_document: {text}"

        try:
            response = await self.http.post(
                f"{self.ollama_url}/api/embeddings",
                json={
                    "model": "embeddinggemma:latest",
                    "prompt": prefixed
                }
            )

            if response.status_code == 200:
                data = response.json()
                embedding = data.get("embedding", [])

                if len(embedding) != 768:
                    print(f"⚠️  Unexpected embedding size: {len(embedding)} (expected 768)")

                return embedding
            else:
                print(f"❌ Embedding failed: {response.status_code}")
                return []

        except Exception as e:
            print(f"❌ Embedding error: {e}")
            return []

    async def get_unprocessed_events(self, limit: int = 50) -> List[Dict]:
        """
        Get events from Postgres that haven't been embedded yet.

        Uses a marker column or timestamp filter to avoid reprocessing.
        """
        if not self.pool:
            raise RuntimeError("Not connected to Postgres")

        # For now, get recent events (last 24 hours)
        # TODO: Add 'embedded' boolean column to track processing
        query = """
            SELECT
                event_id, ts, actor, op, collection, point_id,
                vector_hash, payload_hash, redis_key_ref, diff_json,
                run_id, feature_tags, error_tags, codec, notes, confidence
            FROM phase89_qdrant_events
            WHERE ts > NOW() - INTERVAL '24 hours'
            ORDER BY ts DESC
            LIMIT $1
        """

        async with self.pool.acquire() as conn:
            rows = await conn.fetch(query, limit)

        return [dict(row) for row in rows]

    async def embed_event(self, event: Dict) -> Optional[str]:
        """
        Embed a single event and upsert to Qdrant timeline.

        Returns point_id if successful, None otherwise.
        """
        # 1. Create signature text
        signature = self._create_event_signature(event)

        # 2. Extract metadata with LangExtract (optional, enhances payload)
        metadata = await self.extract_metadata(signature)

        # 3. Generate embedding (task_type="retrieval_document")
        embedding = await self.generate_embedding(signature, task_type="retrieval_document")

        if not embedding:
            print(f"❌ Skipping event {event['event_id']} - embedding failed")
            return None

        # 4. Prepare payload
        ts_unix = int(event['ts'].timestamp()) if isinstance(event['ts'], datetime) else 0

        payload = {
            "event_id": str(event['event_id']),
            "ts": event['ts'].isoformat() if isinstance(event['ts'], datetime) else event['ts'],
            "ts_unix": ts_unix,  # For range queries
            "actor": event['actor'],
            "op": event['op'],
            "collection": event['collection'],
            "point_id": event.get('point_id'),
            "redis_key": event.get('redis_key_ref'),
            "run_id": event.get('run_id'),
            "feature_tags": event.get('feature_tags') or [],
            "error_tags": event.get('error_tags') or [],
            "codec": event.get('codec'),
            "notes": event.get('notes'),
            "confidence": metadata.get('confidence', 0.0),
            "signature_text": signature,  # For debugging
            "langextract_entities": len(metadata.get('entities', [])),
            "vector_hash": event.get('vector_hash')
        }

        # 5. Upsert to Qdrant
        point_id = hashlib.sha256(str(event['event_id']).encode()).hexdigest()[:16]

        try:
            self.qdrant.upsert(
                collection_name="phase92_timeline_events",
                points=[PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload=payload
                )]
            )

            return point_id

        except Exception as e:
            print(f"❌ Qdrant upsert failed: {e}")
            return None

    async def process_batch(self, batch_size: int = 20):
        """
        Process a batch of unprocessed events.

        Returns (success_count, fail_count, total_time).
        """
        print("🔄 Processing event batch...")

        # 1. Get unprocessed events
        events = await self.get_unprocessed_events(limit=batch_size)

        if not events:
            print("✅ No unprocessed events")
            return (0, 0, 0.0)

        print(f"📊 Found {len(events)} events to process")

        # 2. Process each event
        start_time = time.time()
        success = 0
        fail = 0

        for i, event in enumerate(events, 1):
            print(f"\n[{i}/{len(events)}] Processing event {event['event_id']}")
            print(f"   Actor: {event['actor']}")
            print(f"   Op: {event['op']} → {event['collection']}")

            point_id = await self.embed_event(event)

            if point_id:
                print(f"   ✅ Embedded → {point_id}")
                success += 1
            else:
                print(f"   ❌ Failed")
                fail += 1

        elapsed = time.time() - start_time

        print(f"\n📊 Batch complete:")
        print(f"   Success: {success}/{len(events)}")
        print(f"   Failed: {fail}/{len(events)}")
        print(f"   Time: {elapsed:.2f}s ({elapsed/len(events):.2f}s per event)")

        return (success, fail, elapsed)


async def main():
    """Process recent events from Postgres → LangExtract → Qdrant"""
    import argparse

    parser = argparse.ArgumentParser(description="Phase 92: Timeline Event Embedder")
    parser.add_argument("--limit", type=int, default=10, help="Max events to process")
    parser.add_argument("--batch-size", type=int, default=5, help="Batch size for processing")
    args = parser.parse_args()

    print("🧪 Phase 92: Timeline Event Embedder")
    print("=" * 70)
    print(f"   Limit: {args.limit} events")
    print(f"   Batch size: {args.batch_size}")

    embedder = TimelineEventEmbedder(
        postgres_dsn="postgresql://user:pass@localhost:5434/legal",
        ollama_url="http://localhost:11434",
        langextract_url="http://localhost:8095",
        qdrant_url="http://localhost:6333"
    )

    try:
        await embedder.connect()

        # Process batch
        success, fail, elapsed = await embedder.process_batch(batch_size=args.limit)

        print(f"\n✅ Pipeline complete!")
        print(f"   Backend: {JSON_BACKEND}")
        print(f"   Processed: {success} success, {fail} failed")
        print(f"   Elapsed: {elapsed:.2f}s")

    finally:
        await embedder.close()


if __name__ == "__main__":
    asyncio.run(main())
