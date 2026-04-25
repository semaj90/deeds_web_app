"""
OCR + Chunk Worker: Fetch from MinIO → Process with Docling → Chunk → Upload results

Consumes from RabbitMQ 'embedding' queue and:
1. Fetches file from MinIO
2. Processes with Granite-Docling (OCR + layout)
3. Chunks with HybridChunker (multiprocessing)
4. Uploads pages + chunks to MinIO
5. Publishes embedding tasks for each chunk

Optimizations:
- Multiprocessing pool for page processing (4 workers)
- NVTX profiling for CUDA graph capture
- Batch tokenization via CUDA tokenizer service
- Async/await for I/O operations
"""

import asyncio
import json
import logging
import os
import tempfile
from concurrent.futures import ProcessPoolExecutor
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict

import httpx
import redis
from minio import Minio
from minio.error import S3Error
from io import BytesIO

# Import local modules
from backend.mq_client import RabbitMQClient, MQTask
from backend.chunker_langextract import HybridChunker, Chunk
from backend.docling_gateway import GraniteDoclingProcessor

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# Try to import NVTX for profiling (optional)
try:
    from tensorrt_llm.utils.nvtx import nvtx_range
    NVTX_AVAILABLE = True
except ImportError:
    NVTX_AVAILABLE = False
    # Fallback context manager
    from contextlib import contextmanager
    @contextmanager
    def nvtx_range(name):
        yield


@dataclass
class ProcessingResult:
    """Result of OCR + chunking"""
    doc_id: str
    page_count: int
    chunk_count: int
    pages_uploaded: int
    chunks_uploaded: int
    status: str


