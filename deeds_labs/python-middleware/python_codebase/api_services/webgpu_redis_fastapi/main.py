import asyncio
import json
import numpy as np
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import redis.asyncio as redis
from sentence_transformers import SentenceTransformer
import torch
from sklearn.cluster import MiniBatchKMeans
import mmap
import os
import struct
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Tensor AI Service")

# Global connections
redis_client = None
embedding_model = None
kmeans_model = None
tensor_mmap_cache = {}

class TensorRequest(BaseModel):
    text: str
    tensor_id: str
    parent_ids: List[str] = []
    num_slices: int = 3
    cluster: bool = False

class InferenceRequest(BaseModel):
    prompt: str
    max_tokens: int = 512
    temperature: float = 0.7
    case_id: Optional[str] = None

class EmbeddingResponse(BaseModel):
    tensor_id: str
    embeddings: List[float]
    shape: List[int]
    dtype: str
    slices: List[str]  # IDs of tensor slices

class ClusterResult(BaseModel):
    cluster_id: int
    centroid: List[float]
    members: List[str]

# Bit-packing utilities
def pack_float16(arr: np.ndarray) -> bytes:
    """Pack float32 array to float16 bytes"""
    return arr.astype(np.float16).tobytes()

def unpack_float16(data: bytes, shape: tuple) -> np.ndarray:
    """Unpack float16 bytes to float32 array"""
    arr = np.frombuffer(data, dtype=np.float16)
    return arr.reshape(shape).astype(np.float32)

def pack_int8(arr: np.ndarray) -> bytes:
    """Quantize and pack to int8"""
    scale = np.max(np.abs(arr))
    if scale == 0:
        scale = 1
    quantized = (arr / scale * 127).astype(np.int8)
    # Store scale as first 4 bytes
    return struct.pack('f', scale) + quantized.tobytes()

def unpack_int8(data: bytes, shape: tuple) -> np.ndarray:
    """Unpack int8 to float32"""
    scale = struct.unpack('f', data[:4])[0]
    arr = np.frombuffer(data[4:], dtype=np.int8)
    return (arr.astype(np.float32) / 127 * scale).reshape(shape)

# Memory-mapped tensor storage
class TensorMMapStorage:
    def __init__(self, base_path="/tmp/tensors"):
        self.base_path = base_path
        os.makedirs(base_path, exist_ok=True)

    def store(self, tensor_id: str, data: bytes) -> str:
        path = f"{self.base_path}/{tensor_id}.bin"
        with open(path, 'wb') as f:
            f.write(data)
        return path

    def load_mmap(self, tensor_id: str) -> mmap.mmap:
        path = f"{self.base_path}/{tensor_id}.bin"
        if not os.path.exists(path):
            return None

        f = open(path, 'r+b')
        mm = mmap.mmap(f.fileno(), 0)
        tensor_mmap_cache[tensor_id] = (f, mm)
        return mm

    def get_tensor(self, tensor_id: str) -> bytes:
        if tensor_id in tensor_mmap_cache:
            _, mm = tensor_mmap_cache[tensor_id]
            mm.seek(0)
            return mm.read()

        mm = self.load_mmap(tensor_id)
        if mm:
            return mm.read()
        return None

storage = TensorMMapStorage()

@app.on_event("startup")
async def startup():
    global redis_client, embedding_model, kmeans_model

    # Redis connection
    redis_client = await redis.from_url(
        os.getenv("REDIS_URL", "redis://localhost:6379"),
        password=os.getenv("REDIS_PASSWORD", "redis")
    )

    # Load embedding model (using Gemma embeddings as primary)
    try:
        embedding_model = SentenceTransformer('embeddinggemma:latest')
    except:
        # Fallback to nomic if Gemma not available
        embedding_model = SentenceTransformer('nomic-embed-text')

    # Initialize k-means for clustering
    kmeans_model = MiniBatchKMeans(n_clusters=10, batch_size=100)

    logger.info("Services initialized")

@app.on_event("shutdown")
async def shutdown():
    await redis_client.close()
    # Clean up mmap handles
    for tensor_id, (f, mm) in tensor_mmap_cache.items():
        mm.close()
        f.close()

