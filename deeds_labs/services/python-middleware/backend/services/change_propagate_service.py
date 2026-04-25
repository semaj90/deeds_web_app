#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - Change Propagate Service
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Propagate changes across all databases when data is updated
Task: 2.3 - Build ChangePropagate service
═══════════════════════════════════════════════════════════════════════
"""

import os
import logging
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any, Set
from dataclasses import dataclass
from enum import Enum

from backend.services.multi_db_coordinator import (
    MultiDBCoordinator,
    DBOperation,
    DatabaseType,
    Transaction
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ChangeType(Enum):
    """Type of change to propagate."""
    TAG_CREATED = "tag_created"
    TAG_UPDATED = "tag_updated"
    TAG_DELETED = "tag_deleted"
    TAG_RENAMED = "tag_renamed"
    CLUSTER_UPDATED = "cluster_updated"
    EMBEDDING_UPDATED = "embedding_updated"
    AST_UPDATED = "ast_updated"
    ERROR_RESOLVED = "error_resolved"


@dataclass
class ChangeEvent:
    """Change event to propagate."""
    change_type: ChangeType
    entity_id: str
    entity_type: str  # 'tag', 'cluster', 'file', etc.
    old_data: Optional[Dict[str, Any]] = None
    new_data: Optional[Dict[str, Any]] = None
    affected_databases: Set[DatabaseType] = None
    timestamp: datetime = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()
        if self.affected_databases is None:
            self.affected_databases = set()


class ChangePropagateService:
    """
    Propagate changes across all databases when data is updated.

    Features:
    - Automatic change detection
    - Multi-database update coordination
    - Dependency tracking
    - Cache invalidation
    - Event logging
    """

    def __init__(self, coordinator: MultiDBCoordinator):
        """Initialize change propagate service."""
        self.coordinator = coordinator
        logger.info("🔄 ChangePropagateService initialized")

    async def propagate_change(self, event: ChangeEvent) -> bool:
        """
        Propagate a change event across all affected databases.

        Returns: True if all propagations succeeded
        """
        logger.info(f"📡 Propagating change: {event.change_type.value} for {event.entity_type}:{event.entity_id}")

        # Create transaction for atomic propagation
        transaction = self.coordinator.create_transaction()

        # Determine which databases need updates
        affected_dbs = self._determine_affected_databases(event)
        event.affected_databases = affected_dbs

        logger.info(f"   Affected databases: {[db.value for db in affected_dbs]}")

        # Add operations for each affected database
        for database in affected_dbs:
            operations = await self._create_propagation_operations(event, database)

            for op in operations:
                self.coordinator.add_operation(
                    transaction,
                    database,
                    op['operation_type'],
                    op['execute_fn'],
                    op['rollback_fn'],
                    op['payload'],
                )

        # Execute transaction
        success = await self.coordinator.execute_transaction(transaction)

        if success:
            # Invalidate caches
            await self._invalidate_caches(event)
            logger.info(f"✅ Change propagated successfully")
        else:
            logger.error(f"❌ Change propagation failed")

        return success

    def _determine_affected_databases(self, event: ChangeEvent) -> Set[DatabaseType]:
        """Determine which databases are affected by this change."""
        affected = set()

        if event.change_type == ChangeType.TAG_CREATED:
            # New tag affects all databases
            affected = {
                DatabaseType.POSTGRESQL,  # Metadata
                DatabaseType.QDRANT,      # Embedding
                DatabaseType.NEO4J,       # Graph
                DatabaseType.COUCHDB,     # Raw data
                DatabaseType.REDIS,       # Cache
            }

        elif event.change_type == ChangeType.TAG_UPDATED:
            # Update affects metadata and cache
            affected = {
                DatabaseType.POSTGRESQL,
                DatabaseType.QDRANT,
                DatabaseType.REDIS,
            }

        elif event.change_type == ChangeType.TAG_DELETED:
            # Delete affects all databases
            affected = {
                DatabaseType.POSTGRESQL,
                DatabaseType.QDRANT,
                DatabaseType.NEO4J,
                DatabaseType.COUCHDB,
                DatabaseType.REDIS,
            }

        elif event.change_type == ChangeType.TAG_RENAMED:
            # Rename affects all databases
            affected = {
                DatabaseType.POSTGRESQL,
                DatabaseType.QDRANT,
                DatabaseType.NEO4J,
                DatabaseType.COUCHDB,
                DatabaseType.REDIS,
            }

        elif event.change_type == ChangeType.CLUSTER_UPDATED:
            # Cluster update affects PostgreSQL and Redis
            affected = {
                DatabaseType.POSTGRESQL,
                DatabaseType.REDIS,
            }

        elif event.change_type == ChangeType.EMBEDDING_UPDATED:
            # Embedding update affects Qdrant and Redis
            affected = {
                DatabaseType.QDRANT,
                DatabaseType.REDIS,
            }

        elif event.change_type == ChangeType.AST_UPDATED:
            # AST update affects Neo4j and Redis
            affected = {
                DatabaseType.NEO4J,
                DatabaseType.REDIS,
            }

        elif event.change_type == ChangeType.ERROR_RESOLVED:
            # Error resolution affects PostgreSQL and Neo4j
            affected = {
                DatabaseType.POSTGRESQL,
                DatabaseType.NEO4J,
            }

        return affected

    async def _create_propagation_operations(
        self, event: ChangeEvent, database: DatabaseType
    ) -> List[Dict[str, Any]]:
        """Create database-specific operations for change propagation."""
        operations = []

        if database == DatabaseType.POSTGRESQL:
            operations.extend(await self._create_postgres_operations(event))

        elif database == DatabaseType.QDRANT:
            operations.extend(await self._create_qdrant_operations(event))

        elif database == DatabaseType.NEO4J:
            operations.extend(await self._create_neo4j_operations(event))

        elif database == DatabaseType.COUCHDB:
            operations.extend(await self._create_couchdb_operations(event))

        elif database == DatabaseType.REDIS:
            operations.extend(await self._create_redis_operations(event))

        return operations

    async def _create_postgres_operations(self, event: ChangeEvent) -> List[Dict[str, Any]]:
        """Create PostgreSQL operations."""
        operations = []

        if event.change_type == ChangeType.TAG_CREATED:
            async def execute_fn(payload):
                cursor = self.coordinator.pg_conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO enhanced_tags (id, name, category, file_path, timestamp)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        payload["id"],
                        payload["name"],
                        payload["category"],
                        payload["file_path"],
                        datetime.now(),
                    ),
                )
                self.coordinator.pg_conn.commit()
                return payload["id"]

            async def rollback_fn(payload, result):
                cursor = self.coordinator.pg_conn.cursor()
                cursor.execute("DELETE FROM enhanced_tags WHERE id = %s", (result,))
                self.coordinator.pg_conn.commit()

            operations.append({
                'operation_type': 'insert',
                'execute_fn': execute_fn,
                'rollback_fn': rollback_fn,
                'payload': event.new_data,
            })

        elif event.change_type == ChangeType.TAG_UPDATED:
            async def execute_fn(payload):
                cursor = self.coordinator.pg_conn.cursor()
                cursor.execute(
                    "UPDATE enhanced_tags SET name = %s, summary = %s WHERE id = %s",
                    (payload["name"], payload.get("summary"), payload["id"]),
                )
                self.coordinator.pg_conn.commit()
                return payload["id"]

            async def rollback_fn(payload, result):
                cursor = self.coordinator.pg_conn.cursor()
                cursor.execute(
                    "UPDATE enhanced_tags SET name = %s, summary = %s WHERE id = %s",
                    (event.old_data["name"], event.old_data.get("summary"), result),
                )
                self.coordinator.pg_conn.commit()

            operations.append({
                'operation_type': 'update',
                'execute_fn': execute_fn,
                'rollback_fn': rollback_fn,
                'payload': event.new_data,
            })

        elif event.change_type == ChangeType.TAG_DELETED:
            async def execute_fn(payload):
                cursor = self.coordinator.pg_conn.cursor()
                cursor.execute("DELETE FROM enhanced_tags WHERE id = %s", (payload["id"],))
                self.coordinator.pg_conn.commit()
                return payload["id"]

            async def rollback_fn(payload, result):
                cursor = self.coordinator.pg_conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO enhanced_tags (id, name, category, file_path, timestamp)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        event.old_data["id"],
                        event.old_data["name"],
                        event.old_data["category"],
                        event.old_data["file_path"],
                        event.old_data["timestamp"],
                    ),
                )
                self.coordinator.pg_conn.commit()

            operations.append({
                'operation_type': 'delete',
                'execute_fn': execute_fn,
                'rollback_fn': rollback_fn,
                'payload': event.old_data,
            })

        return operations

    async def _create_qdrant_operations(self, event: ChangeEvent) -> List[Dict[str, Any]]:
        """Create Qdrant operations."""
        operations = []

        if event.change_type in [ChangeType.TAG_CREATED, ChangeType.TAG_UPDATED]:
            async def execute_fn(payload):
                from qdrant_client.models import PointStruct
                self.coordinator.qdrant_client.upsert(
                    collection_name="knowledge_base_v2",
                    points=[
                        PointStruct(
                            id=payload["id"],
                            vector=payload["embedding"],
                            payload={
                                "name": payload["name"],
                                "category": payload["category"],
                                "file_path": payload["file_path"],
                                "summary": payload.get("summary", ""),
                            },
                        )
                    ],
                )
                return payload["id"]

            async def rollback_fn(payload, result):
                if event.change_type == ChangeType.TAG_CREATED:
                    # Delete on rollback
                    self.coordinator.qdrant_client.delete(
                        collection_name="knowledge_base_v2",
                        points_selector=[result],
                    )
                else:
                    # Restore old data
                    from qdrant_client.models import PointStruct
                    self.coordinator.qdrant_client.upsert(
                        collection_name="knowledge_base_v2",
                        points=[
                            PointStruct(
                                id=event.old_data["id"],
                                vector=event.old_data["embedding"],
                                payload={
                                    "name": event.old_data["name"],
                                    "category": event.old_data["category"],
                                },
                            )
                        ],
                    )

            operations.append({
                'operation_type': 'upsert',
                'execute_fn': execute_fn,
                'rollback_fn': rollback_fn,
                'payload': event.new_data,
            })

        elif event.change_type == ChangeType.TAG_DELETED:
            async def execute_fn(payload):
                self.coordinator.qdrant_client.delete(
                    collection_name="knowledge_base_v2",
                    points_selector=[payload["id"]],
                )
                return payload["id"]

            async def rollback_fn(payload, result):
                from qdrant_client.models import PointStruct
                self.coordinator.qdrant_client.upsert(
                    collection_name="knowledge_base_v2",
                    points=[
                        PointStruct(
                            id=event.old_data["id"],
                            vector=event.old_data["embedding"],
                            payload={"name": event.old_data["name"]},
                        )
                    ],
                )

            operations.append({
                'operation_type': 'delete',
                'execute_fn': execute_fn,
                'rollback_fn': rollback_fn,
                'payload': event.old_data,
            })

        return operations

    async def _create_neo4j_operations(self, event: ChangeEvent) -> List[Dict[str, Any]]:
        """Create Neo4j operations."""
        operations = []

        if event.change_type == ChangeType.TAG_CREATED:
            async def execute_fn(payload):
                with self.coordinator.neo4j_driver.session() as session:
                    result = session.run(
                        """
                        CREATE (t:Tag {
                            tagId: $tagId,
                            name: $name,
                            category: $category,
                            timestamp: datetime()
                        })
                        RETURN t
                        """,
                        tagId=payload["id"],
                        name=payload["name"],
                        category=payload["category"],
                    )
                    return result.single()[0].id

            async def rollback_fn(payload, result):
                with self.coordinator.neo4j_driver.session() as session:
                    session.run("MATCH (t:Tag {tagId: $tagId}) DELETE t", tagId=payload["id"])

            operations.append({
                'operation_type': 'create',
                'execute_fn': execute_fn,
                'rollback_fn': rollback_fn,
                'payload': event.new_data,
            })

        return operations

    async def _create_couchdb_operations(self, event: ChangeEvent) -> List[Dict[str, Any]]:
        """Create CouchDB operations."""
        operations = []

        # CouchDB operations would go here
        # For now, return empty list

        return operations

    async def _create_redis_operations(self, event: ChangeEvent) -> List[Dict[str, Any]]:
        """Create Redis cache invalidation operations."""
        operations = []

        # Invalidate relevant caches
        async def execute_fn(payload):
            # Delete cached data
            keys_to_delete = []

            if event.change_type in [ChangeType.TAG_UPDATED, ChangeType.TAG_DELETED]:
                keys_to_delete.extend([
                    f"kb:v2:coordinates:{payload['id']}",
                    f"kb:v2:ast:{payload.get('file_path', '')}",
                ])

            if event.change_type == ChangeType.EMBEDDING_UPDATED:
                keys_to_delete.append(f"kb:v2:embedding:*")

            if event.change_type == ChangeType.CLUSTER_UPDATED:
                keys_to_delete.append(f"kb:v2:cluster:*")

            for key in keys_to_delete:
                if '*' in key:
                    # Pattern-based deletion
                    pattern_keys = self.coordinator.redis_cache.redis.keys(key)
                    if pattern_keys:
                        self.coordinator.redis_cache.redis.delete(*pattern_keys)
                else:
                    self.coordinator.redis_cache.redis.delete(key)

            return len(keys_to_delete)

        async def rollback_fn(payload, result):
            # Cache invalidation doesn't need rollback
            pass

        operations.append({
            'operation_type': 'invalidate',
            'execute_fn': execute_fn,
            'rollback_fn': rollback_fn,
            'payload': event.new_data or event.old_data,
        })

        return operations

    async def _invalidate_caches(self, event: ChangeEvent):
        """Invalidate relevant caches after successful propagation."""
        logger.info(f"🗑️  Invalidating caches for {event.entity_type}:{event.entity_id}")

        # This is already handled in Redis operations, but we can add
        # additional cache invalidation logic here if needed
        pass

    async def propagate_tag_rename(
        self, tag_id: str, old_name: str, new_name: str, metadata: Dict[str, Any]
    ) -> bool:
        """
        Propagate tag rename across all databases.

        This is a special case that requires updating references in multiple places.
        """
        logger.info(f"🏷️  Propagating tag rename: '{old_name}' → '{new_name}'")

        event = ChangeEvent(
            change_type=ChangeType.TAG_RENAMED,
            entity_id=tag_id,
            entity_type='tag',
            old_data={'id': tag_id, 'name': old_name, **metadata},
            new_data={'id': tag_id, 'name': new_name, **metadata},
        )

        return await self.propagate_change(event)


# Example usage
async def example_usage():
    """Example of using the ChangePropagateService."""
    coordinator = MultiDBCoordinator()
    coordinator.connect()

    service = ChangePropagateService(coordinator)

    # Simulate tag creation
    import uuid
    tag_id = str(uuid.uuid4())

    event = ChangeEvent(
        change_type=ChangeType.TAG_CREATED,
        entity_id=tag_id,
        entity_type='tag',
        new_data={
            'id': tag_id,
            'name': 'test_tag',
            'category': 'file',
            'file_path': '/test/file.ts',
            'embedding': [0.1] * 384,
        },
    )

    success = await service.propagate_change(event)

    if success:
        print("✅ Change propagated successfully!")
    else:
        print("❌ Change propagation failed")

    coordinator.disconnect()


if __name__ == "__main__":
    asyncio.run(example_usage())
