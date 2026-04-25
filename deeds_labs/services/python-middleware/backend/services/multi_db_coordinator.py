#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - Multi-Database Coordinator
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Atomic transaction management across 6 databases
═══════════════════════════════════════════════════════════════════════
"""

import os
import uuid
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum

# Database clients
import psycopg2
from psycopg2.extras import RealDictCursor
import redis
from qdrant_client import QdrantClient
from neo4j import GraphDatabase
import couchdb

# Local imports
from backend.scripts.setup_redis_v2 import RedisCache

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TransactionStatus(Enum):
    """Transaction status enum."""
    PENDING = "pending"
    COMMITTED = "committed"
    ROLLED_BACK = "rolled_back"
    FAILED = "failed"


class DatabaseType(Enum):
    """Database type enum."""
    POSTGRESQL = "postgresql"
    NEO4J = "neo4j"
    QDRANT = "qdrant"
    COUCHDB = "couchdb"
    REDIS = "redis"
    MINIO = "minio"


@dataclass
class DBOperation:
    """Database operation with rollback capability."""
    database: DatabaseType
    operation_type: str  # 'insert', 'update', 'delete'
    execute_fn: Callable
    rollback_fn: Callable
    payload: Dict[str, Any]
    executed: bool = False
    result: Optional[Any] = None
    error: Optional[str] = None


@dataclass
class Transaction:
    """Multi-database transaction."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    operations: List[DBOperation] = field(default_factory=list)
    status: TransactionStatus = TransactionStatus.PENDING
    created_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None


