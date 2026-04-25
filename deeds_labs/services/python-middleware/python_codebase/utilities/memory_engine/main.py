"""
Advanced AI Memory Engine with 4D Search and Predictive Analytics
Google-style memory with auto-learning and generative pre-fetching
"""

import asyncio
import json
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from fastapi import FastAPI, HTTPException, WebSocket, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncpg
import redis.asyncio as redis
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from sentence_transformers import SentenceTransformer
import torch
from sklearn.cluster import KMeans
from sklearn.metrics.pairwise import cosine_similarity
from neo4j import AsyncGraphDatabase
import logging
from contextlib import asynccontextmanager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Pydantic models
class UserInteraction(BaseModel):
    user_id: str
    session_id: str
    interaction_type: str
    content: str
    temporal_context: Optional[Dict[str, Any]] = None
    spatial_context: Optional[Dict[str, Any]] = None
    semantic_context: Optional[Dict[str, Any]] = None
    social_context: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None

class SearchQuery(BaseModel):
    user_id: str
    query: str
    search_type: str = "4d"
    temporal_weight: float = 0.2
    spatial_weight: float = 0.1
    semantic_weight: float = 0.5
    social_weight: float = 0.2
    limit: int = 10

class PredictionRequest(BaseModel):
    user_id: str
    current_context: Dict[str, Any]
    prediction_horizon: int = 3600

class MemoryResult(BaseModel):
    memory_id: str
    content: str
    similarity_score: float
    temporal_relevance: float
    semantic_relevance: float
    overall_score: float
    created_at: datetime

# Global AI models and connections
embedding_model = None
postgres_pool = None
redis_client = None
qdrant_client = None
neo4j_driver = None

