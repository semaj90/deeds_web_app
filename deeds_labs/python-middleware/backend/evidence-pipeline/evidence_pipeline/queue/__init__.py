"""Message queue initialization and management."""

from evidence_pipeline.queue.connection import init_queue, get_connection, close_connection

__all__ = ["init_queue", "get_connection", "close_connection"]
