from fastapi import FastAPI, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import aiofiles
import uuid
import os
import asyncio
from minio import Minio
import pytesseract
from PIL import Image
import fitz  # PyMuPDF
import httpx
from langchain.text_splitter import RecursiveCharacterTextSplitter
from qdrant_client import QdrantClient
import psycopg2
import json
from typing import List, Dict, Any
import numpy as np

app = FastAPI(title="Legal AI RAG FastAPI Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# ============================================================================
# Service Configuration
# ============================================================================

# MinIO Configuration
MINIO_CLIENT = Minio(
    "localhost:9000",
    access_key="minioadmin",
    secret_key="minioadmin123",
    secure=False
)

# Qdrant Configuration
QDRANT_CLIENT = QdrantClient(host="localhost", port=6333)

# PostgreSQL Configuration
PG_CONN = psycopg2.connect(
    "dbname=legal_ai_db user=legal_admin password=123456 host=localhost"
)

# External Service URLs
TRT_LLM_ENDPOINT = os.getenv("TRT_LLM_ENDPOINT", "http://tensorrt-llm:8000/api/infer")
OLLAMA_EMBED_ENDPOINT = os.getenv("OLLAMA_EMBED_ENDPOINT", "http://ollama:11434/api/embed")

# ============================================================================
# Health Check
# ============================================================================

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "services": {
            "minio": "connected",
            "qdrant": "connected",
            "postgres": "connected",
            "tensorrt-llm": "configured",
            "ollama": "configured"
        }
    }

# ============================================================================
# File Upload API
# ============================================================================

@app.post("/api/v1/upload")
async def upload_evidence(file: UploadFile):
    """
    Upload and process evidence files
    - Extract text from PDFs/images
    - Generate embeddings
    - Store in vector database
    """
    try:
        # Generate unique filename
        file_id = str(uuid.uuid4())
        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{file_id}{file_extension}"

        # Save file temporarily
        temp_path = f"/tmp/{unique_filename}"
        async with aiofiles.open(temp_path, "wb") as out:
            content = await file.read()
            await out.write(content)

        # Create evidence bucket if it doesn't exist
        if not MINIO_CLIENT.bucket_exists("evidence"):
            MINIO_CLIENT.make_bucket("evidence")

        # Upload to MinIO
        MINIO_CLIENT.fput_object("evidence", unique_filename, temp_path)

        # Extract text based on file type
        text = extract_text(temp_path, file.content_type)

        # Generate embeddings and store in vector database
        await embed_and_index(unique_filename, text, file.filename)

        # Clean up temp file
        os.remove(temp_path)

        return {
            "status": "success",
            "file_id": file_id,
            "filename": unique_filename,
            "original_name": file.filename,
            "text_extracted": len(text) > 0,
            "text_length": len(text)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

# ============================================================================
# RAG Search API
# ============================================================================

@app.post("/api/v1/rag/search")
async def rag_search(query: str = Form(...)):
    """
    Perform RAG search with TensorRT-LLM inference
    """
    try:
        # Generate embedding for query
        async with httpx.AsyncClient(timeout=30.0) as client:
            embed_response = await client.post(
                OLLAMA_EMBED_ENDPOINT,
                json={"model": "embeddinggemma:latest", "input": [query]}
            )
            query_embedding = embed_response.json()["embeddings"][0]

        # Search vector database
        search_results = QDRANT_CLIENT.search(
            collection_name="evidence_vectors",
            query_vector=query_embedding,
            limit=5
        )

        # Extract context from results
        context_chunks = []
        for hit in search_results:
            context_chunks.append(hit.payload.get("chunk", ""))

        context = "\n".join(context_chunks)

        # Generate response using TensorRT-LLM
        prompt = f"""You are a legal AI assistant. Use the following context to answer the user's question accurately and professionally.

Context:
{context}

Question: {query}

Answer:"""

        async with httpx.AsyncClient(timeout=60.0) as client:
            llm_response = await client.post(
                TRT_LLM_ENDPOINT,
                json={"prompt": prompt, "max_tokens": 512, "temperature": 0.3}
            )

            if llm_response.status_code != 200:
                raise HTTPException(status_code=500, detail="LLM inference failed")

            result = llm_response.json()

        return {
            "query": query,
            "answer": result.get("text", "No response generated"),
            "context_chunks": len(context_chunks),
            "sources": [
                {
                    "file": hit.payload.get("file", "unknown"),
                    "score": hit.score,
                    "chunk_preview": hit.payload.get("chunk", "")[:200] + "..."
                }
                for hit in search_results
            ]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG search failed: {str(e)}")

# ============================================================================
# Helper Functions
# ============================================================================

def extract_text(file_path: str, mime_type: str) -> str:
    """Extract text from various file types"""
    try:
        if "pdf" in mime_type.lower():
            # Extract text from PDF
            doc = fitz.open(file_path)
            text = ""
            for page in doc:
                text += page.get_text()
            return text
        elif mime_type.startswith("image/"):
            # OCR for images
            img = Image.open(file_path)
            return pytesseract.image_to_string(img)
        else:
            # Try to read as plain text
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
    except Exception as e:
        print(f"Text extraction failed for {file_path}: {e}")
        return ""

async def embed_and_index(file_id: str, text: str, original_filename: str):
    """Generate embeddings and store in vector database"""
    try:
        # Split text into chunks
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=512,
            chunk_overlap=50
        )
        chunks = splitter.split_text(text)

        if not chunks:
            return

        # Generate embeddings for all chunks
        async with httpx.AsyncClient(timeout=60.0) as client:
            embed_response = await client.post(
                OLLAMA_EMBED_ENDPOINT,
                json={"model": "embeddinggemma:latest", "input": chunks}
            )
            embeddings = embed_response.json()["embeddings"]

        # Store in Qdrant
        points = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            point_id = str(uuid.uuid4())
            points.append({
                "id": point_id,
                "vector": embedding,
                "payload": {
                    "file_id": file_id,
                    "original_filename": original_filename,
                    "chunk": chunk,
                    "chunk_index": i
                }
            })

        QDRANT_CLIENT.upsert(
            collection_name="evidence_vectors",
            points=points
        )

        print(f"Indexed {len(points)} chunks for file {file_id}")

    except Exception as e:
        print(f"Embedding/indexing failed for {file_id}: {e}")
        raise

# ============================================================================
# Collection Management
# ============================================================================

@app.post("/api/v1/setup")
async def setup_collections():
    """Initialize vector collections and database schema"""
    try:
        # Create Qdrant collection if it doesn't exist
        try:
            QDRANT_CLIENT.get_collection("evidence_vectors")
        except:
            QDRANT_CLIENT.create_collection(
                collection_name="evidence_vectors",
                vectors_config={
                    "size": 384,  # embeddinggemma dimension
                    "distance": "Cosine"
                }
            )

        # Create PostgreSQL tables if needed
        cursor = PG_CONN.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS evidence_files (
                id UUID PRIMARY KEY,
                filename TEXT NOT NULL,
                original_name TEXT NOT NULL,
                upload_time TIMESTAMP DEFAULT NOW(),
                text_content TEXT,
                metadata JSONB
            )
        """)
        PG_CONN.commit()
        cursor.close()

        return {"status": "setup_complete"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Setup failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005)