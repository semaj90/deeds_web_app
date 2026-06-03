#!/usr/bin/env python3
"""
scripts/embed-server/serve.py

OpenAI-compatible /v1/embeddings server backed by the local EmbeddingGemma 300M model.
Uses sentence-transformers (full safetensors model) or ONNX Runtime (quantized, faster).

Endpoints:
  GET  /health               → {"status": "ok", "model": "...", "dim": 768}
  POST /v1/embeddings        → OpenAI-compatible batch embedding response
  GET  /metrics              → basic request/latency counters

Usage:
  python scripts/embed-server/serve.py
  python scripts/embed-server/serve.py --port 8081 --backend onnx
  python scripts/embed-server/serve.py --port 8081 --backend sentence-transformers

Environment:
  EMBED_SERVER_PORT   default 8081
  EMBED_BACKEND       "onnx" (default) | "sentence-transformers"
  EMBED_MODEL_DIR     path to embeddinggemma_300m_onnx/ or embeddinggemma_300m/
  EMBED_MAX_BATCH     default 64

The /api/embed route is intentionally NOT served (that's the Ollama endpoint).
Use /v1/embeddings — the OpenAI-compatible path.
"""

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import List, Union

# ── Resolve model paths ───────────────────────────────────────────────────────

SCRIPT_DIR   = Path(__file__).resolve().parent
REPO_ROOT    = SCRIPT_DIR.parent.parent.parent  # sveltekit-frontend/scripts/embed-server → repo root
MODELS_DIR   = REPO_ROOT / "models"

ONNX_DIR     = MODELS_DIR / "embeddinggemma_300m_onnx"
ST_DIR       = MODELS_DIR / "embeddinggemma_300m"

