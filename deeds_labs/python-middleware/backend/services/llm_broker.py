"""
LLM Broker - Multi-provider fix suggestion service
Supports: Claude, Gemini, OpenAI, Ollama (local Gemma3-legal)
"""
from __future__ import annotations
import os
from typing import Literal, Dict, Any, Optional
from enum import Enum

import httpx

Provider = Literal["claude", "gemini", "openai", "ollama", "kiro"]

class LLMBroker:
    """Unified interface for multiple LLM providers"""

    def __init__(self):
        self.ollama_host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
        self.claude_key = os.getenv("ANTHROPIC_API_KEY")
        self.gemini_key = os.getenv("GOOGLE_API_KEY")
        self.openai_key = os.getenv("OPENAI_API_KEY")

    def build_prompt(self, error_log: Dict[str, Any]) -> str:
        """Convert normalized error log to fix prompt"""
        errors = error_log.get("errors", [])
        file_path = error_log.get("file_path", "unknown")
        route_path = error_log.get("route_path", "unknown")

        prompt = f"""You are an expert TypeScript/Svelte developer fixing compilation errors.

Route: {route_path}
File: {file_path}

Errors:
"""
        for err in errors:
            prompt += f"- [{err['code']}] Line {err['line']}: {err['message']}\n"

        prompt += """
Provide a concise fix strategy:
1. Root cause analysis
2. Recommended fix (codemod, manual edit, or refactor)
3. Confidence level (0-1)
4. Potential side effects

Format as JSON:
{
  "root_cause": "...",
  "fix_strategy": "...",
  "confidence": 0.85,
  "side_effects": ["..."]
}
"""
        return prompt

    async def request_fix_suggestion(
        self,
        provider: Provider,
        error_log: Dict[str, Any],
        timeout: float = 30.0
    ) -> Dict[str, Any]:
        """Route request to appropriate provider"""
        prompt = self.build_prompt(error_log)

        if provider == "claude":
            return await self._call_claude(prompt, timeout)
        elif provider == "gemini":
            return await self._call_gemini(prompt, timeout)
        elif provider == "openai":
            return await self._call_openai(prompt, timeout)
        elif provider == "ollama":
            return await self._call_ollama(prompt, timeout)
        elif provider == "kiro":
            return await self._call_kiro(prompt, timeout)
        else:
            raise ValueError(f"Unknown provider: {provider}")

    async def _call_claude(self, prompt: str, timeout: float) -> Dict[str, Any]:
        """Call Anthropic Claude API"""
        if not self.claude_key:
            raise ValueError("ANTHROPIC_API_KEY not set")

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.claude_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                json={
                    "model": "claude-3-5-sonnet-20241022",
                    "max_tokens": 2048,
                    "messages": [{"role": "user", "content": prompt}]
                }
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "provider": "claude",
                "response": data["content"][0]["text"],
                "model": data["model"]
            }

    async def _call_gemini(self, prompt: str, timeout: float) -> Dict[str, Any]:
        """Call Google Gemini API"""
        if not self.gemini_key:
            raise ValueError("GOOGLE_API_KEY not set")

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key={self.gemini_key}",
                json={"contents": [{"parts": [{"text": prompt}]}]}
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "provider": "gemini",
                "response": data["candidates"][0]["content"]["parts"][0]["text"],
                "model": "gemini-pro"
            }

    async def _call_openai(self, prompt: str, timeout: float) -> Dict[str, Any]:
        """Call OpenAI API"""
        if not self.openai_key:
            raise ValueError("OPENAI_API_KEY not set")

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.openai_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-4-turbo-preview",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 2048
                }
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "provider": "openai",
                "response": data["choices"][0]["message"]["content"],
                "model": data["model"]
            }

    async def _call_ollama(self, prompt: str, timeout: float) -> Dict[str, Any]:
        """Call local Ollama (Gemma3-legal)"""
        model = os.getenv("OLLAMA_MODEL", "gemma3-legal:latest")

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{self.ollama_host}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False
                }
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "provider": "ollama",
                "response": data["response"],
                "model": model
            }

    async def _call_kiro(self, prompt: str, timeout: float) -> Dict[str, Any]:
        """Call Kiro IDE's internal LLM (if available)"""
        # Placeholder - integrate with Kiro's API when available
        return {
            "provider": "kiro",
            "response": "Kiro integration pending",
            "model": "kiro-internal"
        }

    async def select_best_provider(
        self,
        error_log: Dict[str, Any],
        criteria: Dict[str, Any]
    ) -> Provider:
        """
        Intelligently select provider based on:
        - Error severity
        - File importance
        - Latency budget
        - Privacy requirements
        """
        severity = criteria.get("severity", "error")
        latency_budget = criteria.get("latency_ms", 5000)
        privacy = criteria.get("privacy", "normal")

        # High severity + low latency → local Ollama
        if severity == "error" and latency_budget < 3000:
            return "ollama"

        # Privacy-sensitive → local only
        if privacy == "high":
            return "ollama"

        # Complex refactoring → Claude
        if "refactor" in error_log.get("message", "").lower():
            return "claude"

        # Default to Ollama for speed
        return "ollama"

# Global instance
llm_broker = LLMBroker()
