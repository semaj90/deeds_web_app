"""
Progress Tracker: Track document processing progress with SSE and webhooks

Provides:
- Progress tracking in Postgres
- SSE event emission
- Webhook calling with retry logic
- Status updates and logging
"""

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime
from typing import AsyncGenerator, Dict, Optional

import asyncpg
import httpx

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# Database DSN configuration
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://legal_admin:123456@localhost:5432/legal_ai_db"
)


@dataclass
class ProcessingStatus:
    """Processing status"""
    doc_id: str
    status: str  # uploading, ocr, chunking, embedding, indexing, complete, error
    progress: int  # 0-100
    current_page: int
    total_pages: int
    chunks_created: int
    error: Optional[str]
    timestamp: datetime


class ProgressTracker:
    """Track document processing progress"""

    def __init__(
        self,
        postgres_url: Optional[str] = None,
        webhook_url: Optional[str] = None,
    ):
        self.postgres_url = postgres_url or DATABASE_URL
        self.webhook_url = webhook_url
        self.pool: Optional[asyncpg.pool.Pool] = None

        logger.info(f"✅ Progress Tracker initialized")
        logger.info(f"   Postgres: {postgres_url}")
        logger.info(f"   Webhook: {webhook_url or 'disabled'}")

    async def connect(self):
        """Connect to Postgres"""
        try:
            self.pool = await asyncpg.create_pool(
                self.postgres_url,
                min_size=5,
                max_size=20,
            )
            logger.info("✅ Connected to Postgres")
        except Exception as e:
            logger.error(f"Failed to connect to Postgres: {e}")
            raise

    async def disconnect(self):
        """Disconnect from Postgres"""
        if self.pool:
            await self.pool.close()
            logger.info("✅ Disconnected from Postgres")

    async def _ensure_connected(self):
        """Ensure connection is active"""
        if self.pool is None:
            await self.connect()

    async def track_progress(
        self,
        doc_id: str,
        status: str,
        progress: int,
        current_page: int = 0,
        total_pages: int = 0,
        chunks_created: int = 0,
        error: Optional[str] = None,
    ) -> None:
        """Track processing progress"""
        try:
            await self._ensure_connected()

            async with self.pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO processing_status (doc_id, status, progress, current_page, total_pages, chunks_created, error, timestamp)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (doc_id) DO UPDATE SET
                        status = $2,
                        progress = $3,
                        current_page = $4,
                        total_pages = $5,
                        chunks_created = $6,
                        error = $7,
                        timestamp = $8
                    """,
                    doc_id,
                    status,
                    progress,
                    current_page,
                    total_pages,
                    chunks_created,
                    error,
                    datetime.now(),
                )

            logger.info(f"✅ Tracked progress: {doc_id} - {status} ({progress}%)")

            # Call webhook if configured
            if self.webhook_url and status in ["complete", "error"]:
                await self._call_webhook(doc_id, status, progress, error)

        except Exception as e:
            logger.error(f"Error tracking progress: {e}")

    async def get_status(self, doc_id: str) -> Optional[ProcessingStatus]:
        """Get current processing status"""
        try:
            await self._ensure_connected()

            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    SELECT doc_id, status, progress, current_page, total_pages, chunks_created, error, timestamp
                    FROM processing_status
                    WHERE doc_id = $1
                    """,
                    doc_id,
                )

            if row:
                return ProcessingStatus(
                    doc_id=row["doc_id"],
                    status=row["status"],
                    progress=row["progress"],
                    current_page=row["current_page"],
                    total_pages=row["total_pages"],
                    chunks_created=row["chunks_created"],
                    error=row["error"],
                    timestamp=row["timestamp"],
                )
            else:
                return None

        except Exception as e:
            logger.error(f"Error getting status: {e}")
            return None

    async def stream_progress(self, doc_id: str) -> AsyncGenerator[Dict, None]:
        """Stream progress updates via SSE"""
        try:
            last_progress = -1

            while True:
                status = await self.get_status(doc_id)

                if status:
                    # Only emit if progress changed
                    if status.progress != last_progress:
                        yield {
                            "type": "progress",
                            "data": {
                                "doc_id": doc_id,
                                "status": status.status,
                                "progress": status.progress,
                                "current_page": status.current_page,
                                "total_pages": status.total_pages,
                                "chunks_created": status.chunks_created,
                            },
                        }
                        last_progress = status.progress

                    # Emit done event when complete
                    if status.status == "complete":
                        yield {
                            "type": "done",
                            "data": {
                                "doc_id": doc_id,
                                "status": "complete",
                                "chunks": status.chunks_created,
                            },
                        }
                        break

                    # Emit error event on error
                    if status.status == "error":
                        yield {
                            "type": "error",
                            "data": {
                                "doc_id": doc_id,
                                "error": status.error,
                            },
                        }
                        break

                # Wait before polling again
                await asyncio.sleep(0.5)

        except Exception as e:
            logger.error(f"Error streaming progress: {e}")
            yield {
                "type": "error",
                "data": {"error": str(e)},
            }

    async def _call_webhook(
        self,
        doc_id: str,
        status: str,
        progress: int,
        error: Optional[str] = None,
    ) -> None:
        """Call webhook with retry logic"""
        if not self.webhook_url:
            return

        max_retries = 3
        retry_delay = 1

        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.post(
                        self.webhook_url,
                        json={
                            "doc_id": doc_id,
                            "status": status,
                            "progress": progress,
                            "error": error,
                            "timestamp": datetime.now().isoformat(),
                        },
                    )

                    if response.status_code == 200:
                        logger.info(f"✅ Webhook called successfully: {doc_id}")
                        return
                    else:
                        logger.warning(f"Webhook returned {response.status_code}")

            except Exception as e:
                logger.warning(f"Webhook call failed (attempt {attempt + 1}/{max_retries}): {e}")

                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff

        logger.error(f"Webhook call failed after {max_retries} attempts")

    async def close(self):
        """Close service"""
        await self.disconnect()
        logger.info("✅ Progress Tracker closed")


# Global progress tracker instance
progress_tracker: Optional[ProgressTracker] = None


async def get_progress_tracker() -> ProgressTracker:
    """Get or create progress tracker instance"""
    global progress_tracker

    if progress_tracker is None:
        progress_tracker = ProgressTracker()
        await progress_tracker.connect()

    return progress_tracker


async def close_progress_tracker():
    """Close progress tracker"""
    global progress_tracker

    if progress_tracker:
        await progress_tracker.close()
        progress_tracker = None
