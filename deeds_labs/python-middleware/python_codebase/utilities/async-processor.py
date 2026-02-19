#!/usr/bin/env python3
"""
RabbitMQ Async Document Processing Worker
Handles heavy document ingestion, embedding generation, and legal analysis
Optimized for Windows with proper error handling and retry logic
"""

import asyncio
import json
import logging
import os
import time
import traceback
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Optional, Any, Callable
import signal
import sys

import aio_pika
from aio_pika import Message, IncomingMessage
from aio_pika.abc import AbstractConnection, AbstractChannel, AbstractQueue
import asyncpg
import redis.asyncio as redis
from transformers import AutoTokenizer, AutoModel
import torch
import numpy as np

# Configuration
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
POSTGRES_URL = os.getenv("DATABASE_URL", "postgresql://postgres:123456@localhost:5432/legal_ai_db")

# Queue configurations
QUEUE_CONFIG = {
    "document_ingestion": {
        "queue": "document.ingestion",
        "routing_key": "document.ingest",
        "prefetch_count": 1,  # One document at a time
        "priority": 10,
        "retry_delay": 60,    # 1 minute
        "max_retries": 3
    },
    "embedding_generation": {
        "queue": "embedding.generation",
        "routing_key": "embedding.generate",
        "prefetch_count": 5,  # Multiple small tasks
        "priority": 5,
        "retry_delay": 30,
        "max_retries": 5
    },
    "legal_analysis": {
        "queue": "legal.analysis",
        "routing_key": "legal.analyze",
        "prefetch_count": 2,  # Medium complexity
        "priority": 7,
        "retry_delay": 45,
        "max_retries": 3
    },
    "similarity_indexing": {
        "queue": "similarity.indexing",
        "routing_key": "similarity.index",
        "prefetch_count": 3,
        "priority": 3,
        "retry_delay": 20,
        "max_retries": 5
    }
}

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('async-processor.log')
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class TaskMessage:
    task_id: str
    task_type: str
    payload: Dict[str, Any]
    user_id: Optional[str] = None
    case_id: Optional[str] = None
    priority: int = 5
    retry_count: int = 0
    created_at: float = 0
    started_at: Optional[float] = None
    metadata: Dict[str, Any] = None

    def __post_init__(self):
        if self.created_at == 0:
            self.created_at = time.time()
        if self.metadata is None:
            self.metadata = {}

@dataclass
class TaskResult:
    task_id: str
    success: bool
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    processing_time: float = 0
    metadata: Dict[str, Any] = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}

