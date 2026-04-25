"""
Upload Service: File upload to MinIO with worker pipeline triggering

Provides:
- File validation (type, size)
- MinIO upload with metadata
- RabbitMQ task publishing
- Processing status tracking
- Latency tracking and logging
"""

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Dict, List, Optional
from uuid import uuid4

import aio_pika
from minio import Minio
from minio.error import S3Error
from io import BytesIO

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


@dataclass
class UploadResult:
    """Upload result"""
    doc_id: str
    filename: str
    file_size: int
    file_path: str
    status: str
    progress_url: str
    timestamp: datetime


class UploadService:
    """Upload service with MinIO and RabbitMQ integration"""

    # Allowed file types
    ALLOWED_TYPES = {
        "application/pdf": ".pdf",
        "application/msword": ".doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/tiff": ".tiff",
    }

    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

    def __init__(
        self,
        minio_endpoint: str = "localhost:9000",
        minio_access_key: str = "minio",
        minio_secret_key: str = "minio123",
        minio_bucket: str = "legal-evidence",
        rabbitmq_url: str = "amqp://guest:guest@localhost:5672/",
    ):
        self.minio_endpoint = minio_endpoint
        self.minio_access_key = minio_access_key
        self.minio_secret_key = minio_secret_key
        self.minio_bucket = minio_bucket
        self.rabbitmq_url = rabbitmq_url

        # Initialize MinIO
        endpoint = minio_endpoint.replace("http://", "").replace("https://", "")
        self.minio = Minio(
            endpoint,
            access_key=minio_access_key,
            secret_key=minio_secret_key,
            secure=False,
        )

        self.rabbitmq_connection = None
        self.rabbitmq_channel = None

        logger.info(f"✅ Upload Service initialized")
        logger.info(f"   MinIO: {minio_endpoint}")
        logger.info(f"   RabbitMQ: {rabbitmq_url}")
        logger.info(f"   Max file size: {self.MAX_FILE_SIZE / 1024 / 1024}MB")

    async def connect_rabbitmq(self):
        """Connect to RabbitMQ"""
        try:
            self.rabbitmq_connection = await aio_pika.connect_robust(self.rabbitmq_url)
            self.rabbitmq_channel = await self.rabbitmq_connection.channel()
            logger.info("✅ Connected to RabbitMQ")
        except Exception as e:
            logger.error(f"Failed to connect to RabbitMQ: {e}")
            raise

    async def disconnect_rabbitmq(self):
        """Disconnect from RabbitMQ"""
        if self.rabbitmq_connection:
            await self.rabbitmq_connection.close()
            logger.info("✅ Disconnected from RabbitMQ")

    def _validate_file(self, filename: str, file_size: int, content_type: str) -> tuple[bool, str]:
        """Validate file type and size"""
        # Check file size
        if file_size > self.MAX_FILE_SIZE:
            return False, f"File too large (max {self.MAX_FILE_SIZE / 1024 / 1024}MB)"

        # Check file type
        if content_type not in self.ALLOWED_TYPES:
            return False, f"Unsupported file type: {content_type}"

        # Check filename
        if not filename or len(filename) > 255:
            return False, "Invalid filename"

        return True, ""

    async def upload_file(
        self,
        filename: str,
        file_data: bytes,
        content_type: str,
        case_id: str,
    ) -> UploadResult:
        """Upload file to MinIO and trigger worker pipeline"""
        start_time = time.time()
        doc_id = str(uuid4())

        try:
            # Validate file
            is_valid, error_msg = self._validate_file(filename, len(file_data), content_type)
            if not is_valid:
                logger.error(f"File validation failed: {error_msg}")
                raise ValueError(error_msg)

            logger.info(f"Uploading file: {filename} ({len(file_data)} bytes)")

            # Upload to MinIO
            file_path = f"evidence/{case_id}/{doc_id}/{filename}"

            self.minio.put_object(
                self.minio_bucket,
                file_path,
                BytesIO(file_data),
                len(file_data),
                content_type=content_type,
            )

            logger.info(f"✅ Uploaded to MinIO: {file_path}")

            # Publish task to RabbitMQ
            await self._publish_task(doc_id, case_id, file_path, filename)

            latency_ms = int((time.time() - start_time) * 1000)
            logger.info(f"✅ Upload completed in {latency_ms}ms")

            return UploadResult(
                doc_id=doc_id,
                filename=filename,
                file_size=len(file_data),
                file_path=file_path,
                status="uploading",
                progress_url=f"/api/upload/progress/{doc_id}",
                timestamp=datetime.now(),
            )

        except Exception as e:
            logger.error(f"Upload error: {e}")
            raise

    async def _publish_task(
        self,
        doc_id: str,
        case_id: str,
        file_path: str,
        filename: str,
    ) -> None:
        """Publish task to RabbitMQ"""
        try:
            if not self.rabbitmq_channel:
                await self.connect_rabbitmq()

            # Create exchange and queue
            exchange = await self.rabbitmq_channel.declare_exchange(
                "evidence",
                aio_pika.ExchangeType.DIRECT,
                durable=True,
            )

            queue = await self.rabbitmq_channel.declare_queue(
                "evidence.ingest",
                durable=True,
            )

            await queue.bind(exchange, "ingest")

            # Publish message
            task_payload = {
                "doc_id": doc_id,
                "case_id": case_id,
                "file_path": file_path,
                "filename": filename,
                "bucket": self.minio_bucket,
                "timestamp": datetime.now().isoformat(),
            }

            message = aio_pika.Message(
                body=json.dumps(task_payload).encode(),
                content_type="application/json",
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            )

            await exchange.publish(message, routing_key="ingest")

            logger.info(f"✅ Published task to RabbitMQ: {doc_id}")

        except Exception as e:
            logger.error(f"Error publishing task: {e}")
            raise

    async def get_upload_status(self, doc_id: str) -> Dict:
        """Get upload status (placeholder - would query Postgres in production)"""
        try:
            # In production, would query Postgres for status
            return {
                "doc_id": doc_id,
                "status": "processing",
                "progress": 50,
            }

        except Exception as e:
            logger.error(f"Error getting upload status: {e}")
            raise

    async def get_upload_history(self, case_id: str, limit: int = 10) -> List[Dict]:
        """Get upload history for case (placeholder - would query Postgres in production)"""
        try:
            # In production, would query Postgres for history
            return []

        except Exception as e:
            logger.error(f"Error getting upload history: {e}")
            raise

    async def close(self):
        """Close service"""
        await self.disconnect_rabbitmq()
        logger.info("✅ Upload Service closed")


# Global upload service instance
upload_service: Optional[UploadService] = None


async def get_upload_service() -> UploadService:
    """Get or create upload service instance"""
    global upload_service

    if upload_service is None:
        upload_service = UploadService()
        await upload_service.connect_rabbitmq()

    return upload_service


async def close_upload_service():
    """Close upload service"""
    global upload_service

    if upload_service:
        await upload_service.close()
        upload_service = None
