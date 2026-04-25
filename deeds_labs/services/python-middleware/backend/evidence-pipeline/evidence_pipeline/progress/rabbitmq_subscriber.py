"""RabbitMQ event subscription for progress monitoring."""

import aio_pika
import json
import structlog
from typing import AsyncGenerator, Optional, Callable, Any
from aio_pika import Channel, Queue, IncomingMessage

from evidence_pipeline.config import settings
from evidence_pipeline.queue.connection import get_channel

logger = structlog.get_logger(__name__)

# Progress event exchange and routing keys
PROGRESS_EXCHANGE = f"{settings.RABBITMQ_QUEUE_PREFIX}.progress"
PROGRESS_ROUTING_KEY_PATTERN = f"{settings.RABBITMQ_QUEUE_PREFIX}.progress.*"


class ProgressEventSubscriber:
    """Subscribes to progress events from RabbitMQ."""

    def __init__(self):
        """Initialize subscriber."""
        self._channel: Optional[Channel] = None
        self._queue: Optional[Queue] = None
        self._consumer_tag: Optional[str] = None

    async def connect(self) -> None:
        """Connect to RabbitMQ."""
        try:
            self._channel = await get_channel()

            # Declare exchange
            exchange = await self._channel.declare_exchange(
                PROGRESS_EXCHANGE,
                aio_pika.ExchangeType.TOPIC,
                durable=True,
            )

            # Declare queue
            self._queue = await self._channel.declare_queue(
                exclusive=True,
                auto_delete=True,
            )

            # Bind queue to exchange
            await self._queue.bind(exchange, PROGRESS_ROUTING_KEY_PATTERN)

            logger.info("Progress event subscriber connected")
        except Exception as e:
            logger.error("Failed to connect progress subscriber", error=str(e))
            raise

    async def disconnect(self) -> None:
        """Disconnect from RabbitMQ."""
        try:
            if self._consumer_tag and self._queue:
                await self._queue.cancel(self._consumer_tag)
            logger.info("Progress event subscriber disconnected")
        except Exception as e:
            logger.error("Failed to disconnect subscriber", error=str(e))

    async def subscribe_to_job(
        self,
        job_id: str,
        callback: Callable[[dict], Any],
    ) -> None:
        """Subscribe to events for a specific job."""
        if not self._queue:
            await self.connect()

        try:
            async with self._queue.iterator() as queue_iter:
                async for message: IncomingMessage in queue_iter:
                    try:
                        # Parse message
                        event_data = json.loads(message.body.decode())

                        # Check if event is for this job
                        if event_data.get('job_id') == job_id:
                            # Call callback
                            await callback(event_data)

                        # Acknowledge message
                        await message.ack()
                    except Exception as e:
                        logger.error("Failed to process event", error=str(e))
                        await message.nack(requeue=True)
        except Exception as e:
            logger.error("Subscription error", error=str(e))

    async def stream_job_events(
        self,
        job_id: str,
    ) -> AsyncGenerator[dict, None]:
        """Stream events for a job."""
        if not self._queue:
            await self.connect()

        try:
            async with self._queue.iterator() as queue_iter:
                async for message: IncomingMessage in queue_iter:
                    try:
                        # Parse message
                        event_data = json.loads(message.body.decode())

                        # Check if event is for this job
                        if event_data.get('job_id') == job_id:
                            # Yield event
                            yield event_data

                        # Acknowledge message
                        await message.ack()
                    except Exception as e:
                        logger.error("Failed to process event", error=str(e))
                        await message.nack(requeue=True)
        except Exception as e:
            logger.error("Stream error", error=str(e))


async def publish_progress_event(
    job_id: str,
    event_type: str,
    stage: str,
    data: dict,
) -> bool:
    """Publish a progress event to RabbitMQ."""
    try:
        channel = await get_channel()

        # Declare exchange
        exchange = await channel.declare_exchange(
            PROGRESS_EXCHANGE,
            aio_pika.ExchangeType.TOPIC,
            durable=True,
        )

        # Create message
        event_data = {
            'job_id': job_id,
            'event_type': event_type,
            'stage': stage,
            **data,
        }

        message = aio_pika.Message(
            body=json.dumps(event_data).encode(),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        )

        # Publish message
        routing_key = f"{settings.RABBITMQ_QUEUE_PREFIX}.progress.{job_id}"
        await exchange.publish(message, routing_key=routing_key)

        logger.info(f"Progress event published", job_id=job_id, event_type=event_type)
        return True
    except Exception as e:
        logger.error("Failed to publish progress event", error=str(e))
        return False


# Global subscriber instance
_subscriber: Optional[ProgressEventSubscriber] = None


async def get_subscriber() -> ProgressEventSubscriber:
    """Get or create the global subscriber."""
    global _subscriber
    if _subscriber is None:
        _subscriber = ProgressEventSubscriber()
        await _subscriber.connect()
    return _subscriber
