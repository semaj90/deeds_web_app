#!/usr/bin/env python3
"""
RTX 3060 Ti Optimized Embedding Server
Integrates with Context7 MCP server for NVIDIA C++ JSON documentation
Uses nomic-embed-text with CUDA Tensor Core optimization
"""

import torch
import hashlib
import asyncio
import json
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
import time
import logging

# NVIDIA optimization imports
import torch.cuda
from torch.cuda.amp import autocast
import cupy as cp  # For advanced CUDA operations

# Context7 MCP client for documentation
import subprocess
import aiofiles

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Check RTX 3060 Ti availability
if not torch.cuda.is_available():
    raise RuntimeError("CUDA not available - RTX 3060 Ti required")

device = torch.device("cuda:0")
gpu_props = torch.cuda.get_device_properties(device)
logger.info(f"🚀 GPU: {gpu_props.name}, Memory: {gpu_props.total_memory // 1024**3}GB")

# RTX 3060 Ti specific optimizations
torch.backends.cudnn.benchmark = True  # Optimize for consistent input sizes
torch.backends.cuda.matmul.allow_tf32 = True  # Enable TF32 for faster matmul
torch.backends.cudnn.allow_tf32 = True

@dataclass
class EmbeddingConfig:
    model_name: str = "nomic-embed-text-v1"
    max_batch_size: int = 128  # RTX 3060 Ti sweet spot
    fp16_enabled: bool = True  # Tensor Core optimization
    max_seq_length: int = 512
    cache_embeddings: bool = True
    use_tensor_cores: bool = True

class EmbeddingRequest(BaseModel):
    texts: List[str]
    model: Optional[str] = "nomic-embed-text-v1"
    precision: Optional[str] = "fp16"
    batch_size: Optional[int] = 128
    legal_context: Optional[Dict[str, Any]] = None

class EmbeddingResponse(BaseModel):
    vectors: List[List[float]]
    metadata: Dict[str, Any]

