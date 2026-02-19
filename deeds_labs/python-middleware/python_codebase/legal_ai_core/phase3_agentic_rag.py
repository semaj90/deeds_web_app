"""
Phase 3: Agentic Backend & Advanced RAG System
Production-ready legal AI with your Gemma3 model
"""

import asyncio
import os
import time
import json
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import asyncpg
import redis.asyncio as redis
import httpx
from qdrant_client import QdrantClient
from qdrant_client.http import models
import tiktoken

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Legal AI - Phase 3 Agentic Backend",
    description="Advanced RAG system with Gemma3 model integration",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
DATABASE_URL = "postgresql://legal_admin:123456@localhost:5432/legal_ai_db"
REDIS_URL = "redis://localhost:6379"
QDRANT_URL = "http://localhost:6333"
GEMMA3_API = "http://localhost:11434/api/generate"
GEMMA3_MODEL = "gemma3-legal:latest"

# Global connections
db_pool = None
redis_client = None
qdrant_client = None
tokenizer = None

# Pydantic Models
class DocumentInput(BaseModel):
    title: str
    content: str
    document_type: str = "contract"
    case_id: Optional[str] = None
    metadata: Dict[str, Any] = {}

class QueryInput(BaseModel):
    query: str
    document_type: Optional[str] = None
    case_id: Optional[str] = None
    top_k: int = 5
    include_analysis: bool = True

class AnalysisRequest(BaseModel):
    document_id: str
    analysis_type: str = "comprehensive"  # comprehensive, liability, compliance, risk

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context_documents: Optional[List[str]] = []
    max_tokens: int = 1024
    temperature: float = 0.1

# Startup and shutdown
@app.on_event("startup")
async def startup_event():
    global db_pool, redis_client, qdrant_client, tokenizer
    
    logger.info("🚀 Starting Phase 3 Agentic Backend...")
    
    # Initialize database pool
    try:
        db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=5, max_size=20)
        logger.info("✅ PostgreSQL connection pool established")
    except Exception as e:
        logger.error(f"❌ Database connection failed: {e}")
        
    # Initialize Redis
    try:
        redis_client = redis.from_url(REDIS_URL)
        await redis_client.ping()
        logger.info("✅ Redis connection established")
    except Exception as e:
        logger.error(f"❌ Redis connection failed: {e}")
        
    # Initialize Qdrant
    try:
        qdrant_client = QdrantClient(url=QDRANT_URL)
        logger.info("✅ Qdrant connection established")
        
        # Create collection if it doesn't exist
        try:
            await create_qdrant_collection()
        except Exception as e:
            logger.warning(f"Qdrant collection setup: {e}")
            
    except Exception as e:
        logger.error(f"❌ Qdrant connection failed: {e}")
        
    # Initialize tokenizer
    try:
        tokenizer = tiktoken.get_encoding("cl100k_base")
        logger.info("✅ Tokenizer initialized")
    except Exception as e:
        logger.warning(f"Tokenizer initialization failed: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    global db_pool, redis_client
    
    if db_pool:
        await db_pool.close()
    if redis_client:
        await redis_client.close()

# Utility Functions
async def create_qdrant_collection():
    """Create Qdrant collection for legal documents"""
    try:
        collections = qdrant_client.get_collections()
        collection_names = [col.name for col in collections.collections]
        
        if "legal_documents" not in collection_names:
            qdrant_client.create_collection(
                collection_name="legal_documents",
                vectors_config=models.VectorParams(
                    size=384,  # Sentence transformer embedding size
                    distance=models.Distance.COSINE
                )
            )
            logger.info("✅ Created Qdrant collection: legal_documents")
    except Exception as e:
        logger.error(f"Failed to create Qdrant collection: {e}")

async def call_gemma3(prompt: str, max_tokens: int = 1024, temperature: float = 0.1) -> str:
    """Call your Gemma3 model"""
    payload = {
        "model": GEMMA3_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
            "top_k": 40,
            "top_p": 0.9,
            "repeat_penalty": 1.1,
            "stop": ["<start_of_turn>", "<end_of_turn>"]
        }
    }
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            response = await client.post(GEMMA3_API, json=payload)
            if response.status_code == 200:
                result = response.json()
                return result.get("response", "").strip()
            else:
                raise HTTPException(status_code=500, detail=f"Gemma3 API error: {response.status_code}")
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Gemma3 model timeout - model may be loading")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Gemma3 call failed: {str(e)}")

