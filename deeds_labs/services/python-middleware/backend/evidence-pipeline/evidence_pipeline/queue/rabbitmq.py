"""RabbitMQ queue management and job dispatch."""

import aio_pika
from aio_pika import Channel, Queue
import json
import structlog
from typing import Dict, Any, Optional

from evidence_pipeline.config import settings
from evidence_pipeline.queue.connection import get_channel

logger = structlog.get_logger(__name__)

# Queue names
QUEUE_CLASSIFICATION = f"{settings.RABBITMQ_QUEUE_PREFIX}.classification"
QUEUE_OCR = f"{settings.RABBITMQ_QUEUE_PREFIX}.ocr"
QUEUE_PARSING = f"{settings.RABBITMQ_QUEUE_PREFIX}.parsing"
QUEUE_CHUNKING = f"{settings.RABBITMQ_QUEUE_PREFIX}.chunking"
QUEUE_EMBEDDING = f"{settings.RABBITMQ_QUEUE_PREFIX}.embedding"
QUEUE_INDEXING = f"{settings.RABBITMQ_QUEUE_PREFIX}.indexing"
QUEUE_ANALYSIS = f"{settings.RABBITMQ_QUEUE_PREFIX}.analysis"
QUEUE_DLQ = f"{settings.RABBITMQ_QUEUE_PREFIX}.dlq"

ALL_QUEUES = [
    QUEUE_CLASSIFICATION,
    QUEUE_OCR,
    QUEUE_PARSING,
    QUEUE_CHUNKING,
    QUEUE_EMBEDDING,
    QUEUE_INDEXING,
    QUEUE_ANALYSIS,
    QUEUE_DLQ,
]


async def init_queues():
    """Initialize all RabbitMQ queues."""
    try:
        channel = await get_channel()

        for queue_name in ALL_QUEUES:
            queue = await channel.declare_queue(
                queue_name,
                durable=True,
                auto_delete=False,
            )
            logger.info(f"Queue initialized: {queue_name}")

        logger.info("All RabbitMQ queues initialized")
    except Exception as e:
        logger.error("Failed to initialize queues", error=str(e))
        raise


async def publish_job(queue_name: str, job_data: Dict[str, Any]) -> bool:
    """Publish a job to a queue."""
    try:
        channel = await get_channel()

        message = aio_pika.Message(
            body=json.dumps(job_data).encode(),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        )

        await channel.default_exchange.publish(
            message,
            routing_key=queue_name,
        )

        logger.info(f"Job published to {queue_name}", job_id=job_data.get("job_id"))
        return True
    except Exception as e:
        logger.error(f"Failed to publish job to {queue_name}", error=str(e))
        return False


async def dispatch_classification_job(job_id: str, document_id: str, file_path: str) -> bool:
    """Dispatch a document classification job."""
    job_data = {
        "job_id": job_id,
        "document_id": document_id,
        "file_path": file_path,
    }
    return await publish_job(QUEUE_CLASSIFICATION, job_data)


async def dispatch_ocr_job(job_id: str, document_id: str, file_path: str) -> bool:
    """Dispatch an OCR job."""
    job_data = {
        "job_id": job_id,
        "document_id": document_id,
        "file_path": file_path,
    }
    return await publish_job(QUEUE_OCR, job_data)


async def dispatch_parsing_job(job_id: str, document_id: str, file_path: str) -> bool:
    """Dispatch a document parsing job."""
    job_data = {
        "job_id": job_id,
        "document_id": document_id,
        "file_path": file_path,
    }
    return await publish_job(QUEUE_PARSING, job_data)


async def dispatch_chunking_job(job_id: str, document_id: str, text: str) -> bool:
    """Dispatch a text chunking job."""
    job_data = {
        "job_id": job_id,
        "document_id": document_id,
        "text": text,
    }
    return await publish_job(QUEUE_CHUNKING, job_data)


async def dispatch_embedding_job(job_id: str, document_id: str, chunks: list) -> bool:
    """Dispatch an embedding generation job."""
    job_data = {
        "job_id": job_id,
        "document_id": document_id,
        "chunks": chunks,
    }
    return await publish_job(QUEUE_EMBEDDING, job_data)


async def dispatch_indexing_job(job_id: str, document_id: str, embeddings: list) -> bool:
    """Dispatch a vector indexing job."""
    job_data = {
        "job_id": job_id,
        "document_id": document_id,
        "embeddings": embeddings,
    }
    return await publish_job(QUEUE_INDEXING, job_data)


async def dispatch_analysis_job(job_id: str, document_id: str, chunks: list) -> bool:
    """Dispatch a legal entity analysis job."""
    job_data = {
        "job_id": job_id,
        "document_id": document_id,
        "chunks": chunks,
    }
    return await publish_job(QUEUE_ANALYSIS, job_data)
