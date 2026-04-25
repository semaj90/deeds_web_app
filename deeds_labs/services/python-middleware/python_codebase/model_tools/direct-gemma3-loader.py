#!/usr/bin/env python3
"""
Direct GGUF Model Loader for Your Gemma3 Model
Uses llama-cpp-python to directly load your GGUF file
"""

import os
import time
import json
import requests
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

# Try to import llama-cpp-python
try:
    from llama_cpp import Llama, LlamaGrammar
    LLAMA_CPP_AVAILABLE = True
    print("✅ llama-cpp-python is available")
except ImportError:
    LLAMA_CPP_AVAILABLE = False
    print("⚠️  llama-cpp-python not found. Install with: pip install llama-cpp-python")

app = FastAPI(title="Gemma3 Legal AI Direct Loader", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model instance
model = None
model_name = "gemma3-legal-direct"

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: str = "gemma3-legal-direct"
    messages: List[ChatMessage]
    max_tokens: Optional[int] = 1024
    temperature: Optional[float] = 0.2
    top_p: Optional[float] = 0.9
    stream: Optional[bool] = False

def find_gemma3_model():
    """Find your Gemma3 GGUF model"""
    possible_paths = [
        r"C:\Users\james\Desktop\deeds-web\deeds-web-app\gemma3Q4_K_M\mohf16-Q4_K_M.gguf",
        "./gemma3Q4_K_M/mohf16-Q4_K_M.gguf",
        "./models/gemma3Q4_K_M/mohf16-Q4_K_M.gguf",
        "./gemma3.gguf"
    ]

    for path in possible_paths:
        if os.path.exists(path):
            print(f"✅ Found Gemma3 model at: {path}")
            return path

    # Search for any GGUF files in the current directory and subdirectories
    for root, dirs, files in os.walk("."):
        for file in files:
            if file.endswith(".gguf") and ("gemma" in file.lower() or "mo16" in file.lower()):
                full_path = os.path.join(root, file)
                print(f"✅ Found potential Gemma3 file: {full_path}")
                return full_path

    return None

def load_model():
    """Load the Gemma3 model directly with llama-cpp-python"""
    global model

    if not LLAMA_CPP_AVAILABLE:
        print("❌ llama-cpp-python not available")
        return False

    model_path = find_gemma3_model()

    if not model_path:
        print("❌ Gemma3 model not found!")
        return False

    try:
        print(f"🚀 Loading Gemma3 model from {model_path}...")
        print("This may take 1-2 minutes...")

        # Load the model with optimized settings
        model = Llama(
            model_path=model_path,
            n_ctx=4096,  # Context length
            n_threads=8,  # CPU threads to use
            n_gpu_layers=50,  # Try to use GPU if available
            verbose=False,
            chat_format="gemma"  # Use Gemma chat format
        )

        print("✅ Gemma3 model loaded successfully!")
        return True

    except Exception as e:
        print(f"❌ Failed to load model: {e}")
        return False

@app.on_event("startup")
async def startup_event():
    print("🚀 Starting Gemma3 Legal AI Direct Loader...")

    if LLAMA_CPP_AVAILABLE:
        success = load_model()
        if success:
            print("✅ Direct model loading successful!")
        else:
            print("⚠️  Direct loading failed, will use Ollama fallback")
    else:
        print("⚠️  Will use Ollama fallback mode")

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "model": model_name,
        "direct_loading": model is not None,
        "llama_cpp_available": LLAMA_CPP_AVAILABLE,
        "fallback_mode": model is None,
        "timestamp": time.time()
    }

@app.get("/v1/models")
async def list_models():
    return {
        "object": "list",
        "data": [
            {
                "id": model_name,
                "object": "model",
                "created": int(time.time()),
                "owned_by": "legal-ai-direct"
            }
        ]
    }