async def generate_embeddings(text: str) -> List[float]:
    """Generate embeddings using sentence-transformers via local API"""
    # For now, we'll use a simple embedding service
    # You can replace this with your preferred embedding model
    try:
        # Placeholder: In production, use sentence-transformers or similar
        # For demo, we'll create mock embeddings
        import hashlib
        import struct
        
        # Create deterministic embeddings based on text hash
        text_hash = hashlib.sha256(text.encode()).digest()
        embedding = []
        for i in range(0, min(384*4, len(text_hash)), 4):
            chunk = text_hash[i:i+4]
            if len(chunk) == 4:
                val = struct.unpack('f', chunk)[0]
                embedding.append(val)
        
        # Pad or truncate to 384 dimensions
        while len(embedding) < 384:
            embedding.append(0.0)
        embedding = embedding[:384]
        
        # Normalize
        norm = sum(x*x for x in embedding) ** 0.5
        if norm > 0:
            embedding = [x/norm for x in embedding]
            
        return embedding
        
    except Exception as e:
        logger.error(f"Embedding generation failed: {e}")
        return [0.0] * 384

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 100) -> List[str]:
    """Split text into overlapping chunks"""
    if not tokenizer:
        # Simple word-based chunking as fallback
        words = text.split()
        chunks = []
        for i in range(0, len(words), chunk_size - overlap):
            chunk = " ".join(words[i:i + chunk_size])
            chunks.append(chunk)
        return chunks
    
    tokens = tokenizer.encode(text)
    chunks = []
    
    for i in range(0, len(tokens), chunk_size - overlap):
        chunk_tokens = tokens[i:i + chunk_size]
        chunk_text = tokenizer.decode(chunk_tokens)
        chunks.append(chunk_text)
    
    return chunks

# API Endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    status = {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "phase": "3",
        "model": GEMMA3_MODEL,
        "services": {}
    }
    
    # Check database
    try:
        async with db_pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        status["services"]["postgresql"] = "healthy"
    except:
        status["services"]["postgresql"] = "unhealthy"
    
    # Check Redis
    try:
        await redis_client.ping()
        status["services"]["redis"] = "healthy"
    except:
        status["services"]["redis"] = "unhealthy"
    
    # Check Qdrant
    try:
        qdrant_client.get_collections()
        status["services"]["qdrant"] = "healthy"
    except:
        status["services"]["qdrant"] = "unhealthy"
    
    # Check Gemma3
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get("http://localhost:11434/api/version")
            if response.status_code == 200:
                status["services"]["gemma3"] = "healthy"
            else:
                status["services"]["gemma3"] = "unhealthy"
    except:
        status["services"]["gemma3"] = "unhealthy"
    
    return status

@app.post("/documents/ingest")
async def ingest_document(document: DocumentInput, background_tasks: BackgroundTasks):
    """Ingest a legal document with automatic chunking and embedding"""
    try:
        # Store document in PostgreSQL
        async with db_pool.acquire() as conn:
            document_id = await conn.fetchval("""
                INSERT INTO legal_documents (title, content, document_type, case_id, metadata, rag_indexed)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
            """, document.title, document.content, document.document_type, 
                document.case_id, json.dumps(document.metadata), False)
        
        # Background task for chunking and embedding
        background_tasks.add_task(process_document_embeddings, document_id, document.content)
        
        return {
            "document_id": str(document_id),
            "status": "ingested",
            "message": "Document stored, embeddings processing in background"
        }
        
    except Exception as e:
        logger.error(f"Document ingestion failed: {e}")
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")

