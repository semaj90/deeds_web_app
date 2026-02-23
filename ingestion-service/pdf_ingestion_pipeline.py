"""
WardenNet PDF Ingestion Pipeline
OCR → Parsing → Chunking → Embedding → Indexing → DB Storage
"""

import asyncio
import logging
from typing import Optional
import hashlib
import json
from datetime import datetime

import pdfplumber
import pytesseract
from PIL import Image
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx
import psycopg
from minio import Minio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize services
app = FastAPI(title="WardenNet PDF Ingestion Pipeline")

# MinIO client
minio_client = Minio(
    "localhost:9000",
    access_key="minioadmin",
    secret_key="minioadmin",
    secure=False,
)

# PostgreSQL connection
async def get_db():
    """Get PostgreSQL connection"""
    conn = await psycopg.AsyncConnection.connect(
        "postgresql://legal_admin:123456@localhost:5432/legal_ai_db"
    )
    return conn


class IngestionRequest(BaseModel):
    """Ingestion request"""
    evidence_id: str
    file_key: str  # MinIO object key
    prosecutor_id: str
    case_id: str


class OCRResult(BaseModel):
    """OCR extraction result"""
    text: str
    confidence: float
    pages: int
    method: str  # "pdfplumber" or "tesseract"


class Chunk(BaseModel):
    """Document chunk"""
    seq: int
    section: str
    text: str
    token_length: int


async def extract_pdf_text(file_key: str) -> OCRResult:
    """Extract text from PDF using pdfplumber + Tesseract fallback"""
    logger.info(f"Extracting text from {file_key}")

    try:
        # Download from MinIO
        response = minio_client.get_object("warden-documents", file_key)
        pdf_bytes = response.read()

        # Try pdfplumber first
        text_parts = []
        page_count = 0

        with pdfplumber.open(pdf_bytes) as pdf:
            page_count = len(pdf.pages)

            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)

        if text_parts:
            full_text = "\n\n".join(text_parts)
            return OCRResult(
                text=full_text,
                confidence=0.95,
                pages=page_count,
                method="pdfplumber",
            )

        # Fallback to Tesseract for scanned PDFs
        logger.info(f"Falling back to Tesseract for {file_key}")
        text_parts = []

        with pdfplumber.open(pdf_bytes) as pdf:
            for page in pdf.pages:
                # Convert page to image
                image = page.to_image()
                # OCR with Tesseract
                text = pytesseract.image_to_string(image.original)
                if text.strip():
                    text_parts.append(text)

        full_text = "\n\n".join(text_parts)
        return OCRResult(
            text=full_text,
            confidence=0.85,
            pages=page_count,
            method="tesseract",
        )

    except Exception as e:
        logger.error(f"OCR error for {file_key}: {e}")
        raise


def chunk_text(text: str, chunk_size: int = 512, overlap: int = 128) -> list[Chunk]:
    """Split text into overlapping chunks"""
    logger.info(f"Chunking text into {chunk_size}-token chunks")

    # Simple tokenization (split by words)
    tokens = text.split()
    chunks = []
    seq = 0

    for i in range(0, len(tokens), chunk_size - overlap):
        chunk_tokens = tokens[i : i + chunk_size]
        chunk_text = " ".join(chunk_tokens)

        # Detect section (simple heuristic)
        section = "CONTENT"
        if "FACTS" in chunk_text.upper():
            section = "FACTS"
        elif "JURISDICTION" in chunk_text.upper():
            section = "JURISDICTION"
        elif "CLAIMS" in chunk_text.upper():
            section = "CLAIMS"
        elif "PRAYER" in chunk_text.upper():
            section = "PRAYER"
        elif "HOLDING" in chunk_text.upper():
            section = "HOLDING"

        chunks.append(
            Chunk(
                seq=seq,
                section=section,
                text=chunk_text,
                token_length=len(chunk_tokens),
            )
        )
        seq += 1

    return chunks


