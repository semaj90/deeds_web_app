#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 92: Event Sourcing + Timeline Layer (Final Form)
Audit log for all Qdrant edits with semantic timeline search

Architecture:
  Qdrant Edit → Postgres Event Log → LangExtract Metadata → Timeline Search

Timeline Collections:
  - phase92_timeline_events (semantic search over edit history)
  - Postgres phase89_qdrant_events (authoritative truth)

CRITICAL FIX: Stores timestamps as FLOAT (Unix epoch) for Qdrant Range filtering.

Usage:
    python scripts/phase92-event-sourcing.py --init-db
    python scripts/phase92-event-sourcing.py --log-event "upsert" "phase89_cache_index" "12345"
    python scripts/phase92-event-sourcing.py --search-timeline "runes migration"
    python scripts/phase92-event-sourcing.py --recent-edits --hours 24
"""

import os
import sys

# Windows UTF-8 support (MUST be before any print statements)
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

import json
import asyncio
import hashlib
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from uuid import uuid4
from pathlib import Path

# Add scripts to path for local imports
sys.path.insert(0, str(Path(__file__).parent))

try:
    import psycopg2
    from psycopg2.extras import Json
except ImportError:
    print("❌ Missing psycopg2. Install: pip install psycopg2-binary")
    sys.exit(1)

try:
    from qdrant_client import QdrantClient
    from qdrant_client.http import models
except ImportError:
    print("❌ Missing qdrant-client. Install: pip install qdrant-client")
    sys.exit(1)

try:
    import httpx
except ImportError:
    httpx = None

# Try to import JSON helper
try:
    from phase89_json import BACKEND
    print(f"📦 JSON Backend: {BACKEND}")
except ImportError:
    BACKEND = "json"
    print(f"📦 JSON Backend: {BACKEND} (fallback)")

# =============================================================================
# Configuration
# =============================================================================
POSTGRES_DSN = os.getenv("POSTGRES_DSN", "postgresql://user:pass@localhost:5434/legal")
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
LANGEXTRACT_URL = os.getenv("LANGEXTRACT_URL", "http://localhost:8095")

TIMELINE_COLLECTION = "phase92_timeline_events"
EMBEDDING_MODEL = "embeddinggemma:latest"
EMBEDDING_DIM = 768

# =============================================================================
# Postgres Schema
# =============================================================================
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS phase89_qdrant_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor TEXT NOT NULL,
    op TEXT NOT NULL,
    collection TEXT NOT NULL,
    point_id TEXT,
    vector_hash TEXT,
    payload_hash TEXT,
    redis_key_ref TEXT,
    diff_json JSONB,
    run_id TEXT,
    feature_tags TEXT[],
    error_tags TEXT[],
    codec TEXT,
    notes TEXT,
    confidence FLOAT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qdrant_events_ts ON phase89_qdrant_events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_qdrant_events_collection ON phase89_qdrant_events(collection);
CREATE INDEX IF NOT EXISTS idx_qdrant_events_actor ON phase89_qdrant_events(actor);
CREATE INDEX IF NOT EXISTS idx_qdrant_events_op ON phase89_qdrant_events(op);
CREATE INDEX IF NOT EXISTS idx_qdrant_events_feature_tags ON phase89_qdrant_events USING GIN(feature_tags);
CREATE INDEX IF NOT EXISTS idx_qdrant_events_error_tags ON phase89_qdrant_events USING GIN(error_tags);
CREATE INDEX IF NOT EXISTS idx_qdrant_events_run_id ON phase89_qdrant_events(run_id);
CREATE INDEX IF NOT EXISTS idx_qdrant_events_redis_key ON phase89_qdrant_events(redis_key_ref);
"""

# =============================================================================
# Event Config
# =============================================================================
class EventConfig:
    def __init__(self):
        self.run_id = str(uuid4())
        self.actor = "phase92-event-logger"

