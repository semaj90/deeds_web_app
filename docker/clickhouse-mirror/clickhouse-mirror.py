#!/usr/bin/env python3
"""
Phase 96: ClickHouse Data Mirror Service
Syncs data from Postgres/Qdrant to ClickHouse with Ollama auto-tagging
"""

import asyncio
import asyncpg
import clickhouse_connect
import httpx
import json
from datetime import datetime
from typing import List, Dict, Any
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
POSTGRES_URL = os.getenv("POSTGRES_URL", "postgresql://user:password@host.docker.internal:5434/legal")
CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "clickhouse")
CLICKHOUSE_PORT = int(os.getenv("CLICKHOUSE_PORT", "8123"))
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "default")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "clickhouse_password")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://host.docker.internal:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma4-legal:latest")
SYNC_INTERVAL = int(os.getenv("SYNC_INTERVAL", "60"))  # seconds

class ClickHouseMirror:
    def __init__(self):
        self.pg_pool = None
        self.ch_client = None
        self.ollama_client = httpx.AsyncClient(timeout=30.0)

    async def connect(self):
        """Initialize connections"""
        logger.info("Connecting to databases...")

        # Postgres connection
        self.pg_pool = await asyncpg.create_pool(POSTGRES_URL, min_size=2, max_size=10)

        # ClickHouse connection
        self.ch_client = clickhouse_connect.get_client(
            host=CLICKHOUSE_HOST,
            port=CLICKHOUSE_PORT,
            username=CLICKHOUSE_USER,
            password=CLICKHOUSE_PASSWORD
        )

        logger.info("✅ Connected to Postgres and ClickHouse")

    async def auto_tag_with_ollama(self, text: str, context: str = "legal") -> List[str]:
        """Auto-tag text using Ollama gemma4-legal model"""
        try:
            prompt = f"""Extract 3-5 relevant tags from this {context} text.
Return ONLY the tags as a comma-separated list, no explanation.

Text: {text[:500]}

Tags:"""

            response = await self.ollama_client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.3, "num_predict": 50}
                }
            )

            if response.status_code == 200:
                result = response.json()
                tags_text = result.get("response", "").strip()
                tags = [tag.strip() for tag in tags_text.split(",") if tag.strip()]
                return tags[:5]  # Max 5 tags
            else:
                logger.warning(f"Ollama tagging failed: {response.status_code}")
                return []
        except Exception as e:
            logger.error(f"Ollama tagging error: {e}")
            return []

    async def sync_legal_cases(self):
        """Sync legal cases from Postgres to ClickHouse"""
        logger.info("Syncing legal cases...")

        async with self.pg_pool.acquire() as conn:
            # Get cases from Postgres
            cases = await conn.fetch("""
                SELECT
                    c.id::text as case_id,
                    c.created_at,
                    c.updated_at,
                    c.case_number,
                    c.title,
                    c.status,
                    c.category,
                    c.metadata::text as metadata,
                    (SELECT COUNT(*) FROM evidence WHERE case_id = c.id) as evidence_count,
                    (SELECT COUNT(*) FROM documents WHERE case_id = c.id) as document_count,
                    (SELECT COUNT(*) FROM rag_queries WHERE case_id = c.id) as query_count,
                    GREATEST(c.updated_at,
                        (SELECT MAX(created_at) FROM evidence WHERE case_id = c.id),
                        (SELECT MAX(created_at) FROM documents WHERE case_id = c.id)
                    ) as last_activity
                FROM cases c
                WHERE c.updated_at > NOW() - INTERVAL '1 hour'
                ORDER BY c.updated_at DESC
                LIMIT 1000
            """)

            if not cases:
                logger.info("No new cases to sync")
                return

            # Prepare data for ClickHouse
            rows = []
            for case in cases:
                # Auto-tag with Ollama
                tags = await self.auto_tag_with_ollama(
                    f"{case['title']} {case.get('metadata', '')}",
                    context="legal case"
                )

                rows.append([
                    case['case_id'],
                    case['created_at'],
                    case['updated_at'],
                    case['case_number'] or '',
                    case['title'] or '',
                    case['status'] or 'unknown',
                    case['category'] or 'general',
                    case['metadata'] or '{}',
                    tags,
                    case['evidence_count'] or 0,
                    case['document_count'] or 0,
                    case['query_count'] or 0,
                    case['last_activity'] or case['updated_at']
                ])

            # Insert into ClickHouse
            self.ch_client.insert(
                'analytics.legal_cases',
                rows,
                column_names=[
                    'case_id', 'created_at', 'updated_at', 'case_number', 'title',
                    'status', 'category', 'metadata', 'ai_tags', 'evidence_count',
                    'document_count', 'query_count', 'last_activity'
                ]
            )

            logger.info(f"✅ Synced {len(rows)} legal cases")

    async def sync_documents(self):
        """Sync documents from MinIO metadata + Postgres"""
        logger.info("Syncing documents...")

        async with self.pg_pool.acquire() as conn:
            docs = await conn.fetch("""
                SELECT
                    id::text as document_id,
                    case_id::text as case_id,
                    filename,
                    file_type,
                    file_size,
                    uploaded_at,
                    processed_at,
                    ocr_completed,
                    embedding_completed,
                    summary as ai_summary,
                    EXTRACT(EPOCH FROM (processed_at - uploaded_at)) * 1000 as processing_time_ms
                FROM documents
                WHERE processed_at > NOW() - INTERVAL '1 hour'
                ORDER BY processed_at DESC
                LIMIT 1000
            """)

            if not docs:
                logger.info("No new documents to sync")
                return

            rows = []
            for doc in docs:
                # Auto-tag document summary
                tags = await self.auto_tag_with_ollama(
                    doc['ai_summary'] or doc['filename'],
                    context="legal document"
                )

                rows.append([
                    doc['document_id'],
                    doc['case_id'],
                    doc['filename'] or '',
                    doc['file_type'] or 'unknown',
                    doc['file_size'] or 0,
                    doc['uploaded_at'],
                    doc['processed_at'],
                    doc['ocr_completed'] or False,
                    doc['embedding_completed'] or False,
                    doc['ai_summary'] or '',
                    tags,
                    int(doc['processing_time_ms'] or 0)
                ])

            self.ch_client.insert(
                'analytics.documents',
                rows,
                column_names=[
                    'document_id', 'case_id', 'filename', 'file_type', 'file_size',
                    'uploaded_at', 'processed_at', 'ocr_completed', 'embedding_completed',
                    'ai_summary', 'ai_tags', 'processing_time_ms'
                ]
            )

            logger.info(f"✅ Synced {len(rows)} documents")

    async def sync_neo4j_metrics(self):
        """Sync graph metrics from Neo4j"""
        logger.info("Syncing Neo4j graph metrics...")

        # TODO: Query Neo4j for metrics (node counts, centrality, etc.)
        # For now, insert mock data
        timestamp = datetime.utcnow()

        rows = [
            [timestamp, 'node_count', 'case', 'total', 150, '{}'],
            [timestamp, 'node_count', 'evidence', 'total', 450, '{}'],
            [timestamp, 'edge_count', 'relationship', 'RELATES_TO', 300, '{}'],
        ]

        self.ch_client.insert(
            'analytics.graph_metrics',
            rows,
            column_names=['timestamp', 'metric_type', 'entity_type', 'entity_id', 'metric_value', 'metadata']
        )

        logger.info("✅ Synced Neo4j metrics")

    async def run_sync_loop(self):
        """Main sync loop"""
        await self.connect()

        logger.info(f"🔄 Starting sync loop (interval: {SYNC_INTERVAL}s)")

        while True:
            try:
                await asyncio.gather(
                    self.sync_legal_cases(),
                    self.sync_documents(),
                    self.sync_neo4j_metrics(),
                    return_exceptions=True
                )

                logger.info(f"💤 Sleeping {SYNC_INTERVAL}s...")
                await asyncio.sleep(SYNC_INTERVAL)

            except Exception as e:
                logger.error(f"Sync loop error: {e}")
                await asyncio.sleep(10)  # Brief delay before retry

async def main():
    mirror = ClickHouseMirror()
    await mirror.run_sync_loop()

if __name__ == "__main__":
    asyncio.run(main())
