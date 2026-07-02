#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gemma4 ONNX/Triton adapter for Phase7 summaries.

This is the missing protocol layer between Atlas/RabbitMQ JSON jobs and Triton's
tensor inference API. Triton itself is not an OpenAI-compatible chat server; it
serves tensors. This adapter exposes a small OpenAI-compatible surface that the
Phase7 worker can call.

Current status:
  - Health/probe support is live.
  - Raw Triton model discovery is live.
  - Generation is deliberately gated unless a Triton text-output model is
    actually available. The q4f16 decoder/embed ONNX graphs require an
    autoregressive loop; do not silently fake summaries.

Expected next step:
  - Add a real decode loop or point TRITON_TEXT_MODEL at a TensorRT-LLM ensemble
    that accepts BYTES text_input and returns BYTES text_output.
"""

import argparse
import asyncio
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_TRITON_URL = os.environ.get("TRITON_URL", "http://127.0.0.1:8000").rstrip("/")
DEFAULT_TEXT_MODEL = os.environ.get("TRITON_TEXT_MODEL", "ensemble_summarizer")
DEFAULT_PORT = int(os.environ.get("GEMMA4_ONNX_ADAPTER_PORT", "8098"))


def strip_channel_blocks(text: str) -> str:
    # Keep this intentionally simple in Python stdlib; Phase7 also strips.
    text = str(text or "")
    for marker in ("<|channel>thought", "<|start_header_id|>analysis<|end_header_id|>"):
        idx = text.lower().find(marker.lower())
        if idx >= 0:
            text = text[:idx]
    return text.replace("<|message|>", "").strip()


class TritonClient:
    def __init__(self, base_url: str, text_model: str):
        self.base_url = base_url.rstrip("/")
        self.text_model = text_model

    def _request(self, method: str, path: str, body: Optional[Dict[str, Any]] = None, timeout: int = 30) -> Any:
        data = None
        headers = {"Accept": "application/json"}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = Request(f"{self.base_url}{path}", data=data, headers=headers, method=method)
        with urlopen(req, timeout=timeout) as resp:
            payload = resp.read()
            if not payload:
                return {}
            return json.loads(payload.decode("utf-8"))

    def ready(self) -> bool:
        try:
            # Triton ready endpoint may return an empty 200 body.
            req = Request(f"{self.base_url}/v2/health/ready", method="GET")
            with urlopen(req, timeout=3) as resp:
                return 200 <= resp.status < 300
        except Exception:
            return False

    def models(self) -> List[str]:
        try:
            data = self._request("GET", "/v2/models", timeout=5)
            if isinstance(data, list):
                return [str(item.get("name", item)) for item in data]
            if isinstance(data, dict):
                models = data.get("models") or data.get("data") or []
                return [str(item.get("name", item)) for item in models]
        except Exception:
            return []
        return []

    def infer_text_model(self, prompts: List[str], max_tokens: int, temperature: float, timeout: int = 120) -> List[str]:
        body = {
            "inputs": [
                {
                    "name": "text_input",
                    "shape": [len(prompts)],
                    "datatype": "BYTES",
                    "data": prompts,
                }
            ],
            "outputs": [{"name": "text_output"}],
            "parameters": {
                "max_tokens": int(max_tokens),
                "temperature": float(temperature),
            },
        }
        data = self._request("POST", f"/v2/models/{self.text_model}/infer", body=body, timeout=timeout)
        output = (data.get("outputs") or [{}])[0]
        values = output.get("data") or []
        return [strip_channel_blocks(v) for v in values]


class AdapterHandler(BaseHTTPRequestHandler):
    client: TritonClient = None  # type: ignore
    allow_raw_decoder: bool = False

    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def send_json(self, status: int, body: Dict[str, Any]) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def read_json(self) -> Dict[str, Any]:
        size = int(self.headers.get("Content-Length", "0"))
        if size <= 0:
            return {}
        return json.loads(self.rfile.read(size).decode("utf-8"))

    def do_GET(self) -> None:
        if self.path in ("/health", "/v1/models"):
            ready = self.client.ready()
            models = self.client.models()
            status = "LIVE_PASS" if ready else "FAIL"
            body = {
                "status": status,
                "backend": "gemma4-onnx-triton-adapter",
                "triton_url": self.client.base_url,
                "triton_ready": ready,
                "text_model": self.client.text_model,
                "models": models,
                "supports_chat": self.client.text_model in models,
                "note": "q4f16 decoder/embed ONNX graphs require a generation loop unless a text-output Triton model is available.",
            }
            if self.path == "/v1/models":
                body = {
                    "object": "list",
                    "data": [
                        {
                            "id": "gemma4-e2b-q4f16-onnx-triton",
                            "object": "model",
                            "owned_by": "parent-atlas",
                            "metadata": body,
                        }
                    ],
                }
            self.send_json(200 if ready else 503, body)
            return
        self.send_json(404, {"error": {"message": f"not found: {self.path}"}})

    def do_POST(self) -> None:
        if self.path not in ("/v1/chat/completions", "/v1/summaries"):
            self.send_json(404, {"error": {"message": f"not found: {self.path}"}})
            return

        start = time.time()
        try:
            body = self.read_json()
            prompts = extract_prompts(body)
            if not prompts:
                self.send_json(400, {"error": {"message": "No prompt/messages/input supplied"}})
                return

            models = self.client.models()
            if self.client.text_model not in models:
                self.send_json(
                    503,
                    {
                        "error": {
                            "message": (
                                f"Triton text model '{self.client.text_model}' is not loaded. "
                                "Raw Gemma4 q4f16 ONNX decoder/embed graphs are present, but this adapter "
                                "still needs a decode loop or a TensorRT-LLM/text ensemble."
                            ),
                            "type": "adapter_not_ready",
                        },
                        "triton_ready": self.client.ready(),
                        "available_models": models,
                        "expected_model": self.client.text_model,
                    },
                )
                return

            max_tokens = int(body.get("max_tokens", 160))
            temperature = float(body.get("temperature", 0.2))
            summaries = self.client.infer_text_model(prompts, max_tokens=max_tokens, temperature=temperature)

            if self.path == "/v1/summaries":
                self.send_json(200, {
                    "object": "summary.batch",
                    "model": "gemma4-e2b-q4f16-onnx-triton",
                    "data": [{"index": i, "summary": s} for i, s in enumerate(summaries)],
                    "duration_ms": round((time.time() - start) * 1000, 2),
                })
            else:
                content = summaries[0] if summaries else ""
                self.send_json(200, {
                    "id": f"gemma4-onnx-{int(time.time() * 1000)}",
                    "object": "chat.completion",
                    "model": "gemma4-e2b-q4f16-onnx-triton",
                    "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
                })
        except HTTPError as error:
            self.send_json(error.code, {"error": {"message": error.read().decode("utf-8", errors="ignore")[:1000]}})
        except (URLError, TimeoutError) as error:
            self.send_json(503, {"error": {"message": str(error), "type": "triton_unavailable"}})
        except Exception as error:
            self.send_json(500, {"error": {"message": str(error), "type": "adapter_error"}})


def extract_prompts(body: Dict[str, Any]) -> List[str]:
    if isinstance(body.get("input"), list):
        return [str(v) for v in body["input"]]
    if isinstance(body.get("input"), str):
        return [body["input"]]
    if isinstance(body.get("prompt"), list):
        return [str(v) for v in body["prompt"]]
    if isinstance(body.get("prompt"), str):
        return [body["prompt"]]
    messages = body.get("messages")
    if isinstance(messages, list):
        parts = []
        for msg in messages:
            if isinstance(msg, dict):
                role = msg.get("role", "user")
                content = msg.get("content", "")
                parts.append(f"{role}: {content}")
        return ["\n".join(parts)] if parts else []
    return []


def main() -> None:
    parser = argparse.ArgumentParser(description="Gemma4 ONNX Triton OpenAI-compatible adapter")
    parser.add_argument("--host", default=os.environ.get("GEMMA4_ONNX_ADAPTER_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--triton-url", default=DEFAULT_TRITON_URL)
    parser.add_argument("--text-model", default=DEFAULT_TEXT_MODEL)
    args = parser.parse_args()

    AdapterHandler.client = TritonClient(args.triton_url, args.text_model)
    server = ThreadingHTTPServer((args.host, args.port), AdapterHandler)
    print(json.dumps({
        "status": "starting",
        "adapter": "gemma4-onnx-triton",
        "url": f"http://{args.host}:{args.port}",
        "triton_url": args.triton_url,
        "text_model": args.text_model,
    }))
    server.serve_forever()


if __name__ == "__main__":
    main()
