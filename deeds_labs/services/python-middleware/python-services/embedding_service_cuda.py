#!/usr/bin/env python3
"""
FastAPI service for EmbeddingGemma using ONNX Runtime with CUDA acceleration
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import numpy as np
import onnxruntime as ort
import torch
from transformers import AutoTokenizer
from typing import List, Optional
import logging
import time
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="EmbeddingGemma Service", version="1.0.0")

class EmbeddingRequest(BaseModel):
    text: str
    max_length: Optional[int] = 512

class EmbeddingResponse(BaseModel):
    embedding: List[float]
    shape: List[int]
    inference_time_ms: float

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    cuda_available: bool

# Global variables for model and tokenizer
model = None
tokenizer = None
session = None

def load_model():
    """Load the EmbeddingGemma model and tokenizer"""
    global model, tokenizer, session

    model_dir = "/workspace/models/embeddinggemma_300m_onnx"
    model_path = f"{model_dir}/model.onnx"

    if not Path(model_path).exists():
        raise FileNotFoundError(f"Model file not found: {model_path}")

    logger.info("Loading EmbeddingGemma tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(model_dir)

    logger.info("Setting up ONNX Runtime session...")

    # Try CUDA first, fallback to CPU
    providers = []
    cuda_available = False

    try:
        # Test if CUDA is actually available
        test_session = ort.InferenceSession(model_path, providers=['CUDAExecutionProvider'])
        providers.append('CUDAExecutionProvider')
        cuda_available = True
        logger.info("CUDA execution provider available and working")
        test_session = None  # Clean up test session
    except Exception as e:
        logger.warning(f"CUDA not available or failed: {e}")

    providers.append('CPUExecutionProvider')

    session_options = ort.SessionOptions()
    session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

    try:
        session = ort.InferenceSession(
            model_path,
            sess_options=session_options,
            providers=providers
        )
        logger.info(f"Model loaded successfully. Providers: {session.get_providers()}")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise

    # Warm up the model
    logger.info("Warming up model...")
    try:
        dummy_input = tokenizer("Hello world", return_tensors="np", padding=True, truncation=True)
        _ = session.run(None, {
            "input_ids": dummy_input["input_ids"],
            "attention_mask": dummy_input["attention_mask"]
        })
        logger.info("Model warmup complete")
    except Exception as e:
        logger.error(f"Model warmup failed: {e}")
        raise

@app.on_event("startup")
async def startup_event():
    """Load model on startup"""
    try:
        load_model()
        logger.info("EmbeddingGemma service started successfully")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise

def mean_pooling(last_hidden_state: np.ndarray, attention_mask: np.ndarray) -> np.ndarray:
    """Apply mean pooling to the last hidden state"""
    # Expand attention_mask to match hidden state dimensions
    attention_mask_expanded = np.expand_dims(attention_mask, axis=-1)
    attention_mask_expanded = np.broadcast_to(
        attention_mask_expanded,
        last_hidden_state.shape
    )

    # Apply attention mask and compute mean
    masked_hidden_state = last_hidden_state * attention_mask_expanded
    sum_embeddings = np.sum(masked_hidden_state, axis=1)
    sum_mask = np.sum(attention_mask_expanded, axis=1)
    sum_mask = np.maximum(sum_mask, 1e-9)  # Avoid division by zero

    return sum_embeddings / sum_mask

@app.post("/embed", response_model=EmbeddingResponse)
async def embed_text(request: EmbeddingRequest):
    """Generate embeddings for input text"""
    if session is None or tokenizer is None:
        raise HTTPException(status_code=500, detail="Model not loaded")

    start_time = time.time()

    try:
        # Tokenize input
        inputs = tokenizer(
            request.text,
            return_tensors="np",
            padding=True,
            truncation=True,
            max_length=request.max_length
        )

        # Run inference
        outputs = session.run(None, {
            "input_ids": inputs["input_ids"],
            "attention_mask": inputs["attention_mask"]
        })

        # Apply mean pooling
        embedding = mean_pooling(outputs[0], inputs["attention_mask"])

        # Convert to list and normalize
        embedding = embedding[0].tolist()  # Take first (and only) batch
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = [x / norm for x in embedding]

        inference_time = (time.time() - start_time) * 1000

        return EmbeddingResponse(
            embedding=embedding,
            shape=[len(embedding)],
            inference_time_ms=inference_time
        )

    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    cuda_available = False
    if session:
        providers = session.get_providers()
        cuda_available = 'CUDAExecutionProvider' in providers

    return HealthResponse(
        status="healthy",
        model_loaded=session is not None,
        cuda_available=cuda_available
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8091)