#!/usr/bin/env python3
"""
Gemma-3 Text Embedding Service with Web Search
Uses Ollama embeddinggemma:latest for 768d embeddings (padded to 1024d)
Designed for legal document processing pipeline
"""

import asyncio
import logging
import time
import os
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import numpy as np
import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class EmbeddingRequest:
    """Text embedding request"""
    text: str
    file_path: str = ""
    language: str = "english"
    chunk_id: str = ""
    metadata: Dict[str, Any] = None

@dataclass
class EmbeddingResponse:
    """Embedding response with 1024d vector"""
    chunk_id: str
    embedding: List[float]  # Always 1024 dimensions
    processing_time_ms: float
    token_count: int
    model_name: str

class Gemma3EmbeddingService:
    """Gemma-3 compatible embedding service for 1024d text embeddings via Ollama"""

    def __init__(
        self,
        model_name: str = "embeddinggemma:latest",
        ollama_url: Optional[str] = None,
        batch_size: int = 32,
        max_length: int = 512
    ):
        """
        Initialize embedding service using Ollama

        Args:
            model_name: Ollama model name (default: embeddinggemma:latest)
            ollama_url: Ollama API URL (default: from env OLLAMA_URL or http://localhost:11434)
            batch_size: Batch size for processing
            max_length: Max token length
        """
        self.model_name = model_name
        self.batch_size = batch_size
        self.max_length = max_length

        # Get Ollama endpoint
        self.ollama_url = self.getOllamaEndpoint() if ollama_url is None else ollama_url
        self.embed_endpoint = f"{self.ollama_url}/api/embeddings"

        logger.info(f"🚀 Initializing Gemma-3 Embedding Service")
        logger.info(f"   Model: {self.model_name}")
        logger.info(f"   Ollama: {self.ollama_url}")

        self.is_loaded = False

        # Performance tracking
        self.total_requests = 0
        self.total_processing_time = 0.0

    @staticmethod
    def getOllamaEndpoint() -> str:
        """Get Ollama endpoint from environment (matches fastmcp_agentic_middleware)"""
        # Primary: OLLAMA_URL from .env
        ollama_url = os.getenv("OLLAMA_URL")
        if ollama_url:
            return ollama_url

        # Fallback: VITE_OLLAMA_URL
        vite_url = os.getenv("VITE_OLLAMA_URL")
        if vite_url:
            return vite_url

        # Default
        return "http://localhost:11434"


    async def load_model(self) -> None:
        """Verify Ollama model is available"""
        if self.is_loaded:
            return

        logger.info(f"📥 Checking Ollama model: {self.model_name}")
        start_time = time.time()

        try:
            # Test embedding generation
            response = requests.post(
                self.embed_endpoint,
                json={"model": self.model_name, "prompt": "test"},
                timeout=10
            )
            response.raise_for_status()

            test_embedding = response.json().get("embedding", [])
            load_time = time.time() - start_time

            logger.info(f"✅ Ollama model ready in {load_time:.2f}s")
            logger.info(f"🎯 Base embedding dimension: {len(test_embedding)}d (will pad to 1024d)")

            self.is_loaded = True

        except Exception as e:
            logger.error(f"❌ Failed to connect to Ollama: {e}")
            logger.error(f"   Make sure Ollama is running and {self.model_name} is pulled")
            raise

    async def generate_embeddings(
        self,
        requests_list: List[EmbeddingRequest]
    ) -> List[EmbeddingResponse]:
        """Generate embeddings for multiple requests via Ollama"""
        if not self.is_loaded:
            await self.load_model()

        if not requests_list:
            return []

        logger.info(f"🔄 Processing {len(requests_list)} embedding requests")
        start_time = time.time()

        responses = []

        # Process in batches
        for i in range(0, len(requests_list), self.batch_size):
            batch = requests_list[i:i + self.batch_size]
            batch_responses = await self._process_batch(batch)
            responses.extend(batch_responses)

        total_time = time.time() - start_time
        self.total_requests += len(requests_list)
        self.total_processing_time += total_time

        avg_time = (total_time / len(requests_list)) * 1000
        logger.info(f"✅ Generated {len(responses)} embeddings in {total_time:.2f}s ({avg_time:.1f}ms/req)")

        return responses

    async def _process_batch(self, batch: List[EmbeddingRequest]) -> List[EmbeddingResponse]:
        """Process a batch of embedding requests"""
        batch_start = time.time()
        responses = []

        for req in batch:
            try:
                embedding = await self._generate_single_embedding(req.text)

                response = EmbeddingResponse(
                    chunk_id=req.chunk_id or f"chunk_{len(responses)}",
                    embedding=embedding,
                    processing_time_ms=0,  # Will be set after batch
                    token_count=len(req.text.split()),
                    model_name=self.model_name
                )
                responses.append(response)

            except Exception as e:
                logger.error(f"❌ Error processing chunk {req.chunk_id}: {e}")
                raise

        # Update processing times
        batch_time = (time.time() - batch_start) * 1000
        avg_time = batch_time / len(batch)
        for resp in responses:
            resp.processing_time_ms = avg_time

        return responses

    async def _generate_single_embedding(self, text: str) -> List[float]:
        """Generate single embedding via Ollama embeddinggemma"""
        try:
            response = requests.post(
                self.embed_endpoint,
                json={"model": self.model_name, "prompt": text},
                timeout=30
            )
            response.raise_for_status()

            embedding = response.json().get("embedding", [])

            if not embedding:
                raise ValueError("Empty embedding returned from Ollama")

            # Pad to 1024d if necessary
            embedding_np = np.array(embedding, dtype=np.float32)

            if len(embedding_np) < 1024:
                padding = np.zeros(1024 - len(embedding_np), dtype=np.float32)
                embedding_np = np.concatenate([embedding_np, padding])
            elif len(embedding_np) > 1024:
                embedding_np = embedding_np[:1024]

            # L2 normalization
            norm = np.linalg.norm(embedding_np)
            if norm > 0:
                embedding_np = embedding_np / norm

            return embedding_np.tolist()

        except Exception as e:
            logger.error(f"❌ Embedding generation failed: {e}")
            raise


    def get_stats(self) -> Dict[str, Any]:
        """Get service statistics"""
        avg_time = (self.total_processing_time / max(self.total_requests, 1)) * 1000

        return {
            "model_name": self.model_name,
            "ollama_url": self.ollama_url,
            "is_loaded": self.is_loaded,
            "embedding_dimension": 1024,
            "batch_size": self.batch_size,
            "max_length": self.max_length,
            "total_requests": self.total_requests,
            "total_processing_time": self.total_processing_time,
            "avg_processing_time_ms": avg_time
        }

    async def health_check(self) -> Dict[str, Any]:
        """Health check endpoint"""
        try:
            if not self.is_loaded:
                await self.load_model()

            # Test embedding generation
            test_start = time.time()
            test_embedding = await self._generate_single_embedding("health check test")
            test_time = (time.time() - test_start) * 1000

            return {
                "status": "healthy",
                "model_loaded": True,
                "embedding_dimension": len(test_embedding),
                "test_inference_time_ms": test_time,
                "ollama_url": self.ollama_url,
                "model_name": self.model_name,
                "timestamp": time.time()
            }

        except Exception as e:
            logger.error(f"❌ Health check failed: {e}")
            return {
                "status": "unhealthy",
                "error": str(e),
                "model_loaded": self.is_loaded,
                "ollama_url": self.ollama_url,
                "model_name": self.model_name,
                "timestamp": time.time()
            }

    async def shutdown(self) -> None:
        """Cleanup resources"""
        logger.info("🛑 Shutting down Gemma-3 Embedding service")
        self.is_loaded = False
        logger.info("✅ Gemma-3 Embedding service shutdown complete")


