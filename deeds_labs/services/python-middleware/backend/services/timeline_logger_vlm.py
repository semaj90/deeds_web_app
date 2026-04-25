#!/usr/bin/env python3
"""
Phase 89: Multimodal Timeline Event Logger with VLM Support
============================================================

Enhanced timeline logger supporting:
- 768d embeddings (Ollama embeddinggemma) for text-only
- 1024d embeddings (Gemma-3 VLM) for multimodal (text + image + layout + seal)
- Automatic provider selection based on input modality
- Dual-table storage for backward compatibility

Usage:
    from backend.services.timeline_logger_vlm import MultimodalTimelineLogger

    # Text-only event (768d)
    logger = MultimodalTimelineLogger()
    event_id = logger.log_event(
        operation="upsert",
        collection="phase89_code_chunks",
        note_text="Fixed TypeScript errors",
        tags=["ts_fix"]
    )

    # Multimodal event (1024d)
    event_id = logger.log_multimodal_event(
        operation="upsert",
        collection="phase89_legal_documents",
        note_text="Detected notary seal with 94.5% confidence",
        image_bytes=document_image,
        seal_confidence=0.945,
        layout_boxes=[{"x": 100, "y": 200, "width": 50, "height": 50}],
        tags=["seal_detection", "notary"]
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
from typing import Dict, List, Optional, Any, Literal
import requests
import json
import base64

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MultimodalTimelineLogger:
    """
    Advanced timeline logger with dual-embedding support:
    - 768d: Ollama embeddinggemma (text-only, fast)
    - 1024d: Gemma-3 VLM (multimodal: text + vision + layout + seal)
    """

    def __init__(
        self,
        db_url: Optional[str] = None,
        ollama_url: Optional[str] = None,
        vlm_service_url: Optional[str] = None,
        embedding_model: str = "embeddinggemma:latest",
        vlm_model: str = "google/gemma-3-2b-it-v",
        auto_embed: bool = True,
        prefer_vlm: bool = False
    ):
        """
        Initialize multimodal timeline logger

        Args:
            db_url: PostgreSQL connection string
            ollama_url: Ollama API URL for 768d embeddings
            vlm_service_url: Gemma-3 VLM service URL for 1024d embeddings
            embedding_model: Ollama model name
            vlm_model: VLM model name
            auto_embed: Automatically generate embeddings
            prefer_vlm: Use VLM for all events (even text-only)
        """
        self.db_url = db_url or os.getenv(
            "TIMELINE_DB_URL",
            os.getenv("DATABASE_URL", "postgresql://legal_admin:123456@localhost:5434/legal_ai_db")
        )
        self.ollama_url = ollama_url or os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.vlm_service_url = vlm_service_url or os.getenv("VLM_SERVICE_URL", "http://localhost:8001")
        self.embedding_model = embedding_model
        self.vlm_model = vlm_model
        self.auto_embed = auto_embed
        self.prefer_vlm = prefer_vlm

        self.conn = None
        self._connect()

    def _connect(self) -> None:
        """Establish PostgreSQL connection"""
        try:
            self.conn = psycopg2.connect(self.db_url)
            logger.info("✅ Connected to timeline database (VLM-enabled)")
        except Exception as e:
            logger.error(f"❌ Failed to connect to database: {e}")
            raise

    def _generate_embedding_768d(self, text: str) -> Optional[List[float]]:
        """
        Generate 768d embedding using Ollama embeddinggemma

        Args:
            text: Text to embed

        Returns:
            768-dimensional vector or None
        """
        if not text or not self.auto_embed:
            return None

        try:
            response = requests.post(
                f"{self.ollama_url}/api/embeddings",
                json={"model": self.embedding_model, "prompt": text},
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
                logger.error(f"❌ Ollama embedding failed: HTTP {response.status_code}")
                return None

        except Exception as e:
            logger.error(f"❌ Failed to generate 768d embedding: {e}")
            return None

    def _generate_embedding_1024d(
        self,
        text: str,
        image_bytes: Optional[bytes] = None,
        seal_confidence: float = 0.0,
        layout_boxes: Optional[List[Dict]] = None
    ) -> Optional[List[float]]:
        """
        Generate 1024d embedding using Gemma-3 VLM

        Args:
            text: Text to embed
            image_bytes: Optional image data
            seal_confidence: Seal detection confidence (0.0-1.0)
            layout_boxes: Layout bounding boxes from DocLing

        Returns:
            1024-dimensional vector or None
        """
        if not text or not self.auto_embed:
            return None

        try:
            # Prepare request
            request_data = {
                "texts": [text],
                "images": [],
                "seal_confidences": [seal_confidence],
                "layout_boxes": [layout_boxes or []]
            }

            # Add image if provided
            if image_bytes:
                image_b64 = base64.b64encode(image_bytes).decode('utf-8')
                request_data["images"] = [image_b64]
            else:
                request_data["images"] = [None]

            # Call VLM service
            response = requests.post(
                f"{self.vlm_service_url}/embed",
                json=request_data,
                timeout=60
            )

            if response.status_code == 200:
                data = response.json()
                embeddings = data.get("embeddings", [])

                if embeddings and len(embeddings[0]) == 1024:
                    return embeddings[0]
                else:
                    logger.warning(f"⚠️ Expected 1024d embedding, got {len(embeddings[0]) if embeddings else 0}d")
                    return None
            else:
                logger.error(f"❌ VLM embedding failed: HTTP {response.status_code}")
                return None

        except Exception as e:
            logger.error(f"❌ Failed to generate 1024d embedding: {e}")
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
        metadata: Optional[Dict[str, Any]] = None,
        embedding_provider: Literal["ollama", "vlm", "auto"] = "auto"
    ) -> Optional[int]:
        """
        Log timeline event with 768d embedding

        Args:
            operation: Operation type (upsert, update, delete, search, etc.)
            collection: Qdrant collection name
            point_id: Vector point ID
            actor: Who performed the action (system, user, agentic)
            note_text: Human-readable description (gets embedded)
            tags: Searchable tags
            ref: Reference identifier (file_path, error_id, etc.)
            payload: Full payload for audit trail (JSONB)
            metadata: Additional context (JSONB)
            embedding_provider: Which embedding service to use

        Returns:
            event_id or None if failed
        """
        try:
            # Generate embedding (768d by default)
            embedding = None
            if note_text and self.auto_embed:
                if embedding_provider == "auto" and not self.prefer_vlm:
                    embedding = self._generate_embedding_768d(note_text)
                elif embedding_provider == "vlm" or self.prefer_vlm:
                    embedding = self._generate_embedding_1024d(note_text)
                elif embedding_provider == "ollama":
                    embedding = self._generate_embedding_768d(note_text)

            # Determine table based on embedding dimension
            if embedding and len(embedding) == 1024:
                table_name = "phase89_vector_events_vlm"
            else:
                table_name = "phase89_vector_events"

            # Insert event
            cursor = self.conn.cursor()
            cursor.execute(f"""
                INSERT INTO {table_name} (
                    timestamp, operation, collection, point_id, actor,
                    note_text, note_embedding, tags, ref, payload, metadata
                ) VALUES (
                    NOW(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                RETURNING event_id
            """, (
                operation,
                collection,
                point_id,
                actor,
                note_text,
                embedding,
                tags or [],
                ref,
                Json(payload) if payload else None,
                Json(metadata) if metadata else None
            ))

            event_id = cursor.fetchone()[0]
            self.conn.commit()
            cursor.close()

            logger.info(f"📝 Logged timeline event #{event_id}: {operation} on {collection} (table: {table_name})")
            return event_id

        except Exception as e:
            logger.error(f"❌ Failed to log timeline event: {e}")
            if self.conn:
                self.conn.rollback()
            return None

    def log_multimodal_event(
        self,
        operation: str,
        collection: str,
        note_text: str,
        image_bytes: Optional[bytes] = None,
        seal_confidence: float = 0.0,
        layout_boxes: Optional[List[Dict]] = None,
        point_id: Optional[str] = None,
        actor: str = "system",
        tags: Optional[List[str]] = None,
        ref: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[int]:
        """
        Log multimodal timeline event with 1024d VLM embedding

        Combines text + vision + layout + seal confidence into single embedding

        Args:
            operation: Operation type
            collection: Qdrant collection name
            note_text: Text description
            image_bytes: Document/seal image bytes
            seal_confidence: YOLO seal detection confidence (0.0-1.0)
            layout_boxes: DocLing layout bounding boxes
            point_id: Vector point ID
            actor: Who performed the action
            tags: Searchable tags
            ref: Reference identifier
            payload: Full payload (JSONB)
            metadata: Additional context (JSONB)

        Returns:
            event_id or None if failed
        """
        try:
            # Generate 1024d multimodal embedding
            embedding = self._generate_embedding_1024d(
                text=note_text,
                image_bytes=image_bytes,
                seal_confidence=seal_confidence,
                layout_boxes=layout_boxes
            )

            # Store in VLM table (1024d)
            cursor = self.conn.cursor()
            cursor.execute("""
                INSERT INTO phase89_vector_events_vlm (
                    timestamp, operation, collection, point_id, actor,
                    note_text, note_embedding, tags, ref, payload, metadata,
                    seal_confidence, layout_boxes, modality
                ) VALUES (
                    NOW(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                RETURNING event_id
            """, (
                operation,
                collection,
                point_id,
                actor,
                note_text,
                embedding,
                tags or [],
                ref,
                Json(payload) if payload else None,
                Json(metadata) if metadata else None,
                seal_confidence,
                Json(layout_boxes) if layout_boxes else None,
                "multimodal" if image_bytes else "text"
            ))

            event_id = cursor.fetchone()[0]
            self.conn.commit()
            cursor.close()

            modality = "multimodal" if image_bytes else "text"
            logger.info(f"📝 Logged {modality} timeline event #{event_id}: {operation} on {collection} (1024d VLM)")
            return event_id

        except Exception as e:
            logger.error(f"❌ Failed to log multimodal timeline event: {e}")
            if self.conn:
                self.conn.rollback()
            return None

    def log_upsert(self, collection: str, point_id: str, actor: str, note_text: str,
                   tags: Optional[List[str]] = None, ref: Optional[str] = None,
                   payload: Optional[Dict] = None, **kwargs) -> Optional[int]:
        """Convenience method for logging upsert operations"""
        return self.log_event("upsert", collection, point_id, actor, note_text, tags, ref, payload, **kwargs)

    def log_delete(self, collection: str, point_id: str, actor: str, note_text: str,
                   tags: Optional[List[str]] = None, **kwargs) -> Optional[int]:
        """Convenience method for logging delete operations"""
        return self.log_event("delete", collection, point_id, actor, note_text, tags, **kwargs)

    def log_update_payload(self, collection: str, point_id: str, actor: str, note_text: str,
                          tags: Optional[List[str]] = None, ref: Optional[str] = None,
                          payload: Optional[Dict] = None, **kwargs) -> Optional[int]:
        """Convenience method for logging payload update operations"""
        return self.log_event("update", collection, point_id, actor, note_text, tags, ref, payload, **kwargs)

    def get_recent_events(
        self,
        limit: int = 20,
        collection: Optional[str] = None,
        actor: Optional[str] = None,
        operation: Optional[str] = None,
        tags: Optional[List[str]] = None,
        table: Literal["768d", "1024d", "both"] = "both"
    ) -> List[Dict[str, Any]]:
        """
        Get recent timeline events with optional filters

        Args:
            limit: Number of events to return
            collection: Filter by collection name
            actor: Filter by actor
            operation: Filter by operation type
            tags: Filter by tags (ANY match)
            table: Which table to query (768d, 1024d, or both)

        Returns:
            List of event dictionaries
        """
        try:
            cursor = self.conn.cursor()

            # Build query based on table selection
            if table == "both":
                # Union both tables
                query = """
                    SELECT event_id, timestamp, operation, collection, point_id, actor,
                           note_text, tags, ref, payload, metadata, '768d' as embedding_type
                    FROM phase89_vector_events
                    WHERE 1=1
                """
            elif table == "1024d":
                query = """
                    SELECT event_id, timestamp, operation, collection, point_id, actor,
                           note_text, tags, ref, payload, metadata, modality, seal_confidence,
                           layout_boxes, '1024d' as embedding_type
                    FROM phase89_vector_events_vlm
                    WHERE 1=1
                """
            else:  # 768d
                query = """
                    SELECT event_id, timestamp, operation, collection, point_id, actor,
                           note_text, tags, ref, payload, metadata, '768d' as embedding_type
                    FROM phase89_vector_events
                    WHERE 1=1
                """

            params = []

            # Add filters
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

            # Order and limit
            if table == "both":
                # Add union for 1024d table
                query_1024d = query.replace("phase89_vector_events", "phase89_vector_events_vlm")
                query = f"({query}) UNION ALL ({query_1024d}) ORDER BY timestamp DESC LIMIT %s"
                params = params + params + [limit]  # Double params for union
            else:
                query += " ORDER BY timestamp DESC LIMIT %s"
                params.append(limit)

            cursor.execute(query, params)

            # Fetch results
            columns = [desc[0] for desc in cursor.description]
            events = []
            for row in cursor.fetchall():
                event = dict(zip(columns, row))
                # Convert timestamp to string
                if event.get('timestamp'):
                    event['timestamp'] = event['timestamp'].isoformat()
                events.append(event)

            cursor.close()
            return events

        except Exception as e:
            logger.error(f"❌ Failed to get recent events: {e}")
            return []

    def search_timeline(
        self,
        query_text: str,
        limit: int = 10,
        min_similarity: float = 0.7,
        table: Literal["768d", "1024d", "auto"] = "auto"
    ) -> List[Dict[str, Any]]:
        """
        Semantic timeline search using vector similarity

        Args:
            query_text: Natural language search query
            limit: Number of results to return
            min_similarity: Minimum cosine similarity threshold (0.0-1.0)
            table: Which embedding table to search

        Returns:
            List of events with similarity scores
        """
        try:
            # Generate query embedding
            if table == "auto" or table == "768d":
                query_embedding = self._generate_embedding_768d(query_text)
                search_table = "phase89_vector_events"
            else:  # 1024d
                query_embedding = self._generate_embedding_1024d(query_text)
                search_table = "phase89_vector_events_vlm"

            if not query_embedding:
                logger.warning("⚠️ Failed to generate query embedding, falling back to recent events")
                return self.get_recent_events(limit=limit)

            # Search using cosine similarity
            cursor = self.conn.cursor()
            cursor.execute(f"""
                SELECT
                    event_id, timestamp, operation, collection, point_id, actor,
                    note_text, tags, ref, payload, metadata,
                    1 - (note_embedding <=> %s::vector) as similarity
                FROM {search_table}
                WHERE note_embedding IS NOT NULL
                  AND 1 - (note_embedding <=> %s::vector) >= %s
                ORDER BY similarity DESC
                LIMIT %s
            """, (query_embedding, query_embedding, min_similarity, limit))

            # Fetch results
            columns = [desc[0] for desc in cursor.description]
            events = []
            for row in cursor.fetchall():
                event = dict(zip(columns, row))
                if event.get('timestamp'):
                    event['timestamp'] = event['timestamp'].isoformat()
                events.append(event)

            cursor.close()

            logger.info(f"🔍 Found {len(events)} timeline events matching '{query_text}'")
            return events

        except Exception as e:
            logger.error(f"❌ Timeline search failed: {e}")
            return []

    def get_file_timeline(self, file_path: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Get timeline for a specific file"""
        return self.get_recent_events(limit=limit, ref=file_path)

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
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║  Phase 89: Multimodal Timeline Logger (VLM-Enhanced)           ║")
    print("╚══════════════════════════════════════════════════════════════════╝")
    print()

    with MultimodalTimelineLogger() as timeline:
        # Test 768d text event
        print("📝 Test 1: Logging text-only event (768d)...")
        event_id = timeline.log_upsert(
            collection="test_collection",
            point_id="test_point_1",
            actor="test_suite",
            note_text="Testing 768d embedding with Ollama",
            tags=["test", "768d", "ollama"]
        )
        print(f"   ✅ Event #{event_id} logged")
        print()

        # Test 1024d text event
        print("📝 Test 2: Logging text event with VLM (1024d)...")
        event_id = timeline.log_event(
            operation="upsert",
            collection="test_collection_vlm",
            point_id="test_point_2",
            actor="test_suite",
            note_text="Testing 1024d embedding with Gemma-3 VLM",
            tags=["test", "1024d", "vlm"],
            embedding_provider="vlm"
        )
        print(f"   ✅ Event #{event_id} logged")
        print()

        # Test multimodal event (if VLM service is running)
        print("📝 Test 3: Logging multimodal event (text + seal)...")
        try:
            event_id = timeline.log_multimodal_event(
                operation="seal_detection",
                collection="legal_documents",
                note_text="Detected notary seal with high confidence",
                seal_confidence=0.945,
                layout_boxes=[
                    {"x": 100, "y": 200, "width": 50, "height": 50, "type": "seal"}
                ],
                point_id="doc_12345:seal_1",
                actor="yolo_detector",
                tags=["seal", "notary", "high_confidence"]
            )
            print(f"   ✅ Multimodal event #{event_id} logged")
        except Exception as e:
            print(f"   ⚠️  Multimodal logging skipped (VLM service may not be running): {e}")
        print()

        # Test semantic search
        print("🔍 Test 4: Semantic timeline search...")
        results = timeline.search_timeline(
            query_text="embeddings and testing",
            limit=5,
            table="auto"
        )
        print(f"   ✅ Found {len(results)} matching events")
        for result in results[:3]:
            similarity = result.get('similarity', 0) * 100
            print(f"      {similarity:.1f}% similar: {result['note_text'][:60]}...")
        print()

    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║  ✅ Multimodal Timeline Logger Test Complete!                   ║")
    print("╚══════════════════════════════════════════════════════════════════╝")
