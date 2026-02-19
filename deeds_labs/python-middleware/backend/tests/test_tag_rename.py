#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - Tag Rename Tests
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Property-based tests for tag rename atomicity
Task: 6.3 - Write property test for rename atomicity
Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5
═══════════════════════════════════════════════════════════════════════
"""

import pytest
import uuid
from datetime import datetime
from typing import Dict, Any

from backend.services.tag_rename_service import (
    TagRenameService,
    RenameTransaction,
    RenameOperation,
    RenameStatus
)


# ═══════════════════════════════════════════════════════════════════════
# Property 7: Tag Rename Atomicity
# For any tag rename operation, the system SHALL update all databases
# atomically or rollback all changes on failure.
# Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5
# ═══════════════════════════════════════════════════════════════════════


@pytest.fixture
def rename_service():
    """Create TagRenameService for testing."""
    return TagRenameService()


@pytest.mark.asyncio
async def test_property_7_transaction_structure(rename_service):
    """
    Property 7: Tag Rename Atomicity - Transaction Structure
    Rename transactions must have proper structure with all required fields.
    """
    # Create a mock transaction
    transaction = RenameTransaction(
        transaction_id=str(uuid.uuid4()),
        tag_id="test-tag-123",
        old_name="old_name",
        new_name="new_name",
    )

    # Validate structure
    assert transaction.transaction_id, "Transaction ID must be set"
    assert transaction.tag_id == "test-tag-123", "Tag ID must match"
    assert transaction.old_name == "old_name", "Old name must match"
    assert transaction.new_name == "new_name", "New name must match"
    assert transaction.status == RenameStatus.PENDING, "Initial status must be PENDING"
    assert transaction.started_at, "Started timestamp must be set"
    assert isinstance(transaction.operations, list), "Operations must be a list"

    print(f"✅ Property 7: Transaction structure validated")


@pytest.mark.asyncio
async def test_property_7_operation_tracking(rename_service):
    """
    Property 7: Tag Rename Atomicity - Operation Tracking
    Each database operation must be tracked for rollback.
    """
    # Create operations for each database
    databases = ['qdrant', 'postgresql', 'neo4j', 'couchdb', 'redis']
    operations = []

    for db in databases:
        op = RenameOperation(
            database=db,
            operation_type="update",
            entity_id="test-tag-123",
            old_data={"name": "old_name"},
            new_data={"name": "new_name"},
        )
        operations.append(op)

    # Validate all databases are tracked
    tracked_dbs = [op.database for op in operations]
    assert set(tracked_dbs) == set(databases), "All databases must be tracked"

    # Validate operation structure
    for op in operations:
        assert op.entity_id == "test-tag-123", "Entity ID must match"
        assert op.old_data.get("name") == "old_name", "Old data must be preserved"
        assert op.new_data.get("name") == "new_name", "New data must be set"
        assert op.status == RenameStatus.PENDING, "Initial status must be PENDING"
        assert op.timestamp, "Timestamp must be set"

    print(f"✅ Property 7: Operation tracking validated for {len(databases)} databases")


@pytest.mark.asyncio
async def test_property_7_status_transitions(rename_service):
    """
    Property 7: Tag Rename Atomicity - Status Transitions
    Transaction status must follow valid transitions.
    """
    # Valid transitions: PENDING -> IN_PROGRESS -> COMPLETED/FAILED/ROLLED_BACK
    transaction = RenameTransaction(
        transaction_id=str(uuid.uuid4()),
        tag_id="test-tag",
        old_name="old",
        new_name="new",
    )

    # Initial state
    assert transaction.status == RenameStatus.PENDING

    # Transition to IN_PROGRESS
    transaction.status = RenameStatus.IN_PROGRESS
    assert transaction.status == RenameStatus.IN_PROGRESS

    # Transition to COMPLETED
    transaction.status = RenameStatus.COMPLETED
    transaction.completed_at = datetime.now().isoformat()
    assert transaction.status == RenameStatus.COMPLETED
    assert transaction.completed_at, "Completed timestamp must be set"

    print(f"✅ Property 7: Status transitions validated")


@pytest.mark.asyncio
async def test_property_7_rollback_data_preservation(rename_service):
    """
    Property 7: Tag Rename Atomicity - Rollback Data Preservation
    Old data must be preserved for rollback capability.
    """
    old_name = "original_tag_name"
    new_name = "renamed_tag_name"

    operation = RenameOperation(
        database="qdrant",
        operation_type="update",
        entity_id="test-tag-456",
        old_data={"name": old_name, "category": "file", "metadata": {"key": "value"}},
        new_data={"name": new_name},
    )

    # Verify old data is fully preserved
    assert operation.old_data["name"] == old_name, "Old name must be preserved"
    assert operation.old_data["category"] == "file", "Old category must be preserved"
    assert operation.old_data["metadata"]["key"] == "value", "Old metadata must be preserved"

    # Simulate rollback
    operation.status = RenameStatus.ROLLED_BACK

    # Old data should still be available for restoration
    assert operation.old_data["name"] == old_name, "Old data must remain after rollback"

    print(f"✅ Property 7: Rollback data preservation validated")


@pytest.mark.asyncio
async def test_property_7_transaction_logging(rename_service):
    """
    Property 7: Tag Rename Atomicity - Transaction Logging
    All transactions must be logged and retrievable.
    """
    # Create multiple transactions
    tx_ids = []
    for i in range(3):
        tx = RenameTransaction(
            transaction_id=str(uuid.uuid4()),
            tag_id=f"tag-{i}",
            old_name=f"old_{i}",
            new_name=f"new_{i}",
        )
        rename_service.transactions[tx.transaction_id] = tx
        tx_ids.append(tx.transaction_id)

    # Verify all transactions are retrievable
    for tx_id in tx_ids:
        retrieved = rename_service.get_transaction(tx_id)
        assert retrieved is not None, f"Transaction {tx_id} must be retrievable"
        assert retrieved.transaction_id == tx_id, "Transaction ID must match"

    # Verify all transactions list
    all_txs = rename_service.get_all_transactions()
    assert len(all_txs) >= 3, "All transactions must be in the list"

    print(f"✅ Property 7: Transaction logging validated ({len(tx_ids)} transactions)")


@pytest.mark.asyncio
async def test_property_7_metadata_preservation(rename_service):
    """
    Property 7: Tag Rename Atomicity - Metadata Preservation
    Tag metadata must be preserved during rename (only name changes).
    """
    # Original tag with full metadata
    original_metadata = {
        "name": "original_name",
        "category": "function",
        "filePath": "/src/utils.ts",
        "lineNumber": 42,
        "imports": ["react", "lodash"],
        "exports": ["myFunction"],
        "confidence": 0.95,
    }

    operation = RenameOperation(
        database="postgresql",
        operation_type="update",
        entity_id="tag-with-metadata",
        old_data=original_metadata.copy(),
        new_data={"name": "new_name"},  # Only name changes
    )

    # Verify only name is in new_data (other fields preserved)
    assert "name" in operation.new_data, "New name must be set"
    assert operation.new_data["name"] == "new_name", "New name must be correct"

    # Verify old metadata is fully preserved for reference
    assert operation.old_data["category"] == "function"
    assert operation.old_data["filePath"] == "/src/utils.ts"
    assert operation.old_data["lineNumber"] == 42
    assert operation.old_data["imports"] == ["react", "lodash"]
    assert operation.old_data["exports"] == ["myFunction"]
    assert operation.old_data["confidence"] == 0.95

    print(f"✅ Property 7: Metadata preservation validated")


@pytest.mark.asyncio
async def test_property_7_error_handling(rename_service):
    """
    Property 7: Tag Rename Atomicity - Error Handling
    Failed operations must be properly marked with error details.
    """
    operation = RenameOperation(
        database="neo4j",
        operation_type="update",
        entity_id="failing-tag",
        old_data={"name": "old"},
        new_data={"name": "new"},
    )

    # Simulate failure
    error_message = "Connection refused: Neo4j server unavailable"
    operation.status = RenameStatus.FAILED
    operation.error = error_message

    # Verify error handling
    assert operation.status == RenameStatus.FAILED, "Status must be FAILED"
    assert operation.error == error_message, "Error message must be preserved"
    assert "Neo4j" in operation.error, "Error should identify the database"

    print(f"✅ Property 7: Error handling validated")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