class AsyncTaskProcessor:
    """Base class for async task processing"""

    def __init__(self):
        self.connection: Optional[AbstractConnection] = None
        self.channel: Optional[AbstractChannel] = None
        self.redis_client: Optional[redis.Redis] = None
        self.db_pool: Optional[asyncpg.Pool] = None
        self.running = False
        self.tasks_processed = 0
        self.start_time = time.time()

        # Task handlers
        self.handlers: Dict[str, Callable] = {
            "document_ingestion": self.handle_document_ingestion,
            "embedding_generation": self.handle_embedding_generation,
            "legal_analysis": self.handle_legal_analysis,
            "similarity_indexing": self.handle_similarity_indexing
        }

    async def initialize(self):
        """Initialize all connections"""
        logger.info("Initializing async task processor...")

        # RabbitMQ connection
        try:
            self.connection = await aio_pika.connect_robust(RABBITMQ_URL)
            self.channel = await self.connection.channel()
            await self.channel.set_qos(prefetch_count=1)  # Global prefetch
            logger.info("RabbitMQ connected")
        except Exception as e:
            logger.error(f"RabbitMQ connection failed: {e}")
            raise

        # Redis connection
        try:
            self.redis_client = redis.from_url(REDIS_URL)
            await self.redis_client.ping()
            logger.info("Redis connected")
        except Exception as e:
            logger.error(f"Redis connection failed: {e}")
            raise

        # PostgreSQL connection pool
        try:
            self.db_pool = await asyncpg.create_pool(
                POSTGRES_URL,
                min_size=2,
                max_size=10,
                command_timeout=60
            )
            logger.info("PostgreSQL pool created")
        except Exception as e:
            logger.error(f"PostgreSQL connection failed: {e}")
            raise

    async def setup_queues(self):
        """Setup all queues with proper configuration"""
        logger.info("Setting up queues...")

        # Declare exchange
        exchange = await self.channel.declare_exchange(
            "legal_ai_tasks",
            aio_pika.ExchangeType.TOPIC,
            durable=True
        )

        for queue_name, config in QUEUE_CONFIG.items():
            # Declare queue with dead letter exchange
            queue = await self.channel.declare_queue(
                config["queue"],
                durable=True,
                arguments={
                    "x-message-ttl": 3600000,  # 1 hour message TTL
                    "x-dead-letter-exchange": "legal_ai_dlx",
                    "x-dead-letter-routing-key": f"dlx.{config['routing_key']}",
                    "x-max-priority": 10
                }
            )

            # Bind queue to exchange
            await queue.bind(exchange, config["routing_key"])

            # Set queue-specific prefetch
            await self.channel.set_qos(prefetch_count=config["prefetch_count"])

            logger.info(f"Queue {queue_name} configured")

        # Setup dead letter exchange
        dlx = await self.channel.declare_exchange(
            "legal_ai_dlx",
            aio_pika.ExchangeType.TOPIC,
            durable=True
        )

        dlq = await self.channel.declare_queue("dead_letters", durable=True)
        await dlq.bind(dlx, "dlx.*")

        logger.info("Dead letter exchange configured")

    async def start_consuming(self):
        """Start consuming messages from all queues"""
        logger.info("Starting message consumption...")
        self.running = True

        tasks = []
        for queue_name, config in QUEUE_CONFIG.items():
            queue = await self.channel.get_queue(config["queue"])
            task = asyncio.create_task(
                self.consume_queue(queue, queue_name)
            )
            tasks.append(task)

        # Wait for all consuming tasks
        try:
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            logger.info("Consumption cancelled")
        except Exception as e:
            logger.error(f"Consumption error: {e}")

    async def consume_queue(self, queue: AbstractQueue, queue_name: str):
        """Consume messages from a specific queue"""
        logger.info(f"Starting consumption for queue: {queue_name}")

        async def process_message(message: IncomingMessage):
            async with message.process(requeue=True):
                try:
                    # Parse message
                    task_msg = TaskMessage(**json.loads(message.body.decode()))
                    task_msg.started_at = time.time()

                    logger.info(f"Processing task {task_msg.task_id} of type {task_msg.task_type}")

                    # Get appropriate handler
                    handler = self.handlers.get(task_msg.task_type)
                    if not handler:
                        raise ValueError(f"Unknown task type: {task_msg.task_type}")

                    # Process task
                    start_time = time.time()
                    result = await handler(task_msg)
                    processing_time = time.time() - start_time

                    # Create result
                    task_result = TaskResult(
                        task_id=task_msg.task_id,
                        success=True,
                        result=result,
                        processing_time=processing_time
                    )

                    # Cache result
                    await self.cache_result(task_result)

                    # Update stats
                    self.tasks_processed += 1
                    await self.update_stats(queue_name, "success", processing_time)

                    logger.info(f"Task {task_msg.task_id} completed in {processing_time:.2f}s")

                except Exception as e:
                    logger.error(f"Task processing error: {e}")
                    logger.error(traceback.format_exc())

                    # Handle retry logic
                    await self.handle_task_failure(message, task_msg, str(e))
                    await self.update_stats(queue_name, "error")

        # Start consuming
        await queue.consume(process_message)

    async def handle_task_failure(self, message: IncomingMessage, task_msg: TaskMessage, error: str):
        """Handle task failure with retry logic"""
        task_msg.retry_count += 1
        config = QUEUE_CONFIG.get(task_msg.task_type, {})
        max_retries = config.get("max_retries", 3)

        if task_msg.retry_count <= max_retries:
            # Schedule retry with delay
            retry_delay = config.get("retry_delay", 60)
            logger.info(f"Scheduling retry {task_msg.retry_count}/{max_retries} for task {task_msg.task_id} in {retry_delay}s")

            # Update task message
            retry_message = Message(
                json.dumps(asdict(task_msg)).encode(),
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                priority=task_msg.priority,
                expiration=retry_delay * 1000  # Convert to milliseconds
            )

            # Republish with delay
            exchange = await self.channel.get_exchange("legal_ai_tasks")
            routing_key = QUEUE_CONFIG[task_msg.task_type]["routing_key"]
            await exchange.publish(retry_message, routing_key)
        else:
            # Max retries exceeded, send to dead letter queue
            logger.error(f"Task {task_msg.task_id} exceeded max retries, sending to DLQ")

            task_result = TaskResult(
                task_id=task_msg.task_id,
                success=False,
                error=f"Max retries exceeded: {error}",
                metadata={"retry_count": task_msg.retry_count}
            )

            await self.cache_result(task_result)

    # Task Handlers
    async def handle_document_ingestion(self, task_msg: TaskMessage) -> Dict[str, Any]:
        """Handle document ingestion and chunking"""
        payload = task_msg.payload
        document_path = payload.get("document_path")
        case_id = task_msg.case_id

        logger.info(f"Ingesting document: {document_path}")

        # Simulate document processing
        await asyncio.sleep(2)  # Simulate file reading and chunking

        # Extract text and create chunks
        chunks = await self.extract_document_chunks(document_path)

        # Store chunks in database
        chunk_ids = await self.store_document_chunks(chunks, case_id, task_msg.user_id)

        # Trigger embedding generation for chunks
        await self.schedule_embedding_tasks(chunk_ids)

        return {
            "document_path": document_path,
            "chunks_created": len(chunks),
            "chunk_ids": chunk_ids,
            "status": "ingested"
        }

    async def handle_embedding_generation(self, task_msg: TaskMessage) -> Dict[str, Any]:
        """Handle embedding generation for text chunks"""
        payload = task_msg.payload
        chunk_id = payload.get("chunk_id")
        text = payload.get("text")
        model_name = payload.get("model", "nomic-embed-text")

        logger.info(f"Generating embedding for chunk: {chunk_id}")

        # Check cache first
        cache_key = f"embed:{model_name}:{hash(text) % 1000000}"
        cached = await self.redis_client.get(cache_key)

        if cached:
            embedding = json.loads(cached)
            logger.info(f"Using cached embedding for chunk: {chunk_id}")
        else:
            # Generate embedding (simulated)
            embedding = await self.generate_embedding(text, model_name)

            # Cache embedding
            await self.redis_client.setex(
                cache_key,
                1800,  # 30 minutes
                json.dumps(embedding.tolist() if isinstance(embedding, np.ndarray) else embedding)
            )

        # Store in database
        await self.store_embedding(chunk_id, embedding)

        # Schedule similarity indexing
        await self.schedule_similarity_indexing(chunk_id, embedding)

        return {
            "chunk_id": chunk_id,
            "embedding_dimensions": len(embedding),
            "model": model_name,
            "status": "embedded"
        }

    async def handle_legal_analysis(self, task_msg: TaskMessage) -> Dict[str, Any]:
        """Handle legal document analysis"""
        payload = task_msg.payload
        document_id = payload.get("document_id")
        analysis_type = payload.get("analysis_type", "summary")
        text = payload.get("text")

        logger.info(f"Performing legal analysis: {analysis_type} on document: {document_id}")

        # Simulate legal analysis processing
        await asyncio.sleep(5)  # Simulate AI processing time

        # Generate analysis based on type
        analysis_result = await self.perform_legal_analysis(text, analysis_type)

        # Store analysis results
        await self.store_legal_analysis(document_id, analysis_type, analysis_result)

        return {
            "document_id": document_id,
            "analysis_type": analysis_type,
            "analysis": analysis_result,
            "status": "analyzed"
        }

    async def handle_similarity_indexing(self, task_msg: TaskMessage) -> Dict[str, Any]:
        """Handle similarity indexing and vector database updates"""
        payload = task_msg.payload
        chunk_id = payload.get("chunk_id")
        embedding = payload.get("embedding")

        logger.info(f"Indexing similarity for chunk: {chunk_id}")

        # Update vector index
        await self.update_vector_index(chunk_id, embedding)

        # Find similar documents
        similar_docs = await self.find_similar_documents(embedding, limit=10)

        # Update similarity relationships
        await self.update_similarity_relationships(chunk_id, similar_docs)

        return {
            "chunk_id": chunk_id,
            "similar_documents": len(similar_docs),
            "status": "indexed"
        }

    # Helper methods (simplified implementations)
    async def extract_document_chunks(self, document_path: str) -> List[Dict[str, Any]]:
        """Extract and chunk document text"""
        # Simulate document processing
        await asyncio.sleep(1)

        # Return mock chunks
        return [
            {"text": f"Document chunk {i}", "page": i // 10 + 1, "position": i}
            for i in range(20)  # 20 chunks per document
        ]

    async def store_document_chunks(self, chunks: List[Dict[str, Any]], case_id: str, user_id: str) -> List[str]:
        """Store document chunks in database"""
        chunk_ids = []

        async with self.db_pool.acquire() as conn:
            for chunk in chunks:
                chunk_id = f"chunk_{int(time.time() * 1000)}_{len(chunk_ids)}"

                await conn.execute("""
                    INSERT INTO document_chunks (id, text, case_id, user_id, metadata, created_at)
                    VALUES ($1, $2, $3, $4, $5, NOW())
                """, chunk_id, chunk["text"], case_id, user_id, json.dumps(chunk))

                chunk_ids.append(chunk_id)

        return chunk_ids

    async def schedule_embedding_tasks(self, chunk_ids: List[str]):
        """Schedule embedding generation tasks"""
        exchange = await self.channel.get_exchange("legal_ai_tasks")

        for chunk_id in chunk_ids:
            task_msg = TaskMessage(
                task_id=f"embed_{chunk_id}_{int(time.time())}",
                task_type="embedding_generation",
                payload={
                    "chunk_id": chunk_id,
                    "text": f"Text for chunk {chunk_id}",  # Would get from DB
                    "model": "nomic-embed-text"
                },
                priority=5
            )

            message = Message(
                json.dumps(asdict(task_msg)).encode(),
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                priority=task_msg.priority
            )

            await exchange.publish(message, "embedding.generate")

    async def generate_embedding(self, text: str, model_name: str) -> List[float]:
        """Generate embedding for text (simplified)"""
        # In production, this would use the actual model
        await asyncio.sleep(0.5)  # Simulate processing time

        # Return mock embedding
        return [0.1 * i for i in range(384)]  # 384-dimensional embedding

    async def store_embedding(self, chunk_id: str, embedding: List[float]):
        """Store embedding in database"""
        async with self.db_pool.acquire() as conn:
            await conn.execute("""
                UPDATE document_chunks
                SET vector = $1, updated_at = NOW()
                WHERE id = $2
            """, embedding, chunk_id)

    async def schedule_similarity_indexing(self, chunk_id: str, embedding: List[float]):
        """Schedule similarity indexing task"""
        exchange = await self.channel.get_exchange("legal_ai_tasks")

        task_msg = TaskMessage(
            task_id=f"sim_{chunk_id}_{int(time.time())}",
            task_type="similarity_indexing",
            payload={
                "chunk_id": chunk_id,
                "embedding": embedding
            },
            priority=3
        )

        message = Message(
            json.dumps(asdict(task_msg)).encode(),
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            priority=task_msg.priority
        )

        await exchange.publish(message, "similarity.index")

    async def perform_legal_analysis(self, text: str, analysis_type: str) -> Dict[str, Any]:
        """Perform legal analysis on text"""
        # Simulate AI analysis
        await asyncio.sleep(3)

        analyses = {
            "summary": {"summary": f"Legal summary of: {text[:100]}...", "key_points": ["Point 1", "Point 2"]},
            "risks": {"risks": ["Risk 1", "Risk 2"], "risk_level": "medium"},
            "compliance": {"compliance_status": "compliant", "requirements": ["Req 1", "Req 2"]}
        }

        return analyses.get(analysis_type, {"analysis": "Generic legal analysis"})

    async def store_legal_analysis(self, document_id: str, analysis_type: str, analysis: Dict[str, Any]):
        """Store legal analysis results"""
        async with self.db_pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO legal_analyses (document_id, analysis_type, analysis, created_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (document_id, analysis_type)
                DO UPDATE SET analysis = $3, updated_at = NOW()
            """, document_id, analysis_type, json.dumps(analysis))

    async def update_vector_index(self, chunk_id: str, embedding: List[float]):
        """Update vector search index"""
        # In production, this might update a specialized vector database
        await asyncio.sleep(0.2)
        logger.debug(f"Vector index updated for chunk: {chunk_id}")

    async def find_similar_documents(self, embedding: List[float], limit: int = 10) -> List[str]:
        """Find similar documents using vector search"""
        await asyncio.sleep(0.5)  # Simulate vector search

        # Return mock similar document IDs
        return [f"doc_{i}" for i in range(min(limit, 5))]

    async def update_similarity_relationships(self, chunk_id: str, similar_docs: List[str]):
        """Update similarity relationships"""
        async with self.db_pool.acquire() as conn:
            for similar_doc in similar_docs:
                await conn.execute("""
                    INSERT INTO similarity_relationships (chunk_id, similar_chunk_id, similarity_score)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (chunk_id, similar_chunk_id)
                    DO UPDATE SET similarity_score = $3, updated_at = NOW()
                """, chunk_id, similar_doc, 0.85)  # Mock similarity score

    async def cache_result(self, result: TaskResult):
        """Cache task result in Redis"""
        cache_key = f"task_result:{result.task_id}"
        await self.redis_client.setex(
            cache_key,
            3600,  # 1 hour
            json.dumps(asdict(result))
        )

    async def update_stats(self, queue_name: str, status: str, processing_time: float = 0):
        """Update processing statistics"""
        await self.redis_client.hincrby("processor_stats", f"{queue_name}_{status}", 1)
        if processing_time > 0:
            await self.redis_client.hincrbyfloat("processor_stats", f"{queue_name}_total_time", processing_time)

    async def get_stats(self) -> Dict[str, Any]:
        """Get processor statistics"""
        stats = await self.redis_client.hgetall("processor_stats")

        return {
            "tasks_processed": self.tasks_processed,
            "uptime_seconds": time.time() - self.start_time,
            "running": self.running,
            "queue_stats": {k.decode(): v.decode() for k, v in stats.items()}
        }

    async def shutdown(self):
        """Graceful shutdown"""
        logger.info("Shutting down async task processor...")
        self.running = False

        if self.channel:
            await self.channel.close()
        if self.connection:
            await self.connection.close()
        if self.redis_client:
            await self.redis_client.close()
        if self.db_pool:
            await self.db_pool.close()

        logger.info("Shutdown complete")

# Main application
async def main():
    processor = AsyncTaskProcessor()

    # Signal handling for graceful shutdown
    def signal_handler(signum, frame):
        logger.info(f"Received signal {signum}, initiating shutdown...")
        asyncio.create_task(processor.shutdown())
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        # Initialize
        await processor.initialize()
        await processor.setup_queues()

        logger.info("Async task processor started successfully")

        # Start processing
        await processor.start_consuming()

    except Exception as e:
        logger.error(f"Failed to start processor: {e}")
        logger.error(traceback.format_exc())
        await processor.shutdown()
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())