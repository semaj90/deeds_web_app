#!/usr/bin/env python3
"""
Phase 70: RAG Ingest Service
Ingests and processes documents for RAG (Retrieval-Augmented Generation)
"""

import os
import sys
import asyncio
import logging
from typing import Dict, List, Optional, Any
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
import uvicorn
import tempfile
import json

# Vector database and embeddings
try:
    import chromadb
    from sentence_transformers import SentenceTransformer
    import faiss
    import numpy as np
    RAG_AVAILABLE = True
except ImportError:
    RAG_AVAILABLE = False

# Document processing
try:
    import PyPDF2
    import docx
    DOC_PROCESSING_AVAILABLE = True
except ImportError:
    DOC_PROCESSING_AVAILABLE = False

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Phase 70 RAG Ingest Service", version="1.0.0")

class IngestRequest(BaseModel):
    content: str
    metadata: Dict[str, Any] = {}
    chunk_size: int = 512
    chunk_overlap: int = 50
    collection_name: str = "legal_documents"

class IngestResponse(BaseModel):
    document_id: str
    chunks_created: int
    total_tokens: int
    processing_time: float
    collection_name: str

class SearchRequest(BaseModel):
    query: str
    collection_name: str = "legal_documents"
    top_k: int = 5
    include_metadata: bool = True

class SearchResponse(BaseModel):
    query: str
    results: List[Dict[str, Any]]
    processing_time: float

# Global RAG components
chroma_client = None
embedding_model = None
collections = {}

def initialize_rag():
    """Initialize RAG components"""
    global chroma_client, embedding_model

    if not RAG_AVAILABLE:
        logger.warning("RAG libraries not available")
        return

    try:
        # Initialize ChromaDB
        chroma_client = chromadb.PersistentClient(path="/app/chroma_db")

        # Initialize embedding model
        embedding_model = SentenceTransformer('all-MiniLM-L6-v2')  # Lightweight model

        logger.info("✅ RAG components initialized")

    except Exception as e:
        logger.error(f"Failed to initialize RAG: {e}")

def chunk_text(text: str, chunk_size: int = 512, overlap: int = 50) -> List[str]:
    """Split text into chunks with overlap"""
    words = text.split()
    chunks = []

    for i in range(0, len(words), chunk_size - overlap):
        chunk = words[i:i + chunk_size]
        chunks.append(" ".join(chunk))

    return chunks

def extract_text_from_file(file_path: str) -> str:
    """Extract text from various file formats"""
    if not DOC_PROCESSING_AVAILABLE:
        raise HTTPException(status_code=503, detail="Document processing not available")

    file_extension = Path(file_path).suffix.lower()

    try:
        if file_extension == '.pdf':
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                text = ""
                for page in pdf_reader.pages:
                    text += page.extract_text() + "\n"
                return text

        elif file_extension in ['.docx', '.doc']:
            doc = docx.Document(file_path)
            text = ""
            for paragraph in doc.paragraphs:
                text += paragraph.text + "\n"
            return text

        elif file_extension == '.txt':
            with open(file_path, 'r', encoding='utf-8') as file:
                return file.read()

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_extension}")

    except Exception as e:
        logger.error(f"Text extraction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Text extraction failed: {e}")

async def ingest_document(request: IngestRequest) -> IngestResponse:
    """Ingest document into vector database"""
    import time
    import uuid
    start_time = time.time()

    if not chroma_client or not embedding_model:
        raise HTTPException(status_code=503, detail="RAG service not available")

    try:
        # Get or create collection
        if request.collection_name not in collections:
            collections[request.collection_name] = chroma_client.get_or_create_collection(
                name=request.collection_name
            )

        collection = collections[request.collection_name]

        # Chunk the content
        chunks = chunk_text(request.content, request.chunk_size, request.chunk_overlap)

        # Generate embeddings
        embeddings = embedding_model.encode(chunks)

        # Prepare documents for ChromaDB
        documents = chunks
        metadatas = [request.metadata.copy() for _ in chunks]
        ids = [f"{uuid.uuid4()}_{i}" for i in range(len(chunks))]

        # Add to collection
        collection.add(
            documents=documents,
            embeddings=embeddings.tolist(),
            metadatas=metadatas,
            ids=ids
        )

        processing_time = time.time() - start_time

        return IngestResponse(
            document_id=str(uuid.uuid4()),
            chunks_created=len(chunks),
            total_tokens=sum(len(chunk.split()) for chunk in chunks),
            processing_time=round(processing_time, 2),
            collection_name=request.collection_name
        )

    except Exception as e:
        logger.error(f"Document ingestion failed: {e}")
        raise HTTPException(status_code=500, detail=f"Document ingestion failed: {e}")

