#!/usr/bin/env python3
"""
RAG Ingestion Worker for Legal AI Platform
Processes crawled documents through MinIO upload, embedding generation, and vector storage
"""

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Dict, List, Any, Optional
from pathlib import Path

import aio_pika
import aiohttp
import boto3
from botocore.exceptions import ClientError
import numpy as np
from pydantic import BaseModel, Field
import redis.asyncio as redis
from sentence_transformers import SentenceTransformer
import psycopg2
from psycopg2.extras import execute_values
import pgvector.psycopg2

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class IngestionJob(BaseModel):
    """Ingestion job model"""
    job_id: str = Field(..., description="Unique job identifier")
    source: str = Field(..., description="Source of the documents (e.g., 'web_crawl', 'upload')")
    documents: List[Dict[str, Any]] = Field(..., description="List of documents to process")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Job metadata")
    priority: int = Field(default=1, description="Job priority (1-10, higher is more important)")
    created_at: datetime = Field(default_factory=datetime.utcnow)

class DocumentChunk(BaseModel):
    """Document chunk model"""
    content: str
    metadata: Dict[str, Any]
    embedding: Optional[List[float]] = None
    chunk_id: str = Field(default_factory=lambda: f"chunk_{datetime.utcnow().timestamp()}")
    document_id: str