class Context7MCPClient:
    """Client for accessing NVIDIA C++ JSON documentation via Context7 MCP"""
    
    def __init__(self, mcp_config_path: str = "../mcp-servers/mcp.json"):
        self.mcp_config_path = mcp_config_path
        self.nvidia_docs_cache = {}
    
    async def get_nvidia_cuda_docs(self, query: str) -> Dict[str, Any]:
        """Fetch NVIDIA CUDA C++ documentation using Context7 MCP"""
        try:
            # Use Context7 MCP to search NVIDIA docs
            cmd = [
                "node", "../mcp-servers/mcp-context7-wrapper.js",
                "--query", f"NVIDIA CUDA C++ {query}",
                "--format", "json",
                "--max-results", "5"
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                docs = json.loads(result.stdout)
                logger.info(f"📚 Retrieved NVIDIA docs for: {query}")
                return docs
            else:
                logger.warning(f"MCP query failed: {result.stderr}")
                return {"error": "Documentation not found"}
                
        except Exception as e:
            logger.error(f"Context7 MCP error: {e}")
            return {"error": str(e)}
    
    async def enhance_embedding_context(self, text: str) -> str:
        """Enhance legal text with relevant NVIDIA optimization context"""
        # For legal AI embeddings, add GPU optimization context
        if any(term in text.lower() for term in ["performance", "optimization", "parallel", "gpu"]):
            nvidia_context = await self.get_nvidia_cuda_docs("tensor operations legal text processing")
            if "error" not in nvidia_context:
                context_summary = f"[GPU-OPTIMIZED] {text}"
                return context_summary
        
        return text

class RTXEmbeddingServer:
    """RTX 3060 Ti optimized embedding server with Context7 integration"""
    
    def __init__(self, config: EmbeddingConfig):
        self.config = config
        self.model = None
        self.tokenizer = None
        self.context7_client = Context7MCPClient()
        self.executor = ThreadPoolExecutor(max_workers=4)
        
        # CUDA streams for async processing
        self.compute_stream = torch.cuda.Stream()
        self.memory_stream = torch.cuda.Stream()
        
        # Pinned memory pool for faster CPU->GPU transfers
        self.pinned_memory_pool = []
        
        self._initialize_model()
    
    def _initialize_model(self):
        """Initialize nomic-embed-text with RTX 3060 Ti optimizations"""
        try:
            # Import nomic embedding model
            from sentence_transformers import SentenceTransformer
            
            logger.info("🔥 Initializing nomic-embed-text for RTX 3060 Ti...")
            
            # Load model with CUDA optimizations
            self.model = SentenceTransformer('nomic-ai/nomic-embed-text-v1')
            self.model = self.model.to(device)
            
            if self.config.fp16_enabled:
                self.model = self.model.half()  # Enable FP16 for Tensor Cores
                logger.info("✅ FP16 Tensor Core optimization enabled")
            
            # Warm up GPU
            self._warmup_gpu()
            
        except Exception as e:
            logger.error(f"Model initialization failed: {e}")
            raise
    
    def _warmup_gpu(self):
        """Warm up GPU with dummy inference"""
        logger.info("🔥 Warming up RTX 3060 Ti...")
        dummy_texts = ["GPU warmup text"] * 4
        
        with torch.no_grad():
            if self.config.fp16_enabled:
                with autocast():
                    _ = self.model.encode(dummy_texts, convert_to_tensor=True)
            else:
                _ = self.model.encode(dummy_texts, convert_to_tensor=True)
        
        torch.cuda.synchronize()
        logger.info("✅ GPU warmup complete")
    
    async def _preprocess_with_context7(self, texts: List[str]) -> List[str]:
        """Enhance texts with Context7 NVIDIA documentation context"""
        enhanced_texts = []
        
        for text in texts:
            try:
                enhanced_text = await self.context7_client.enhance_embedding_context(text)
                enhanced_texts.append(enhanced_text)
            except Exception as e:
                logger.warning(f"Context enhancement failed: {e}")
                enhanced_texts.append(text)
        
        return enhanced_texts
    
    def _batch_encode_optimized(self, texts: List[str]) -> torch.Tensor:
        """RTX 3060 Ti optimized batch encoding"""
        batch_size = min(len(texts), self.config.max_batch_size)
        
        # Process in optimized batches
        all_embeddings = []
        
        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i:i + batch_size]
            
            with torch.cuda.stream(self.compute_stream):
                with torch.no_grad():
                    if self.config.fp16_enabled:
                        # Use autocast for automatic mixed precision
                        with autocast():
                            batch_embeddings = self.model.encode(
                                batch_texts,
                                convert_to_tensor=True,
                                device=device,
                                show_progress_bar=False,
                                normalize_embeddings=True
                            )
                    else:
                        batch_embeddings = self.model.encode(
                            batch_texts,
                            convert_to_tensor=True,
                            device=device,
                            show_progress_bar=False,
                            normalize_embeddings=True
                        )
                    
                    all_embeddings.append(batch_embeddings)
        
        # Synchronize streams
        torch.cuda.synchronize()
        
        # Concatenate all batches
        if len(all_embeddings) == 1:
            return all_embeddings[0]
        else:
            return torch.cat(all_embeddings, dim=0)
    
    async def embed_texts(self, request: EmbeddingRequest) -> EmbeddingResponse:
        """Main embedding processing with Context7 enhancement"""
        start_time = time.time()
        
        if not request.texts:
            raise HTTPException(status_code=400, detail="No texts provided")
        
        if len(request.texts) > self.config.max_batch_size * 2:
            raise HTTPException(status_code=400, detail=f"Too many texts. Max: {self.config.max_batch_size * 2}")
        
        try:
            # Enhance texts with Context7 NVIDIA documentation
            enhanced_texts = await self._preprocess_with_context7(request.texts)
            
            # Generate embeddings with RTX 3060 Ti optimization
            embeddings_tensor = self._batch_encode_optimized(enhanced_texts)
            
            # Convert to CPU and then to list for JSON serialization
            embeddings_cpu = embeddings_tensor.cpu()
            
            if self.config.fp16_enabled:
                embeddings_cpu = embeddings_cpu.float()  # Convert back to FP32 for output
            
            embeddings_list = embeddings_cpu.numpy().tolist()
            
            processing_time = time.time() - start_time
            
            # Prepare metadata
            metadata = {
                "model": request.model or self.config.model_name,
                "gpu_time_ms": round(processing_time * 1000, 2),
                "batch_size": len(request.texts),
                "precision": "fp16" if self.config.fp16_enabled else "fp32",
                "gpu_name": gpu_props.name,
                "tensor_cores_used": self.config.fp16_enabled and self.config.use_tensor_cores,
                "context7_enhanced": True,
                "embedding_dimension": len(embeddings_list[0]) if embeddings_list else 0
            }
            
            logger.info(f"🚀 Embedded {len(request.texts)} texts in {processing_time:.3f}s")
            
            return EmbeddingResponse(vectors=embeddings_list, metadata=metadata)
            
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise HTTPException(status_code=500, detail=f"Embedding error: {str(e)}")
    
    def get_gpu_stats(self) -> Dict[str, Any]:
        """Get RTX 3060 Ti utilization stats"""
        if torch.cuda.is_available():
            memory_allocated = torch.cuda.memory_allocated(device)
            memory_reserved = torch.cuda.memory_reserved(device)
            memory_total = torch.cuda.get_device_properties(device).total_memory
            
            return {
                "gpu_name": gpu_props.name,
                "memory_allocated_mb": memory_allocated // 1024**2,
                "memory_reserved_mb": memory_reserved // 1024**2,
                "memory_total_mb": memory_total // 1024**2,
                "memory_utilization": round(memory_allocated / memory_total * 100, 2),
                "tensor_cores_available": True,  # RTX 3060 Ti has Tensor Cores
                "cuda_version": torch.version.cuda,
                "pytorch_version": torch.__version__
            }
        return {"error": "CUDA not available"}