# FastAPI Integration
app = FastAPI(title="Gemma-3 Embedding Service", version="1.0.0")
service = Gemma3EmbeddingService()

class EmbedRequest(BaseModel):
    texts: List[str]
    file_paths: List[str] = []
    languages: List[str] = []
    chunk_ids: List[str] = []
    metadata: List[Dict[str, Any]] = []

class EmbedResponse(BaseModel):
    embeddings: List[List[float]]
    processing_time_ms: float
    model_name: str
    embedding_dimension: int

@app.on_event("startup")
async def startup():
    await service.load_model()

@app.on_event("shutdown")
async def shutdown():
    await service.shutdown()

@app.post("/embed", response_model=EmbedResponse)
async def embed_texts(request: EmbedRequest):
    try:
        # Convert to EmbeddingRequest objects
        requests = []
        for i, text in enumerate(request.texts):
            req = EmbeddingRequest(
                text=text,
                file_path=request.file_paths[i] if i < len(request.file_paths) else "",
                language=request.languages[i] if i < len(request.languages) else "english",
                chunk_id=request.chunk_ids[i] if i < len(request.chunk_ids) else f"chunk_{i}",
                metadata=request.metadata[i] if i < len(request.metadata) else {}
            )
            requests.append(req)

        # Generate embeddings
        start_time = time.time()
        responses = await service.generate_embeddings(requests)
        total_time = (time.time() - start_time) * 1000

        return EmbedResponse(
            embeddings=[resp.embedding for resp in responses],
            processing_time_ms=total_time,
            model_name=service.model_name,
            embedding_dimension=1024
        )

    except Exception as e:
        logger.error(f"❌ Embedding error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return await service.health_check()

@app.get("/stats")
async def stats():
    return service.get_stats()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")