async def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate embeddings using Ollama Gemma"""
    logger.info(f"Generating embeddings for {len(texts)} chunks")

    embeddings = []

    async with httpx.AsyncClient() as client:
        for text in texts:
            try:
                response = await client.post(
                    "http://localhost:11434/api/embeddings",
                    json={"model": "gemma:7b", "prompt": text},
                    timeout=30.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    embeddings.append(data.get("embedding", []))
                else:
                    logger.warning(f"Embedding generation failed: {response.status_code}")
                    # Return zero vector as fallback
                    embeddings.append([0.0] * 768)

            except Exception as e:
                logger.error(f"Embedding error: {e}")
                embeddings.append([0.0] * 768)

    return embeddings


async def store_chunks_in_db(
    evidence_id: str,
    case_id: str,
    chunks: list[Chunk],
    embeddings: list[list[float]],
) -> int:
    """Store chunks and embeddings in PostgreSQL"""
    logger.info(f"Storing {len(chunks)} chunks in database")

    conn = await get_db()
    cursor = await conn.cursor()

    try:
        stored = 0

        for chunk, embedding in zip(chunks, embeddings):
            await cursor.execute(
                """
                INSERT INTO warden_chunks (
                    evidence_id, text, embedding, seq, section, token_length
                ) VALUES ($1, $2, $3, $4, $5, $6)
                """,
                (
                    evidence_id,
                    chunk.text,
                    embedding,  # pgvector will handle the array
                    chunk.seq,
                    chunk.section,
                    chunk.token_length,
                ),
            )
            stored += 1

        await conn.commit()
        logger.info(f"Stored {stored} chunks")
        return stored

    except Exception as e:
        logger.error(f"Database error: {e}")
        await conn.rollback()
        raise

    finally:
        await cursor.close()
        await conn.close()


async def index_in_elasticsearch(
    evidence_id: str, chunks: list[Chunk]
) -> int:
    """Index chunks in Elasticsearch"""
    logger.info(f"Indexing {len(chunks)} chunks in Elasticsearch")

    async with httpx.AsyncClient() as client:
        indexed = 0

        for chunk in chunks:
            try:
                response = await client.post(
                    f"http://localhost:9200/warden-evidence/_doc",
                    json={
                        "evidence_id": evidence_id,
                        "section": chunk.section,
                        "text": chunk.text,
                        "seq": chunk.seq,
                        "indexed_at": datetime.utcnow().isoformat(),
                    },
                    timeout=10.0,
                )

                if response.status_code in [200, 201]:
                    indexed += 1
                else:
                    logger.warning(f"Elasticsearch indexing failed: {response.status_code}")

            except Exception as e:
                logger.error(f"Elasticsearch error: {e}")

        logger.info(f"Indexed {indexed} chunks in Elasticsearch")
        return indexed


async def run_ingestion_pipeline(request: IngestionRequest) -> dict:
    """Execute complete ingestion pipeline"""
    logger.info(f"Starting ingestion for evidence {request.evidence_id}")

    try:
        # Step 1: OCR extraction
        ocr_result = await extract_pdf_text(request.file_key)
        logger.info(f"OCR complete: {ocr_result.pages} pages, {len(ocr_result.text)} chars")

        # Step 2: Chunking
        chunks = chunk_text(ocr_result.text)
        logger.info(f"Created {len(chunks)} chunks")

        # Step 3: Embedding generation
        chunk_texts = [chunk.text for chunk in chunks]
        embeddings = await generate_embeddings(chunk_texts)
        logger.info(f"Generated {len(embeddings)} embeddings")

        # Step 4: Store in PostgreSQL
        stored = await store_chunks_in_db(
            request.evidence_id, request.case_id, chunks, embeddings
        )

        # Step 5: Index in Elasticsearch
        indexed = await index_in_elasticsearch(request.evidence_id, chunks)

        # Step 6: Update evidence status
        conn = await get_db()
        cursor = await conn.cursor()

        await cursor.execute(
            """
            UPDATE warden_evidence
            SET status = 'locked', metadata = $1
            WHERE id = $2
            """,
            (
                json.dumps({
                    "ocr_method": ocr_result.method,
                    "ocr_confidence": ocr_result.confidence,
                    "pages": ocr_result.pages,
                    "chunks": len(chunks),
                    "indexed_at": datetime.utcnow().isoformat(),
                }),
                request.evidence_id,
            ),
        )

        await conn.commit()
        await cursor.close()
        await conn.close()

        logger.info(f"Ingestion complete for {request.evidence_id}")

        return {
            "success": True,
            "evidence_id": request.evidence_id,
            "pages": ocr_result.pages,
            "chunks": len(chunks),
            "stored": stored,
            "indexed": indexed,
            "ocr_method": ocr_result.method,
            "ocr_confidence": ocr_result.confidence,
        }

    except Exception as e:
        logger.error(f"Ingestion pipeline error: {e}")
        raise


@app.post("/ingest")
async def ingest(request: IngestionRequest):
    """Trigger ingestion pipeline"""
    try:
        result = await run_ingestion_pipeline(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    """Health check"""
    return {"status": "healthy", "service": "pdf-ingestion-pipeline"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8003)