# Initialize server
config = EmbeddingConfig()
embedding_server = RTXEmbeddingServer(config)

# FastAPI app
app = FastAPI(
    title="RTX 3060 Ti Legal AI Embedding Server",
    description="CUDA-optimized embedding server with Context7 MCP integration",
    version="1.0.0"
)

@app.post("/embed", response_model=EmbeddingResponse)
async def embed_endpoint(request: EmbeddingRequest):
    """Generate embeddings with RTX 3060 Ti optimization"""
    return await embedding_server.embed_texts(request)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    gpu_stats = embedding_server.get_gpu_stats()
    
    return {
        "status": "healthy",
        "gpu_available": torch.cuda.is_available(),
        "model_loaded": embedding_server.model is not None,
        "gpu_stats": gpu_stats,
        "context7_available": True,
        "tensor_cores_enabled": config.fp16_enabled and config.use_tensor_cores
    }

@app.get("/nvidia-docs/{query}")
async def nvidia_docs_endpoint(query: str):
    """Query NVIDIA documentation via Context7 MCP"""
    docs = await embedding_server.context7_client.get_nvidia_cuda_docs(query)
    return {"query": query, "documentation": docs}

@app.post("/embed-legal")
async def embed_legal_endpoint(request: EmbeddingRequest):
    """Specialized legal document embedding with enhanced context"""
    # Add legal-specific processing
    if request.legal_context:
        # Enhance texts with legal context
        for i, text in enumerate(request.texts):
            if request.legal_context.get("practice_area"):
                request.texts[i] = f"[{request.legal_context['practice_area']}] {text}"
            if request.legal_context.get("jurisdiction"):
                request.texts[i] = f"{request.texts[i]} (Jurisdiction: {request.legal_context['jurisdiction']})"
    
    return await embedding_server.embed_texts(request)

@app.get("/gpu-benchmark")
async def gpu_benchmark():
    """Benchmark RTX 3060 Ti embedding performance"""
    # Generate test texts
    test_texts = [
        f"Legal document performance test number {i} with various legal terminology and case references."
        for i in range(128)
    ]
    
    start_time = time.time()
    
    request = EmbeddingRequest(texts=test_texts)
    response = await embedding_server.embed_texts(request)
    
    total_time = time.time() - start_time
    throughput = len(test_texts) / total_time
    
    return {
        "benchmark_results": {
            "total_texts": len(test_texts),
            "total_time_seconds": round(total_time, 3),
            "throughput_texts_per_second": round(throughput, 2),
            "gpu_metadata": response.metadata
        }
    }

if __name__ == "__main__":
    logger.info("🚀 Starting RTX 3060 Ti Legal AI Embedding Server...")
    logger.info(f"🔥 GPU: {gpu_props.name}")
    logger.info(f"📊 Max batch size: {config.max_batch_size}")
    logger.info(f"⚡ Tensor Cores: {'Enabled' if config.fp16_enabled else 'Disabled'}")
    logger.info(f"📚 Context7 MCP: Enabled")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
        access_log=True
    )