# AI Inference with Triton/TensorRT + Ollama Fallback
# Token-level streaming for real-time evidence analysis

import asyncio
import aiohttp
import subprocess
import json
from typing import AsyncGenerator, List, Dict, Optional
import os

# Configuration
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
TENSORRT_BASE_URL = os.getenv("TENSORRT_BASE_URL", "http://localhost:8001")
TRITON_BASE_URL = os.getenv("TRITON_BASE_URL", "http://localhost:8000")
MODEL_NAME = os.getenv("AI_MODEL", "gemma3-legal:latest")

# ✨ Updated to use embeddinggemma:latest (Google's specialized embedding model)
# Provides better semantic understanding compared to nomic-embed-text
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "embeddinggemma:latest")


async def stream_ollama(
    prompt: str,
    system_prompt: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 2048
) -> AsyncGenerator[Dict, None]:
    """
    Stream tokens from Ollama

    Yields:
        dict: {"token": str, "source": "ollama", "done": bool}
    """
    url = f"{OLLAMA_BASE_URL}/api/generate"

    full_prompt = prompt
    if system_prompt:
        full_prompt = f"{system_prompt}\n\nUser: {prompt}"

    payload = {
        "model": MODEL_NAME,
        "prompt": full_prompt,
        "stream": True,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens
        }
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as response:
                if response.status != 200:
                    raise Exception(f"Ollama error: {response.status}")

                async for line in response.content:
                    if line:
                        try:
                            data = json.loads(line.decode('utf-8'))
                            if data.get("response"):
                                yield {
                                    "token": data["response"],
                                    "source": "ollama",
                                    "done": data.get("done", False)
                                }
                            if data.get("done"):
                                break
                        except json.JSONDecodeError:
                            continue
    except Exception as e:
        print(f"[AI] ❌ Ollama streaming failed: {e}")
        raise


async def stream_tensorrt(
    prompt: str,
    system_prompt: Optional[str] = None,
    max_tokens: int = 2048
) -> AsyncGenerator[Dict, None]:
    """
    Stream tokens from TensorRT/Triton (simulated)

    In production, this would call Triton Inference Server with gRPC streaming
    """
    url = f"{TENSORRT_BASE_URL}/v2/models/legal-llm/infer"

    full_prompt = prompt
    if system_prompt:
        full_prompt = f"{system_prompt}\n\n{prompt}"

    payload = {
        "inputs": [
            {
                "name": "input_text",
                "shape": [1],
                "datatype": "BYTES",
                "data": [full_prompt]
            }
        ],
        "outputs": [{"name": "output_text"}]
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as response:
                if response.status != 200:
                    raise Exception(f"TensorRT error: {response.status}")

                data = await response.json()
                full_text = data["outputs"][0]["data"][0]

                # Simulate token-by-token streaming
                tokens = full_text.split(' ')
                for i, token in enumerate(tokens):
                    token_with_space = token + (' ' if i < len(tokens) - 1 else '')
                    yield {
                        "token": token_with_space,
                        "source": "tensorrt",
                        "done": i == len(tokens) - 1
                    }
                    await asyncio.sleep(0.05)  # Simulate streaming delay
    except Exception as e:
        print(f"[AI] ❌ TensorRT streaming failed: {e}")
        raise


async def ai_stream_with_fallback(
    prompt: str,
    system_prompt: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 2048
) -> AsyncGenerator[Dict, None]:
    """
    Stream AI tokens with automatic fallback: Ollama → TensorRT

    Yields:
        dict: {"token": str, "source": str, "done": bool}
    """
    try:
        print("[AI] 🤖 Attempting Ollama streaming...")
        async for chunk in stream_ollama(prompt, system_prompt, temperature, max_tokens):
            yield chunk
    except Exception as ollama_error:
        print(f"[AI] ⚠️ Ollama failed, falling back to TensorRT: {ollama_error}")

        try:
            async for chunk in stream_tensorrt(prompt, system_prompt, max_tokens):
                yield chunk
        except Exception as tensorrt_error:
            print(f"[AI] ❌ TensorRT also failed: {tensorrt_error}")
            raise Exception("Both Ollama and TensorRT failed")


async def generate_embedding(text: str) -> List[float]:
    """
    Generate embedding using embeddinggemma:latest

    Args:
        text: Input text to embed

    Returns:
        List[float]: 768-dim embedding vector (embeddinggemma:latest output)

    Note:
        embeddinggemma:latest provides superior semantic understanding
        compared to nomic-embed-text, especially for legal domain queries
    """
    url = f"{OLLAMA_BASE_URL}/api/embeddings"

    payload = {
        "model": EMBEDDING_MODEL,
        "prompt": text
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Embedding generation failed ({response.status}): {error_text}")

                data = await response.json()
                embedding = data.get("embedding", [])

                if not embedding:
                    raise Exception(f"No embedding returned from {EMBEDDING_MODEL}")

                print(f"[AI] ✅ Generated {EMBEDDING_MODEL} embedding ({len(embedding)} dims)")
                return embedding
    except Exception as e:
        print(f"[AI] ❌ {EMBEDDING_MODEL} embedding generation failed: {e}")
        print(f"[AI] 💡 Make sure {EMBEDDING_MODEL} is pulled: ollama pull {EMBEDDING_MODEL}")
        return []


async def chat_completion(
    messages: List[Dict[str, str]],
    temperature: float = 0.7
) -> Dict:
    """
    Non-streaming chat completion

    Args:
        messages: List of {"role": "user"|"assistant"|"system", "content": str}
        temperature: Sampling temperature

    Returns:
        dict: {"text": str, "source": str, "model": str}
    """
    url = f"{OLLAMA_BASE_URL}/api/chat"

    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "stream": False,
        "options": {"temperature": temperature}
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as response:
                if response.status != 200:
                    raise Exception(f"Chat completion failed: {response.status}")

                data = await response.json()
                message_content = data.get("message", {}).get("content", "")

                return {
                    "text": message_content,
                    "source": "ollama",
                    "model": MODEL_NAME
                }
    except Exception as e:
        print(f"[AI] ❌ Chat completion failed: {e}")
        return {"text": "", "source": "error", "model": ""}


# AI Tool execution for agentic workflows
async def execute_ai_tool(tool_name: str, params: Dict) -> Dict:
    """
    Execute AI tool (web_search, legal_citation, extract_entities)

    Args:
        tool_name: Name of tool to execute
        params: Tool parameters

    Returns:
        dict: Tool execution result
    """
    print(f"[AI] 🔧 Executing tool: {tool_name}")

    if tool_name == "web_search":
        query = params.get("query", "")
        # TODO: Integrate with actual search API
        return {"results": [f"Search result for: {query}"]}

    elif tool_name == "legal_citation_lookup":
        citation = params.get("citation", "")
        # TODO: Integrate with legal database
        return {
            "case": citation,
            "summary": f"Legal case summary for {citation}"
        }

    elif tool_name == "extract_entities":
        text = params.get("text", "")
        # Simple regex-based entity extraction
        import re
        entities = re.findall(r'\b[A-Z][a-z]+ [A-Z][a-z]+\b', text)
        return {"entities": list(set(entities))}

    else:
        return {"error": f"Unknown tool: {tool_name}"}


# Health check
async def ai_health() -> Dict:
    """Check AI service health"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{OLLAMA_BASE_URL}/api/tags") as response:
                if response.status == 200:
                    return {"status": "healthy", "service": "ollama"}
                else:
                    return {"status": "unhealthy", "service": "ollama"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
