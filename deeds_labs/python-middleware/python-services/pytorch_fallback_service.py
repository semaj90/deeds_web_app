# Phase 70: PyTorch Fallback Service
# Uses PyTorch already in NVIDIA TensorRT container
# Python 3.12 + PyTorch 2.7 (NVIDIA fork) + CUDA 12.9

import os
import asyncio
import json
import logging
from typing import Dict, List, Optional, Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# PyTorch imports (pre-installed in NVIDIA container)
import torch
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    BitsAndBytesConfig,
    pipeline
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Phase 70 PyTorch Fallback Service", version="1.0.0")

class GenerateRequest(BaseModel):
    prompt: str
    max_tokens: int = 512
    temperature: float = 0.7
    top_p: float = 0.9
    top_k: int = 50
    repetition_penalty: float = 1.0

class GenerateResponse(BaseModel):
    generated_text: str
    tokens_generated: int
    backend: str = "pytorch-fallback"

# Global model and tokenizer
model: Optional[AutoModelForCausalLM] = None
tokenizer: Optional[AutoTokenizer] = None
text_generator = None

def load_pytorch_model():
    """Load PyTorch model with quantization for fallback"""
    global model, tokenizer, text_generator

    model_path = "/app/models/gemma3-legal"  # Local model path

    # Check if model exists locally
    if not os.path.exists(model_path):
        logger.warning(f"Model not found locally: {model_path}")
        logger.info("PyTorch service will be available but model needs to be downloaded")
        return

    try:
        # Configure 4-bit quantization to save memory
        quantization_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
            bnb_4bit_quant_type="nf4"
        )

        # Load tokenizer
        tokenizer = AutoTokenizer.from_pretrained(model_path)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        # Load model with quantization
        model = AutoModelForCausalLM.from_pretrained(
            model_path,
            quantization_config=quantization_config,
            device_map="auto",
            torch_dtype=torch.float16,
            low_cpu_mem_usage=True
        )

        # Create text generation pipeline
        text_generator = pipeline(
            "text-generation",
            model=model,
            tokenizer=tokenizer,
            device_map="auto",
            torch_dtype=torch.float16,
            max_new_tokens=512,
            temperature=0.7,
            top_p=0.9,
            top_k=50,
            repetition_penalty=1.0,
            do_sample=True
        )

        logger.info("✅ PyTorch model loaded successfully with 4-bit quantization")

    except Exception as e:
        logger.error(f"❌ Failed to load PyTorch model: {e}")
        raise

@app.on_event("startup")
async def startup_event():
    """Load model on startup"""
    try:
        load_pytorch_model()
    except Exception as e:
        logger.error(f"Failed to load model on startup: {e}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "backend": "pytorch-fallback",
        "model_loaded": model is not None,
        "cuda_available": torch.cuda.is_available(),
        "device_count": torch.cuda.device_count() if torch.cuda.is_available() else 0
    }

@app.post("/generate", response_model=GenerateResponse)
async def generate_text(request: GenerateRequest):
    """Generate text using PyTorch fallback"""
    if not text_generator:
        raise HTTPException(status_code=503, detail="PyTorch model not loaded")

    try:
        # Generate text
        outputs = text_generator(
            request.prompt,
            max_new_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=request.top_p,
            top_k=request.top_k,
            repetition_penalty=request.repetition_penalty,
            do_sample=True,
            pad_token_id=tokenizer.pad_token_id,
            eos_token_id=tokenizer.eos_token_id
        )

        generated_text = outputs[0]["generated_text"]
        # Remove the original prompt from the response
        if generated_text.startswith(request.prompt):
            generated_text = generated_text[len(request.prompt):].strip()

        tokens_generated = len(tokenizer.encode(generated_text))

        return GenerateResponse(
            generated_text=generated_text,
            tokens_generated=tokens_generated,
            backend="pytorch-fallback"
        )

    except Exception as e:
        logger.error(f"PyTorch generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(
        "pytorch_fallback_service:app",
        host="0.0.0.0",
        port=8100,
        reload=False,
        log_level="info"
    )