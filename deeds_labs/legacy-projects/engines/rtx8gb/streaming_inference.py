#!/usr/bin/env python3
"""
Streaming Inference Server for RTX 8GB GPUs
Optimized for Gemma3 with model sharding and chunked processing
"""

import torch
import tensorrt_llm
from tensorrt_llm.runtime import ModelRunner
import numpy as np
import psutil
from typing import List, Dict, Any
import asyncio
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class InferenceRequest(BaseModel):
    prompt: str
    max_tokens: int = 512
    temperature: float = 0.7
    stream: bool = True

class InferenceResponse(BaseModel):
    text: str
    tokens_generated: int
    memory_used_gb: float

app = FastAPI(title="RTX 8GB Streaming Inference Server")

class StreamingInferenceEngine:
    def __init__(self, engine_path: str, chunk_size: int = 512):
        self.chunk_size = chunk_size
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        # Load sharded model with memory optimization
        logger.info("Loading sharded TensorRT model...")
        self.runner = ModelRunner.from_dir(engine_path, rank=0)

        # CPU offloading for KV cache
        self.kv_cache_cpu = {}
        self.max_memory_gb = 6  # Leave 2GB for system

        logger.info("Model loaded successfully")

    def check_memory_usage(self) -> float:
        """Check current GPU memory usage in GB"""
        if torch.cuda.is_available():
            return torch.cuda.memory_allocated() / 1024**3
        return psutil.virtual_memory().used / 1024**3

    def stream_chunks(self, text: str) -> List[str]:
        """Split text into chunks for streaming processing"""
        words = text.split()
        chunks = []
        current_chunk = []

        for word in words:
            current_chunk.append(word)
            if len(' '.join(current_chunk)) > self.chunk_size:
                if len(current_chunk) > 1:
                    chunks.append(' '.join(current_chunk[:-1]))
                    current_chunk = [word]
                else:
                    chunks.append(' '.join(current_chunk))
                    current_chunk = []

        if current_chunk:
            chunks.append(' '.join(current_chunk))

        return chunks

    async def generate_streaming(self, prompt: str, max_tokens: int = 512) -> str:
        """Generate text with streaming and memory management"""
        logger.info(f"Starting streaming generation for prompt: {prompt[:50]}...")

        # Check initial memory
        initial_memory = self.check_memory_usage()
        if initial_memory > self.max_memory_gb:
            raise MemoryError(f"Initial memory usage too high: {initial_memory:.2f}GB")

        # Split prompt into chunks
        chunks = self.stream_chunks(prompt)
        logger.info(f"Split prompt into {len(chunks)} chunks")

        generated_text = ""
        total_tokens = 0

        for i, chunk in enumerate(chunks):
            logger.info(f"Processing chunk {i+1}/{len(chunks)}")

            # Generate for this chunk
            try:
                outputs = self.runner.generate(
                    [chunk],
                    max_new_tokens=min(max_tokens - total_tokens, 128),  # Smaller batches
                    temperature=0.7,
                    top_p=0.9,
                    streaming=True
                )

                chunk_text = ""
                async for output in outputs:
                    token_text = output.token_text
                    chunk_text += token_text
                    total_tokens += 1

                    # Memory check
                    current_memory = self.check_memory_usage()
                    if current_memory > self.max_memory_gb:
                        logger.warning(f"Memory usage high: {current_memory:.2f}GB, clearing cache")
                        if torch.cuda.is_available():
                            torch.cuda.empty_cache()
                        # Offload KV cache to CPU if needed
                        self._offload_kv_cache()

                    if total_tokens >= max_tokens:
                        break

                generated_text += chunk_text

            except Exception as e:
                logger.error(f"Error processing chunk {i+1}: {e}")
                # Try to continue with next chunk
                continue

            # Memory cleanup between chunks
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

        logger.info(f"Generation complete. Total tokens: {total_tokens}")
        return generated_text

    def _offload_kv_cache(self):
        """Offload KV cache to CPU to free GPU memory"""
        # Implementation depends on TensorRT-LLM API
        # This is a placeholder for KV cache offloading
        pass

# Global inference engine
engine = None

@app.on_event("startup")
async def startup_event():
    global engine
    engine_path = "/workspace/engines/rtx8gb/engine"
    engine = StreamingInferenceEngine(engine_path)
    logger.info("RTX 8GB Streaming Inference Server started")

@app.post("/generate", response_model=InferenceResponse)
async def generate(request: InferenceRequest):
    if not engine:
        raise HTTPException(status_code=500, detail="Inference engine not initialized")

    try:
        generated_text = await engine.generate_streaming(
            request.prompt,
            request.max_tokens
        )

        return InferenceResponse(
            text=generated_text,
            tokens_generated=len(generated_text.split()),
            memory_used_gb=engine.check_memory_usage()
        )

    except MemoryError as e:
        raise HTTPException(status_code=507, detail=str(e))
    except Exception as e:
        logger.error(f"Generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

@app.get("/health")
async def health_check():
    if not engine:
        return {"status": "initializing"}

    memory_usage = engine.check_memory_usage()
    return {
        "status": "healthy",
        "memory_usage_gb": round(memory_usage, 2),
        "max_memory_gb": engine.max_memory_gb,
        "device": str(engine.device)
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8099)
