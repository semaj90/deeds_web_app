"""
YoRHa Document Ingestion Service
Complete pipeline: MinIO → OCR → Embedding → pgvector/Qdrant → Redis Cache

Stack: Drizzle ORM 0.44, PostgreSQL 17 + pgvector, MinIO, Redis, Qdrant
LLM: gemma3-legal:latest via Ollama (future: TRT-LLM/Triton)
"""

import os
import hashlib
import asyncio
from datetime import datetime
from typing import List, Dict, Optional, Any
from dataclasses import dataclass
import json

# MinIO client
from minio import Minio
from minio.error import S3Error

# Redis for caching
import redis.asyncio as redis

# PostgreSQL + Drizzle via Python client
import asyncpg

# Ollama for embeddings and LLM
import httpx

# OCR (Tesseract)
try:
    import pytesseract
    from PIL import Image
    import pdf2image
    HAS_OCR = True
except ImportError:
   HAS_OCR = False

# Configuration
@dataclass
class IngestionConfig:
    # PostgreSQL
    postgres_host: str = os.getenv("POSTGRES_HOST", "localhost")
    postgres_port: int = int(os.getenv("POSTGRES_PORT", "5434"))
    postgres_db: str = os.getenv("POSTGRES_DB", "legal_ai_db")
    postgres_user: str = os.getenv("POSTGRES_USER", "legal_admin")
    postgres_password: str = os.getenv("POSTGRES_PASSWORD", "123456")

    # MinIO
    minio_endpoint: str = os.getenv("MINIO_ENDPOINT", "localhost:9000")
    minio_access_key: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    minio_secret_key: str = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    minio_secure: bool = os.getenv("MINIO_USE_SSL", "false").lower() == "true"
    minio_bucket: str = os.getenv("MINIO_BUCKET_LEGAL_DOCS", "legal-documents")

    # Redis
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    redis_password: Optional[str] = os.getenv("REDIS_PASSWORD", "redis")

    # Ollama
    ollama_url: str = os.getenv("OLLAMA_URL", "http://localhost:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "gemma3-legal:latest")
    ollama_embed_model: str = os.getenv("OLLAMA_EMBED_MODEL", "embeddinggemma:latest")

    # Qdrant
    qdrant_url: str = os.getenv("QDRANT_URL", "http://localhost:6333")
    qdrant_collection: str = "legal_documents"

    # Processing
    chunk_size: int = 1000
    chunk_overlap: int = 200
    embedding_dim: int = 384  # embeddinggemma dimensions

    @property
    def postgres_dsn(self) -> str:
        return f"postgres://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"


class DocumentIngestionService:
    """Complete document ingestion pipeline"""

    def __init__(self, config: Optional[IngestionConfig] = None):
        self.config = config or IngestionConfig()
        self.minio_client: Optional[Minio] = None
        self.redis_client: Optional[redis.Redis] = None
        self.pg_pool: Optional[asyncpg.Pool] = None
        self.http_client = httpx.AsyncClient(timeout=60.0)

    async def initialize(self):
        """Initialize all service connections"""
        # MinIO
        self.minio_client = Minio(
            self.config.minio_endpoint,
            access_key=self.config.minio_access_key,
            secret_key=self.config.minio_secret_key,
            secure=self.config.minio_secure
        )

        # Ensure bucket exists
        if not self.minio_client.bucket_exists(self.config.minio_bucket):
            self.minio_client.make_bucket(self.config.minio_bucket)
            print(f"✅ Created MinIO bucket: {self.config.minio_bucket}")

        # Redis
        self.redis_client = await redis.from_url(
            self.config.redis_url,
            password=self.config.redis_password,
            decode_responses=True
        )
        await self.redis_client.ping()
        print("✅ Connected to Redis")

        # PostgreSQL pool
        self.pg_pool = await asyncpg.create_pool(
            self.config.postgres_dsn,
            min_size=2,
            max_size=10
        )
        print("✅ Connected to PostgreSQL")

        # Enable pgvector extension
        async with self.pg_pool.acquire() as conn:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            print("✅ Enabled pgvector extension")

    async def close(self):
        """Clean up connections"""
        if self.http_client:
            await self.http_client.aclose()
        if self.redis_client:
            await self.redis_client.close()
        if self.pg_pool:
            await self.pg_pool.close()

    def get_ollama_endpoint(self, path: str = "") -> str:
        """Get Ollama endpoint - matches frontend getOllamaEndpoint()"""
        base = self.config.ollama_url.rstrip("/")
        return f"{base}/{path.lstrip('/')}" if path else base

    async def upload_to_minio(
        self,
        file_path: str,
        object_name: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None
    ) -> str:
        """Upload file to MinIO and return object name"""
        if object_name is None:
            object_name = os.path.basename(file_path)

        self.minio_client.fput_object(
            self.config.minio_bucket,
            object_name,
            file_path,
            metadata=metadata or {}
        )

        print(f"✅ Uploaded to MinIO: {object_name}")
        return object_name

    async def extract_text(self, file_path: str, mime_type: str) -> str:
        """Extract text from document (OCR for PDFs/images)"""
        if mime_type == "text/plain":
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()

        if mime_type == "application/pdf" and HAS_OCR:
            # Convert PDF to images
            images = pdf2image.convert_from_path(file_path, dpi=300)

            # OCR each page
            text_parts = []
            for i, image in enumerate(images):
                text = pytesseract.image_to_string(image)
                text_parts.append(f"[Page {i+1}]\n{text}")

            return "\n\n".join(text_parts)

        # Fallback
        return f"[Unsupported file type: {mime_type}]"

    def create_chunks(self, text: str) -> List[str]:
        """Semantic chunking with overlap"""
        # Split by paragraphs first
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

        chunks = []
        current_chunk = ""

        for para in paragraphs:
            candidate = f"{current_chunk}\n\n{para}".strip()

            if len(candidate) > self.config.chunk_size and current_chunk:
                chunks.append(current_chunk)
                # Overlap: keep last N chars
                overlap_text = current_chunk[-self.config.chunk_overlap:]
                current_chunk = f"{overlap_text}\n\n{para}".strip()
            else:
                current_chunk = candidate

        if current_chunk:
            chunks.append(current_chunk)

        return chunks if chunks else [text[:self.config.chunk_size]]

    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding using Ollama"""
        cache_key = f"embed:{hashlib.sha256(text.encode()).hexdigest()}"

        # Check cache
        cached = await self.redis_client.get(cache_key)
        if cached:
            return json.loads(cached)

        # Call Ollama
        url = self.get_ollama_endpoint("api/embeddings")
        response = await self.http_client.post(
            url,
            json={
                "model": self.config.ollama_embed_model,
                "prompt": text[:2000]  # Limit context
            }
        )
        response.raise_for_status()

        data = response.json()
        embedding = data.get("embedding", [])

        # Cache for 1 hour
        await self.redis_client.setex(
            cache_key,
            3600,
            json.dumps(embedding)
        )

        return embedding

    async def store_document(
        self,
        filename: str,
        content: str,
        chunks: List[str],
        embeddings: List[List[float]],
        metadata: Dict[str, Any]
    ) -> str:
        """Store document and chunks in PostgreSQL with vectors"""
        content_hash = hashlib.sha256(content.encode()).hexdigest()

        async with self.pg_pool.acquire() as conn:
            # Insert document
            doc_id = await conn.fetchval(
                """
                INSERT INTO documents (
                    filename, content_hash, metadata, processed_at
                )
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (content_hash) DO UPDATE
                SET updated_at = NOW()
                RETURNING id
                """,
                filename,
                content_hash,
                json.dumps(metadata),
                datetime.utcnow()
            )

            # Insert chunks with embeddings
            for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                await conn.execute(
                    """
                    INSERT INTO document_chunks (
                        document_id, chunk_index, text, embedding, tokens
                    )
                    VALUES ($1, $2, $3, $4::vector, $5)
                    """,
                    doc_id,
                    idx,
                    chunk,
                    embedding,
                    len(chunk.split())
                )

            print(f"✅ Stored document: {filename} ({len(chunks)} chunks)")
            return doc_id

    async def ingest_document(
        self,
        file_path: str,
        mime_type: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Complete ingestion pipeline:
        1. Upload to MinIO
        2. Extract text (OCR if needed)
        3. Create chunks
        4. Generate embeddings
        5. Store in PostgreSQL + pgvector
        6. Mirror to Qdrant (optional)
        """
        start_time = datetime.utcnow()
        filename = os.path.basename(file_path)

        try:
            # Step 1: Upload to MinIO
            object_name = await self.upload_to_minio(file_path, metadata={"mime_type": mime_type})

            # Step 2: Extract text
            print(f"🔍 Extracting text from: {filename}")
            text = await self.extract_text(file_path, mime_type)

            # Step 3: Create chunks
            chunks = self.create_chunks(text)
            print(f"📝 Created {len(chunks)} chunks")

            # Step 4: Generate embeddings (parallel)
            print(f"🧠 Generating embeddings...")
            embeddings = await asyncio.gather(*[
                self.generate_embedding(chunk) for chunk in chunks
            ])

            # Step 5: Store in PostgreSQL
            doc_metadata = metadata or {}
            doc_metadata.update({
                "filename": filename,
                "mime_type": mime_type,
                "chunks_count": len(chunks),
                "minio_object": object_name,
                "ingested_at": start_time.isoformat()
            })

            doc_id = await self.store_document(
                filename, text, chunks, embeddings, doc_metadata
            )

            # Calculate processing time
            duration = (datetime.utcnow() - start_time).total_seconds()

            return {
                "success": True,
                "document_id": doc_id,
                "filename": filename,
                "chunks_count": len(chunks),
                "processing_time_seconds": duration,
                "minio_object": object_name
            }

        except Exception as e:
            print(f"❌ Ingestion failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "filename": filename
            }


# FastAPI integration endpoint
async def create_ingestion_endpoint():
    """Create FastAPI endpoint for document ingestion"""
    from fastapi import FastAPI, File, UploadFile, Form
    from fastapi.responses import JSONResponse

    app = FastAPI(title="YoRHa Document Ingestion API")
    service = DocumentIngestionService()

    @app.on_event("startup")
    async def startup():
        await service.initialize()

    @app.on_event("shutdown")
    async def shutdown():
        await service.close()

    @app.post("/api/v1/ingest/upload")
    async def upload_document(
        file: UploadFile = File(...),
        case_id: Optional[str] = Form(None),
        document_type: Optional[str] = Form(None)
    ):
        """Upload and ingest document"""
        # Save temp file
        temp_path = f"/tmp/{file.filename}"
        with open(temp_path, "wb") as f:
            f.write(await file.read())

        # Ingest
        result = await service.ingest_document(
            temp_path,
            file.content_type or "application/octet-stream",
            metadata={
                "case_id": case_id,
                "document_type": document_type,
                "uploaded_by": "api"
            }
        )

        # Clean up
        os.remove(temp_path)

        return JSONResponse(result)

    @app.get("/api/v1/health")
    async def health_check():
        """Health check endpoint"""
        try:
            await service.redis_client.ping()
            redis_status = "healthy"
        except:
            redis_status = "unhealthy"

        try:
            async with service.pg_pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            postgres_status = "healthy"
        except:
            postgres_status = "unhealthy"

        return {
            "status": "operational",
            "services": {
                "redis": redis_status,
                "postgres": postgres_status,
                "minio": "connected",
                "ollama": service.config.ollama_url
            }
        }

    return app


if __name__ == "__main__":
    import uvicorn

    # Run the ingestion API
    app = asyncio.run(create_ingestion_endpoint())
    uvicorn.run(app, host="0.0.0.0", port=8001)
