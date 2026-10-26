"""
Chat helper for scripts: llama-server (Ornith 1.5) on :8090, OpenAI-compatible.

Replaces direct Ollama /api/chat and /api/generate calls. Ollama stays embeddings-only
(embeddinggemma), per the Ollama vs llama-server boundary in CLAUDE.md.

Settings come from the environment (.env), with these defaults:
  LLAMA_SERVER_URL  http://127.0.0.1:8090
  CHAT_MODEL        ornith-1.5-9b   (request alias; never a GGUF filename)

Streaming is always on: a non-streaming reasoning model can spend max_tokens on
reasoning output and return empty content. The reply is assembled from SSE deltas
until [DONE].
"""
import json
import os
import urllib.request

LLAMA_SERVER_URL = os.getenv("LLAMA_SERVER_URL", "http://127.0.0.1:8090").rstrip("/")
CHAT_MODEL = os.getenv("CHAT_MODEL", "ornith-1.5-9b")
CHAT_TIMEOUT = int(os.getenv("CHAT_TIMEOUT", "240"))


def llama_chat(messages, *, max_tokens=600, temperature=0.2, timeout=None):
    """Return the assistant text for a list of {role, content} messages."""
    body = {
        "model": CHAT_MODEL,
        "messages": messages,
        "stream": True,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    req = urllib.request.Request(
        f"{LLAMA_SERVER_URL}/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    parts = []
    with urllib.request.urlopen(req, timeout=timeout or CHAT_TIMEOUT) as resp:
        for raw in resp:
            line = raw.decode("utf-8", errors="replace").strip()
            if not line.startswith("data:"):
                continue
            payload = line[len("data:"):].strip()
            if payload == "[DONE]":
                break
            try:
                chunk = json.loads(payload)
            except json.JSONDecodeError:
                continue
            for choice in chunk.get("choices", []):
                delta = choice.get("delta", {}) or {}
                if delta.get("content"):
                    parts.append(delta["content"])
    return "".join(parts)