logging.basicConfig(
    level=logging.INFO,
    format="[embed-server] %(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("embed-server")

# ── CLI args ──────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="EmbeddingGemma OpenAI-compatible embed server")
parser.add_argument("--port",    type=int, default=int(os.environ.get("EMBED_SERVER_PORT", "8081")))
parser.add_argument("--host",    type=str, default=os.environ.get("EMBED_SERVER_HOST", "127.0.0.1"))
parser.add_argument("--backend", type=str, default=os.environ.get("EMBED_BACKEND", "onnx"),
                    choices=["onnx", "sentence-transformers", "st"])
parser.add_argument("--model-dir", type=str, default=os.environ.get("EMBED_MODEL_DIR", ""))
parser.add_argument("--max-batch", type=int, default=int(os.environ.get("EMBED_MAX_BATCH", "64")))
args = parser.parse_args()

BACKEND   = "sentence-transformers" if args.backend in ("sentence-transformers", "st") else "onnx"
MAX_BATCH = args.max_batch

# Resolve model directory
if args.model_dir:
    model_path = Path(args.model_dir)
elif BACKEND == "onnx":
    model_path = ONNX_DIR
else:
    model_path = ST_DIR

if not model_path.exists():
    log.error(f"Model directory not found: {model_path}")
    log.error("Run: git lfs pull  (or check models/ directory)")
    sys.exit(1)

log.info(f"Backend: {BACKEND}")
log.info(f"Model path: {model_path}")

# ── Load model ────────────────────────────────────────────────────────────────

embed_fn    = None
model_name  = "embeddinggemma"
output_dim  = 768
_req_count  = 0
_total_ms   = 0.0

if BACKEND == "onnx":
    try:
        import onnxruntime as ort
        import numpy as np
        from tokenizers import Tokenizer

        tokenizer_path = model_path / "tokenizer.json"
        onnx_path      = model_path / "model.onnx"

        if not onnx_path.exists():
            log.error(f"ONNX model not found at {onnx_path}")
            log.error("Expected: models/embeddinggemma_300m_onnx/model.onnx")
            sys.exit(1)

        log.info(f"Loading ONNX model: {onnx_path}")
        sess_opts = ort.SessionOptions()
        sess_opts.intra_op_num_threads = 4
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        # Try DirectML (GPU) first, fall back to CPU
        providers = []
        available = ort.get_available_providers()
        if "DmlExecutionProvider" in available:
            providers.append("DmlExecutionProvider")
            log.info("Using DirectML (GPU) execution provider")
        providers.append("CPUExecutionProvider")

        session   = ort.InferenceSession(str(onnx_path), sess_opts, providers=providers)
        tokenizer = Tokenizer.from_file(str(tokenizer_path))
        tokenizer.enable_padding(pad_id=0, pad_token="<pad>")
        tokenizer.enable_truncation(max_length=512)

        input_names = [i.name for i in session.get_inputs()]
        log.info(f"ONNX input names: {input_names}")

        def _mean_pool(token_embeddings: np.ndarray, attention_mask: np.ndarray) -> np.ndarray:
            mask = attention_mask[:, :, np.newaxis].astype(np.float32)
            summed = (token_embeddings * mask).sum(axis=1)
            counts = mask.sum(axis=1).clip(min=1e-9)
            return summed / counts

        def _l2_normalize(vecs: np.ndarray) -> np.ndarray:
            norms = np.linalg.norm(vecs, axis=1, keepdims=True).clip(min=1e-9)
            return vecs / norms

        def embed_fn(texts: List[str]) -> List[List[float]]:
            encoded   = tokenizer.encode_batch(texts)
            input_ids = np.array([e.ids for e in encoded], dtype=np.int64)
            attn_mask = np.array([e.attention_mask for e in encoded], dtype=np.int64)

            feed = {}
            if "input_ids" in input_names:
                feed["input_ids"] = input_ids
            if "attention_mask" in input_names:
                feed["attention_mask"] = attn_mask
            if "token_type_ids" in input_names:
                feed["token_type_ids"] = np.zeros_like(input_ids)

            outputs = session.run(None, feed)
            # Expect last_hidden_state or pooler_output
            token_embeddings = outputs[0]  # shape: (batch, seq_len, hidden) or (batch, hidden)

            if token_embeddings.ndim == 3:
                pooled = _mean_pool(token_embeddings, attn_mask)
            else:
                pooled = token_embeddings  # already pooled

            normalized = _l2_normalize(pooled)
            return normalized.tolist()

        # Verify dim with a test call
        test_out = embed_fn(["hello"])
        output_dim = len(test_out[0])
        log.info(f"ONNX model loaded. Output dim: {output_dim}")

    except ImportError as e:
        log.error(f"Missing dependency for ONNX backend: {e}")
        log.error("Install: pip install onnxruntime tokenizers numpy")
        sys.exit(1)

else:  # sentence-transformers
    try:
        from sentence_transformers import SentenceTransformer
        import numpy as np

        log.info(f"Loading sentence-transformers model from {model_path}")
        st_model  = SentenceTransformer(str(model_path))
        output_dim = st_model.get_sentence_embedding_dimension()
        log.info(f"sentence-transformers model loaded. Output dim: {output_dim}")

        def embed_fn(texts: List[str]) -> List[List[float]]:
            vecs = st_model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
            return vecs.tolist()

    except ImportError as e:
        log.error(f"Missing dependency for sentence-transformers backend: {e}")
        log.error("Install: pip install sentence-transformers")
        sys.exit(1)

# ── HTTP server ───────────────────────────────────────────────────────────────

try:
    from http.server import BaseHTTPRequestHandler, HTTPServer
except ImportError:
    log.error("http.server not available (standard library)")
    sys.exit(1)


class EmbedHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *a):
        pass  # suppress default access log; we log ourselves

    def _send_json(self, status: int, body: dict):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _send_error(self, status: int, message: str):
        self._send_json(status, {"error": {"message": message, "type": "invalid_request_error"}})

    def do_GET(self):
        global _req_count, _total_ms

        if self.path == "/health":
            self._send_json(200, {
                "status": "ok",
                "model": model_name,
                "dim": output_dim,
                "backend": BACKEND,
                "requests": _req_count,
            })
        elif self.path == "/metrics":
            avg_ms = (_total_ms / _req_count) if _req_count > 0 else 0
            self._send_json(200, {
                "requests_total": _req_count,
                "avg_latency_ms": round(avg_ms, 2),
                "model": model_name,
                "dim": output_dim,
            })
        elif self.path.startswith("/api/"):
            # Explicitly reject Ollama routes — this is NOT an Ollama server
            self._send_error(404, (
                "/api/embed is an Ollama endpoint — this server exposes /v1/embeddings "
                "(OpenAI-compatible). Set OLLAMA_EMBED_BASE_URL=http://127.0.0.1:8081."
            ))
        else:
            self._send_error(404, f"Not found: {self.path}")

    def do_POST(self):
        global _req_count, _total_ms

        if self.path.startswith("/api/"):
            self._send_error(404, (
                "/api/embed is an Ollama endpoint — use /v1/embeddings on this server."
            ))
            return

        if self.path != "/v1/embeddings":
            self._send_error(404, f"Not found: {self.path}")
            return

        # Read body
        length = int(self.headers.get("Content-Length", 0))
        body   = self.rfile.read(length)
        try:
            req = json.loads(body)
        except Exception:
            self._send_error(400, "Invalid JSON body")
            return

        raw_input = req.get("input", req.get("prompt", ""))
        if isinstance(raw_input, str):
            texts = [raw_input]
        elif isinstance(raw_input, list):
            texts = raw_input
        else:
            self._send_error(400, "input must be a string or array of strings")
            return

        if len(texts) == 0:
            self._send_error(400, "input is empty")
            return

        if len(texts) > MAX_BATCH:
            self._send_error(400, f"batch size {len(texts)} exceeds max {MAX_BATCH}")
            return

        t0 = time.time()
        try:
            vecs = embed_fn(texts)
        except Exception as e:
            log.error(f"embed error: {e}")
            self._send_error(500, f"Embedding failed: {e}")
            return
        ms = (time.time() - t0) * 1000

        _req_count += 1
        _total_ms  += ms

        data = [
            {"object": "embedding", "index": i, "embedding": vec}
            for i, vec in enumerate(vecs)
        ]
        resp = {
            "object": "list",
            "data": data,
            "model": model_name,
            "usage": {
                "prompt_tokens": sum(len(t.split()) for t in texts),
                "total_tokens":  sum(len(t.split()) for t in texts),
            },
        }
        log.info(f"POST /v1/embeddings  n={len(texts)}  dim={output_dim}  {ms:.1f}ms")
        self._send_json(200, resp)


log.info(f"Starting embed server on http://{args.host}:{args.port}")
log.info(f"Endpoint: POST http://{args.host}:{args.port}/v1/embeddings")
log.info(f"Health:   GET  http://{args.host}:{args.port}/health")

server = HTTPServer((args.host, args.port), EmbedHandler)
try:
    server.serve_forever()
except KeyboardInterrupt:
    log.info("Stopped.")
    server.server_close()
