#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - Retry Queue Processor
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Process failed operations with exponential backoff
Task: 2.2 - Write property test for atomicity
═══════════════════════════════════════════════════════════════════════
"""

import os
import time
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum

import psycopg2
from psycopg2.extras import RealDictCursor

from backend.services.multi_db_coordinator import (
    MultiDBCoordinator,
    DBOperation,
    DatabaseType,
    TransactionStatus
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class RetryStatus(Enum):
    """Retry queue status."""
    PENDING = "pending"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    DEAD_LETTER = "dead_letter"


@dataclass
class QueuedOperation:
    """Queued operation with retry metadata."""
    id: str
    operation: DBOperation
    attempts: int = 0
    max_attempts: int = 3
    status: RetryStatus = RetryStatus.PENDING
    created_at: datetime = field(default_factory=datetime.now)
    last_attempt: Optional[datetime] = None
    next_retry: Optional[datetime] = None
    error_message: Optional[str] = None


class RetryQueueProcessor:
    """
    Process failed database operations with exponential backoff.

    Features:
    - Exponential backoff (2^attempts seconds)
    - Dead letter queue for permanently failed operations
    - PostgreSQL-backed queue for persistence
    - Automatic retry scheduling
    """

    def __init__(
        self,
        coordinator: MultiDBCoordinator,
        max_attempts: int = 3,
        base_delay: int = 2,
        max_delay: int = 300,
    ):
        """Initialize retry queue processor."""
        self.coordinator = coordinator
        self.max_attempts = max_attempts
        self.base_delay = base_delay  # seconds
        self.max_delay = max_delay  # seconds

        self.pg_conn = coordinator.pg_conn
        self.running = False

        logger.info(f"🔄 RetryQueueProcessor initialized (max_attempts={max_attempts})")

    def enqueue(
        self,
        operation: DBOperation,
        error_message: str,
        transaction_id: Optional[str] = None,
    ) -> str:
        """
        Add failed operation to retry queue.

        Returns: queue_id
        """
        import uuid

        queue_id = str(uuid.uuid4())

        try:
            cursor = self.pg_conn.cursor()
            cursor.execute(
                """
                INSERT INTO retry_queue (
                    id, transaction_id, database, operation_type,
                    payload, status, attempts, max_attempts,
                    error_message, created_at, next_retry
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    queue_id,
                    transaction_id,
                    operation.database.value,
                    operation.operation_type,
                    psycopg2.extras.Json(operation.payload),
                    RetryStatus.PENDING.value,
                    0,
                    self.max_attempts,
                    error_message,
                    datetime.now(),
                    datetime.now() + timedelta(seconds=self.base_delay),
                ),
            )
            self.pg_conn.commit()

            logger.info(f"➕ Enqueued operation {queue_id} for retry")
            return queue_id

        except Exception as e:
            logger.error(f"❌ Failed to enqueue operation: {e}")
            self.pg_conn.rollback()
            raise

    def get_pending_operations(self) -> List[Dict[str, Any]]:
        """Get operations ready for retry."""
        try:
            cursor = self.pg_conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                SELECT * FROM retry_queue
                WHERE status = %s
                  AND next_retry <= %s
                  AND attempts < max_attempts
                ORDER BY next_retry ASC
                LIMIT 100
                """,
                (RetryStatus.PENDING.value, datetime.now()),
            )

            operations = cursor.fetchall()
            return [dict(op) for op in operations]

        except Exception as e:
            logger.error(f"❌ Failed to fetch pending operations: {e}")
            return []

    async def process_operation(self, queued_op: Dict[str, Any]) -> bool:
        """
        Process a single queued operation.

        Returns: True if succeeded, False if failed
        """
        queue_id = queued_op['id']
        attempts = queued_op['attempts']

        logger.info(f"⚙️  Processing queued operation {queue_id} (attempt {attempts + 1}/{queued_op['max_attempts']})")

        # Update status to PROCESSING
        try:
            cursor = self.pg_conn.cursor()
            cursor.execute(
                """
                UPDATE retry_queue
                SET status = %s, last_attempt = %s, attempts = attempts + 1
                WHERE id = %s
                """,
                (RetryStatus.PROCESSING.value, datetime.now(), queue_id),
            )
            self.pg_conn.commit()
        except Exception as e:
            logger.error(f"❌ Failed to update status: {e}")
            self.pg_conn.rollback()
            return False

        # Reconstruct DBOperation
        database = DatabaseType(queued_op['database'])
        operation_type = queued_op['operation_type']
        payload = queued_op['payload']

        # Create operation based on database type
        operation = self._create_operation(database, operation_type, payload)

        # Execute operation
        try:
            result = await operation.execute_fn(payload)

            # Success - mark as SUCCEEDED
            cursor = self.pg_conn.cursor()
            cursor.execute(
                """
                UPDATE retry_queue
                SET status = %s, completed_at = %s
                WHERE id = %s
                """,
                (RetryStatus.SUCCEEDED.value, datetime.now(), queue_id),
            )
            self.pg_conn.commit()

            logger.info(f"✅ Operation {queue_id} succeeded")
            return True

        except Exception as e:
            error_message = str(e)
            logger.error(f"❌ Operation {queue_id} failed: {error_message}")

            # Calculate next retry time with exponential backoff
            attempts = queued_op['attempts'] + 1
            delay = min(self.base_delay * (2 ** attempts), self.max_delay)
            next_retry = datetime.now() + timedelta(seconds=delay)

            # Check if max attempts reached
            if attempts >= queued_op['max_attempts']:
                # Move to dead letter queue
                cursor = self.pg_conn.cursor()
                cursor.execute(
                    """
                    UPDATE retry_queue
                    SET status = %s, error_message = %s, completed_at = %s
                    WHERE id = %s
                    """,
                    (RetryStatus.DEAD_LETTER.value, error_message, datetime.now(), queue_id),
                )
                self.pg_conn.commit()

                logger.warning(f"💀 Operation {queue_id} moved to dead letter queue")
                return False

            # Schedule next retry
            cursor = self.pg_conn.cursor()
            cursor.execute(
                """
                UPDATE retry_queue
                SET status = %s, error_message = %s, next_retry = %s
                WHERE id = %s
                """,
                (RetryStatus.PENDING.value, error_message, next_retry, queue_id),
            )
            self.pg_conn.commit()

            logger.info(f"🔄 Operation {queue_id} scheduled for retry at {next_retry} (delay: {delay}s)")
            return False

    def _create_operation(
        self, database: DatabaseType, operation_type: str, payload: Dict[str, Any]
    ) -> DBOperation:
        """Create DBOperation from queued data."""

        # Define execute and rollback functions based on database type
        if database == DatabaseType.POSTGRESQL:
            async def execute_fn(p):
                cursor = self.coordinator.pg_conn.cursor()
                if operation_type == "insert":
                    cursor.execute(
                        "INSERT INTO enhanced_tags (id, name, category, file_path, timestamp) VALUES (%s, %s, %s, %s, %s)",
                        (p["id"], p["name"], p["category"], p["file_path"], datetime.now()),
                    )
                elif operation_type == "update":
                    cursor.execute(
                        "UPDATE enhanced_tags SET name = %s WHERE id = %s",
                        (p["name"], p["id"]),
                    )
                elif operation_type == "delete":
                    cursor.execute("DELETE FROM enhanced_tags WHERE id = %s", (p["id"],))
                self.coordinator.pg_conn.commit()
                return p["id"]

            async def rollback_fn(p, result):
                cursor = self.coordinator.pg_conn.cursor()
                cursor.execute("DELETE FROM enhanced_tags WHERE id = %s", (result,))
                self.coordinator.pg_conn.commit()

        elif database == DatabaseType.QDRANT:
            async def execute_fn(p):
                from qdrant_client.models import PointStruct
                self.coordinator.qdrant_client.upsert(
                    collection_name="knowledge_base_v2",
                    points=[
                        PointStruct(
                            id=p["id"],
                            vector=p["embedding"],
                            payload={"name": p["name"], "category": p["category"]},
                        )
                    ],
                )
                return p["id"]

            async def rollback_fn(p, result):
                self.coordinator.qdrant_client.delete(
                    collection_name="knowledge_base_v2",
                    points_selector=[result],
                )

        elif database == DatabaseType.NEO4J:
            async def execute_fn(p):
                with self.coordinator.neo4j_driver.session() as session:
                    result = session.run(
                        "CREATE (f:File {path: $path, name: $name}) RETURN f",
                        path=p["file_path"],
                        name=p["name"],
                    )
                    return result.single()[0].id

            async def rollback_fn(p, result):
                with self.coordinator.neo4j_driver.session() as session:
                    session.run("MATCH (f:File) WHERE id(f) = $id DELETE f", id=result)

        else:
            # Default no-op functions
            async def execute_fn(p):
                pass

            async def rollback_fn(p, result):
                pass

        return DBOperation(
            database=database,
            operation_type=operation_type,
            execute_fn=execute_fn,
            rollback_fn=rollback_fn,
            payload=payload,
        )

    async def process_queue(self):
        """Process all pending operations in the queue."""
        logger.info("🔄 Processing retry queue...")

        pending_ops = self.get_pending_operations()

        if not pending_ops:
            logger.info("   No pending operations")
            return

        logger.info(f"   Found {len(pending_ops)} pending operations")

        succeeded = 0
        failed = 0

        for op in pending_ops:
            success = await self.process_operation(op)
            if success:
                succeeded += 1
            else:
                failed += 1

        logger.info(f"✅ Queue processing complete: {succeeded} succeeded, {failed} failed")

    async def run_forever(self, interval: int = 10):
        """Run queue processor in background."""
        self.running = True
        logger.info(f"🚀 Starting retry queue processor (interval={interval}s)")

        while self.running:
            try:
                await self.process_queue()
            except Exception as e:
                logger.error(f"❌ Queue processing error: {e}")

            await asyncio.sleep(interval)

        logger.info("🛑 Retry queue processor stopped")

    def stop(self):
        """Stop the queue processor."""
        self.running = False

    def get_stats(self) -> Dict[str, Any]:
        """Get retry queue statistics."""
        try:
            cursor = self.pg_conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                SELECT
                    status,
                    COUNT(*) as count,
                    AVG(attempts) as avg_attempts
                FROM retry_queue
                GROUP BY status
                """
            )

            stats_by_status = {row['status']: dict(row) for row in cursor.fetchall()}

            cursor.execute("SELECT COUNT(*) as total FROM retry_queue")
            total = cursor.fetchone()['total']

            return {
                "total_operations": total,
                "by_status": stats_by_status,
            }

        except Exception as e:
            logger.error(f"❌ Failed to get stats: {e}")
            return {}


# Example usage
async def example_usage():
    """Example of using the RetryQueueProcessor."""
    coordinator = MultiDBCoordinator()
    coordinator.connect()

    processor = RetryQueueProcessor(coordinator, max_attempts=3)

    # Simulate a failed operation
    import uuid
    test_payload = {
        "id": str(uuid.uuid4()),
        "name": "test_tag",
        "category": "file",
        "file_path": "/test/file.ts",
        "embedding": [0.1] * 384,
    }

    operation = DBOperation(
        database=DatabaseType.POSTGRESQL,
        operation_type="insert",
        execute_fn=lambda p: None,  # Will be replaced
        rollback_fn=lambda p, r: None,
        payload=test_payload,
    )

    # Enqueue operation
    queue_id = processor.enqueue(operation, "Simulated failure", transaction_id=None)
    print(f"✅ Enqueued operation: {queue_id}")

    # Process queue
    await processor.process_queue()

    # Get stats
    stats = processor.get_stats()
    print(f"\n📊 Queue Stats: {stats}")

    coordinator.disconnect()


if __name__ == "__main__":
    asyncio.run(example_usage())
