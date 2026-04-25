"""
MLP Worker: RabbitMQ-based task consumer

Consumes tasks from RabbitMQ queues and processes them:
- Embedding generation
- Mirror to Qdrant + Postgres
- Reranking
- Citation extraction

Runs under supervisord with multiple worker processes.
"""

import asyncio
import logging
import os
from typing import Optional

import asyncpg
from backend.mq_client import RabbitMQClient, MQTask

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


class MLPWorker:
    """RabbitMQ-based MLP worker"""

    def __init__(
        self,
        queue_type: str = "embedding",
        mq_host: str = None,
        mq_port: int = None,
        mq_user: str = None,
        mq_password: str = None,
        mq_vhost: str = None,
        postgres_url: str = None,
    ):
        self.queue_type = queue_type

        # RabbitMQ config
        self.mq_host = mq_host or os.getenv("MQ_HOST", "localhost")
        self.mq_port = mq_port or int(os.getenv("MQ_PORT", "5672"))
        self.mq_user = mq_user or os.getenv("MQ_USER", "legalai")
        self.mq_password = mq_password or os.getenv("MQ_PASS", "legalai123")
        self.mq_vhost = mq_vhost or os.getenv("MQ_VHOST", "/legalai")

        # Postgres config
        self.postgres_url = postgres_url or os.getenv(
            "DATABASE_URL",
            "postgresql://postgres:password@localhost/legal_db",
        )

        self.mq_client: Optional[RabbitMQClient] = None
        self.postgres_pool: Optional[asyncpg.Pool] = None

    async def initialize(self) -> None:
        """Initialize connections"""
        # RabbitMQ
        self.mq_client = RabbitMQClient(
            host=self.mq_host,
            port=self.mq_port,
            user=self.mq_user,
            password=self.mq_password,
            vhost=self.mq_vhost,
        )
        await self.mq_client.connect()
        logger.info(f"✅ Connected to RabbitMQ ({self.mq_host}:{self.mq_port})")

        # Postgres
        self.postgres_pool = await asyncpg.create_pool(
            self.postgres_url,
            min_size=2,
            max_size=10,
        )
        logger.info("✅ Connected to Postgres")

    async def start(self) -> None:
        """Start consuming tasks"""
        logger.info(f"🔄 Starting MLP worker for queue: {self.queue_type}")

        await self.mq_client.consume_tasks(
            queue_type=self.queue_type,
            callback=self._process_task,
            prefetch_count=1,
        )

    async def _process_task(self, task: MQTask) -> dict:
        """Process a task based on type"""
        logger.info(f"📥 Processing task: {task.task_id} ({task.task_type})")

        try:
            if task.task_type == "embedding":
                result = await self._handle_embedding(task)
            elif task.task_type == "mirror":
                result = await self._handle_mirror(task)
            elif task.task_type == "rerank":
                result = await self._handle_rerank(task)
            elif task.task_type == "citation":
                result = await self._handle_citation(task)
            else:
                raise ValueError(f"Unknown task type: {task.task_type}")

            logger.info(f"✅ Completed task: {task.task_id}")
            return result

        except Exception as e:
            logger.error(f"❌ Error processing task {task.task_id}: {e}")
            raise

    async def _handle_embedding(self, task: MQTask) -> dict:
        """Handle embedding generation task"""
        chunk_id = task.payload.get("chunk_id")
        text = task.payload.get("text")

        logger.info(f"  Generating embedding for chunk: {chunk_id}")

        # Mock implementation (would use EmbeddingGemma in production)
        embedding = [0.1] * 768  # Mock 768-dim embedding

        return {
            "chunk_id": chunk_id,
            "embedding": embedding,
            "status": "completed",
        }

    async def _handle_mirror(self, task: MQTask) -> dict:
        """Handle mirror to Qdrant + Postgres task"""
        chunk_id = task.payload.get("chunk_id")
        embedding = task.payload.get("embedding")

        logger.info(f"  Mirroring chunk to Qdrant + Postgres: {chunk_id}")

        # Mock implementation (would use Qdrant + Postgres in production)
        return {
            "chunk_id": chunk_id,
            "qdrant_id": f"point_{chunk_id}",
            "postgres_id": f"embed_{chunk_id}",
            "status": "completed",
        }

    async def _handle_rerank(self, task: MQTask) -> dict:
        """Handle reranking task"""
        results = task.payload.get("results", [])

        logger.info(f"  Reranking {len(results)} results")

        # Mock implementation (would use MiniLM in production)
        reranked = results[:5]  # Simple truncation for now

        return {
            "reranked_results": reranked,
            "count": len(reranked),
            "status": "completed",
        }

    async def _handle_citation(self, task: MQTask) -> dict:
        """Handle citation extraction task"""
        text = task.payload.get("text")
        chunk_id = task.payload.get("chunk_id")

        logger.info(f"  Extracting citations from chunk: {chunk_id}")

        # Mock implementation (would use NER + statute matcher in production)
        citations = []
        if "statute" in text.lower() or "code" in text.lower():
            citations.append({
                "statute_code": "PC 245",
                "statute_title": "Assault",
                "confidence": 0.8,
            })

        return {
            "chunk_id": chunk_id,
            "citations": citations,
            "count": len(citations),
            "status": "completed",
        }

    async def close(self) -> None:
        """Close connections"""
        if self.mq_client:
            await self.mq_client.close()
        if self.postgres_pool:
            await self.postgres_pool.close()


async def main():
    """Main entry point"""
    # Determine queue type from environment or default to "embedding"
    queue_type = os.getenv("MLP_QUEUE_TYPE", "embedding")

    worker = MLPWorker(queue_type=queue_type)

    try:
        await worker.initialize()
        await worker.start()
    except KeyboardInterrupt:
        logger.info("Shutting down worker...")
    finally:
        await worker.close()


if __name__ == "__main__":
    asyncio.run(main())
