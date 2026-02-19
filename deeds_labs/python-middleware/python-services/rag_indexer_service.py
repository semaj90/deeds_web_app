#!/usr/bin/env python3
"""
Phase 70: RAG Indexer with LangExtract Integration
Indexes crawled documents with LangExtract structured data into Qdrant and Elasticsearch
"""

import os
import sys
import logging
import json
import hashlib
from typing import Dict, List, Optional, Any
from datetime import datetime

import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# Vector database imports
try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import Distance, VectorParams, PointStruct
    QDRANT_AVAILABLE = True
except ImportError:
    QDRANT_AVAILABLE = False

try:
    from elasticsearch import Elasticsearch
    ELASTICSEARCH_AVAILABLE = True
except ImportError:
    ELASTICSEARCH_AVAILABLE = False

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Phase 70 RAG Indexer with LangExtract", version="1.0.0")

class IndexRequest(BaseModel):
    doc_id: str
    url: str
    title: str
    text: str
    langextract: Dict[str, Any]
    meta: Optional[Dict[str, Any]] = {}
    chunk_size: int = 1000
    chunk_overlap: int = 200

class IndexResponse(BaseModel):
    doc_id: str
    chunks_created: int
    qdrant_points: int = 0
    elasticsearch_docs: int = 0
    status: str

class SearchRequest(BaseModel):
    query: str
    limit: int = 10
    filters: Optional[Dict[str, Any]] = None

class SearchResponse(BaseModel):
    query: str
    qdrant_results: List[Dict[str, Any]] = []
    elasticsearch_results: List[Dict[str, Any]] = []
    hybrid_score: float = 0.0

# Service configurations
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "embeddinggemma:2b")

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_COLLECTION = "legal_docs"

ES_URL = os.getenv("ES_URL", "http://localhost:9200")
ES_INDEX = "legal_docs"

# Initialize clients
qdrant_client = None
es_client = None

def init_clients():
    """Initialize vector database clients"""
    global qdrant_client, es_client

    if QDRANT_AVAILABLE:
        try:
            qdrant_client = QdrantClient(url=QDRANT_URL)
            logger.info("✅ Qdrant client initialized")
        except Exception as e:
            logger.error(f"❌ Failed to initialize Qdrant: {e}")

    if ELASTICSEARCH_AVAILABLE:
        try:
            es_client = Elasticsearch([ES_URL])
            logger.info("✅ Elasticsearch client initialized")
        except Exception as e:
            logger.error(f"❌ Failed to initialize Elasticsearch: {e}")

def get_embedding(text: str) -> List[float]:
    """Get embedding from Ollama"""
    try:
        response = requests.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={
                "model": EMBEDDING_MODEL,
                "prompt": text
            },
            timeout=30
        )
        response.raise_for_status()
        return response.json()["embedding"]
    except Exception as e:
        logger.error(f"Failed to get embedding: {e}")
        return []

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
    """Split text into overlapping chunks"""
    chunks = []
    start = 0

    while start < len(text):
        end = start + chunk_size

        # Find sentence boundary if possible
        if end < len(text):
            # Look for sentence endings within the last 100 chars
            sentence_end = max(
                text.rfind('. ', end - 100, end),
                text.rfind('! ', end - 100, end),
                text.rfind('? ', end - 100, end),
                text.rfind('\n\n', end - 100, end)
            )
            if sentence_end > start:
                end = sentence_end + 1

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        # Move start position with overlap
        start = end - overlap

        # Ensure we don't get stuck
        if start >= len(text) - 10:
            break

    return chunks