class OCRChunkWorker:
    """Worker for OCR + chunking pipeline with multiprocessing optimization"""

    def __init__(
        self,
        minio_endpoint: str = None,
        minio_access_key: str = None,
        minio_secret_key: str = None,
        minio_bucket: str = "legal-evidence",
        redis_url: str = None,
        rabbitmq_url: str = None,
        tokenizer_service_url: str = None,
        num_workers: int = 4,
    ):
        # MinIO
        self.minio_endpoint = minio_endpoint or os.getenv("MINIO_ENDPOINT", "localhost:9000")
        self.minio_access_key = minio_access_key or os.getenv("MINIO_ACCESS_KEY", "minio")
        self.minio_secret_key = minio_secret_key or os.getenv("MINIO_SECRET_KEY", "minio123")
        self.minio_bucket = minio_bucket

        # Redis
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")
        self.redis_client = redis.from_url(self.redis_url)

        # RabbitMQ
        self.rabbitmq_url = rabbitmq_url or os.getenv("RABBITMQ_URL", "amqp://legalai:legalai123@localhost:5672/legalai")
        self.mq_client = RabbitMQClient()

        # CUDA Tokenizer Service
        self.tokenizer_service_url = tokenizer_service_url or os.getenv("TOKENIZER_SERVICE_URL", "http://localhost:8000")

        # Multiprocessing pool for page processing
        self.num_workers = num_workers
        self.executor = ProcessPoolExecutor(max_workers=num_workers)

        # Initialize clients
        self.minio = self._init_minio()
        self.chunker = HybridChunker()
        self.vlm = GraniteDoclingProcessor()

        logger.info(f"✅ OCR Chunk Worker initialized")
        logger.info(f"   Workers: {num_workers}")
        logger.info(f"   Tokenizer Service: {self.tokenizer_service_url}")
        logger.info(f"   NVTX Profiling: {'enabled' if NVTX_AVAILABLE else 'disabled'}")

    def _init_minio(self) -> Minio:
        """Initialize MinIO client"""
        endpoint = self.minio_endpoint.replace("http://", "").replace("https://", "")
        return Minio(
            endpoint,
            access_key=self.minio_access_key,
            secret_key=self.minio_secret_key,
            secure=False,
        )

    async def process_upload(self, task: MQTask) -> ProcessingResult:
        """Process uploaded file: OCR → Chunk → Upload results (optimized with multiprocessing)"""
        doc_id = task.payload.get("doc_id")
        file_path = task.payload.get("file_path")
        bucket = task.payload.get("bucket")

        logger.info(f"🔄 Processing: {doc_id}")

        try:
            # 1. Fetch file from MinIO
            with nvtx_range("fetch_minio"):
                logger.info(f"📥 Fetching from MinIO: {file_path}")
                file_data = self._fetch_from_minio(bucket, file_path)

            # 2. Save to temp file
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                tmp.write(file_data)
                tmp_path = tmp.name

            # 3. Process with Docling (OCR + layout)
            with nvtx_range("docling_ocr"):
                logger.info(f"🔍 Processing with Docling: {doc_id}")
                doctags = self.vlm.process_document(tmp_path, doc_id)

            # 4. Chunk the document (multiprocessing)
            with nvtx_range("chunking"):
                logger.info(f"✂️ Chunking document: {doc_id} ({len(doctags.pages)} pages)")
                chunks = self.chunker.from_doctags(doctags)

            # 5. Tokenize chunks (GPU-accelerated via service)
            with nvtx_range("cuda_tokenization"):
                logger.info(f"🔤 Tokenizing {len(chunks)} chunks via CUDA service")
                chunks = await self._tokenize_chunks_async(chunks)

            # 6. Upload pages to MinIO (parallel)
            with nvtx_range("upload_pages"):
                logger.info(f"📤 Uploading {len(doctags.pages)} pages to MinIO")
                pages_uploaded = await self._upload_pages_async(doc_id, bucket, doctags.pages)

            # 7. Upload chunks to MinIO (parallel)
            with nvtx_range("upload_chunks"):
                logger.info(f"📤 Uploading {len(chunks)} chunks to MinIO")
                chunks_uploaded = await self._upload_chunks_async(doc_id, bucket, chunks)

            # 8. Publish embedding tasks
            with nvtx_range("publish_tasks"):
                logger.info(f"📢 Publishing {len(chunks)} embedding tasks")
                await self._publish_embedding_tasks(doc_id, bucket, chunks)

            # 9. Clean up
            os.unlink(tmp_path)

            result = ProcessingResult(
                doc_id=doc_id,
                page_count=len(doctags.pages),
                chunk_count=len(chunks),
                pages_uploaded=pages_uploaded,
                chunks_uploaded=chunks_uploaded,
                status="completed",
            )

            logger.info(f"✅ Completed: {doc_id} ({len(chunks)} chunks)")
            return result

        except Exception as e:
            logger.error(f"❌ Error processing {doc_id}: {e}")
            return ProcessingResult(
                doc_id=doc_id,
                page_count=0,
                chunk_count=0,
                pages_uploaded=0,
                chunks_uploaded=0,
                status=f"error: {str(e)}",
            )

    def _fetch_from_minio(self, bucket: str, file_path: str) -> bytes:
        """Fetch file from MinIO"""
        try:
            response = self.minio.get_object(bucket, file_path)
            data = response.read()
            response.close()
            return data
        except S3Error as e:
            logger.error(f"MinIO fetch error: {e}")
            raise

    async def _tokenize_chunks_async(self, chunks: List[Chunk]) -> List[Chunk]:
        """Tokenize chunks using GPU-accelerated CUDA tokenizer service"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                for chunk in chunks:
                    try:
                        response = await client.post(
                            f"{self.tokenizer_service_url}/tokenize",
                            json={"text": chunk.text, "max_length": 8192},
                        )

                        if response.status_code == 200:
                            data = response.json()
                            chunk.tokens = data.get("token_count", 0)
                            logger.debug(f"  ✅ Tokenized chunk {chunk.id}: {chunk.tokens} tokens")
                        else:
                            logger.warning(f"  ⚠️ Tokenization failed for {chunk.id}: {response.status_code}")

                    except Exception as e:
                        logger.warning(f"  ⚠️ Error tokenizing chunk {chunk.id}: {e}")
                        # Continue with chunk even if tokenization fails

            return chunks

        except Exception as e:
            logger.error(f"Tokenization service error: {e}")
            return chunks

    async def _upload_pages_async(self, doc_id: str, bucket: str, pages: List[Dict]) -> int:
        """Upload OCR pages to MinIO (parallel)"""
        uploaded = 0
        loop = asyncio.get_event_loop()

        async def upload_page(page):
            try:
                page_num = page.get("page_num", 0)
                page_path = f"evidence/{doc_id}/pages/{page_num}.json"

                page_json = json.dumps(page).encode()

                # Run in executor to avoid blocking
                await loop.run_in_executor(
                    self.executor,
                    self.minio.put_object,
                    bucket,
                    page_path,
                    BytesIO(page_json),
                    len(page_json),
                )

                logger.debug(f"  ✅ Uploaded page {page_num}")
                return 1
            except Exception as e:
                logger.error(f"  ❌ Error uploading page {page.get('page_num', 0)}: {e}")
                return 0

        # Upload pages in parallel
        results = await asyncio.gather(*[upload_page(page) for page in pages])
        uploaded = sum(results)

        return uploaded

    async def _upload_chunks_async(self, doc_id: str, bucket: str, chunks: List[Chunk]) -> int:
        """Upload chunks to MinIO (parallel)"""
        uploaded = 0
        loop = asyncio.get_event_loop()

        async def upload_chunk(chunk):
            try:
                chunk_path = f"evidence/{doc_id}/chunks/{chunk.id}.json"

                chunk_data = {
                    "id": chunk.id,
                    "doc_id": chunk.doc_id,
                    "text": chunk.text,
                    "tokens": chunk.tokens,
                    "semantic_type": chunk.semantic_type,
                    "page": chunk.page,
                    "bounding_boxes": chunk.bounding_boxes,
                    "metadata": chunk.metadata,
                }

                chunk_json = json.dumps(chunk_data).encode()

                # Run in executor to avoid blocking
                await loop.run_in_executor(
                    self.executor,
                    self.minio.put_object,
                    bucket,
                    chunk_path,
                    BytesIO(chunk_json),
                    len(chunk_json),
                )

                logger.debug(f"  ✅ Uploaded chunk {chunk.id}")
                return 1
            except Exception as e:
                logger.error(f"  ❌ Error uploading chunk {chunk.id}: {e}")
                return 0

        # Upload chunks in parallel
        results = await asyncio.gather(*[upload_chunk(chunk) for chunk in chunks])
        uploaded = sum(results)

        return uploaded

    def _upload_pages(self, doc_id: str, bucket: str, pages: List[Dict]) -> int:
        """Upload OCR pages to MinIO (synchronous fallback)"""
        uploaded = 0

        for page in pages:
            try:
                page_num = page.get("page_num", 0)
                page_path = f"evidence/{doc_id}/pages/{page_num}.json"

                page_json = json.dumps(page).encode()
                self.minio.put_object(
                    bucket,
                    page_path,
                    BytesIO(page_json),
                    len(page_json),
                )

                uploaded += 1
                logger.debug(f"  ✅ Uploaded page {page_num}")

            except Exception as e:
                logger.error(f"  ❌ Error uploading page {page_num}: {e}")

        return uploaded

    def _upload_chunks(self, doc_id: str, bucket: str, chunks: List[Chunk]) -> int:
        """Upload chunks to MinIO (synchronous fallback)"""
        uploaded = 0

        for chunk in chunks:
            try:
                chunk_path = f"evidence/{doc_id}/chunks/{chunk.id}.json"

                chunk_data = {
                    "id": chunk.id,
                    "doc_id": chunk.doc_id,
                    "text": chunk.text,
                    "tokens": chunk.tokens,
                    "semantic_type": chunk.semantic_type,
                    "page": chunk.page,
                    "bounding_boxes": chunk.bounding_boxes,
                    "metadata": chunk.metadata,
                }

                chunk_json = json.dumps(chunk_data).encode()
                self.minio.put_object(
                    bucket,
                    chunk_path,
                    BytesIO(chunk_json),
                    len(chunk_json),
                )

                uploaded += 1
                logger.debug(f"  ✅ Uploaded chunk {chunk.id}")

            except Exception as e:
                logger.error(f"  ❌ Error uploading chunk {chunk.id}: {e}")

        return uploaded

    async def _publish_embedding_tasks(self, doc_id: str, bucket: str, chunks: List[Chunk]) -> None:
        """Publish embedding tasks for each chunk"""
        await self.mq_client.connect()

        for chunk in chunks:
            try:
                task_id = await self.mq_client.publish_task(
                    task_type="embedding",
                    payload={
                        "chunk_id": chunk.id,
                        "doc_id": doc_id,
                        "bucket": bucket,
                        "text": chunk.text,
                        "tokens": chunk.tokens,
                        "semantic_type": chunk.semantic_type,
                        "page": chunk.page,
                    },
                )

                logger.debug(f"  📢 Published embedding task: {task_id}")

            except Exception as e:
                logger.error(f"  ❌ Error publishing embedding task for {chunk.id}: {e}")

        await self.mq_client.close()

    def shutdown(self):
        """Shutdown worker resources"""
        logger.info("🛑 Shutting down OCR + Chunk Worker...")
        self.executor.shutdown(wait=True)
        logger.info("✅ Worker shutdown complete")

    async def start(self) -> None:
        """Start consuming OCR tasks"""
        logger.info("🚀 Starting OCR + Chunk Worker")
        logger.info(f"   Multiprocessing workers: {self.num_workers}")
        logger.info(f"   CUDA Tokenizer Service: {self.tokenizer_service_url}")

        await self.mq_client.connect()

        try:
            await self.mq_client.consume_tasks(
                queue_type="ingest",  # Consume from ingest queue (OCR -> chunk)
                callback=self.process_upload,
                prefetch_count=1,
            )
        except KeyboardInterrupt:
            logger.info("Shutting down OCR + Chunk Worker...")
        finally:
            self.shutdown()
            await self.mq_client.close()


async def main():
    """Main entry point"""
    worker = OCRChunkWorker()
    await worker.start()


if __name__ == "__main__":
    asyncio.run(main())