# =============================================================================
# Event Sourcing Engine
# =============================================================================
class EventSourcingEngine:
    """Audit log for all Qdrant edits with semantic timeline."""

    def __init__(self, config: EventConfig = None):
        self.config = config or EventConfig()
        self.qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

        # Connect to Postgres
        try:
            self.pg_conn = psycopg2.connect(POSTGRES_DSN)
            self.pg_conn.autocommit = True
            print(f"✅ Postgres connected")
        except Exception as e:
            print(f"⚠️ Postgres connection failed: {e}")
            self.pg_conn = None

    def _compute_hash(self, data: Any) -> str:
        """Deterministic hash for payloads/vectors."""
        if isinstance(data, dict):
            s = json.dumps(data, sort_keys=True)
        else:
            s = str(data)
        return hashlib.sha256(s.encode()).hexdigest()

    def _get_embedding(self, text: str) -> List[float]:
        """Get embedding from Ollama."""
        try:
            import requests
            response = requests.post(
                f"{OLLAMA_URL}/api/embeddings",
                json={"model": EMBEDDING_MODEL, "prompt": text},
                timeout=30
            )
            if response.status_code == 200:
                return response.json().get("embedding", [])
        except Exception as e:
            print(f"⚠️ Embedding failed: {e}")

        # Return zero vector as fallback
        return [0.0] * EMBEDDING_DIM

    def init_db(self):
        """Initialize Postgres schema and Qdrant collection."""
        print("🔧 Initializing Postgres schema...")

        if self.pg_conn:
            try:
                with self.pg_conn.cursor() as cur:
                    cur.execute(CREATE_TABLE_SQL)
                print("   ✅ Tables created")
            except Exception as e:
                print(f"   ❌ Table creation failed: {e}")

        # Create Qdrant timeline collection
        print(f"🔧 Initializing Qdrant {TIMELINE_COLLECTION}...")

        try:
            self.qdrant.get_collection(TIMELINE_COLLECTION)
            print(f"   ✅ Collection exists")
        except:
            self.qdrant.create_collection(
                collection_name=TIMELINE_COLLECTION,
                vectors_config=models.VectorParams(
                    size=EMBEDDING_DIM,
                    distance=models.Distance.COSINE
                )
            )

            # Create payload indexes
            for field in ["actor", "op", "collection", "tags"]:
                try:
                    self.qdrant.create_payload_index(
                        collection_name=TIMELINE_COLLECTION,
                        field_name=field,
                        field_schema=models.PayloadSchemaType.KEYWORD
                    )
                except:
                    pass

            # Float index for timestamp range queries
            try:
                self.qdrant.create_payload_index(
                    collection_name=TIMELINE_COLLECTION,
                    field_name="ts",
                    field_schema=models.PayloadSchemaType.FLOAT
                )
            except:
                pass

            print(f"   ✅ Collection created with indexes")

        print()

    async def log_event(
        self,
        op: str,
        collection: str,
        point_id: str,
        payload: Dict = None,
        vector: List[float] = None,
        tags: List[str] = None,
        notes: str = None
    ) -> str:
        """
        Logs an event to BOTH Postgres (Truth) and Qdrant (Semantic Search).

        CRITICAL: Stores ts as FLOAT for Qdrant Range filtering.
        """
        # 1. Prepare Data
        ts_now = datetime.now(timezone.utc)
        ts_float = ts_now.timestamp()  # CRITICAL: Float for Qdrant Range filter
        event_id = str(uuid4())

        safe_payload = payload or {}
        safe_tags = tags or []

        # 2. Build event summary for embedding
        event_summary = f"{op} on {collection}: {point_id}"
        if safe_tags:
            event_summary += f" (tags: {', '.join(safe_tags)})"
        if notes:
            event_summary += f" - {notes}"

        # 3. Write to Postgres (The Audit Log)
        if self.pg_conn:
            try:
                with self.pg_conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO phase89_qdrant_events
                        (event_id, ts, actor, op, collection, point_id,
                         payload_hash, feature_tags, notes)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        event_id, ts_now, self.config.actor, op, collection,
                        str(point_id), self._compute_hash(safe_payload),
                        safe_tags, notes
                    ))
                print(f"📝 Postgres: {event_id}")
            except Exception as e:
                print(f"❌ Postgres Write Error: {e}")

        # 4. Get embedding for event
        if vector is None:
            vector = self._get_embedding(event_summary)

        # 5. Write to Qdrant Timeline (The Semantic Log)
        if vector and len(vector) == EMBEDDING_DIM:
            q_payload = {
                "event_id": event_id,
                "ts": ts_float,  # FLOAT for Range filtering!
                "ts_iso": ts_now.isoformat(),  # ISO for display
                "actor": self.config.actor,
                "op": op,
                "collection": collection,
                "point_id": str(point_id),
                "tags": safe_tags,
                "notes": notes or "",
                "summary": event_summary
            }

            try:
                self.qdrant.upsert(
                    collection_name=TIMELINE_COLLECTION,
                    points=[
                        models.PointStruct(
                            id=event_id,
                            vector=vector,
                            payload=q_payload
                        )
                    ]
                )
                print(f"✅ Qdrant Timeline: {event_id}")
            except Exception as e:
                print(f"❌ Qdrant Write Error: {e}")
        else:
            print(f"⚠️ Skipped Qdrant (no valid embedding)")

        return event_id

    async def search_timeline(
        self,
        query: str,
        hours: int = 24,
        limit: int = 10
    ) -> List[Dict]:
        """
        Semantic search over timeline events with time filtering.

        Uses FLOAT timestamp for Range filter (fixes ValidationError).
        """
        print(f"🔍 Searching timeline: '{query}' (Last {hours}h)")
        print()

        # 1. Calculate Cutoff Timestamp (FLOAT)
        cutoff_dt = datetime.now(timezone.utc) - timedelta(hours=hours)
        cutoff_ts = cutoff_dt.timestamp()  # CRITICAL: Float for Range filter

        # 2. Get query embedding
        query_vector = self._get_embedding(query)

        if not query_vector or len(query_vector) != EMBEDDING_DIM:
            print("❌ Failed to get query embedding")
            return []

        # 3. Search with Time Filter (using query_points instead of deprecated search)
        try:
            results_obj = self.qdrant.query_points(
                collection_name=TIMELINE_COLLECTION,
                query=query_vector,
                limit=limit,
                query_filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="ts",
                            range=models.Range(
                                gte=cutoff_ts  # FLOAT fixes ValidationError!
                            )
                        )
                    ]
                ),
                with_payload=True
            )
            hits = results_obj.points

            print(f"📊 Found {len(hits)} events:")
            results = []
            for hit in hits:
                p = hit.payload
                ts_val = p.get('ts', 0)

                # Convert float timestamp to datetime for display
                if isinstance(ts_val, (int, float)):
                    dt = datetime.fromtimestamp(ts_val, tz=timezone.utc)
                    time_str = dt.strftime('%Y-%m-%d %H:%M:%S')
                else:
                    time_str = str(ts_val)

                print(f"   [{time_str}] {p.get('op')} {p.get('collection')} (Score: {hit.score:.4f})")
                if p.get('notes'):
                    print(f"      Notes: {p.get('notes')}")

                results.append({
                    'event_id': p.get('event_id'),
                    'score': hit.score,
                    'ts': ts_val,
                    'op': p.get('op'),
                    'collection': p.get('collection'),
                    'actor': p.get('actor'),
                    'notes': p.get('notes')
                })

            return results

        except Exception as e:
            print(f"❌ Search Failed: {e}")
            return []

    def recent_edits(self, hours: int = 24, limit: int = 50) -> List[Dict]:
        """Get recent edits from Postgres."""
        if not self.pg_conn:
            print("❌ No Postgres connection")
            return []

        try:
            cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
            with self.pg_conn.cursor() as cur:
                cur.execute("""
                    SELECT event_id, ts, actor, op, collection, point_id,
                           redis_key_ref, feature_tags, error_tags, notes
                    FROM phase89_qdrant_events
                    WHERE ts >= %s
                    ORDER BY ts DESC
                    LIMIT %s
                """, (cutoff, limit))

                columns = [desc[0] for desc in cur.description]
                rows = cur.fetchall()
                return [dict(zip(columns, row)) for row in rows]
        except Exception as e:
            print(f"❌ Query failed: {e}")
            return []

    def close(self):
        """Close connections."""
        if self.pg_conn:
            self.pg_conn.close()