def create_qdrant_payload(chunk: str, chunk_idx: int, doc_data: Dict[str, Any]) -> Dict[str, Any]:
    """Create Qdrant payload from chunk and LangExtract data"""
    payload = {
        "doc_id": doc_data["doc_id"],
        "url": doc_data["url"],
        "title": doc_data["title"],
        "chunk_idx": chunk_idx,
        "text": chunk,
        "chunk_hash": hashlib.sha256(chunk.encode()).hexdigest(),
        "indexed_at": datetime.now().isoformat()
    }

    # Add LangExtract structured data
    langextract = doc_data.get("langextract", {})

    # Case metadata
    if "case_metadata" in langextract:
        payload.update({
            "court": langextract["case_metadata"].get("court", ""),
            "jurisdiction": langextract["case_metadata"].get("jurisdiction", ""),
            "case_date": langextract["case_metadata"].get("date", ""),
            "docket": langextract["case_metadata"].get("docket", ""),
            "parties": langextract["case_metadata"].get("parties", [])
        })

    # Issues, holdings, rules
    payload.update({
        "issues": langextract.get("issues", []),
        "holdings": langextract.get("holdings", []),
        "rules": langextract.get("rules", []),
        "citations": langextract.get("citations", []),
        "key_facts": langextract.get("key_facts", [])
    })

    # Classification
    payload.update({
        "extraction_class": "legal_opinion_section",
        "section_type": "unknown",  # Could be enhanced with section detection
        "topics": extract_topics(langextract)
    })

    return payload

def extract_topics(langextract: Dict[str, Any]) -> List[str]:
    """Extract topic tags from LangExtract data"""
    topics = []

    # From citations (case names, statutes)
    citations = langextract.get("citations", [])
    for citation in citations:
        if citation.get("type") == "case":
            topics.append(f"case:{citation.get('name', '')}")
        elif citation.get("type") == "statute":
            topics.append(f"statute:{citation.get('name', '')}")

    # From holdings/rules (legal concepts)
    holdings = langextract.get("holdings", [])
    rules = langextract.get("rules", [])

    legal_keywords = [
        "due process", "equal protection", "first amendment", "fourth amendment",
        "search", "seizure", "warrant", "probable cause", "reasonable suspicion",
        "habeas corpus", "standing", "jurisdiction", "venue", "remand"
    ]

    all_text = " ".join(holdings + rules).lower()
    for keyword in legal_keywords:
        if keyword in all_text:
            topics.append(keyword)

    return topics

def index_to_qdrant(chunks: List[str], doc_data: Dict[str, Any]) -> int:
    """Index chunks to Qdrant"""
    if not qdrant_client or not QDRANT_AVAILABLE:
        logger.warning("Qdrant not available, skipping")
        return 0

    points = []

    for i, chunk in enumerate(chunks):
        embedding = get_embedding(chunk)
        if not embedding:
            continue

        payload = create_qdrant_payload(chunk, i, doc_data)

        point = PointStruct(
            id=f"{doc_data['doc_id']}_{i}",
            vector=embedding,
            payload=payload
        )
        points.append(point)

    if points:
        try:
            qdrant_client.upsert(
                collection_name=QDRANT_COLLECTION,
                points=points
            )
            logger.info(f"✅ Indexed {len(points)} points to Qdrant")
            return len(points)
        except Exception as e:
            logger.error(f"❌ Qdrant indexing failed: {e}")
            return 0

    return 0

def index_to_elasticsearch(chunks: List[str], doc_data: Dict[str, Any]) -> int:
    """Index document to Elasticsearch"""
    if not es_client or not ELASTICSEARCH_AVAILABLE:
        logger.warning("Elasticsearch not available, skipping")
        return 0

    try:
        # Create main document
        es_doc = {
            "doc_id": doc_data["doc_id"],
            "url": doc_data["url"],
            "title": doc_data["title"],
            "text": doc_data["text"],
            "indexed_at": datetime.now().isoformat(),
            "meta": doc_data.get("meta", {})
        }

        # Add LangExtract data
        langextract = doc_data.get("langextract", {})
        es_doc.update({
            "case_metadata": langextract.get("case_metadata", {}),
            "issues": langextract.get("issues", []),
            "holdings": langextract.get("holdings", []),
            "rules": langextract.get("rules", []),
            "citations": langextract.get("citations", []),
            "key_facts": langextract.get("key_facts", []),
            "topics": extract_topics(langextract)
        })

        # Index main document
        es_client.index(index=ES_INDEX, id=doc_data["doc_id"], document=es_doc)

        # Index individual chunks for better search
        for i, chunk in enumerate(chunks):
            chunk_doc = es_doc.copy()
            chunk_doc.update({
                "chunk_idx": i,
                "chunk_text": chunk,
                "text": chunk  # Override main text with chunk
            })

            chunk_id = f"{doc_data['doc_id']}_{i}"
            es_client.index(index=f"{ES_INDEX}_chunks", id=chunk_id, document=chunk_doc)

        logger.info(f"✅ Indexed document and {len(chunks)} chunks to Elasticsearch")
        return 1 + len(chunks)  # Main doc + chunks

    except Exception as e:
        logger.error(f"❌ Elasticsearch indexing failed: {e}")
        return 0

