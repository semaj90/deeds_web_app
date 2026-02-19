#!/usr/bin/env python3
"""
Granite Client - LLM interface for text generation and planning.

Supports:
  - Text generation via Ollama or HTTP API
  - Planning prompts (TOOL/ARGS/REASON parsing)
  - Summarization
"""

import logging
from typing import Dict, Any, Optional

try:
    import requests
except ImportError:
    requests = None

logger = logging.getLogger(__name__)


class GraniteClient:
    """Client for Granite/Gemma3 LLM via Ollama or HTTP API."""

    def __init__(self, config: Dict[str, Any] = None, **kwargs):
        """
        Initialize Granite client.

        Args:
            config: Configuration dict with keys like:
              - ollama_url: Ollama API URL (default: http://localhost:11434)
              - ollama_model: Model name (default: gemma3:latest)
              - granite_url: Alternative HTTP API URL
            **kwargs: Additional config overrides
        """
        if not requests:
            raise ImportError("requests package not installed. Install with: pip install requests")

        self.config = config or {}
        self.config.update(kwargs)

        # Determine API endpoint
        self.ollama_url = self.config.get("ollama_url", "http://localhost:11434")
        self.ollama_model = self.config.get("ollama_model", "gemma3:latest")
        self.granite_url = self.config.get("granite_url", self.ollama_url)

        logger.info(f"✅ Granite client initialized: {self.ollama_url} / {self.ollama_model}")

    def generate(self, prompt: str, max_tokens: int = 500, temperature: float = 0.7) -> str:
        """
        Generate text using Ollama.

        Args:
            prompt: Input prompt
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature

        Returns:
            Generated text
        """
        try:
            response = requests.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": self.ollama_model,
                    "prompt": prompt,
                    "stream": False,
                    "temperature": temperature,
                    "num_predict": max_tokens,
                },
                timeout=60,
            )
            response.raise_for_status()
            data = response.json()
            return data.get("response", "").strip()
        except Exception as e:
            logger.error(f"Error generating text: {e}")
            return ""

    def plan_phase72_next_step(self, prompt: str) -> str:
        """
        Generate a planning response for Phase 72.

        Expected format:
          TOOL: <tool_name>
          ARGS: <JSON>
          REASON: <text>

        Args:
            prompt: Planning prompt

        Returns:
            LLM response with TOOL/ARGS/REASON
        """
        return self.generate(prompt, max_tokens=500)

    def summarize(self, text: str, max_length: int = 200) -> str:
        """
        Summarize text.

        Args:
            text: Text to summarize
            max_length: Maximum summary length

        Returns:
            Summary
        """
        prompt = f"Summarize the following in {max_length} words or less:\n\n{text}"
        return self.generate(prompt, max_tokens=max_length // 4 + 50)

    def embed(self, text: str) -> Optional[list]:
        """
        Generate embeddings for text.

        Args:
            text: Text to embed

        Returns:
            Embedding vector or None
        """
        try:
            response = requests.post(
                f"{self.ollama_url}/api/embeddings",
                json={
                    "model": self.ollama_model,
                    "input": text,
                },
                timeout=60,
            )
            response.raise_for_status()
            data = response.json()
            embeddings = data.get("embeddings", [])
            return embeddings[0] if embeddings else None
        except Exception as e:
            logger.error(f"Error generating embeddings: {e}")
            return None