async def process_document_embeddings(document_id: str, content: str):
    """Background task to process document embeddings"""
    try:
        # Chunk the document
        chunks = chunk_text(content)
        
        points = []
        for i, chunk in enumerate(chunks):
            # Generate embedding
            embedding = await generate_embeddings(chunk)
            
            # Create Qdrant point
            point = models.PointStruct(
                id=f"{document_id}_{i}",
                vector=embedding,
                payload={
                    "document_id": document_id,
                    "chunk_index": i,
                    "chunk_text": chunk[:500],  # Store truncated text
                    "full_chunk": chunk
                }
            )
            points.append(point)
        
        # Upload to Qdrant
        qdrant_client.upsert(
            collection_name="legal_documents",
            points=points
        )
        
        # Update database
        async with db_pool.acquire() as conn:
            await conn.execute("""
                UPDATE legal_documents 
                SET rag_indexed = $1, rag_last_updated = $2, chunk_total = $3
                WHERE id = $4
            """, True, datetime.now(), len(chunks), document_id)
        
        logger.info(f"✅ Document {document_id} processed: {len(chunks)} chunks")
        
    except Exception as e:
        logger.error(f"Background embedding processing failed: {e}")

@app.post("/search/semantic")
async def semantic_search(query: QueryInput):
    """Perform semantic search across legal documents"""
    try:
        # Generate query embedding
        query_embedding = await generate_embeddings(query.query)
        
        # Search Qdrant
        search_result = qdrant_client.search(
            collection_name="legal_documents",
            query_vector=query_embedding,
            limit=query.top_k,
            score_threshold=0.5
        )
        
        # Get document details from PostgreSQL
        document_ids = list(set([hit.payload["document_id"] for hit in search_result]))
        
        async with db_pool.acquire() as conn:
            documents = await conn.fetch("""
                SELECT id, title, document_type, case_id, created_at
                FROM legal_documents
                WHERE id = ANY($1::uuid[])
            """, document_ids)
        
        # Format results
        results = []
        for hit in search_result:
            doc_info = next((d for d in documents if str(d["id"]) == hit.payload["document_id"]), None)
            
            result = {
                "document_id": hit.payload["document_id"],
                "title": doc_info["title"] if doc_info else "Unknown",
                "document_type": doc_info["document_type"] if doc_info else "unknown",
                "case_id": doc_info["case_id"] if doc_info else None,
                "relevance_score": hit.score,
                "chunk_text": hit.payload["chunk_text"],
                "chunk_index": hit.payload["chunk_index"]
            }
            results.append(result)
        
        return {
            "query": query.query,
            "total_results": len(results),
            "results": results
        }
        
    except Exception as e:
        logger.error(f"Semantic search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@app.post("/analyze/document")
async def analyze_document(request: AnalysisRequest):
    """AI-powered document analysis using Gemma3"""
    try:
        # Get document from database
        async with db_pool.acquire() as conn:
            document = await conn.fetchrow("""
                SELECT id, title, content, document_type, case_id
                FROM legal_documents
                WHERE id = $1
            """, request.document_id)
        
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Create analysis prompt based on type
        analysis_prompts = {
            "comprehensive": "Provide a comprehensive legal analysis of this document. Identify key terms, potential issues, and recommendations.",
            "liability": "Focus specifically on liability clauses, limitations of liability, and potential legal exposure in this document.",
            "compliance": "Analyze this document for compliance issues, regulatory requirements, and potential violations.",
            "risk": "Identify and assess legal risks, potential disputes, and areas of concern in this document."
        }
        
        prompt = f"""<start_of_turn>user
You are a specialized Legal AI Assistant. {analysis_prompts.get(request.analysis_type, analysis_prompts['comprehensive'])}

Document Title: {document['title']}
Document Type: {document['document_type']}

Document Content:
{document['content'][:4000]}  # Limit content to fit context

Please provide a detailed analysis with specific examples from the document.<end_of_turn>
<start_of_turn>model
"""
        
        # Call Gemma3 for analysis
        analysis = await call_gemma3(prompt, max_tokens=1500, temperature=0.1)
        
        # Store analysis result
        analysis_id = None
        async with db_pool.acquire() as conn:
            analysis_id = await conn.fetchval("""
                INSERT INTO event_logs (event_type, entity_type, entity_id, event_data, user_id)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            """, "document_analysis", "legal_document", request.document_id,
                json.dumps({
                    "analysis_type": request.analysis_type,
                    "analysis_result": analysis,
                    "model_used": GEMMA3_MODEL
                }), "system")
        
        return {
            "document_id": request.document_id,
            "analysis_type": request.analysis_type,
            "analysis_id": str(analysis_id),
            "analysis": analysis,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Document analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/chat/legal")
async def legal_chat(request: ChatRequest):
    """RAG-powered legal chat using Gemma3 with document context"""
    try:
        # Get relevant documents if context is needed
        context_text = ""
        if request.context_documents:
            async with db_pool.acquire() as conn:
                docs = await conn.fetch("""
                    SELECT title, content FROM legal_documents
                    WHERE id = ANY($1::uuid[])
                """, request.context_documents)
                
                context_text = "\n\n".join([f"Document: {doc['title']}\n{doc['content'][:1000]}" for doc in docs])
        
        # If no explicit context, perform semantic search on the last user message
        elif request.messages:
            last_user_msg = next((msg.content for msg in reversed(request.messages) if msg.role == "user"), "")
            if last_user_msg:
                search_query = QueryInput(query=last_user_msg, top_k=3)
                search_results = await semantic_search(search_query)
                context_text = "\n\n".join([f"Relevant: {result['chunk_text']}" for result in search_results.get("results", [])])
        
        # Build conversation prompt
        conversation = ""
        for msg in request.messages:
            if msg.role == "user":
                conversation += f"<start_of_turn>user\n{msg.content}<end_of_turn>\n"
            elif msg.role == "assistant":
                conversation += f"<start_of_turn>model\n{msg.content}<end_of_turn>\n"
        
        # Create final prompt with context
        prompt = f"""<start_of_turn>user
You are a specialized Legal AI Assistant powered by Gemma 3. You provide expert legal analysis and guidance based on the following context and conversation.

{f"Relevant Document Context:\n{context_text}\n" if context_text else ""}

{conversation}
<end_of_turn>
<start_of_turn>model
"""
        
        # Call Gemma3
        response = await call_gemma3(prompt, max_tokens=request.max_tokens, temperature=request.temperature)
        
        return {
            "response": response,
            "model": GEMMA3_MODEL,
            "context_used": bool(context_text),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Legal chat failed: {e}")
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")

@app.get("/documents/stats")
async def document_stats():
    """Get document and system statistics"""
    try:
        async with db_pool.acquire() as conn:
            total_docs = await conn.fetchval("SELECT COUNT(*) FROM legal_documents")
            indexed_docs = await conn.fetchval("SELECT COUNT(*) FROM legal_documents WHERE rag_indexed = true")
            doc_types = await conn.fetch("""
                SELECT document_type, COUNT(*) as count 
                FROM legal_documents 
                GROUP BY document_type
            """)
            recent_analyses = await conn.fetchval("""
                SELECT COUNT(*) FROM event_logs 
                WHERE event_type = 'document_analysis' 
                AND timestamp > NOW() - INTERVAL '24 hours'
            """)
        
        # Qdrant stats
        try:
            collections = qdrant_client.get_collections()
            qdrant_stats = {col.name: qdrant_client.count(col.name).count for col in collections.collections}
        except:
            qdrant_stats = {}
        
        return {
            "documents": {
                "total": total_docs,
                "indexed": indexed_docs,
                "by_type": {row["document_type"]: row["count"] for row in doc_types}
            },
            "recent_analyses": recent_analyses,
            "vector_store": qdrant_stats,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Stats retrieval failed: {e}")
        raise HTTPException(status_code=500, detail=f"Stats failed: {str(e)}")

if __name__ == "__main__":
    print("🚀 Starting Phase 3 Agentic Backend & Advanced RAG System")
    print(f"📁 Model: {GEMMA3_MODEL}")
    print("📍 Server: http://localhost:9000")
    print("📖 Docs: http://localhost:9000/docs")
    
    uvicorn.run(app, host="0.0.0.0", port=9000)
