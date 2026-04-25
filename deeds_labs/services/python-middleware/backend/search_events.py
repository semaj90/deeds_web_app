"""
Search Events: Real-time progress streaming via SSE

Provides:
- Event emission for search progress
- Redis Streams for event buffering
- Event types: embedding_complete, search_complete, reranking_complete, done
"""

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import AsyncGenerator, Dict, Optional

import redis.asyncio as redis

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


@dataclass
class SearchEvent:
    """Search progress event"""
    search_id: str
    event_type: str
    data: Dict
    timestamp: datetime


class SearchEventEmitter:
    """Emit and stream search progress events"""

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379",
        stream_prefix: str = "search_events:",
    ):
        self.redis_url = redis_url
        self.stream_prefix = stream_prefix
        self.redis_client: Optional[redis.Redis] = None

        logger.info(f"✅ Search Event Emitter initialized")
        logger.info(f"   Redis: {redis_url}")
        logger.info(f"   Stream Prefix: {stream_prefix}")

    async def _ensure_connected(self):
        """Ensure Redis connection"""
        if self.redis_client is None:
            self.redis_client = await redis.from_url(self.redis_url)

    async def emit_embedding_complete(self, search_id: str):
        """Emit embedding complete event"""
        await self._emit_event(
            search_id,
            "embedding_complete",
            {"status": "embedding_complete"},
        )

    async def emit_search_complete(self, search_id: str, result_count: int):
        """Emit search complete event"""
        await self._emit_event(
            search_id,
            "search_complete",
            {"status": "search_complete", "result_count": result_count},
        )

    async def emit_reranking_complete(self, search_id: str, top_k: int):
        """Emit reranking complete event"""
        await self._emit_event(
            search_id,
            "reranking_complete",
            {"status": "reranking_complete", "top_k": top_k},
        )

    async def emit_done(self, search_id: str, total_latency_ms: int):
        """Emit done event"""
        await self._emit_event(
            search_id,
            "done",
            {"status": "done", "total_latency_ms": total_latency_ms},
        )

    async def emit_error(self, search_id: str, error_message: str):
        """Emit error event"""
        await self._emit_event(
            search_id,
            "error",
            {"status": "error", "error": error_message},
        )

    async def _emit_event(self, search_id: str, event_type: str, data: Dict):
        """Emit event to Redis Stream"""
        try:
            await self._ensure_connected()

            stream_key = f"{self.stream_prefix}{search_id}"

            event = {
                "type": event_type,
                "data": json.dumps(data),
                "timestamp": datetime.now().isoformat(),
            }

            # Add to Redis Stream
            await self.redis_client.xadd(stream_key, event)

            # Set expiration (24 hours)
            await self.redis_client.expire(stream_key, 86400)

            logger.debug(f"✅ Emitted event: {event_type} for {search_id}")

        except Exception as e:
            logger.error(f"Error emitting event: {e}")

    async def subscribe(self, search_id: str) -> AsyncGenerator[Dict, None]:
        """Subscribe to search events"""
        try:
            await self._ensure_connected()

            stream_key = f"{self.stream_prefix}{search_id}"
            last_id = "0"

            while True:
                try:
                    # Read from stream
                    messages = await self.redis_client.xread(
                        {stream_key: last_id},
                        block=5000,  # 5 second timeout
                    )

                    if messages:
                        for stream, message_list in messages:
                            for message_id, message_data in message_list:
                                last_id = message_id

                                # Parse event
                                event = {
                                    "type": message_data.get(b"type", b"").decode(),
                                    "data": json.loads(
                                        message_data.get(b"data", b"{}").decode()
                                    ),
                                    "timestamp": message_data.get(b"timestamp", b"").decode(),
                                }

                                yield event

                                # Check if done
                                if event["type"] == "done":
                                    return

                except asyncio.TimeoutError:
                    continue
                except Exception as e:
                    logger.error(f"Error reading stream: {e}")
                    break

        except Exception as e:
            logger.error(f"Subscribe error: {e}")

    async def close(self):
        """Close Redis connection"""
        if self.redis_client:
            await self.redis_client.close()
            logger.info("✅ Search Event Emitter closed")


# Global event emitter instance
event_emitter: Optional[SearchEventEmitter] = None


async def get_event_emitter() -> SearchEventEmitter:
    """Get or create event emitter instance"""
    global event_emitter

    if event_emitter is None:
        event_emitter = SearchEventEmitter()

    return event_emitter


async def close_event_emitter():
    """Close event emitter"""
    global event_emitter

    if event_emitter:
        await event_emitter.close()
        event_emitter = None