@app.on_event("startup")
async def startup_event():
    """Initialize clients"""
    init_clients()
    logger.info("✅ RAG Indexer with LangExtract initialized")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Phase 70 RAG Indexer with LangExtract",
        "qdrant": QDRANT_AVAILABLE and qdrant_client is not None,
        "elasticsearch": ELASTICSEARCH_AVAILABLE and es_client is not None,
        "ollama_url": OLLAMA_URL,
        "embedding_model": EMBEDDING_MODEL
    }

@app.post("/index", response_model=IndexResponse)
async def index_document(req: IndexRequest) -> IndexResponse:
    """Index document with LangExtract data"""
    try:
        # Chunk the text
        chunks = chunk_text(req.text, req.chunk_size, req.chunk_overlap)
        logger.info(f"📄 Created {len(chunks)} chunks for doc {req.doc_id}")

        # Prepare document data
        doc_data = {
            "doc_id": req.doc_id,
            "url": req.url,
            "title": req.title,
            "text": req.text,
            "langextract": req.langextract,
            "meta": req.meta
        }

        # Index to Qdrant
        qdrant_points = index_to_qdrant(chunks, doc_data)

        # Index to Elasticsearch
        es_docs = index_to_elasticsearch(chunks, doc_data)

        return IndexResponse(
            doc_id=req.doc_id,
            chunks_created=len(chunks),
            qdrant_points=qdrant_points,
            elasticsearch_docs=es_docs,
            status="success"
        )

    except Exception as e:
        logger.error(f"Indexing failed for {req.doc_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Indexing failed: {e}")

@app.post("/search", response_model=SearchResponse)
async def search_documents(req: SearchRequest) -> SearchResponse:
    """Search documents using hybrid approach"""
    try:
        # Get embedding for semantic search
        query_embedding = get_embedding(req.query)

        qdrant_results = []
        es_results = []

        # Qdrant semantic search
        if qdrant_client and query_embedding:
            try:
                search_result = qdrant_client.search(
                    collection_name=QDRANT_COLLECTION,
                    query_vector=query_embedding,
                    limit=req.limit,
                    query_filter=req.filters
                )
                qdrant_results = [
                    {
                        "id": hit.id,
                        "score": hit.score,
                        "payload": hit.payload
                    }
                    for hit in search_result
                ]
            except Exception as e:
                logger.error(f"Qdrant search failed: {e}")

        # Elasticsearch text search
        if es_client:
            try:
                search_body = {
                    "query": {
                        "multi_match": {
                            "query": req.query,
                            "fields": ["title^3", "text", "issues", "holdings", "rules", "topics"]
                        }
                    },
                    "size": req.limit
                }

                result = es_client.search(index=ES_INDEX, body=search_body)
                es_results = [
                    {
                        "id": hit["_id"],
                        "score": hit["_score"],
                        "source": hit["_source"]
                    }
                    for hit in result["hits"]["hits"]
                ]
            except Exception as e:
                logger.error(f"Elasticsearch search failed: {e}")

        # Simple RRF-like scoring (can be enhanced)
        hybrid_score = len(qdrant_results) + len(es_results)

        return SearchResponse(
            query=req.query,
            qdrant_results=qdrant_results,
            elasticsearch_results=es_results,
            hybrid_score=hybrid_score
        )

    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {e}")

if __name__ == "__main__":
    port = int(os.getenv("RAG_INDEXER_PORT", "8104"))
    host = os.getenv("RAG_INDEXER_HOST", "0.0.0.0")

    logger.info(f"🚀 Starting RAG Indexer with LangExtract on {host}:{port}")
    uvicorn.run(
        "rag_indexer_service:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )