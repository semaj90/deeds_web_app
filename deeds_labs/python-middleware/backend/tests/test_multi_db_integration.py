#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - Multi-DB Integration Tests
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Test multi-database coordination with phase89 indexer
Task: 2.2 - Property test for atomicity
═══════════════════════════════════════════════════════════════════════
"""

import sys
import os
import asyncio
import uuid
import pytest
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from backend.services.multi_db_coordinator import (
    MultiDBCoordinator,
    DBOperation,
    DatabaseType,
    TransactionStatus
)
from backend.services.retry_queue_processor import RetryQueueProcessor
from backend.services.change_propagate_service import (
    ChangePropagateService,
    ChangeEvent,
    ChangeType
)


class TestMultiDBCoordinator:
    """Test multi-database coordinator."""

    @pytest.fixture
    def coordinator(self):
        """Create coordinator instance."""
        coord = MultiDBCoordinator()
        coord.connect()
        yield coord
        coord.disconnect()

    @pytest.mark.asyncio
    async def test_atomic_transaction_success(self, coordinator):
        """
        Property 2: Multi-Database Atomicity
        Test that all operations complete atomically on success.
        """
        transaction = coordinator.create_transaction()

        test_id = str(uuid.uuid4())
        test_payload = {
            "id": test_id,
            "name": "test_tag_success",
            "category": "file",
            "file_path": "/test/success.ts",
            "embedding": [0.1] * 384,
        }

        # PostgreSQL operation
        async def insert_postgres(payload):
            cursor = coordinator.pg_conn.cursor()
            cursor.execute(
                "INSERT INTO enhanced_tags (id, name, category, file_path, timestamp) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                (payload["id"], payload["name"], payload["category"], payload["file_path"], datetime.now()),
            )
            coordinator.pg_conn.commit()
            return cursor.fetchone()[0]

        async def rollback_postgres(payload, result):
            cursor = coordinator.pg_conn.cursor()
            cursor.execute("DELETE FROM enhanced_tags WHERE id = %s", (result,))
            coordinator.pg_conn.commit()

        # Qdrant operation
        async def insert_qdrant(payload):
            from qdrant_client.models import PointStruct
            coordinator.qdrant_client.upsert(
                collection_name="knowledge_base_v2",
                points=[
                    PointStruct(
                        id=payload["id"],
                        vector=payload["embedding"],
                        payload={"name": payload["name"], "category": payload["category"]},
                    )
                ],
            )
            return payload["id"]

        async def rollback_qdrant(payload, result):
            coordinator.qdrant_client.delete(
                collection_name="knowledge_base_v2",
                points_selector=[result],
            )

        # Add operations
        coordinator.add_operation(
            transaction,
            DatabaseType.POSTGRESQL,
            "insert",
            insert_postgres,
            rollback_postgres,
            test_payload,
        )

        coordinator.add_operation(
            transaction,
            DatabaseType.QDRANT,
            "insert",
            insert_qdrant,
            rollback_qdrant,
            test_payload,
        )

        # Execute transaction
        success = await coordinator.execute_transaction(transaction)

        # Verify success
        assert success is True
        assert transaction.status == TransactionStatus.COMMITTED

        # Verify data in PostgreSQL
        cursor = coordinator.pg_conn.cursor()
        cursor.execute("SELECT * FROM enhanced_tags WHERE id = %s", (test_id,))
        pg_result = cursor.fetchone()
        assert pg_result is not None

        # Verify data in Qdrant
        qdrant_result = coordinator.qdrant_client.retrieve(
            collection_name="knowledge_base_v2",
            ids=[test_id],
        )
        assert len(qdrant_result) == 1

        # Cleanup
        cursor.execute("DELETE FROM enhanced_tags WHERE id = %s", (test_id,))
        coordinator.pg_conn.commit()
        coordinator.qdrant_client.delete(
            collection_name="knowledge_base_v2",
            points_selector=[test_id],
        )

    @pytest.mark.asyncio
    async def test_atomic_transaction_rollback(self, coordinator):
        """
        Property 2: Multi-Database Atomicity
        Test that all operations rollback on failure.
        """
        transaction = coordinator.create_transaction()

        test_id = str(uuid.uuid4())
        test_payload = {
            "id": test_id,
            "name": "test_tag_rollback",
            "category": "file",
            "file_path": "/test/rollback.ts",
            "embedding": [0.1] * 384,
        }

        # PostgreSQL operation (will succeed)
        async def insert_postgres(payload):
            cursor = coordinator.pg_conn.cursor()
            cursor.execute(
                "INSERT INTO enhanced_tags (id, name, category, file_path, timestamp) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                (payload["id"], payload["name"], payload["category"], payload["file_path"], datetime.now()),
            )
            coordinator.pg_conn.commit()
            return cursor.fetchone()[0]

        async def rollback_postgres(payload, result):
            cursor = coordinator.pg_conn.cursor()
            cursor.execute("DELETE FROM enhanced_tags WHERE id = %s", (result,))
            coordinator.pg_conn.commit()

        # Failing operation
        async def failing_operation(payload):
            raise Exception("Simulated failure")

        async def rollback_failing(payload, result):
            pass

        # Add operations
        coordinator.add_operation(
            transaction,
            DatabaseType.POSTGRESQL,
            "insert",
            insert_postgres,
            rollback_postgres,
            test_payload,
        )

        coordinator.add_operation(
            transaction,
            DatabaseType.QDRANT,
            "insert",
            failing_operation,
            rollback_failing,
            test_payload,
        )

        # Execute transaction (should fail)
        success = await coordinator.execute_transaction(transaction)

        # Verify failure
        assert success is False
        assert transaction.status == TransactionStatus.ROLLED_BACK

        # Verify rollback - data should NOT exist in PostgreSQL
        cursor = coordinator.pg_conn.cursor()
        cursor.execute("SELECT * FROM enhanced_tags WHERE id = %s", (test_id,))
        pg_result = cursor.fetchone()
        assert pg_result is None

    @pytest.mark.asyncio
    async def test_retry_queue_processor(self, coordinator):
        """Test retry queue processor with exponential backoff."""
        processor = RetryQueueProcessor(coordinator, max_attempts=3)

        test_id = str(uuid.uuid4())
        test_payload = {
            "id": test_id,
            "name": "test_retry",
            "category": "file",
            "file_path": "/test/retry.ts",
            "embedding": [0.1] * 384,
        }

        operation = DBOperation(
            database=DatabaseType.POSTGRESQL,
            operation_type="insert",
            execute_fn=lambda p: None,
            rollback_fn=lambda p, r: None,
            payload=test_payload,
        )

        # Enqueue operation
        queue_id = processor.enqueue(operation, "Test error", transaction_id=None)
        assert queue_id is not None

        # Verify operation is in queue
        pending = processor.get_pending_operations()
        assert len(pending) > 0
        assert any(op['id'] == queue_id for op in pending)

        # Get stats
        stats = processor.get_stats()
        assert stats['total_operations'] > 0

    @pytest.mark.asyncio
    async def test_change_propagate_service(self, coordinator):
        """Test change propagation across databases."""
        service = ChangePropagateService(coordinator)

        test_id = str(uuid.uuid4())

        event = ChangeEvent(
            change_type=ChangeType.TAG_CREATED,
            entity_id=test_id,
            entity_type='tag',
            new_data={
                'id': test_id,
                'name': 'test_propagate',
                'category': 'file',
                'file_path': '/test/propagate.ts',
                'embedding': [0.1] * 384,
            },
        )

        # Propagate change
        success = await service.propagate_change(event)

        # Verify success
        assert success is True

        # Verify data in PostgreSQL
        cursor = coordinator.pg_conn.cursor()
        cursor.execute("SELECT * FROM enhanced_tags WHERE id = %s", (test_id,))
        pg_result = cursor.fetchone()
        assert pg_result is not None

        # Cleanup
        cursor.execute("DELETE FROM enhanced_tags WHERE id = %s", (test_id,))
        coordinator.pg_conn.commit()
        coordinator.qdrant_client.delete(
            collection_name="knowledge_base_v2",
            points_selector=[test_id],
        )

    @pytest.mark.asyncio
    async def test_tag_rename_propagation(self, coordinator):
        """
        Property 7: Tag Rename Atomicity
        Test that tag rename updates all databases atomically.
        """
        service = ChangePropagateService(coordinator)

        test_id = str(uuid.uuid4())
        old_name = "old_tag_name"
        new_name = "new_tag_name"

        # Create initial tag
        create_event = ChangeEvent(
            change_type=ChangeType.TAG_CREATED,
            entity_id=test_id,
            entity_type='tag',
            new_data={
                'id': test_id,
                'name': old_name,
                'category': 'file',
                'file_path': '/test/rename.ts',
                'embedding': [0.1] * 384,
            },
        )

        await service.propagate_change(create_event)

        # Rename tag
        success = await service.propagate_tag_rename(
            test_id,
            old_name,
            new_name,
            {
                'category': 'file',
                'file_path': '/test/rename.ts',
                'embedding': [0.1] * 384,
            },
        )

        # Verify success
        assert success is True

        # Verify new name in PostgreSQL
        cursor = coordinator.pg_conn.cursor()
        cursor.execute("SELECT name FROM enhanced_tags WHERE id = %s", (test_id,))
        pg_result = cursor.fetchone()
        assert pg_result is not None
        assert pg_result[0] == new_name

        # Cleanup
        cursor.execute("DELETE FROM enhanced_tags WHERE id = %s", (test_id,))
        coordinator.pg_conn.commit()
        coordinator.qdrant_client.delete(
            collection_name="knowledge_base_v2",
            points_selector=[test_id],
        )


class TestPhase89Integration:
    """Test integration with phase89 indexer."""

    @pytest.fixture
    def coordinator(self):
        """Create coordinator instance."""
        coord = MultiDBCoordinator()
        coord.connect()
        yield coord
        coord.disconnect()

    @pytest.mark.asyncio
    async def test_phase89_indexer_integration(self, coordinator):
        """Test integration with phase89 enhanced codebase indexer."""
        # Import phase89 indexer
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../sveltekit-frontend/scripts'))
        from phase89_enhanced_codebase_indexer import EnhancedCodebaseIndexer

        indexer = EnhancedCodebaseIndexer()

        # Create a test file
        test_file = "/tmp/test_integration.ts"
        with open(test_file, 'w') as f:
            f.write("""
// Test file for integration
export function testFunction() {
    // TODO: Implement this
    return "test";
}
""")

        # Index the file
        result = indexer.index_file(test_file)

        # Verify result
        assert result is not None
        assert result['file_path'] == test_file
        assert result['summary'] is not None
        assert result['tags'] is not None

        # Verify data in Qdrant
        point_id = result['point_id']
        qdrant_result = coordinator.qdrant_client.retrieve(
            collection_name='phase89_codebase_index',
            ids=[point_id],
        )
        assert len(qdrant_result) == 1

        # Cleanup
        os.remove(test_file)


def run_tests():
    """Run all tests."""
    pytest.main([__file__, '-v', '-s'])


if __name__ == "__main__":
    run_tests()
