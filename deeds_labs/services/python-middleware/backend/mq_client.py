"""
RabbitMQ Client: Unified message queue for GPU workers

Handles:
- Auto-declare exchanges, queues, bindings
- Publish tasks (embeddings, mirror, rerank, citation)
- Consume tasks with acknowledgment
- JSON + msgpack serialization
- Connection pooling + retry logic
"""

import asyncio
import json
import logging
from typing import Dict, Any, Optional, Callable
from dataclasses import dataclass, asdict
from datetime import datetime
import uuid

import aio_pika
from aio_pika import ExchangeType, DeliveryMode

logger = logging.getLogger(__name__)


@dataclass
class MQTask:
    """Message queue task"""
    task_id: str
    task_type: str  # "embedding", "mirror", "rerank", "citation"
    payload: Dict[str, Any]
    created_at: str = None
    priority: int = 0  # 0=normal, 1=high, -1=low

    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now().isoformat()

    def to_dict(self) -> Dict:
        return asdict(self)


class RabbitMQClient:
    """
    RabbitMQ client for legal AI task queue.

    Queues:
    - ingest: Raw document ingest (MinIO → OCR/Chunk)
    - embedding: Embedding generation tasks
    - mirror: Mirror to Qdrant + Postgres
    - rerank: Reranking tasks
    - citation: Citation extraction tasks
    """

    # Queue configuration
    QUEUES = {
        "ingest": {
            "name": "ingest",
            "routing_key": "ingest",
            "durable": True,
        },
        "embedding": {
            "name": "embedding",
            "routing_key": "embedding",
            "durable": True,
        },
        "mirror": {
            "name": "mirror",
            "routing_key": "mirror",
            "durable": True,
        },
        "rerank": {
            "name": "rerank",
            "routing_key": "rerank",
            "durable": True,
        },
        "citation": {
            "name": "citation",
            "routing_key": "citation",
            "durable": True,
        },
    }

    EXCHANGE_NAME = "rag_ai"
    EXCHANGE_TYPE = ExchangeType.DIRECT

    def __init__(
        self,
        host: str = "localhost",
        port: int = 5672,
        user: str = "legalai",
        password: str = "legalai123",
        vhost: str = "/legalai",
    ):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.vhost = vhost

        self.connection: Optional[aio_pika.Connection] = None
        self.channel: Optional[aio_pika.Channel] = None
        self.exchange: Optional[aio_pika.Exchange] = None
        self.queues: Dict[str, aio_pika.Queue] = {}

    async def connect(self) -> None:
        """Connect to RabbitMQ and declare exchanges/queues"""
        try:
            # Connect
            self.connection = await aio_pika.connect_robust(
                f"amqp://{self.user}:{self.password}@{self.host}:{self.port}/{self.vhost}"
            )
            self.channel = await self.connection.channel()

            logger.info(f"✅ Connected to RabbitMQ ({self.host}:{self.port})")

            # Declare exchange
            self.exchange = await self.channel.declare_exchange(
                self.EXCHANGE_NAME,
                self.EXCHANGE_TYPE,
                durable=True,
            )
            logger.info(f"✅ Declared exchange: {self.EXCHANGE_NAME}")

            # Declare queues
            for queue_key, queue_config in self.QUEUES.items():
                queue = await self.channel.declare_queue(
                    queue_config["name"],
                    durable=queue_config["durable"],
                )

                # Bind to exchange
                await queue.bind(
                    self.exchange,
                    routing_key=queue_config["routing_key"],
                )

                self.queues[queue_key] = queue
                logger.info(f"✅ Declared queue: {queue_config['name']}")

        except Exception as e:
            logger.error(f"❌ RabbitMQ connection failed: {e}")
            raise

    async def publish_task(
        self,
        task_type: str,
        payload: Dict[str, Any],
        priority: int = 0,
    ) -> str:
        """
        Publish a task to RabbitMQ.

        Args:
            task_type: "embedding", "mirror", "rerank", "citation"
            payload: Task payload
            priority: 0=normal, 1=high, -1=low

        Returns:
            Task ID
        """
        if not self.exchange:
            raise RuntimeError("Not connected to RabbitMQ")

        task_id = str(uuid.uuid4())
        task = MQTask(
            task_id=task_id,
            task_type=task_type,
            payload=payload,
            priority=priority,
        )

        # Get routing key
        queue_config = self.QUEUES.get(task_type)
        if not queue_config:
            raise ValueError(f"Unknown task type: {task_type}")

        routing_key = queue_config["routing_key"]

        # Publish
        message = aio_pika.Message(
            body=json.dumps(task.to_dict()).encode(),
            content_type="application/json",
            delivery_mode=DeliveryMode.PERSISTENT,
            priority=priority,
        )

        await self.exchange.publish(message, routing_key=routing_key)

        logger.info(f"📤 Published task: {task_id} ({task_type})")
        return task_id

    async def consume_tasks(
        self,
        queue_type: str,
        callback: Callable[[MQTask], Any],
        prefetch_count: int = 1,
    ) -> None:
        """
        Consume tasks from a queue.

        Args:
            queue_type: "embedding", "mirror", "rerank", "citation"
            callback: Async callback function to process task
            prefetch_count: Number of tasks to prefetch
        """
        if not self.channel:
            raise RuntimeError("Not connected to RabbitMQ")

        queue = self.queues.get(queue_type)
        if not queue:
            raise ValueError(f"Unknown queue type: {queue_type}")

        # Set QoS
        await self.channel.set_qos(prefetch_count=prefetch_count)

        logger.info(f"🔄 Consuming from queue: {queue_type}")

        async with queue.iterator() as queue_iter:
            async for message in queue_iter:
                try:
                    # Parse task
                    task_data = json.loads(message.body.decode())
                    task = MQTask(**task_data)

                    logger.info(f"📥 Received task: {task.task_id} ({task.task_type})")

                    # Process task
                    result = await callback(task)

                    # Acknowledge
                    await message.ack()

                    logger.info(f"✅ Completed task: {task.task_id}")

                except Exception as e:
                    logger.error(f"❌ Error processing task: {e}")
                    # Nack and requeue
                    await message.nack(requeue=True)

    async def close(self) -> None:
        """Close connection"""
        if self.connection:
            await self.connection.close()
            logger.info("✅ Closed RabbitMQ connection")


# Example usage
async def example_producer():
    """Example: Publish tasks"""
    client = RabbitMQClient()
    await client.connect()

    # Publish embedding task
    task_id = await client.publish_task(
        task_type="embedding",
        payload={
            "chunk_id": "chunk_001",
            "text": "Sample legal text",
        },
    )

    print(f"Published task: {task_id}")
    await client.close()


async def example_consumer():
    """Example: Consume tasks"""
    client = RabbitMQClient()
    await client.connect()

    async def process_task(task: MQTask):
        print(f"Processing: {task.task_id}")
        # Do work here
        return {"status": "completed"}

    await client.consume_tasks("embedding", process_task)


if __name__ == "__main__":
    # Run producer
    asyncio.run(example_producer())
