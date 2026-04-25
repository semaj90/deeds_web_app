#!/usr/bin/env python
"""Database setup script for evidence processing pipeline."""

import asyncio
import sys
import psycopg2
from psycopg2 import sql
import structlog

from evidence_pipeline.config import settings

logger = structlog.get_logger(__name__)


def run_migrations():
    """Run database migrations."""
    try:
        # Parse connection string
        conn_str = settings.DATABASE_URL

        # Connect to database
        conn = psycopg2.connect(conn_str)
        cursor = conn.cursor()

        logger.info("Connected to database")

        # Read and execute migration
        with open("migrations/001_initial_schema.sql", "r") as f:
            migration_sql = f.read()

        cursor.execute(migration_sql)
        conn.commit()

        logger.info("Database migrations completed successfully")

        cursor.close()
        conn.close()

    except Exception as e:
        logger.error("Failed to run migrations", error=str(e))
        sys.exit(1)


async def init_services():
    """Initialize all services."""
    try:
        from evidence_pipeline.queue import init_queue
        from evidence_pipeline.queue.rabbitmq import init_queues
        from evidence_pipeline.storage import init_minio
        from evidence_pipeline.vector import init_qdrant

        logger.info("Initializing services...")

        await init_queue()
        logger.info("RabbitMQ connection established")

        await init_queues()
        logger.info("RabbitMQ queues initialized")

        await init_minio()
        logger.info("MinIO initialized")

        await init_qdrant()
        logger.info("Qdrant initialized")

        logger.info("All services initialized successfully")

    except Exception as e:
        logger.error("Failed to initialize services", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    logger.info("Starting database setup...")

    # Run migrations
    run_migrations()

    # Initialize services
    asyncio.run(init_services())

    logger.info("Setup completed successfully")