# =============================================================================
# CLI
# =============================================================================
def main():
    import argparse

    parser = argparse.ArgumentParser(
        description='Phase 92: Event Sourcing + Timeline Layer (Final Form)'
    )
    parser.add_argument('--init-db', action='store_true', help='Initialize DB schemas')
    parser.add_argument('--log-event', nargs=3, metavar=('OP', 'COLLECTION', 'POINT_ID'),
                        help='Log an event')
    parser.add_argument('--actor', default='cli-user', help='Actor name')
    parser.add_argument('--search-timeline', metavar='QUERY', help='Search timeline semantically')
    parser.add_argument('--recent-edits', action='store_true', help='Show recent edits')
    parser.add_argument('--hours', type=int, default=24, help='Hours lookback')
    parser.add_argument('--limit', type=int, default=10, help='Max results')
    parser.add_argument('--notes', type=str, help='Notes for log event')
    parser.add_argument('--json', action='store_true', help='JSON output')

    args = parser.parse_args()
    print()

    config = EventConfig()
    config.actor = args.actor
    engine = EventSourcingEngine(config)

    try:
        if args.init_db:
            engine.init_db()
            print("✅ Database initialized")

        elif args.log_event:
            op, collection, point_id = args.log_event
            print(f"📝 Logging event...")
            print(f"   Op: {op}")
            print(f"   Collection: {collection}")
            print(f"   Point: {point_id}")
            print()

            event_id = asyncio.run(engine.log_event(
                op=op,
                collection=collection,
                point_id=point_id,
                tags=["cli-test"],
                notes=args.notes
            ))

            print()
            print(f"✅ Event logged: {event_id}")

        elif args.search_timeline:
            asyncio.run(engine.search_timeline(
                query=args.search_timeline,
                hours=args.hours,
                limit=args.limit
            ))

        elif args.recent_edits:
            edits = engine.recent_edits(hours=args.hours, limit=args.limit)

            if args.json:
                # JSON output for MCP tools
                import json
                print(json.dumps({
                    'recent_edits': edits,
                    'count': len(edits),
                    'hours': args.hours
                }, default=str))
            else:
                # Human-readable output
                print(f"📊 Recent edits (last {args.hours} hours):")
                print()

                if not edits:
                    print("   No recent edits found")
                else:
                    for edit in edits:
                        print(f"• [{edit['op']}] {edit['collection']}")
                        print(f"  Actor: {edit['actor']}")
                        print(f"  Time: {edit['ts']}")
                        if edit.get('notes'):
                            print(f"  Notes: {edit['notes']}")
                        print()

        else:
            parser.print_help()

    finally:
        engine.close()

if __name__ == '__main__':
    main()