async def search_documents(request: SearchRequest) -> SearchResponse:
    """Search documents using vector similarity"""
    import time
    start_time = time.time()

    if not chroma_client or not embedding_model:
        raise HTTPException(status_code=503, detail="RAG service not available")

    try:
        # Get collection
        if request.collection_name not in collections:
            collections[request.collection_name] = chroma_client.get_or_create_collection(
                name=request.collection_name
            )

        collection = collections[request.collection_name]

        # Generate query embedding
        query_embedding = embedding_model.encode([request.query])[0]

        # Search
        results = collection.query(
            query_embeddings=[query_embedding.tolist()],
            n_results=request.top_k,
            include=['documents', 'metadatas', 'distances'] if request.include_metadata else ['documents']
        )

        # Format results
        formatted_results = []
        for i, doc in enumerate(results['documents'][0]):
            result = {
                "document": doc,
                "score": 1.0 - results['distances'][0][i] if 'distances' in results else 0.0
            }

            if request.include_metadata and 'metadatas' in results:
                result["metadata"] = results['metadatas'][0][i]

            formatted_results.append(result)

        processing_time = time.time() - start_time

        return SearchResponse(
            query=request.query,
            results=formatted_results,
            processing_time=round(processing_time, 2)
        )

    except Exception as e:
        logger.error(f"Document search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Document search failed: {e}")

@app.on_event("startup")
async def startup_event():
    """Initialize RAG components"""
    initialize_rag()

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy" if RAG_AVAILABLE else "degraded",
        "service": "Phase 70 RAG Ingest Service",
        "chromadb_available": chroma_client is not None,
        "embedding_model_loaded": embedding_model is not None,
        "doc_processing_available": DOC_PROCESSING_AVAILABLE
    }

@app.post("/ingest", response_model=IngestResponse)
async def ingest_endpoint(request: IngestRequest):
    """Ingest document endpoint"""
    return await ingest_document(request)

@app.post("/ingest/file")
async def ingest_file_endpoint(
    file: UploadFile = File(...),
    collection_name: str = "legal_documents",
    chunk_size: int = 512,
    chunk_overlap: int = 50
):
    """Upload and ingest file"""
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as temp_file:
        content = await file.read()
        temp_file.write(content)
        temp_file_path = temp_file.name

    try:
        # Extract text
        text = extract_text_from_file(temp_file_path)

        # Ingest document
        request = IngestRequest(
            content=text,
            metadata={"filename": file.filename, "file_type": Path(file.filename).suffix},
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            collection_name=collection_name
        )

        result = await ingest_document(request)
        return result

    finally:
        # Clean up temp file
        os.unlink(temp_file_path)

@app.post("/search", response_model=SearchResponse)
async def search_endpoint(request: SearchRequest):
    """Search documents endpoint"""
    return await search_documents(request)

@app.get("/collections")
async def list_collections():
    """List available collections"""
    if not chroma_client:
        raise HTTPException(status_code=503, detail="ChromaDB not available")

    try:
        collections_info = []
        for name in collections.keys():
            collection = collections[name]
            count = collection.count()
            collections_info.append({
                "name": name,
                "document_count": count
            })

        return {"collections": collections_info}

    except Exception as e:
        logger.error(f"Failed to list collections: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list collections: {e}")

@app.delete("/collection/{collection_name}")
async def delete_collection(collection_name: str):
    """Delete a collection"""
    if not chroma_client:
        raise HTTPException(status_code=503, detail="ChromaDB not available")

    try:
        chroma_client.delete_collection(name=collection_name)
        if collection_name in collections:
            del collections[collection_name]

        return {"message": f"Collection '{collection_name}' deleted"}

    except Exception as e:
        logger.error(f"Failed to delete collection: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete collection: {e}")

if __name__ == "__main__":
    port = int(os.getenv("RAG_INGEST_PORT", "8104"))
    host = os.getenv("RAG_INGEST_HOST", "0.0.0.0")

    logger.info(f"🚀 Starting RAG ingest service on {host}:{port}")
    uvicorn.run(
        "rag_ingest_service:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )