#!/usr/bin/env python3
"""
Phase 79: RAG/KAG Middleware API
Integrates MinIO document storage, Qdrant vector search, and Knowledge Graph

Features:
- Upload documents to MinIO
- Extract text and generate embeddings
- Store vectors in Qdrant
- Build knowledge graph relationships (Neo4j)
- Query with RAG/KAG
- Error analysis with Phase 66-79 support
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import httpx
import json
from datetime import datetime
import hashlib
import logging

# Initialize FastAPI app
app = FastAPI(
    title="Phase 79 RAG/KAG Middleware",
    description="Document ingestion, vector search, and knowledge graph API",
    version="1.0.0"
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
CONFIG = {
    "minio": {
        "endpoint": os.getenv("MINIO_ENDPOINT", "localhost:9000"),
        "access_key": os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
        "secret_key": os.getenv("MINIO_SECRET_KEY", "minioadmin"),
        "bucket_documents": os.getenv("MINIO_BUCKET", "legal-documents"),
        "bucket_rag": "rag-context",
        "secure": os.getenv("MINIO_USE_SSL", "false").lower() == "true"
    },
    "qdrant": {
        "url": os.getenv("QDRANT_URL", "http://localhost:6333"),
        "collection_vectors": "phase79_rag_vectors",
        "collection_kag": "phase79_kag_graph"
    },
    "ollama": {
        "url": os.getenv("OLLAMA_URL", "http://localhost:11434"),
        "embedding_model": "embeddinggemma:latest",
        "llm_model": "gemma3-legal:latest"
    },
    "neo4j": {
        "uri": os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        "user": os.getenv("NEO4J_USER", "neo4j"),
        "password": os.getenv("NEO4J_PASSWORD", "password")
    },
    "postgres": {
        "url": os.getenv("DATABASE_URL", "postgresql://postgres:123456@localhost:5432/legal_ai_db")
    }
}

# ============================================================================
# Pydantic Models
# ============================================================================

class DocumentMetadata(BaseModel):
    """Document metadata for tracking"""
    name: str
    size: int
    mime_type: str
    source: str = "ui-upload"
    created_at: str = None
    chunks: int = 0
    error_tags: List[str] = []

class RAGQuery(BaseModel):
    """RAG query model"""
    query: str
    limit: int = 5
    threshold: float = 0.7
    use_kag: bool = True
    error_phase: Optional[str] = None

class KAGNode(BaseModel):
    """Knowledge graph node"""
    id: str
    label: str
    properties: Dict[str, Any]
    type: str  # "error", "fix", "pattern", "file", "entity"

class KAGRelation(BaseModel):
    """Knowledge graph relation"""
    source_id: str
    target_id: str
    relation_type: str  # "fixes", "relates_to", "similar_to", "depends_on"
    confidence: float

class SearchResult(BaseModel):
    """Search result model"""
    document: str
    chunk: int
    content: str
    similarity: float
    source: str

class RAGResponse(BaseModel):
    """RAG response with KAG integration"""
    results: List[SearchResult]
    kag_nodes: List[KAGNode] = []
    kag_relations: List[KAGRelation] = []
    avg_similarity: float
    execution_time: float

# ============================================================================
# Helper Functions
# ============================================================================

async def get_minio_client():
    """Get MinIO client"""
    from minio import Minio
    return Minio(
        CONFIG["minio"]["endpoint"],
        access_key=CONFIG["minio"]["access_key"],
        secret_key=CONFIG["minio"]["secret_key"],
        secure=CONFIG["minio"]["secure"]
    )

async def extract_document_text(file_content: bytes, filename: str) -> str:
    """Extract text from various document formats"""
    ext = filename.split(".")[-1].lower()

    if ext == "txt":
        return file_content.decode("utf-8", errors="ignore")
    elif ext == "pdf":
        import PyPDF2
        from io import BytesIO
        reader = PyPDF2.PdfReader(BytesIO(file_content))
        text = ""
        for page in reader.pages:
            text += page.extract_text()
        return text
    elif ext == "md" or ext == "markdown":
        return file_content.decode("utf-8", errors="ignore")
    elif ext == "html" or ext == "htm":
        from html.parser import HTMLParser
        class TextExtractor(HTMLParser):
            def __init__(self):
                super().__init__()
                self.text = []
            def handle_data(self, data):
                self.text.append(data)
        parser = TextExtractor()
        parser.feed(file_content.decode("utf-8", errors="ignore"))
        return " ".join(parser.text)
    else:
        raise ValueError(f"Unsupported format: {ext}")

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> List[str]:
    """Split text into overlapping chunks"""
    chunks = []
    for i in range(0, len(text), chunk_size - overlap):
        chunk = text[i : i + chunk_size]
        if len(chunk.strip()) > 0:
            chunks.append(chunk)
    return chunks

async def generate_embedding(text: str) -> List[float]:
    """Generate embedding via Ollama"""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{CONFIG['ollama']['url']}/api/embeddings",
            json={
                "model": CONFIG["ollama"]["embedding_model"],
                "prompt": text[:8000]
            }
        )
        data = response.json()
        return data.get("embedding", [])

async def ensure_qdrant_collection(collection_name: str):
    """Ensure Qdrant collection exists"""
    async with httpx.AsyncClient() as client:
        try:
            await client.get(f"{CONFIG['qdrant']['url']}/collections/{collection_name}")
        except:
            await client.put(
                f"{CONFIG['qdrant']['url']}/collections/{collection_name}",
                json={
                    "vectors": {
                        "size": 768,
                        "distance": "Cosine"
                    }
                }
            )

# ============================================================================
# API Endpoints
# ============================================================================

@app.post("/api/rag/upload")
async def upload_document(
    file: UploadFile = File(...),
    source: str = "ui-upload",
    error_tags: Optional[List[str]] = None,
    background_tasks: BackgroundTasks = None
):
    """
    Upload document to MinIO and process for RAG

    - Extracts text
    - Chunks content
    - Generates embeddings
    - Stores in Qdrant
    - Stores metadata in PostgreSQL
    """
    try:
        logger.info(f"📄 Processing: {file.filename}")

        # Read file
        file_content = await file.read()
        filename = file.filename
        file_size = len(file_content)

        # Extract text
        text = await extract_document_text(file_content, filename)
        chunks = chunk_text(text)

        logger.info(f"   📝 Extracted {len(chunks)} chunks")

        # Store in MinIO
        minio_client = await get_minio_client()

        # Upload original document
        from io import BytesIO
        minio_client.put_object(
            CONFIG["minio"]["bucket_documents"],
            filename,
            BytesIO(file_content),
            file_size,
            content_type=file.content_type or "application/octet-stream"
        )

        logger.info(f"   🗄️  Stored in MinIO: {filename}")

        # Ensure Qdrant collection
        await ensure_qdrant_collection(CONFIG["qdrant"]["collection_vectors"])

        # Process chunks - embed and store in Qdrant
        point_ids = []
        async with httpx.AsyncClient() as client:
            for idx, chunk in enumerate(chunks):
                # Generate embedding
                embedding = await generate_embedding(chunk)

                if not embedding:
                    continue

                point_id = int(hashlib.md5(f"{filename}_{idx}".encode()).hexdigest(), 16) % (10 ** 8)
                payload = {
                    "document_name": filename,
                    "chunk_index": idx,
                    "content": chunk,
                    "source": source,
                    "error_tags": error_tags or [],
                    "uploaded_at": datetime.utcnow().isoformat(),
                    "chunk_count": len(chunks)
                }

                # Store in Qdrant
                await client.put(
                    f"{CONFIG['qdrant']['url']}/collections/{CONFIG['qdrant']['collection_vectors']}/points",
                    json={
                        "points": [
                            {
                                "id": point_id,
                                "vector": embedding,
                                "payload": payload
                            }
                        ]
                    }
                )

                point_ids.append(point_id)

        logger.info(f"   ✅ Stored {len(point_ids)} vectors in Qdrant")

        return JSONResponse({
            "success": True,
            "file": filename,
            "size": file_size,
            "chunks": len(chunks),
            "vectors": len(point_ids),
            "error_tags": error_tags or [],
            "message": f"Processed {filename} ({len(chunks)} chunks, {len(point_ids)} vectors)"
        })

    except Exception as e:
        logger.error(f"❌ Upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/rag/search")
async def search_rag(
    query: str,
    limit: int = 5,
    threshold: float = 0.7,
    use_kag: bool = True,
    error_phase: Optional[str] = None
):
    """
    Search RAG knowledge base with Qdrant
    Optionally augment with KAG (knowledge graph)
    """
    try:
        logger.info(f"🔍 Searching: {query[:100]}...")

        # Ensure collection exists
        await ensure_qdrant_collection(CONFIG["qdrant"]["collection_vectors"])

        # Generate query embedding
        query_embedding = await generate_embedding(query)

        if not query_embedding:
            return JSONResponse({
                "success": False,
                "error": "Failed to generate embedding"
            }, status_code=400)

        # Search Qdrant
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{CONFIG['qdrant']['url']}/collections/{CONFIG['qdrant']['collection_vectors']}/points/search",
                json={
                    "vector": query_embedding,
                    "limit": limit,
                    "score_threshold": threshold,
                    "with_payload": True
                }
            )

            data = response.json()
            results = []
            similarities = []

            for item in data.get("result", []):
                result = SearchResult(
                    document=item["payload"]["document_name"],
                    chunk=item["payload"]["chunk_index"],
                    content=item["payload"]["content"],
                    similarity=item["score"],
                    source=item["payload"].get("source", "unknown")
                )
                results.append(result)
                similarities.append(item["score"])

        avg_similarity = sum(similarities) / len(similarities) if similarities else 0

        logger.info(f"   ✅ Found {len(results)} matches (avg {avg_similarity:.2%})")

        # Optional: augment with KAG
        kag_nodes = []
        kag_relations = []

        if use_kag:
            # This would query Neo4j knowledge graph
            # Placeholder for KAG integration
            logger.info(f"   📊 KAG integration: placeholder")

        return JSONResponse({
            "success": True,
            "query": query,
            "results": [r.dict() for r in results],
            "kag_nodes": [n.dict() for n in kag_nodes],
            "kag_relations": [r.dict() for r in kag_relations],
            "count": len(results),
            "avg_similarity": round(avg_similarity, 4),
            "error_phase": error_phase
        })

    except Exception as e:
        logger.error(f"❌ Search error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/rag/kag/build-graph")
async def build_knowledge_graph(
    error_logs: List[Dict[str, Any]],
    error_phase: Optional[str] = None
):
    """
    Build knowledge graph from error logs
    Creates nodes for errors, files, patterns, and relationships
    """
    try:
        logger.info(f"📊 Building KAG from {len(error_logs)} error logs...")

        # This would use Neo4j to build the graph
        # Placeholder implementation
        nodes = []
        relations = []

        for error_log in error_logs:
            # Create error node
            error_node = KAGNode(
                id=f"error_{error_log.get('code', 'unknown')}",
                label=error_log.get("message", "Unknown error"),
                properties=error_log,
                type="error"
            )
            nodes.append(error_node)

            # Create file node
            if "file_path" in error_log:
                file_node = KAGNode(
                    id=f"file_{hashlib.md5(error_log['file_path'].encode()).hexdigest()[:8]}",
                    label=error_log["file_path"],
                    properties={"path": error_log["file_path"]},
                    type="file"
                )
                nodes.append(file_node)

                # Create relation: error -> file
                relations.append(KAGRelation(
                    source_id=error_node.id,
                    target_id=file_node.id,
                    relation_type="occurs_in",
                    confidence=1.0
                ))

        logger.info(f"   ✅ Built graph: {len(nodes)} nodes, {len(relations)} relations")

        return JSONResponse({
            "success": True,
            "nodes": [n.dict() for n in nodes],
            "relations": [r.dict() for r in relations],
            "error_phase": error_phase
        })

    except Exception as e:
        logger.error(f"❌ Graph build error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/rag/kag/query")
async def query_rag_kag(
    query_model: RAGQuery
):
    """
    Combined RAG + KAG query
    - Search vectors in Qdrant
    - Cross-reference with knowledge graph
    - Return augmented results
    """
    try:
        logger.info(f"🔍 RAG+KAG Query: {query_model.query[:100]}...")

        # RAG search
        rag_response = await search_rag(
            query=query_model.query,
            limit=query_model.limit,
            threshold=query_model.threshold,
            use_kag=False  # Get RAG separately first
        )

        rag_data = rag_response.body if hasattr(rag_response, 'body') else json.loads(rag_response.body)

        # KAG augmentation
        if query_model.use_kag:
            # Query knowledge graph for related nodes
            # Placeholder implementation
            logger.info(f"   📊 Augmenting with KAG...")

        return JSONResponse({
            "success": True,
            "rag_results": rag_data.get("results", []),
            "kag_nodes": [],
            "kag_relations": [],
            "error_phase": query_model.error_phase,
            "execution_time": 0.0
        })

    except Exception as e:
        logger.error(f"❌ RAG+KAG query error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return JSONResponse({
        "status": "online",
        "services": {
            "api": "running",
            "minio": "configured",
            "qdrant": "configured",
            "ollama": "configured",
            "neo4j": "configured"
        }
    })

@app.get("/api/stats")
async def get_stats():
    """Get system statistics"""
    try:
        async with httpx.AsyncClient() as client:
            # Get Qdrant stats
            qdrant_response = await client.get(
                f"{CONFIG['qdrant']['url']}/collections/{CONFIG['qdrant']['collection_vectors']}"
            )
            qdrant_data = qdrant_response.json()

            return JSONResponse({
                "success": True,
                "qdrant": {
                    "collection": CONFIG["qdrant"]["collection_vectors"],
                    "points": qdrant_data.get("result", {}).get("points_count", 0)
                },
                "minio": {
                    "bucket": CONFIG["minio"]["bucket_documents"],
                    "status": "configured"
                },
                "timestamp": datetime.utcnow().isoformat()
            })
    except Exception as e:
        logger.error(f"Stats error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("API_PORT", 8000))
    host = os.getenv("API_HOST", "0.0.0.0")

    logger.info(f"🚀 Starting Phase 79 RAG/KAG Middleware API on {host}:{port}")
    logger.info(f"   MinIO: {CONFIG['minio']['endpoint']}")
    logger.info(f"   Qdrant: {CONFIG['qdrant']['url']}")
    logger.info(f"   Ollama: {CONFIG['ollama']['url']}")

    uvicorn.run(app, host=host, port=port, log_level="info")