@app.post("/embed", response_model=EmbeddingResponse)
async def create_embedding(req: TensorRequest, background_tasks: BackgroundTasks):
    """Create multi-slice embeddings from text"""

    # Generate base embedding
    embeddings = embedding_model.encode(req.text)
    embeddings = embeddings.astype(np.float32)

    # Create multiple slices (LoD representations)
    slices = []
    slice_ids = []

    for i in range(req.num_slices):
        # Different compression levels for each slice
        slice_data = embeddings.copy()

        if i == 0:
            # Full precision slice
            packed = slice_data.tobytes()
            dtype = "float32"
        elif i == 1:
            # Float16 slice
            packed = pack_float16(slice_data)
            dtype = "float16"
        else:
            # Int8 quantized slice
            packed = pack_int8(slice_data)
            dtype = "int8"

        slice_id = f"{req.tensor_id}_slice_{i}"
        slice_ids.append(slice_id)

        # Store in mmap file
        storage.store(slice_id, packed)

        # Cache metadata in Redis
        metadata = {
            "parent_id": req.tensor_id,
            "shape": list(embeddings.shape),
            "dtype": dtype,
            "timestamp": datetime.utcnow().isoformat(),
            "parent_assets": req.parent_ids
        }

        await redis_client.hset(f"tensor:{slice_id}", mapping=metadata)
        await redis_client.expire(f"tensor:{slice_id}", 3600)  # 1 hour TTL

        # Add to parent's slice list
        await redis_client.sadd(f"asset:{req.tensor_id}:slices", slice_id)

    # Background clustering if requested
    if req.cluster:
        background_tasks.add_task(cluster_embeddings, req.tensor_id, embeddings)

    return EmbeddingResponse(
        tensor_id=req.tensor_id,
        embeddings=embeddings.tolist(),
        shape=list(embeddings.shape),
        dtype="float32",
        slices=slice_ids
    )

async def cluster_embeddings(tensor_id: str, embeddings: np.ndarray):
    """Background task for k-means clustering"""
    try:
        # Get similar embeddings from cache
        similar = await redis_client.smembers(f"cluster:similar:{tensor_id}")

        if len(similar) > 5:
            # Load similar embeddings
            vectors = [embeddings]
            for sim_id in similar:
                data = storage.get_tensor(sim_id.decode() + "_slice_0")
                if data:
                    vec = np.frombuffer(data, dtype=np.float32)
                    vectors.append(vec)

            # Fit k-means
            X = np.vstack(vectors)
            kmeans_model.partial_fit(X)

            # Store cluster assignment
            cluster_id = kmeans_model.predict([embeddings])[0]
            await redis_client.hset(f"tensor:{tensor_id}", "cluster_id", str(cluster_id))

            logger.info(f"Clustered {tensor_id} to cluster {cluster_id}")
    except Exception as e:
        logger.error(f"Clustering failed: {e}")

@app.post("/infer")
async def inference(req: InferenceRequest):
    """Gemma3 legal model inference with streaming"""

    # Check cache first
    cache_key = f"inference:{req.case_id}:{hash(req.prompt)}"
    cached = await redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    async def generate():
        # Simulate streaming response (replace with actual vLLM/Gemma3)
        tokens = [
            "Based", "on", "legal", "precedent", "and", "case", "law",
            "the", "analysis", "suggests", "that", "..."
        ]

        for token in tokens:
            yield f"data: {json.dumps({'token': token})}\n\n"
            await asyncio.sleep(0.05)  # Simulate generation delay

        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

@app.get("/tensor/{tensor_id}")
async def get_tensor(tensor_id: str):
    """Retrieve tensor with metadata"""

    # Get metadata from Redis
    metadata = await redis_client.hgetall(f"tensor:{tensor_id}")
    if not metadata:
        raise HTTPException(404, "Tensor not found")

    # Load tensor data from mmap
    data = storage.get_tensor(tensor_id)
    if not data:
        raise HTTPException(404, "Tensor data not found")

    # Check dtype and unpack if needed
    dtype = metadata.get(b"dtype", b"float32").decode()
    shape = json.loads(metadata.get(b"shape", b"[]").decode())

    if dtype == "float16":
        arr = unpack_float16(data, tuple(shape))
    elif dtype == "int8":
        arr = unpack_int8(data, tuple(shape))
    else:
        arr = np.frombuffer(data, dtype=np.float32).reshape(shape)

    return {
        "tensor_id": tensor_id,
        "data": arr.tolist(),
        "metadata": {k.decode(): v.decode() for k, v in metadata.items()}
    }

@app.post("/langextract")
async def lang_extract(text: str, patterns: List[str]):
    """Extract patterns from text using embeddings"""

    # Embed text and patterns
    text_emb = embedding_model.encode(text)
    pattern_embs = embedding_model.encode(patterns)

    # Calculate similarities
    similarities = np.dot(pattern_embs, text_emb) / (
        np.linalg.norm(pattern_embs, axis=1) * np.linalg.norm(text_emb)
    )

    # Return matches above threshold
    matches = []
    for i, sim in enumerate(similarities):
        if sim > 0.7:
            matches.append({
                "pattern": patterns[i],
                "similarity": float(sim),
                "confidence": float(sim * 100)
            })

    return {"matches": matches}

@app.get("/clusters")
async def get_clusters():
    """Get current k-means clusters"""

    if not hasattr(kmeans_model, 'cluster_centers_'):
        return {"clusters": []}

    clusters = []
    for i, center in enumerate(kmeans_model.cluster_centers_):
        # Get members from Redis
        members = await redis_client.smembers(f"cluster:{i}:members")

        clusters.append(ClusterResult(
            cluster_id=i,
            centroid=center.tolist(),
            members=[m.decode() for m in members]
        ))

    return {"clusters": clusters}

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "redis": await redis_client.ping(),
        "embedding_model": embedding_model is not None,
        "mmap_cache_size": len(tensor_mmap_cache)
    }