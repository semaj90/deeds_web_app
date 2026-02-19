"""
Database connection pool management for Legal AI Backend
"""

import os
import logging
from typing import Optional
import asyncpg

logger = logging.getLogger(__name__)

# Global database pool
_db_pool: Optional[asyncpg.Pool] = None


async def init_db_pool() -> asyncpg.Pool:
    """Initialize the database connection pool"""
    global _db_pool

    if _db_pool is not None:
        return _db_pool

    database_url = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/legal_ai_db"
    )

    try:
        _db_pool = await asyncpg.create_pool(
            database_url,
            min_size=5,
            max_size=20,
            command_timeout=60,
        )
        logger.info("✅ Database pool initialized")
        return _db_pool
    except Exception as e:
        logger.error(f"❌ Failed to initialize database pool: {e}")
        raise


async def close_db_pool() -> None:
    """Close the database connection pool"""
    global _db_pool

    if _db_pool is not None:
        await _db_pool.close()
        _db_pool = None
        logger.info("✅ Database pool closed")


def get_db_pool() -> asyncpg.Pool:
    """Get the current database pool"""
    global _db_pool

    if _db_pool is None:
        raise RuntimeError("Database pool not initialized. Call init_db_pool() first.")

    return _db_pool
