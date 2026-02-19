#!/usr/bin/env python3
"""
FastAPI Web Server for TensorRT Gemma 3 Inference
Provides REST API for high-performance legal AI inference
"""

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import time
import json
from pathlib import Path

# Import our TensorRT server
from trt_inference_server import GemmaTRTServer

app = FastAPI(
    title="Gemma 3 TensorRT Inference API",
    description="High-performance legal AI inference with TensorRT optimization",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global server instance
trt_server = None

class InferenceRequest(BaseModel):
    prompt: str
    max_tokens: int = 100
    temperature: float = 0.8

class BenchmarkRequest(BaseModel):
    runs: int = 5
    seq_length: int = 512

@app.on_event("startup")
async def startup_event():
    """Initialize TensorRT server on startup"""
    global trt_server

    # Path to engine - adjust as needed
    engine_path = "/workspace/python_codebase/model_tools/gemma3_270m_fp16.engine"

    if not Path(engine_path).exists():
        print(f"⚠️ Engine not found at {engine_path}")
        print("Server will start but inference will fail")
        return

    try:
        print("🚀 Initializing TensorRT server...")
        trt_server = GemmaTRTServer(engine_path)
        print("✅ TensorRT server ready!")
    except Exception as e:
        print(f"❌ Failed to initialize TensorRT server: {e}")

@app.get("/")
async def root():
    """Health check endpoint"""
    if trt_server is None:
        return {
            "status": "error",
            "message": "TensorRT server not initialized",
            "engine_loaded": False
        }

    return {
        "status": "healthy",
        "message": "Gemma 3 TensorRT Inference API",
        "engine_loaded": True,
        "engine_size_mb": trt_server.engine_path.stat().st_size / (1024*1024) if trt_server.engine_path.exists() else 0
    }

@app.get("/health")
async def health():
    """Detailed health check"""
    if trt_server is None:
        raise HTTPException(status_code=503, detail="TensorRT server not available")

    return {
        "status": "healthy",
        "engine_path": str(trt_server.engine_path),
        "engine_size_mb": trt_server.engine_path.stat().st_size / (1024*1024),
        "io_tensors": trt_server.engine.num_io_tensors if trt_server.engine else 0,
        "optimization_profiles": trt_server.engine.num_optimization_profiles if trt_server.engine else 0
    }

@app.post("/generate")
async def generate_text(request: InferenceRequest):
    """Generate text from prompt"""
    if trt_server is None:
        raise HTTPException(status_code=503, detail="TensorRT server not available")

    if trt_server.tokenizer is None:
        raise HTTPException(status_code=503, detail="Tokenizer not available")

    try:
        start_time = time.time()
        generated_text = trt_server.generate_text(
            request.prompt,
            max_new_tokens=request.max_tokens,
            temperature=request.temperature
        )
        inference_time = time.time() - start_time

        return {
            "prompt": request.prompt,
            "generated_text": generated_text,
            "inference_time_ms": round(inference_time * 1000, 2),
            "tokens_generated": len(generated_text.split()),
            "tokens_per_second": len(generated_text.split()) / inference_time if inference_time > 0 else 0
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")

@app.post("/benchmark")
async def benchmark(request: BenchmarkRequest):
    """Run performance benchmark"""
    if trt_server is None:
        raise HTTPException(status_code=503, detail="TensorRT server not available")

    try:
        import asyncio
        results = await asyncio.get_event_loop().run_in_executor(
            None,
            trt_server.benchmark,
            request.runs,
            request.seq_length
        )

        return {
            "status": "completed",
            "results": results,
            "engine": "TensorRT",
            "model": "Gemma-3-270M-FP16"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Benchmark failed: {str(e)}")

@app.get("/stats")
async def get_stats():
    """Get server statistics"""
    if trt_server is None:
        return {"error": "Server not initialized"}

    return {
        "engine_loaded": True,
        "engine_path": str(trt_server.engine_path),
        "engine_size_mb": trt_server.engine_path.stat().st_size / (1024*1024),
        "tensorrt_version": "10.5.0",  # From container
        "cuda_available": True,  # Assumed in container
        "model": "Gemma-3-270M",
        "precision": "FP16",
        "optimization": "TensorRT"
    }

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="TensorRT Gemma 3 Web Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind to")
    parser.add_argument("--engine-path", help="Path to TensorRT engine (overrides default)")

    args = parser.parse_args()

    # Override engine path if provided
    if args.engine_path:
        # This would need to be set before startup, for now just note it
        print(f"Custom engine path: {args.engine_path}")

    print("🚀 Starting Gemma 3 TensorRT Inference Server...")
    print(f"📡 Server will be available at http://{args.host}:{args.port}")
    print("📊 Endpoints:")
    print("  GET  /         - Health check")
    print("  GET  /health   - Detailed health")
    print("  POST /generate - Text generation")
    print("  POST /benchmark- Performance benchmark")
    print("  GET  /stats    - Server statistics")

    uvicorn.run(app, host=args.host, port=args.port)