class RAGIngestionWorker:
    """RAG ingestion worker for processing crawled documents"""

    def __init__(self):
        # Configuration
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:4005")
        self.rabbitmq_url = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
        self.minio_endpoint = os.getenv("MINIO_ENDPOINT", "localhost:4002")
        self.minio_access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
        self.minio_secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")
        self.minio_bucket = os.getenv("MINIO_BUCKET", "legal-documents")
        self.postgres_url = os.getenv("DATABASE_URL", "postgresql://postgres:123456@localhost:5432/legal_ai_db")
        self.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.embedding_model = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
        self.chunk_size = int(os.getenv("CHUNK_SIZE", "600"))
        self.chunk_overlap = int(os.getenv("CHUNK_OVERLAP", "60"))

        # Initialize clients
        self.redis_client = None
        self.rabbitmq_connection = None
        self.minio_client = None
        self.db_connection = None
        self.embedding_model_instance = None

        # Queues
        self.ingestion_queue = "rag_ingestion_jobs"
        self.completed_queue = "rag_ingestion_completed"

    async def initialize(self):
        """Initialize all clients and connections"""
        logger.info("Initializing RAG Ingestion Worker...")

        # Initialize Redis
        self.redis_client = redis.from_url(self.redis_url)
        await self.redis_client.ping()
        logger.info("✅ Redis connected")

        # Initialize RabbitMQ
        self.rabbitmq_connection = await aio_pika.connect_robust(self.rabbitmq_url)
        self.channel = await self.rabbitmq_connection.channel()
        await self.channel.declare_queue(self.ingestion_queue, durable=True)
        await self.channel.declare_queue(self.completed_queue, durable=True)
        logger.info("✅ RabbitMQ connected")

        # Initialize MinIO
        self.minio_client = boto3.client(
            's3',
            endpoint_url=f"http://{self.minio_endpoint}",
            aws_access_key_id=self.minio_access_key,
            aws_secret_access_key=self.minio_secret_key,
            region_name='us-east-1'
        )

        # Ensure bucket exists
        try:
            self.minio_client.head_bucket(Bucket=self.minio_bucket)
        except ClientError:
            self.minio_client.create_bucket(Bucket=self.minio_bucket)
            logger.info(f"✅ Created MinIO bucket: {self.minio_bucket}")

        # Initialize PostgreSQL with pgvector
        self.db_connection = psycopg2.connect(self.postgres_url)
        self.db_connection.autocommit = True

        # Enable pgvector extension
        with self.db_connection.cursor() as cursor:
            cursor.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS document_chunks (
                    id SERIAL PRIMARY KEY,
                    document_id VARCHAR(255) NOT NULL,
                    chunk_id VARCHAR(255) NOT NULL UNIQUE,
                    content TEXT NOT NULL,
                    metadata JSONB,
                    embedding vector(384),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
                ON document_chunks USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = 100);
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_document_chunks_metadata
                ON document_chunks USING gin (metadata);
            """)

        logger.info("✅ PostgreSQL with pgvector initialized")

        # Initialize embedding model (fallback to local if Ollama unavailable)
        try:
            await self.initialize_embedding_model()
        except Exception as e:
            logger.warning(f"⚠️ Embedding model initialization failed: {e}")
            logger.info("🔄 Falling back to sentence-transformers")
            self.embedding_model_instance = SentenceTransformer('all-MiniLM-L6-v2')

        logger.info("🚀 RAG Ingestion Worker initialized successfully")

    async def initialize_embedding_model(self):
        """Initialize Ollama embedding model"""
        async with aiohttp.ClientSession() as session:
            try:
                # Check if model is available
                async with session.get(f"{self.ollama_url}/api/tags") as response:
                    if response.status == 200:
                        models = await response.json()
                        model_names = [m['name'] for m in models.get('models', [])]
                        if self.embedding_model in model_names:
                            logger.info(f"✅ Ollama embedding model available: {self.embedding_model}")
                            return
                        else:
                            logger.warning(f"⚠️ Model {self.embedding_model} not found, pulling...")
                            # Pull the model
                            async with session.post(
                                f"{self.ollama_url}/api/pull",
                                json={"name": self.embedding_model}
                            ) as pull_response:
                                if pull_response.status == 200:
                                    logger.info(f"✅ Model {self.embedding_model} pulled successfully")
                                    return
            except Exception as e:
                logger.error(f"❌ Failed to initialize Ollama embedding model: {e}")
                raise

    async def generate_embeddings_ollama(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings using Ollama"""
        async with aiohttp.ClientSession() as session:
            embeddings = []
            for text in texts:
                try:
                    async with session.post(
                        f"{self.ollama_url}/api/embeddings",
                        json={
                            "model": self.embedding_model,
                            "prompt": text
                        }
                    ) as response:
                        if response.status == 200:
                            result = await response.json()
                            embedding = result.get('embedding', [])
                            embeddings.append(embedding)
                        else:
                            logger.warning(f"⚠️ Embedding generation failed for text: {text[:50]}...")
                            embeddings.append([0.0] * 384)  # Fallback zero vector
                except Exception as e:
                    logger.error(f"❌ Embedding generation error: {e}")
                    embeddings.append([0.0] * 384)
            return embeddings

    def generate_embeddings_local(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings using local sentence-transformers model"""
        embeddings = self.embedding_model_instance.encode(texts, convert_to_numpy=True)
        return embeddings.tolist()

    def chunk_text(self, text: str, chunk_size: int = None, overlap: int = None) -> List[str]:
        """Split text into overlapping chunks"""
        if chunk_size is None:
            chunk_size = self.chunk_size
        if overlap is None:
            overlap = self.chunk_overlap

        chunks = []
        start = 0
        text_length = len(text)

        while start < text_length:
            end = start + chunk_size
            chunk = text[start:end]

            # Clean up chunk boundaries
            if end < text_length:
                # Try to break at sentence boundary
                last_sentence_end = max(
                    chunk.rfind('. '), chunk.rfind('! '), chunk.rfind('? '),
                    chunk.rfind('\n'), chunk.rfind(' ')
                )
                if last_sentence_end > chunk_size // 2:
                    chunk = chunk[:last_sentence_end + 1]
                    end = start + last_sentence_end + 1

            chunks.append(chunk.strip())
            start = end - overlap

            if start >= text_length:
                break

        return chunks

    async def upload_to_minio(self, content: str, filename: str, metadata: Dict[str, Any]) -> str:
        """Upload content to MinIO and return object key"""
        try:
            object_key = f"crawled/{datetime.utcnow().strftime('%Y/%m/%d')}/{filename}"

            # Add metadata
            minio_metadata = {
                'source': metadata.get('source', 'web_crawl'),
                'url': metadata.get('url', ''),
                'title': metadata.get('title', ''),
                'crawled_at': metadata.get('crawled_at', datetime.utcnow().isoformat()),
                'content_type': 'text/plain'
            }

            self.minio_client.put_object(
                Bucket=self.minio_bucket,
                Key=object_key,
                Body=content.encode('utf-8'),
                Metadata=minio_metadata,
                ContentType='text/plain'
            )

            logger.info(f"✅ Uploaded to MinIO: {object_key}")
            return object_key

        except Exception as e:
            logger.error(f"❌ MinIO upload failed: {e}")
            raise

    async def store_chunks_in_vector_db(self, chunks: List[DocumentChunk]):
        """Store document chunks with embeddings in PostgreSQL vector database"""
        try:
            with self.db_connection.cursor() as cursor:
                # Prepare data for bulk insert
                values = []
                for chunk in chunks:
                    if chunk.embedding:
                        values.append((
                            chunk.document_id,
                            chunk.chunk_id,
                            chunk.content,
                            json.dumps(chunk.metadata),
                            chunk.embedding
                        ))

                if values:
                    execute_values(
                        cursor,
                        """
                        INSERT INTO document_chunks (document_id, chunk_id, content, metadata, embedding)
                        VALUES %s
                        ON CONFLICT (chunk_id) DO UPDATE SET
                            content = EXCLUDED.content,
                            metadata = EXCLUDED.metadata,
                            embedding = EXCLUDED.embedding
                        """,
                        values
                    )

                    logger.info(f"✅ Stored {len(values)} chunks in vector database")

        except Exception as e:
            logger.error(f"❌ Vector database storage failed: {e}")
            raise

    async def process_document(self, document: Dict[str, Any], job_metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Process a single document through the RAG pipeline"""
        try:
            doc_id = f"doc_{datetime.utcnow().timestamp()}_{hash(document.get('url', ''))}"
            url = document.get('url', '')
            title = document.get('title', 'Untitled')
            content = document.get('text', document.get('content', ''))

            if not content:
                logger.warning(f"⚠️ No content found for document: {url}")
                return {"status": "skipped", "reason": "no_content", "document_id": doc_id}

            # Upload raw content to MinIO
            filename = f"{doc_id}_{title.replace('/', '_')[:50]}.txt"
            minio_key = await self.upload_to_minio(content, filename, {
                'source': 'web_crawl',
                'url': url,
                'title': title,
                'crawled_at': document.get('crawled_at', datetime.utcnow().isoformat())
            })

            # Chunk the content
            text_chunks = self.chunk_text(content)

            # Generate embeddings
            if hasattr(self, 'generate_embeddings_ollama') and self.ollama_url:
                try:
                    embeddings = await self.generate_embeddings_ollama(text_chunks)
                except:
                    embeddings = self.generate_embeddings_local(text_chunks)
            else:
                embeddings = self.generate_embeddings_local(text_chunks)

            # Create document chunks
            chunks = []
            for i, (chunk_text, embedding) in enumerate(zip(text_chunks, embeddings)):
                chunk = DocumentChunk(
                    content=chunk_text,
                    metadata={
                        'document_id': doc_id,
                        'chunk_index': i,
                        'total_chunks': len(text_chunks),
                        'url': url,
                        'title': title,
                        'minio_key': minio_key,
                        'source': 'web_crawl',
                        'crawled_at': document.get('crawled_at'),
                        'job_id': job_metadata.get('job_id')
                    },
                    embedding=embedding,
                    document_id=doc_id
                )
                chunks.append(chunk)

            # Store in vector database
            await self.store_chunks_in_vector_db(chunks)

            # Cache document metadata in Redis
            await self.redis_client.setex(
                f"rag:doc:{doc_id}",
                86400,  # 24 hours
                json.dumps({
                    'id': doc_id,
                    'url': url,
                    'title': title,
                    'minio_key': minio_key,
                    'chunks_count': len(chunks),
                    'total_tokens': sum(len(c.content.split()) for c in chunks),
                    'created_at': datetime.utcnow().isoformat(),
                    'job_id': job_metadata.get('job_id')
                })
            )

            logger.info(f"✅ Processed document: {title} ({len(chunks)} chunks)")
            return {
                "status": "completed",
                "document_id": doc_id,
                "chunks_count": len(chunks),
                "minio_key": minio_key,
                "url": url,
                "title": title
            }

        except Exception as e:
            logger.error(f"❌ Document processing failed: {e}")
            return {"status": "failed", "error": str(e), "url": document.get('url')}

    async def process_ingestion_job(self, job: IngestionJob) -> Dict[str, Any]:
        """Process an ingestion job"""
        logger.info(f"🔄 Processing ingestion job: {job.job_id}")

        start_time = datetime.utcnow()
        results = []

        for document in job.documents:
            result = await self.process_document(document, job.metadata)
            results.append(result)

        # Calculate job statistics
        completed = sum(1 for r in results if r['status'] == 'completed')
        failed = sum(1 for r in results if r['status'] == 'failed')
        skipped = sum(1 for r in results if r['status'] == 'skipped')

        job_result = {
            "job_id": job.job_id,
            "source": job.source,
            "total_documents": len(job.documents),
            "completed": completed,
            "failed": failed,
            "skipped": skipped,
            "processing_time": (datetime.utcnow() - start_time).total_seconds(),
            "results": results,
            "completed_at": datetime.utcnow().isoformat()
        }

        # Publish completion message
        await self.channel.default_exchange.publish(
            aio_pika.Message(
                body=json.dumps(job_result).encode(),
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT
            ),
            routing_key=self.completed_queue
        )

        logger.info(f"✅ Completed ingestion job: {job.job_id} ({completed}/{len(job.documents)} documents)")
        return job_result

    async def consume_jobs(self):
        """Consume ingestion jobs from RabbitMQ queue"""
        logger.info(f"👂 Listening for ingestion jobs on queue: {self.ingestion_queue}")

        queue = await self.channel.declare_queue(self.ingestion_queue, durable=True)

        async with queue.iterator() as queue_iter:
            async for message in queue_iter:
                async with message.process():
                    try:
                        job_data = json.loads(message.body.decode())
                        job = IngestionJob(**job_data)
                        await self.process_ingestion_job(job)
                    except Exception as e:
                        logger.error(f"❌ Job processing error: {e}")
                        # Send to dead letter queue or retry logic could be added here

    async def run(self):
        """Run the ingestion worker"""
        await self.initialize()

        try:
            await self.consume_jobs()
        except KeyboardInterrupt:
            logger.info("🛑 Shutting down RAG Ingestion Worker...")
        finally:
            await self.cleanup()

    async def cleanup(self):
        """Clean up resources"""
        if self.rabbitmq_connection:
            await self.rabbitmq_connection.close()
        if self.redis_client:
            await self.redis_client.close()
        if self.db_connection:
            self.db_connection.close()
        logger.info("🧹 Cleanup completed")

async def main():
    """Main entry point"""
    worker = RAGIngestionWorker()
    await worker.run()

if __name__ == "__main__":
    asyncio.run(main())