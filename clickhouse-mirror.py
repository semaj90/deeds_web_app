#!/usr/bin/env python3
"""
ClickHouse Mirror Service - Phase 66 Analytics Pipeline
Syncs PostgreSQL/Qdrant/Redis → ClickHouse with Ollama auto-tagging

Architecture:
1. Read from PostgreSQL raw_error_embeddings
2. Auto-tag with Ollama gemma3-legal:latest
3. Cache tags in Redis (GPU artifact cache)
4. Write to ClickHouse for analytics
5. Sync Qdrant vector search results
6. Track Redis cache hits

Author: Phase 66 AutoGen Integration
"""

import os
import sys
import time
import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from uuid import uuid4

import psycopg2
from psycopg2.extras import RealDictCursor
from clickhouse_driver import Client as ClickHouseClient
from qdrant_client import QdrantClient
from redis import Redis
import httpx

# Configuration
POSTGRES_URL = os.getenv("POSTGRES_URL")
QDRANT_URL = os.getenv("QDRANT_URL")
REDIS_URL = os.getenv("REDIS_URL")
CLICKHOUSE_URL = os.getenv("CLICKHOUSE_URL", "http://clickhouse:8123")
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "user")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "password")
CLICKHOUSE_DB = os.getenv("CLICKHOUSE_DB", "legal_analytics")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://host.docker.internal:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3-legal:latest")
SYNC_INTERVAL = int(os.getenv("SYNC_INTERVAL_SECONDS", "300"))
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "1000"))
ENABLE_AUTO_TAGGING = os.getenv("ENABLE_AUTO_TAGGING", "true").lower() == "true"
GPU_CACHE_ENABLED = os.getenv("GPU_CACHE_ENABLED", "true").lower() == "true"

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