def messages_to_gemma_prompt(messages: List[ChatMessage]) -> str:
    """Convert messages to Gemma format"""
    prompt_parts = []

    system_msg = "You are a specialized Legal AI Assistant powered by Gemma 3. You provide expert legal analysis, contract review, case law research, and document assistance. Always maintain professional accuracy while noting that responses are informational guidance, not formal legal advice."

    # Add system message if not present
    has_system = any(msg.role == "system" for msg in messages)
    if not has_system:
        prompt_parts.append(f"<start_of_turn>system\n{system_msg}<end_of_turn>")

    for message in messages:
        if message.role == "system":
            prompt_parts.append(f"<start_of_turn>system\n{message.content}<end_of_turn>")
        elif message.role == "user":
            prompt_parts.append(f"<start_of_turn>user\n{message.content}<end_of_turn>")
        elif message.role == "assistant":
            prompt_parts.append(f"<start_of_turn>model\n{message.content}<end_of_turn>")

    prompt_parts.append("<start_of_turn>model\n")
    return "\n".join(prompt_parts)

async def fallback_to_ollama(messages: List[ChatMessage], temperature: float, max_tokens: int):
    """Fallback to Ollama if direct loading failed"""
    try:
        prompt = messages_to_gemma_prompt(messages)

        # Try to use the gemma3-legal model first, then fallback to llama3.2:1b
        for model_name in ["gemma3-legal", "llama3.2:1b"]:
            try:
                response = requests.post(
                    "http://localhost:11434/api/generate",
                    json={
                        "model": model_name,
                        "prompt": prompt,
                        "stream": False,
                        "options": {
                            "temperature": temperature,
                            "num_predict": max_tokens,
                            "top_k": 40,
                            "top_p": 0.9,
                            "repeat_penalty": 1.1
                        }
                    },
                    timeout=60
                )

                if response.status_code == 200:
                    return response.json().get("response", "")

            except Exception as e:
                print(f"Failed to use {model_name}: {e}")
                continue

        raise Exception("All Ollama models failed")

    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Ollama fallback failed: {str(e)}")

@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    try:
        if model is not None:
            # Use direct model loading
            prompt = messages_to_gemma_prompt(request.messages)

            response = model(
                prompt,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
                top_p=request.top_p,
                stop=["<end_of_turn>", "<start_of_turn>user"],
                echo=False
            )

            generated_text = response['choices'][0]['text'].strip()

            return {
                "id": f"chatcmpl-direct-{int(time.time())}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": request.model,
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": generated_text
                        },
                        "finish_reason": "stop"
                    }
                ],
                "usage": {
                    "prompt_tokens": len(prompt.split()),
                    "completion_tokens": len(generated_text.split()),
                    "total_tokens": len(prompt.split()) + len(generated_text.split())
                }
            }
        else:
            # Fallback to Ollama
            generated_text = await fallback_to_ollama(
                request.messages,
                request.temperature,
                request.max_tokens
            )

            return {
                "id": f"chatcmpl-fallback-{int(time.time())}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": request.model,
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": generated_text
                        },
                        "finish_reason": "stop"
                    }
                ]
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

@app.post("/test-legal")
async def test_legal():
    """Test the legal AI with a sample query"""
    test_request = ChatCompletionRequest(
        messages=[
            ChatMessage(role="user", content="I need help analyzing a software license agreement. What are the key liability clauses I should review?")
        ],
        max_tokens=512,
        temperature=0.1
    )

    return await chat_completions(test_request)

if __name__ == "__main__":
    print("=" * 60)
    print("🚀 GEMMA3 LEGAL AI DIRECT LOADER")
    print("=" * 60)
    print()
    print("📍 Server: http://localhost:8001")
    print("🧪 Test: http://localhost:8001/test-legal")
    print("📖 Docs: http://localhost:8001/docs")
    print("💊 Health: http://localhost:8001/health")
    print()
    print("🎯 This server will:")
    print("  1. Try to load your GGUF model directly with llama-cpp-python")
    print("  2. Fall back to Ollama if direct loading fails")
    print("  3. Provide OpenAI-compatible API")
    print()

    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")
