#!/usr/bin/env python3
"""ace_bifrost_lm_v1.py — Direct Bifrost LM Adapter for DSPy / ACE Prompting.

Implements ACE-PROMPT-02:
Directly calls Bifrost (:3040, model id 'openai/ornith-1.5-9b') without importing or invoking LiteLLM.
Inherits from dspy.LM / dspy.BaseLM when DSPy is present, or a clean standard-library shim when absent.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Union

try:
    import dspy
    if hasattr(dspy, "LM"):
        _BaseClass = dspy.LM
    elif hasattr(dspy, "BaseLM"):
        _BaseClass = dspy.BaseLM
    else:
        _BaseClass = object
except ImportError:
    dspy = None
    _BaseClass = object


class BifrostOrnithLM(_BaseClass):
    """Direct Bifrost / Ornith LM client for DSPy.
    
    Routes completions to Bifrost (:3040) with model 'openai/ornith-1.5-9b'.
    Bypasses LiteLLM completely to avoid dependency overhead and unexpected provider side-effects.
    """

    def __init__(
        self,
        model: str = "openai/ornith-1.5-9b",
        api_base: Optional[str] = None,
        timeout: float = 30.0,
        temperature: float = 0.0,
        max_tokens: int = 512,
        **kwargs: Any,
    ) -> None:
        self.model = model
        self.api_base = (
            api_base
            or os.environ.get("BIFROST_API_BASE")
            or "http://127.0.0.1:3040/v1"
        ).rstrip("/")
        self.endpoint = f"{self.api_base}/chat/completions"
        self.timeout = timeout
        self.kwargs = {
            "temperature": temperature,
            "max_tokens": max_tokens,
            **kwargs,
        }
        self.history: List[Dict[str, Any]] = []
        self.provider = "bifrost-direct"

    def basic_request(self, prompt: str, **kwargs: Any) -> Dict[str, Any]:
        """Send a single prompt wrapped in a user message to Bifrost."""
        messages = [{"role": "user", "content": prompt}]
        return self._post_chat(messages, **kwargs)

    def _post_chat(
        self,
        messages: List[Dict[str, str]],
        **kwargs: Any,
    ) -> Dict[str, Any]:
        params = {**self.kwargs, **kwargs}
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": params.get("temperature", 0.0),
            "max_tokens": params.get("max_tokens", 512),
        }
        if "stop" in params and params["stop"]:
            payload["stop"] = params["stop"]

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            self.endpoint,
            data=data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Atlas-Bifrost-LM-v1",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                resp_bytes = resp.read()
                result = json.loads(resp_bytes.decode("utf-8"))
        except urllib.error.URLError as err:
            raise ConnectionError(
                f"Failed to connect to Bifrost at {self.endpoint}: {err}"
            ) from err

        self.history.append({
            "prompt_messages": messages,
            "response": result,
            "kwargs": params,
        })
        return result

    def __call__(
        self,
        prompt: Optional[str] = None,
        messages: Optional[List[Dict[str, str]]] = None,
        **kwargs: Any,
    ) -> List[str]:
        """Callable interface matching DSPy LM protocol.
        
        Returns a list of candidate completion strings (typically len=1).
        """
        if messages is None:
            if prompt is None:
                raise ValueError("Either prompt or messages must be provided")
            messages = [{"role": "user", "content": prompt}]

        response = self._post_chat(messages, **kwargs)
        choices = response.get("choices", [])
        if not choices:
            return []
        
        completions: List[str] = []
        for choice in choices:
            msg = choice.get("message", {})
            content = msg.get("content", "")
            if content:
                completions.append(content)
        return completions

    def inspect_history(self, n: int = 1) -> None:
        """Print the last n interactions in the history log."""
        for item in self.history[-n:]:
            print("--- BIFROST CALL ---")
            print("Messages:", json.dumps(item["prompt_messages"], indent=2))
            resp = item["response"]
            choices = resp.get("choices", [])
            content = choices[0].get("message", {}).get("content", "") if choices else ""
            print("Completion:", content)
            print("--------------------")


if __name__ == "__main__":
    import sys
    print("Testing BifrostOrnithLM connection to :3040...")
    lm = BifrostOrnithLM()
    try:
        res = lm("Ping! Please reply with 'pong-bifrost-direct'")
        print("Response received:", res)
        sys.exit(0 if res and "pong" in res[0].lower() else 1)
    except Exception as exc:
        print("Error during Bifrost call:", exc)
        sys.exit(1)