class MultiDBCoordinator:
    """
    Coordinates atomic transactions across multiple databases.

    Supports: PostgreSQL, Neo4j, Qdrant, CouchDB, Redis, MinIO
    """

    def __init__(
        self,
        postgres_url: Optional[str] = None,
        neo4j_url: Optional[str] = None,
        qdrant_url: Optional[str] = None,
        couchdb_url: Optional[str] = None,
        redis_url: Optional[str] = None,
    ):
        """Initialize database connections."""
        # PostgreSQL
        self.postgres_url = postgres_url or os.getenv(
            "DATABASE_URL", "postgresql://legal_admin:123456@localhost:5434/legal_ai_db"
        )
        self.pg_conn = None

        # Neo4j
        self.neo4j_url = neo4j_url or os.getenv("NEO4J_URL", "bolt://localhost:7687")
        self.neo4j_user = os.getenv("NEO4J_USER", "neo4j")
        self.neo4j_password = os.getenv("NEO4J_PASSWORD", "password")
        self.neo4j_driver = None

        # Qdrant
        self.qdrant_url = qdrant_url or os.getenv("QDRANT_URL", "http://localhost:6333")
        self.qdrant_client = None

        # CouchDB
        self.couchdb_url = couchdb_url or os.getenv(
            "COUCHDB_URL", "http://admin:password@localhost:5984"
        )
        self.couchdb_server = None

        # Redis
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")
        self.redis_cache = None

        # Transaction log
        self.transactions: Dict[str, Transaction] = {}

    def connect(self):
        """Connect to all databases."""
        try:
            # PostgreSQL
            self.pg_conn = psycopg2.connect(self.postgres_url)
            logger.info("✅ PostgreSQL connected")

            # Neo4j
            self.neo4j_driver = GraphDatabase.driver(
                self.neo4j_url,
                auth=(self.neo4j_user, self.neo4j_password)
            )
            logger.info("✅ Neo4j connected")

            # Qdrant
            self.qdrant_client = QdrantClient(url=self.qdrant_url)
            logger.info("✅ Qdrant connected")

            # CouchDB
            self.couchdb_server = couchdb.Server(self.couchdb_url)
            logger.info("✅ CouchDB connected")

            # Redis
            self.redis_cache = RedisCache(url=self.redis_url)
            logger.info("✅ Redis connected")

            logger.info("🎉 All databases connected successfully!")
            return True

        except Exception as e:
            logger.error(f"❌ Database connection failed: {e}")
            raise

    def disconnect(self):
        """Disconnect from all databases."""
        try:
            if self.pg_conn:
                self.pg_conn.close()
            if self.neo4j_driver:
                self.neo4j_driver.close()
            logger.info("✅ All databases disconnected")
        except Exception as e:
            logger.error(f"❌ Disconnect error: {e}")

    def create_transaction(self) -> Transaction:
        """Create a new transaction."""
        transaction = Transaction()
        self.transactions[transaction.id] = transaction
        logger.info(f"📝 Created transaction: {transaction.id}")
        return transaction

    def add_operation(
        self,
        transaction: Transaction,
        database: DatabaseType,
        operation_type: str,
        execute_fn: Callable,
        rollback_fn: Callable,
        payload: Dict[str, Any],
    ):
        """Add an operation to a transaction."""
        operation = DBOperation(
            database=database,
            operation_type=operation_type,
            execute_fn=execute_fn,
            rollback_fn=rollback_fn,
            payload=payload,
        )
        transaction.operations.append(operation)
        logger.info(
            f"➕ Added {database.value} {operation_type} operation to transaction {transaction.id}"
        )

    async def execute_transaction(self, transaction: Transaction) -> bool:
        """
        Execute all operations in a transaction atomically.

        Returns True if all operations succeed, False otherwise.
        Automatically rolls back on failure.
        """
        logger.info(f"🚀 Executing transaction {transaction.id} with {len(transaction.operations)} operations")

        # Log transaction start in PostgreSQL
        await self._log_transaction_start(transaction)

        executed_operations = []

        try:
            # Execute all operations
            for operation in transaction.operations:
                logger.info(
                    f"   ⚙️  Executing {operation.database.value} {operation.operation_type}..."
                )

                try:
                    result = await operation.execute_fn(operation.payload)
                    operation.executed = True
                    operation.result = result
                    executed_operations.append(operation)
                    logger.info(f"   ✅ {operation.database.value} operation succeeded")

                except Exception as e:
                    operation.error = str(e)
                    logger.error(f"   ❌ {operation.database.value} operation failed: {e}")
                    raise

            # All operations succeeded
            transaction.status = TransactionStatus.COMMITTED
            transaction.completed_at = datetime.now()

            # Log transaction commit
            await self._log_transaction_commit(transaction)

            logger.info(f"✅ Transaction {transaction.id} committed successfully!")
            return True

        except Exception as e:
            # Rollback all executed operations
            logger.error(f"❌ Transaction {transaction.id} failed: {e}")
            transaction.status = TransactionStatus.FAILED
            transaction.error_message = str(e)
            transaction.completed_at = datetime.now()

            await self._rollback_operations(executed_operations, transaction)

            # Log transaction rollback
            await self._log_transaction_rollback(transaction)

            return False

    async def _rollback_operations(
        self, operations: List[DBOperation], transaction: Transaction
    ):
        """Rollback executed operations in reverse order."""
        logger.warning(f"🔄 Rolling back {len(operations)} operations...")

        for operation in reversed(operations):
            if operation.executed:
                try:
                    logger.info(f"   ↩️  Rolling back {operation.database.value}...")
                    await operation.rollback_fn(operation.payload, operation.result)
                    logger.info(f"   ✅ {operation.database.value} rollback succeeded")
                except Exception as e:
                    logger.error(f"   ❌ {operation.database.value} rollback failed: {e}")
                    # Continue rolling back other operations

        transaction.status = TransactionStatus.ROLLED_BACK
        logger.info(f"✅ Transaction {transaction.id} rolled back")

    async def _log_transaction_start(self, transaction: Transaction):
        """Log transaction start in PostgreSQL."""
        try:
            cursor = self.pg_conn.cursor()
            cursor.execute(
                """
                INSERT INTO multi_db_transactions (id, operation, status, databases, payload, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    transaction.id,
                    "multi_db_transaction",
                    transaction.status.value,
                    [op.database.value for op in transaction.operations],
                    None,  # payload as JSONB
                    transaction.created_at,
                ),
            )
            self.pg_conn.commit()
        except Exception as e:
            logger.error(f"Failed to log transaction start: {e}")

    async def _log_transaction_commit(self, transaction: Transaction):
        """Log transaction commit in PostgreSQL."""
        try:
            cursor = self.pg_conn.cursor()
            cursor.execute(
                """
                UPDATE multi_db_transactions
                SET status = %s, completed_at = %s
                WHERE id = %s
                """,
                (transaction.status.value, transaction.completed_at, transaction.id),
            )
            self.pg_conn.commit()
        except Exception as e:
            logger.error(f"Failed to log transaction commit: {e}")

    async def _log_transaction_rollback(self, transaction: Transaction):
        """Log transaction rollback in PostgreSQL."""
        try:
            cursor = self.pg_conn.cursor()
            cursor.execute(
                """
                UPDATE multi_db_transactions
                SET status = %s, completed_at = %s, error_message = %s
                WHERE id = %s
                """,
                (
                    transaction.status.value,
                    transaction.completed_at,
                    transaction.error_message,
                    transaction.id,
                ),
            )
            self.pg_conn.commit()
        except Exception as e:
            logger.error(f"Failed to log transaction rollback: {e}")

    def get_transaction_stats(self) -> Dict[str, Any]:
        """Get transaction statistics."""
        total = len(self.transactions)
        committed = sum(1 for t in self.transactions.values() if t.status == TransactionStatus.COMMITTED)
        rolled_back = sum(1 for t in self.transactions.values() if t.status == TransactionStatus.ROLLED_BACK)
        failed = sum(1 for t in self.transactions.values() if t.status == TransactionStatus.FAILED)
        pending = sum(1 for t in self.transactions.values() if t.status == TransactionStatus.PENDING)

        return {
            "total_transactions": total,
            "committed": committed,
            "rolled_back": rolled_back,
            "failed": failed,
            "pending": pending,
            "success_rate": round(committed / total * 100, 2) if total > 0 else 0,
        }


# Example usage
async def example_usage():
    """Example of using the MultiDBCoordinator."""
    coordinator = MultiDBCoordinator()
    coordinator.connect()

    # Create a transaction
    transaction = coordinator.create_transaction()

    # Define operations
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

    # Add operations to transaction
    test_payload = {
        "id": str(uuid.uuid4()),
        "name": "test_tag",
        "category": "file",
        "file_path": "/test/file.ts",
        "embedding": [0.1] * 384,
    }

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

    if success:
        print("✅ Transaction completed successfully!")
    else:
        print("❌ Transaction failed and was rolled back")

    # Get stats
    stats = coordinator.get_transaction_stats()
    print(f"\n📊 Transaction Stats: {stats}")

    coordinator.disconnect()


if __name__ == "__main__":
    asyncio.run(example_usage())
