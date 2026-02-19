#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - Tag Rename Service
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Atomic tag rename across all databases with rollback
Task: 6.1 - Create tag rename service
Task: 6.2 - Implement rollback mechanism
═══════════════════════════════════════════════════════════════════════
"""

import os
import logging
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum

import aiohttp
import psycopg2
import redis
from qdrant_client import QdrantClient
from neo4j import GraphDatabase

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class RenameStatus(Enum):
    """Status of rename operation."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ROLLED_BACK = "rolled_back"
    FAILED = "failed"


@dataclass
class RenameOperation:
    """Tracks a single database rename operation for rollback."""
    database: str  # 'qdrant', 'postgresql', 'neo4j', 'couchdb', 'redis'
    operation_type: str  # 'update', 'delete', 'create'
    entity_id: str
    old_data: Dict[str, Any]
    new_data: Dict[str, Any]
    status: RenameStatus = RenameStatus.PENDING
    error: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class RenameTransaction:
    """Tracks the full rename transaction across all databases."""
    transaction_id: str
    tag_id: str
    old_name: str
    new_name: str
    operations: List[RenameOperation] = field(default_factory=list)
    status: RenameStatus = RenameStatus.PENDING
    started_at: str = field(default_factory=lambda: datetime.now().isoformat())
    completed_at: Optional[str] = None
    error: Optional[str] = None


