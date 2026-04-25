"""RabbitMQ connection pool management."""

import aio_pika
from aio_pika import Connection, Channel
import structlog
from typing import Optional

from evidence_pipeline.config import settings

logger = structlog.get_logger(__name__)

_connection: Optional[Connection] = None
_channel: Optional[Channel] = None


async def init_queue():
    """Initialize RabbitMQ connection."""
    global _connection, _channel
    try:
        _connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
        _channel = await _connection.channel()
        logger.info("RabbitMQ connection established")
    except Exception as e:
        logger.error("Failed to connect to RabbitMQ", error=str(e))
        raise


async def get_connection() -> Connection:
    """Get RabbitMQ connection."""
    if _connection is None:
        await init_queue()
    return _connection


async def get_channel() -> Channel:
    """Get RabbitMQ channel."""
    if _channel is None:
        await init_queue()
    return _channel


async def close_connection():
    """Close RabbitMQ connection."""
    global _connection, _channel
    if _connection:
        await _connection.close()
        _connection = None
        _channel = None
        logger.info("RabbitMQ connection closed")


async def health_check() -> dict:
    """Check RabbitMQ health."""
    try:
        conn = await get_connection()
        if conn and not conn.is_closed():
            return {"status": "healthy", "service": "rabbitmq"}
        else:
            return {"status": "unhealthy", "service": "rabbitmq", "error": "Connection closed"}
    except Exception as e:
        return {"status": "unhealthy", "service": "rabbitmq", "error": str(e)}