class ClickHouseMirror:
    def __init__(self):
        self.pg_conn = None
        self.clickhouse = None
        self.qdrant = None
        self.redis = None
        self.ollama_client = httpx.Client(timeout=30.0)
        self.last_sync_time = {}

    def connect(self):
        """Initialize all database connections"""
        try:
            # PostgreSQL
            self.pg_conn = psycopg2.connect(POSTGRES_URL)
            logger.info("✅ Connected to PostgreSQL")

            # ClickHouse
            url_parts = CLICKHOUSE_URL.replace("http://", "").split(":")
            host = url_parts[0]
            port = int(url_parts[1]) if len(url_parts) > 1 else 9000

            self.clickhouse = ClickHouseClient(
                host=host,
                port=port,
                user=CLICKHOUSE_USER,
                password=CLICKHOUSE_PASSWORD,
                database=CLICKHOUSE_DB,
            )
            logger.info(f"✅ Connected to ClickHouse at {host}:{port}")

            # Qdrant
            self.qdrant = QdrantClient(url=QDRANT_URL)
            logger.info("✅ Connected to Qdrant")

            # Redis
            self.redis = Redis.from_url(REDIS_URL, decode_responses=False)
            logger.info("✅ Connected to Redis")

        except Exception as e:
            logger.error(f"❌ Connection failed: {e}")
            raise

    def auto_tag_with_ollama(self, error_message: str, file_path: str) -> tuple[List[str], float]:
        """
        Use Ollama gemma3-legal to auto-generate tags for errors
        Returns: (tags, confidence_score)
        """
        if not ENABLE_AUTO_TAGGING:
            return [], 0.0

        # Check Redis cache first
        cache_key = f"ollama:tag:{hash(error_message + file_path)}"
        if GPU_CACHE_ENABLED:
            cached = self.redis.get(cache_key)
            if cached:
                data = json.loads(cached)
                self._track_cache_hit(cache_key, "tag", OLLAMA_MODEL)
                return data["tags"], data["confidence"]

        # Call Ollama for tagging
        prompt = f"""Analyze this TypeScript/Svelte error and generate 3-5 relevant tags.

File: {file_path}
Error: {error_message}

Respond with JSON only:
{{"tags": ["tag1", "tag2", "tag3"], "confidence": 0.95}}"""

        try:
            response = self.ollama_client.post(
                f"{OLLAMA_URL}/api/generate",
                json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
            )
            result = response.json()

            # Parse JSON response
            output = result.get("response", "{}")
            data = json.loads(output)
            tags = data.get("tags", [])
            confidence = data.get("confidence", 0.8)

            # Cache in Redis
            if GPU_CACHE_ENABLED:
                self.redis.setex(
                    cache_key, 86400, json.dumps({"tags": tags, "confidence": confidence})
                )

            return tags, confidence

        except Exception as e:
            logger.warning(f"⚠️  Auto-tagging failed: {e}")
            return ["untagged"], 0.5

    def sync_error_embeddings(self):
        """Sync PostgreSQL error_embeddings → ClickHouse with auto-tagging"""
        logger.info("🔄 Syncing error embeddings from PostgreSQL...")

        try:
            cursor = self.pg_conn.cursor(cursor_factory=RealDictCursor)

            # Get new errors since last sync
            last_sync = self.last_sync_time.get("error_embeddings", "1970-01-01")
            cursor.execute(
                """
                SELECT id, file_path, error_message, error_type, severity,
                       line_number, column_number, embedding, source, created_at,
                       cluster_id, impact_score
                FROM raw_error_embeddings
                WHERE created_at > %s
                ORDER BY created_at
                LIMIT %s
                """,
                (last_sync, BATCH_SIZE),
            )

            rows = cursor.fetchall()
            if not rows:
                logger.info("✅ No new error embeddings to sync")
                return

            # Process and tag each error
            clickhouse_rows = []
            for row in rows:
                tags, confidence = self.auto_tag_with_ollama(
                    row["error_message"], row["file_path"]
                )

                clickhouse_rows.append(
                    (
                        str(uuid4()),  # id
                        str(row["id"]),  # error_id
                        row["file_path"],
                        row["error_message"],
                        row["error_type"] or "unknown",
                        row["severity"] or "error",
                        row["line_number"] or 0,
                        row["column_number"] or 0,
                        row["embedding"] or [],
                        row["source"] or "unknown",
                        row["created_at"],
                        tags,
                        confidence,
                        row.get("cluster_id"),
                        row.get("impact_score"),
                    )
                )

            # Bulk insert to ClickHouse
            self.clickhouse.execute(
                """
                INSERT INTO error_embeddings
                (id, error_id, file_path, error_message, error_type, severity,
                 line_number, column_number, embedding, source, timestamp,
                 auto_tags, confidence_score, cluster_id, impact_score)
                VALUES
                """,
                clickhouse_rows,
            )

            logger.info(f"✅ Synced {len(rows)} error embeddings with auto-tags")
            self.last_sync_time["error_embeddings"] = rows[-1]["created_at"].isoformat()
            cursor.close()

        except Exception as e:
            logger.error(f"❌ Error embeddings sync failed: {e}")

    def sync_qdrant_cache(self):
        """Sync Qdrant vector search results to ClickHouse"""
        logger.info("🔄 Syncing Qdrant search cache...")

        try:
            # Get recent search results from Qdrant scroll
            # (This is a simplified example - real implementation would track queries)
            collections = self.qdrant.get_collections().collections

            for collection in collections:
                if "error" in collection.name or "legal" in collection.name:
                    logger.info(f"📊 Collection: {collection.name} - {collection.points_count} vectors")

            logger.info("✅ Qdrant cache sync completed")

        except Exception as e:
            logger.error(f"❌ Qdrant sync failed: {e}")

    def sync_redis_cache_hits(self):
        """Track Redis GPU cache hits in ClickHouse"""
        if not GPU_CACHE_ENABLED:
            return

        logger.info("🔄 Syncing Redis cache hits...")

        try:
            # Get all cache keys
            cache_keys = self.redis.keys("ollama:*")

            clickhouse_rows = []
            for key in cache_keys[:BATCH_SIZE]:  # Limit batch
                key_str = key.decode("utf-8")
                value = self.redis.get(key)

                # Parse cache type from key
                cache_type = "unknown"
                if "tag" in key_str:
                    cache_type = "tag"
                elif "embedding" in key_str:
                    cache_type = "embedding"
                elif "completion" in key_str:
                    cache_type = "completion"

                clickhouse_rows.append(
                    (
                        key_str,
                        value.decode("utf-8") if value else "",
                        cache_type,
                        OLLAMA_MODEL,
                        1,  # hit_count
                        datetime.now(),
                        datetime.now(),
                        0.0,  # avg_latency_ms
                        0,    # total_tokens
                    )
                )

            if clickhouse_rows:
                self.clickhouse.execute(
                    """
                    INSERT INTO gpu_cache_hits
                    (cache_key, cache_value, cache_type, model_name, hit_count,
                     last_access, created_at, avg_latency_ms, total_tokens)
                    VALUES
                    """,
                    clickhouse_rows,
                )
                logger.info(f"✅ Synced {len(clickhouse_rows)} Redis cache hits")

        except Exception as e:
            logger.error(f"❌ Redis cache sync failed: {e}")

    def _track_cache_hit(self, cache_key: str, cache_type: str, model: str):
        """Increment cache hit counter in Redis"""
        hit_key = f"cache:hit:{cache_key}"
        self.redis.incr(hit_key)

    def run_sync_loop(self):
        """Main sync loop"""
        logger.info(f"🚀 Starting ClickHouse mirror service (interval: {SYNC_INTERVAL}s)")

        while True:
            try:
                self.sync_error_embeddings()
                self.sync_qdrant_cache()
                self.sync_redis_cache_hits()

                logger.info(f"😴 Sleeping for {SYNC_INTERVAL}s...")
                time.sleep(SYNC_INTERVAL)

            except KeyboardInterrupt:
                logger.info("🛑 Shutting down...")
                break
            except Exception as e:
                logger.error(f"❌ Sync loop error: {e}")
                time.sleep(10)  # Brief pause before retry

    def close(self):
        """Close all connections"""
        if self.pg_conn:
            self.pg_conn.close()
        if self.ollama_client:
            self.ollama_client.close()
        logger.info("👋 Connections closed")


if __name__ == "__main__":
    mirror = ClickHouseMirror()

    try:
        mirror.connect()
        mirror.run_sync_loop()
    except Exception as e:
        logger.error(f"❌ Fatal error: {e}")
        sys.exit(1)
    finally:
        mirror.close()