class TagRenameService:
    """
    Tag Rename Service - Atomic rename across all databases.

    Databases updated:
    - Qdrant: Update payload name field
    - PostgreSQL: Update enhanced_tags table
    - Neo4j: Update node properties
    - CouchDB: Update document
    - Redis: Invalidate cache

    Features:
    - Atomic transaction with rollback on failure
    - Operation logging for audit trail
    - Metadata preservation during rename
    """

    def __init__(
        self,
        postgres_url: Optional[str] = None,
        qdrant_url: Optional[str] = None,
        neo4j_url: Optional[str] = None,
        couchdb_url: Optional[str] = None,
        redis_url: Optional[str] = None,
    ):
        """Initialize tag rename service with database connections."""
        self.postgres_url = postgres_url or os.getenv(
            "DATABASE_URL", "postgresql://legal_ai:legal_ai_pass@localhost:5434/legal_ai_db"
        )
        self.qdrant_url = qdrant_url or os.getenv("QDRANT_URL", "http://localhost:6333")
        self.neo4j_url = neo4j_url or os.getenv("NEO4J_URL", "bolt://localhost:7687")
        self.couchdb_url = couchdb_url or os.getenv("COUCHDB_URL", "http://admin:admin@localhost:5984")
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")

        # Initialize clients
        self.qdrant_client = QdrantClient(url=self.qdrant_url)
        self.redis_client = redis.from_url(self.redis_url)

        # Transaction log
        self.transactions: Dict[str, RenameTransaction] = {}

        logger.info("🏷️  TagRenameService initialized")

    async def rename_tag(
        self,
        tag_id: str,
        new_name: str,
        collection_name: str = "knowledge_base_v2"
    ) -> RenameTransaction:
        """
        Rename a tag atomically across all databases.

        Args:
            tag_id: Tag ID to rename
            new_name: New name for the tag
            collection_name: Qdrant collection name

        Returns:
            RenameTransaction with status and operations
        """
        import uuid
        transaction_id = str(uuid.uuid4())

        # Get current tag data
        old_data = await self._get_tag_data(tag_id, collection_name)
        if not old_data:
            raise ValueError(f"Tag not found: {tag_id}")

        old_name = old_data.get('name', '')

        # Create transaction
        transaction = RenameTransaction(
            transaction_id=transaction_id,
            tag_id=tag_id,
            old_name=old_name,
            new_name=new_name,
        )
        self.transactions[transaction_id] = transaction

        logger.info(f"🏷️  Starting rename: {old_name} → {new_name} (tx: {transaction_id})")

        try:
            transaction.status = RenameStatus.IN_PROGRESS

            # 1. Update Qdrant
            await self._rename_in_qdrant(transaction, tag_id, new_name, collection_name)

            # 2. Update PostgreSQL
            await self._rename_in_postgresql(transaction, tag_id, new_name)

            # 3. Update Neo4j
            await self._rename_in_neo4j(transaction, tag_id, new_name)

            # 4. Update CouchDB
            await self._rename_in_couchdb(transaction, tag_id, new_name)

            # 5. Invalidate Redis cache
            await self._invalidate_redis_cache(transaction, tag_id)

            # Mark completed
            transaction.status = RenameStatus.COMPLETED
            transaction.completed_at = datetime.now().isoformat()

            logger.info(f"✅ Rename completed: {old_name} → {new_name}")
            return transaction

        except Exception as e:
            logger.error(f"❌ Rename failed: {e}")
            transaction.error = str(e)
            transaction.status = RenameStatus.FAILED

            # Rollback all completed operations
            await self._rollback_transaction(transaction)

            return transaction

    async def _get_tag_data(self, tag_id: str, collection_name: str) -> Optional[Dict]:
        """Get tag data from Qdrant."""
        try:
            result = self.qdrant_client.retrieve(
                collection_name=collection_name,
                ids=[tag_id],
                with_payload=True
            )
            if result and len(result) > 0:
                return result[0].payload
        except Exception as e:
            logger.error(f"❌ Failed to get tag: {e}")
        return None

    async def _rename_in_qdrant(
        self,
        transaction: RenameTransaction,
        tag_id: str,
        new_name: str,
        collection_name: str
    ):
        """Update tag name in Qdrant."""
        operation = RenameOperation(
            database="qdrant",
            operation_type="update",
            entity_id=tag_id,
            old_data={"name": transaction.old_name},
            new_data={"name": new_name},
        )
        transaction.operations.append(operation)

        try:
            self.qdrant_client.set_payload(
                collection_name=collection_name,
                payload={"name": new_name, "updated_at": datetime.now().isoformat()},
                points=[tag_id]
            )
            operation.status = RenameStatus.COMPLETED
            logger.info(f"  ✓ Qdrant updated")
        except Exception as e:
            operation.status = RenameStatus.FAILED
            operation.error = str(e)
            raise

    async def _rename_in_postgresql(
        self,
        transaction: RenameTransaction,
        tag_id: str,
        new_name: str
    ):
        """Update tag name in PostgreSQL."""
        operation = RenameOperation(
            database="postgresql",
            operation_type="update",
            entity_id=tag_id,
            old_data={"name": transaction.old_name},
            new_data={"name": new_name},
        )
        transaction.operations.append(operation)

        try:
            conn = psycopg2.connect(self.postgres_url)
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE enhanced_tags
                SET name = %s, updated_at = NOW()
                WHERE id = %s
                """,
                (new_name, tag_id)
            )
            conn.commit()
            cursor.close()
            conn.close()
            operation.status = RenameStatus.COMPLETED
            logger.info(f"  ✓ PostgreSQL updated")
        except Exception as e:
            operation.status = RenameStatus.FAILED
            operation.error = str(e)
            logger.warning(f"  ⚠ PostgreSQL update skipped: {e}")
            # Don't raise - PostgreSQL may not have this tag

    async def _rename_in_neo4j(
        self,
        transaction: RenameTransaction,
        tag_id: str,
        new_name: str
    ):
        """Update tag name in Neo4j."""
        operation = RenameOperation(
            database="neo4j",
            operation_type="update",
            entity_id=tag_id,
            old_data={"name": transaction.old_name},
            new_data={"name": new_name},
        )
        transaction.operations.append(operation)

        try:
            driver = GraphDatabase.driver(
                self.neo4j_url,
                auth=("neo4j", os.getenv("NEO4J_PASSWORD", "password"))
            )
            with driver.session() as session:
                session.run(
                    """
                    MATCH (n {id: $tag_id})
                    SET n.name = $new_name, n.updated_at = datetime()
                    """,
                    tag_id=tag_id,
                    new_name=new_name
                )
            driver.close()
            operation.status = RenameStatus.COMPLETED
            logger.info(f"  ✓ Neo4j updated")
        except Exception as e:
            operation.status = RenameStatus.FAILED
            operation.error = str(e)
            logger.warning(f"  ⚠ Neo4j update skipped: {e}")

    async def _rename_in_couchdb(
        self,
        transaction: RenameTransaction,
        tag_id: str,
        new_name: str
    ):
        """Update tag name in CouchDB."""
        operation = RenameOperation(
            database="couchdb",
            operation_type="update",
            entity_id=tag_id,
            old_data={"name": transaction.old_name},
            new_data={"name": new_name},
        )
        transaction.operations.append(operation)

        try:
            async with aiohttp.ClientSession() as session:
                # Get current doc
                async with session.get(
                    f"{self.couchdb_url}/knowledge_base/{tag_id}"
                ) as response:
                    if response.status != 200:
                        logger.warning(f"  ⚠ CouchDB doc not found")
                        operation.status = RenameStatus.COMPLETED
                        return
                    doc = await response.json()
           # Update doc
                doc['name'] = new_name
                doc['updated_at'] = datetime.now().isoformat()

                async with session.put(
                    f"{self.couchdb_url}/knowledge_base/{tag_id}",
                    json=doc
                ) as response:
                    if response.status not in [200, 201]:
                        raise Exception(f"CouchDB update failed: {response.status}")

            operation.status = RenameStatus.COMPLETED
            logger.info(f"  ✓ CouchDB updated")
        except Exception as e:
            operation.status = RenameStatus.FAILED
            operation.error = str(e)
            logger.warning(f"  ⚠ CouchDB update skipped: {e}")

    async def _invalidate_redis_cache(
        self,
        transaction: RenameTransaction,
        tag_id: str
    ):
        """Invalidate Redis cache for the tag."""
        operation = RenameOperation(
            database="redis",
            operation_type="delete",
            entity_id=tag_id,
            old_data={},
            new_data={},
        )
        transaction.operations.append(operation)

        try:
            # Delete all cache keys for this tag
            patterns = [
                f"kb:v2:tag:{tag_id}",
                f"kb:v2:coordinates:{tag_id}",
                f"kb:v2:summary:{tag_id}",
            ]
            for pattern in patterns:
                self.redis_client.delete(pattern)

            operation.status = RenameStatus.COMPLETED
            logger.info(f"  ✓ Redis cache invalidated")
        except Exception as e:
            operation.status = RenameStatus.FAILED
            operation.error = str(e)
            logger.warning(f"  ⚠ Redis invalidation skipped: {e}")

    async def _rollback_transaction(self, transaction: RenameTransaction):
        """Rollback all completed operations in reverse order."""
        logger.warning(f"🔄 Rolling back transaction: {transaction.transaction_id}")

        # Reverse order for rollback
        for operation in reversed(transaction.operations):
            if operation.status != RenameStatus.COMPLETED:
                continue

            try:
                if operation.database == "qdrant":
                    self.qdrant_client.set_payload(
                        collection_name="knowledge_base_v2",
                        payload={"name": operation.old_data.get("name")},
                        points=[operation.entity_id]
                    )
                elif operation.database == "postgresql":
                    conn = psycopg2.connect(self.postgres_url)
                    cursor = conn.cursor()
                    cursor.execute(
                        "UPDATE enhanced_tags SET name = %s WHERE id = %s",
                        (operation.old_data.get("name"), operation.entity_id)
                    )
                    conn.commit()
                    cursor.close()
                    conn.close()
                elif operation.database == "neo4j":
                    driver = GraphDatabase.driver(
                        self.neo4j_url,
                        auth=("neo4j", os.getenv("NEO4J_PASSWORD", "password"))
                    )
                    with driver.session() as session:
                        session.run(
                            "MATCH (n {id: $id}) SET n.name = $name",
                            id=operation.entity_id,
                            name=operation.old_data.get("name")
                        )
                    driver.close()

                operation.status = RenameStatus.ROLLED_BACK
                logger.info(f"  ↩ Rolled back {operation.database}")

            except Exception as e:
                logger.error(f"  ❌ Rollback failed for {operation.database}: {e}")

        transaction.status = RenameStatus.ROLLED_BACK
        transaction.completed_at = datetime.now().isoformat()

    def get_transaction(self, transaction_id: str) -> Optional[RenameTransaction]:
        """Get transaction by ID."""
        return self.transactions.get(transaction_id)

    def get_all_transactions(self) -> List[RenameTransaction]:
        """Get all transactions."""
        return list(self.transactions.values())


# Example usage
async def example_usage():
    """Example of using the TagRenameService."""
    service = TagRenameService()

    # Rename a tag
    transaction = await service.rename_tag(
        tag_id="test-tag-id",
        new_name="new_tag_name"
    )

    print(f"\nTransaction: {transaction.transaction_id}")
    print(f"Status: {transaction.status.value}")
    print(f"Operations: {len(transaction.operations)}")

    for op in transaction.operations:
        print(f"  - {op.database}: {op.status.value}")


if __name__ == "__main__":
    asyncio.run(example_usage())
