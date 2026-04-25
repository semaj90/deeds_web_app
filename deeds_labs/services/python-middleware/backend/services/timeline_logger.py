#!/usr/bin/env python3
"""
Phase 89: Timeline Event Logger
================================

Logs all Qdrant vector operations to PostgreSQL with automatic embedding
for semantic timeline search ("what changed recently related to TypeScript?")

Usage:
    from backend.services.timeline_logger import TimelineLogger

    logger = TimelineLogger()

    # Log upsert operation
    event_id = logger.log_event(
        operation="upsert",
        collection="phase89_code_chunks",
        point_id="src/lib/service.ts:chunk:5",
        actor="agentic",
        note_text="Fixed TypeScript errors in authentication service",
        tags=["phase89", "ts_fix", "auth"],
        ref="src/lib/service.ts",
        payload={"error_count": 3, "loc": 150}
    )
"""

import sys
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

import os
import time
import logging
import psycopg2
from psycopg2.extras import Json
from typing import Dict, List, Optional, Any
import requests
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TimelineLogger:
    """
    Centralized logger for all Qdrant vector operations
    Logs to PostgreSQL + embeds events for semantic search
    """

    def __init__(
        self,
        db_url: Optional[str] = None,
        ollama_url: Optional[str] = None,
        embedding_model: str = "embeddinggemma:latest",
        auto_embed: bool = True
    ):
        """
        Initialize timeline logger

        Args:
            db_url: PostgreSQL connection string (default from env or localhost:5434)
            ollama_url: Ollama API URL (default http://localhost:11434)
            embedding_model: Model for embedding note_text
            auto_embed: Automatically embed note_text when logging
        """
        self.db_url = db_url or os.getenv(
            "TIMELINE_DB_URL",
            os.getenv("DATABASE_URL", "postgresql://legal_admin:123456@localhost:5434/legal_ai_db")
        )
        self.ollama_url = ollama_url or os.getenv(
            "OLLAMA_URL",
            "http://localhost:11434"
        )
        self.embedding_model = embedding_model
        self.auto_embed = auto_embed

        self.conn = None
        self._connect()

    def _connect(self) -> None:
        """Establish PostgreSQL connection"""
        try:
            self.conn = psycopg2.connect(self.db_url)
            logger.info(f"✅ Connected to timeline database")
        except Exception as e:
            logger.error(f"❌ Failed to connect to database: {e}")
            raise

    def _generate_embedding(self, text: str) -> Optional[List[float]]:
        """
        Generate 768d embedding using Ollama embeddinggemma

        Args:
            text: Text to embed

        Returns:
            768-dimensional embedding vector or None if failed
        """
        if not text or not self.auto_embed:
            return None

        try:
            response = requests.post(
                f"{self.ollama_url}/api/embeddings",
                json={
                    "model": self.embedding_model,
                    "prompt": text
                },
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                embedding = data.get("embedding", [])

                if len(embedding) == 768:
                    return embedding
                else:
                    logger.warning(f"⚠️ Expected 768d embedding, got {len(embedding)}d")
                    return None
            else:
                logger.warning(f"⚠️ Ollama embedding failed: {response.status_code}")
                return None

        except Exception as e:
            logger.warning(f"⚠️ Embedding generation failed: {e}")
            return None

    def log_event(
        self,
        operation: str,
        collection: str,
        point_id: Optional[str] = None,
        actor: str = "system",
        note_text: Optional[str] = None,
        tags: Optional[List[str]] = None,
        ref: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[int]:
        """
        Log a Qdrant operation to timeline

        Args:
            operation: Operation type ('upsert', 'update', 'delete', 'create_collection', 'search')
            collection: Qdrant collection name
            point_id: Vector point ID (optional for collection operations)
            actor: Who performed the operation ('system', 'user', 'agentic')
            note_text: Human-readable description (will be embedded for semantic search)
            tags: Searchable tags (e.g., ['phase89', 'ts_fix', 'error_reduction'])
            ref: Reference identifier (file_path, error_id, etc.)
            payload: Full payload for audit (JSONB)
            metadata: Additional context (JSONB)

        Returns:
            event_id or None if failed
        """
        if not self.conn:
            self._connect()

        try:
            # Generate embedding for note_text
            note_embedding = None
            if note_text:
                note_embedding = self._generate_embedding(note_text)

            # Build SQL query
            cur = self.conn.cursor()

            query = """
                INSERT INTO phase89_vector_events (
                    operation, collection, point_id, actor,
                    note_text, note_embedding, tags, ref,
                    payload, metadata
                ) VALUES (
                    %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s
                )
                RETURNING event_id
            """

            cur.execute(query, (
                operation,
                collection,
                point_id,
                actor,
                note_text,
                note_embedding,
                tags or [],
                ref,
                Json(payload) if payload else None,
                Json(metadata) if metadata else None
            ))

            event_id = cur.fetchone()[0]
            self.conn.commit()

            logger.info(
                f"📝 Logged timeline event #{event_id}: "
                f"{operation} on {collection} "
                f"(point: {point_id or 'N/A'}, actor: {actor})"
            )

            return event_id

        except Exception as e:
            logger.error(f"❌ Failed to log timeline event: {e}")
            if self.conn:
                self.conn.rollback()
            return None

    def log_upsert(
        self,
        collection: str,
        point_id: str,
        actor: str = "system",
        note_text: Optional[str] = None,
        tags: Optional[List[str]] = None,
        ref: Optional[str] = None,
        payload: Optional[Dict] = None
    ) -> Optional[int]:
        """Convenience method for logging upsert operations"""
        return self.log_event(
            operation="upsert",
            collection=collection,
            point_id=point_id,
            actor=actor,
            note_text=note_text,
            tags=tags,
            ref=ref,
            payload=payload
        )

    def log_delete(
        self,
        collection: str,
        point_id: str,
        actor: str = "system",
        note_text: Optional[str] = None,
        tags: Optional[List[str]] = None,
        ref: Optional[str] = None
    ) -> Optional[int]:
        """Convenience method for logging delete operations"""
        return self.log_event(
            operation="delete",
            collection=collection,
            point_id=point_id,
            actor=actor,
            note_text=note_text,
            tags=tags,
            ref=ref
        )

    def log_update_payload(
        self,
        collection: str,
        point_id: str,
        actor: str = "system",
        note_text: Optional[str] = None,
        tags: Optional[List[str]] = None,
        ref: Optional[str] = None,
        payload: Optional[Dict] = None
    ) -> Optional[int]:
        """Convenience method for logging payload updates"""
        return self.log_event(
            operation="update",
            collection=collection,
            point_id=point_id,
            actor=actor,
            note_text=note_text,
            tags=tags,
            ref=ref,
            payload=payload
        )

    def get_recent_events(
        self,
        limit: int = 20,
        collection: Optional[str] = None,
        actor: Optional[str] = None,
        operation: Optional[str] = None,
        tags: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Get recent timeline events with optional filters

        Args:
            limit: Maximum number of events
            collection: Filter by collection name
            actor: Filter by actor
            operation: Filter by operation type
            tags: Filter by tags (events with ANY of these tags)

        Returns:
            List of event dictionaries
        """
        if not self.conn:
            self._connect()

        try:
            cur = self.conn.cursor()

            query = """
                SELECT
                    event_id, timestamp, operation, collection,
                    point_id, actor, note_text, tags, ref,
                    payload, metadata, created_at
                FROM phase89_vector_events
                WHERE 1=1
            """
            params = []

            if collection:
                query += " AND collection = %s"
                params.append(collection)

            if actor:
                query += " AND actor = %s"
                params.append(actor)

            if operation:
                query += " AND operation = %s"
                params.append(operation)

            if tags:
                query += " AND tags && %s"
                params.append(tags)

            query += " ORDER BY timestamp DESC LIMIT %s"
            params.append(limit)

            cur.execute(query, params)

            columns = [desc[0] for desc in cur.description]
            events = []

            for row in cur.fetchall():
                event = dict(zip(columns, row))
                # Convert datetime to ISO string
                if event.get('timestamp'):
                    event['timestamp'] = event['timestamp'].isoformat()
                if event.get('created_at'):
                    event['created_at'] = event['created_at'].isoformat()
                events.append(event)

            return events

        except Exception as e:
            logger.error(f"❌ Failed to get recent events: {e}")
            return []

    def search_timeline(
        self,
        query_text: str,
        limit: int = 10,
        min_similarity: float = 0.7
    ) -> List[Dict[str, Any]]:
        """
        Semantic search of timeline events

        Args:
            query_text: Natural language query (e.g., "what changed related to TypeScript errors?")
            limit: Maximum results
            min_similarity: Minimum cosine similarity threshold

        Returns:
            List of matching events with similarity scores
        """
        if not self.conn:
            self._connect()

        # Generate embedding for query
        query_embedding = self._generate_embedding(query_text)
        if not query_embedding:
            logger.warning("⚠️ Could not generate query embedding, falling back to text search")
            return self.get_recent_events(limit=limit)

        try:
            cur = self.conn.cursor()

            query = """
                SELECT
                    event_id, timestamp, operation, collection,
                    point_id, actor, note_text, tags, ref,
                    payload, metadata,
                    1 - (note_embedding <=> %s::vector) as similarity
                FROM phase89_vector_events
                WHERE note_embedding IS NOT NULL
                  AND 1 - (note_embedding <=> %s::vector) >= %s
                ORDER BY similarity DESC
                LIMIT %s
            """

            cur.execute(query, (query_embedding, query_embedding, min_similarity, limit))

            columns = [desc[0] for desc in cur.description]
            events = []

            for row in cur.fetchall():
                event = dict(zip(columns, row))
                # Convert datetime to ISO string
                if event.get('timestamp'):
                    event['timestamp'] = event['timestamp'].isoformat()
                if event.get('created_at'):
                    event['created_at'] = event['created_at'].isoformat()
                # Round similarity
                if event.get('similarity'):
                    event['similarity'] = round(float(event['similarity']), 3)
                events.append(event)

            logger.info(f"🔍 Found {len(events)} timeline events matching '{query_text}'")
            return events

        except Exception as e:
            logger.error(f"❌ Timeline search failed: {e}")
            return []

    def get_file_timeline(
        self,
        file_path: str,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """Get timeline of all changes for a specific file"""
        return self.get_recent_events(
            limit=limit,
            ref=file_path
        )

    def close(self) -> None:
        """Close database connection"""
        if self.conn:
            self.conn.close()
            logger.info("✅ Timeline logger connection closed")

    def __enter__(self):
        """Context manager entry"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()


# Example usage
if __name__ == "__main__":
    # Test timeline logger
    print("=" * 70)
    print("Phase 89: Timeline Logger Test")
    print("=" * 70)
    print()

    with TimelineLogger() as timeline:
        # Log a sample upsert event
        event_id = timeline.log_upsert(
            collection="phase89_code_chunks",
            point_id="src/lib/auth/session.ts:chunk:1",
            actor="agentic",
            note_text="Fixed TypeScript error: useState is not defined. Replaced with $state() rune for Svelte 5 compatibility.",
            tags=["phase89", "ts_fix", "svelte5_migration"],
            ref="src/lib/auth/session.ts",
            payload={
                "error_type": "typescript",
                "error_count_before": 5,
                "error_count_after": 0,
                "loc": 120
            }
        )

        print(f"\n✅ Logged event #{event_id}")
        print()

        # Get recent events
        print("📋 Recent timeline events:")
        print()
        events = timeline.get_recent_events(limit=5)
        for event in events:
            print(f"  {event['timestamp']}: {event['operation']} on {event['collection']}")
            if event.get('note_text'):
                print(f"    → {event['note_text'][:80]}...")
            print()

        # Semantic search
        print("🔍 Semantic timeline search:")
        print("   Query: 'TypeScript errors related to Svelte 5'")
        print()
        results = timeline.search_timeline(
            "TypeScript errors related to Svelte 5",
            limit=3
        )
        for result in results:
            print(f"  Similarity: {result['similarity']:.2%}")
            print(f"  {result['operation']} on {result['collection']}")
            print(f"  → {result.get('note_text', 'N/A')[:80]}...")
            print()

        print("=" * 70)
        print("✅ Timeline logger test complete!")
        print("=" * 70)