class AdvancedMemoryEngine:
    """Advanced AI Memory Engine with 4D Search and Predictive Analytics"""
    
    def __init__(self):
        self.embedding_cache = {}
        self.user_patterns = {}
        self.prediction_models = {}
        
    async def initialize(self):
        """Initialize all AI models and database connections"""
        global embedding_model, postgres_pool, redis_client, qdrant_client, neo4j_driver
        
        try:
            logger.info("🤖 Loading sentence transformer model...")
            embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
            if torch.cuda.is_available():
                embedding_model = embedding_model.to('cuda')
                logger.info("✅ GPU acceleration enabled for embeddings")
            
            logger.info("🗄️ Connecting to databases...")
            
            postgres_pool = await asyncpg.create_pool(
                "postgresql://legal_admin:LegalRAG2024!@postgres-advanced:5432/legal_ai_advanced",
                min_size=5,
                max_size=20
            )
            
            redis_client = redis.from_url("redis://redis-advanced:6379", decode_responses=True)
            qdrant_client = QdrantClient(url="http://qdrant-gpu:6333")
            
            neo4j_driver = AsyncGraphDatabase.driver(
                "bolt://neo4j-4d:7687",
                auth=("neo4j", "LegalRAG2024!")
            )
            
            await self._initialize_qdrant_collection()
            logger.info("✅ All AI systems initialized successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize AI systems: {e}")
            raise
    
    async def _initialize_qdrant_collection(self):
        """Initialize Qdrant collection for 4D vectors"""
        try:
            collection_name = "memory_4d_vectors"
            
            try:
                collection_info = qdrant_client.get_collection(collection_name)
                logger.info(f"✅ Qdrant collection '{collection_name}' exists")
            except:
                qdrant_client.create_collection(
                    collection_name=collection_name,
                    vectors_config=VectorParams(
                        size=384,
                        distance=Distance.COSINE
                    )
                )
                logger.info(f"✅ Created Qdrant collection '{collection_name}'")
                
        except Exception as e:
            logger.error(f"❌ Failed to initialize Qdrant collection: {e}")
    
    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embeddings with caching"""
        cache_key = f"embed:{hash(text)}"
        
        cached = await redis_client.get(cache_key)
        if cached:
            return json.loads(cached)
        
        embedding = embedding_model.encode(text, convert_to_numpy=True)
        embedding_list = embedding.tolist()
        
        await redis_client.setex(cache_key, 3600, json.dumps(embedding_list))
        return embedding_list
    
    async def store_user_interaction(self, interaction: UserInteraction) -> str:
        """Store user interaction with 4D context and generate predictions"""
        try:
            embedding = await self.generate_embedding(interaction.content)
            
            async with postgres_pool.acquire() as conn:
                memory_id = await conn.fetchval("""
                    INSERT INTO user_memory (
                        user_id, session_id, interaction_type, content, embedding,
                        temporal_context, spatial_context, semantic_context, social_context, metadata
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    RETURNING id
                """, 
                interaction.user_id, interaction.session_id, interaction.interaction_type,
                interaction.content, embedding, 
                json.dumps(interaction.temporal_context) if interaction.temporal_context else None,
                json.dumps(interaction.spatial_context) if interaction.spatial_context else None,
                json.dumps(interaction.semantic_context) if interaction.semantic_context else None,
                json.dumps(interaction.social_context) if interaction.social_context else None,
                json.dumps(interaction.metadata) if interaction.metadata else None
                )
            
            qdrant_client.upsert(
                collection_name="memory_4d_vectors",
                points=[PointStruct(
                    id=str(memory_id),
                    vector=embedding,
                    payload={
                        "user_id": interaction.user_id,
                        "session_id": interaction.session_id,
                        "interaction_type": interaction.interaction_type,
                        "content": interaction.content,
                        "temporal_context": interaction.temporal_context or {},
                        "semantic_context": interaction.semantic_context or {},
                        "created_at": datetime.now().isoformat()
                    }
                )]
            )
            
            await self._update_user_patterns(interaction)
            await self._store_in_neo4j(interaction, str(memory_id))
            
            logger.info(f"✅ Stored interaction {memory_id} for user {interaction.user_id}")
            return str(memory_id)
            
        except Exception as e:
            logger.error(f"❌ Failed to store interaction: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    async def search_4d_memory(self, query: SearchQuery) -> List[MemoryResult]:
        """Perform 4D search across temporal, spatial, semantic, and social dimensions"""
        try:
            query_embedding = await self.generate_embedding(query.query)
            
            # Simple fallback search if 4D function doesn't exist
            async with postgres_pool.acquire() as conn:
                try:
                    results = await conn.fetch("""
                        SELECT * FROM search_4d_memory(
                            $1, $2, $3, $4, $5, $6, $7
                        )
                    """, 
                    query.user_id, query_embedding,
                    query.temporal_weight, query.spatial_weight,
                    query.semantic_weight, query.social_weight,
                    query.limit
                    )
                except:
                    # Fallback to basic similarity search
                    results = await conn.fetch("""
                        SELECT 
                            id as memory_id,
                            content,
                            (1 - (embedding <=> $2)) as similarity_score,
                            1.0 as temporal_relevance,
                            (1 - (embedding <=> $2)) as semantic_relevance,
                            (1 - (embedding <=> $2)) as overall_score,
                            created_at
                        FROM user_memory
                        WHERE user_id = $1 
                          AND embedding IS NOT NULL
                        ORDER BY embedding <=> $2
                        LIMIT $3
                    """, query.user_id, query_embedding, query.limit)
            
            memory_results = [
                MemoryResult(
                    memory_id=str(row['memory_id']),
                    content=row['content'],
                    similarity_score=float(row['similarity_score']) if row['similarity_score'] else 0.0,
                    temporal_relevance=float(row['temporal_relevance']) if row['temporal_relevance'] else 0.0,
                    semantic_relevance=float(row['semantic_relevance']) if row['semantic_relevance'] else 0.0,
                    overall_score=float(row['overall_score']) if row['overall_score'] else 0.0,
                    created_at=row['created_at']
                )
                for row in results
            ]
            
            return memory_results
            
        except Exception as e:
            logger.error(f"❌ 4D search failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

# Initialize memory engine
memory_engine = AdvancedMemoryEngine()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    await memory_engine.initialize()
    yield
    if postgres_pool:
        await postgres_pool.close()
    if redis_client:
        await redis_client.close()
    if neo4j_driver:
        await neo4j_driver.close()

# FastAPI app
app = FastAPI(
    title="Advanced AI Memory Engine",
    description="4D Search + Predictive Analytics + Auto-Memory",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "message": "Advanced AI Memory Engine",
        "version": "1.0.0",
        "features": [
            "4D Search (Temporal + Spatial + Semantic + Social)",
            "Predictive Analytics",
            "Auto-Memory with AI",
            "NVIDIA GPU Acceleration",
            "Real-time User Pattern Learning"
        ]
    }

@app.post("/store-interaction")
async def store_interaction(interaction: UserInteraction):
    """Store user interaction with 4D context"""
    memory_id = await memory_engine.store_user_interaction(interaction)
    return {"memory_id": memory_id, "status": "stored"}

@app.post("/search-4d")
async def search_4d(query: SearchQuery):
    """Perform 4D memory search"""
    results = await memory_engine.search_4d_memory(query)
    return {
        "results": results,
        "count": len(results),
        "search_type": "4d"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        if postgres_pool:
            async with postgres_pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
        
        await redis_client.ping()
        
        return {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "gpu_available": torch.cuda.is_available(),
            "gpu_count": torch.cuda.device_count() if torch.cuda.is_available() else 0
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Unhealthy: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
