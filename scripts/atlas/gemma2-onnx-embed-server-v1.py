"""EmbeddingGemma2 ONNX CPU embedding server (EXPERIMENT challenger, port 8094).

Ownership: EXPERIMENT. Not the canonical semantic_768 owner (that is
embeddinggemma:latest via Ollama). Returns vectors only; never writes to
PostgreSQL, Qdrant, Redis or Neo4j. Callers apply their own recipe/prefix.

Endpoints:
  GET  /health  -> model, providers, dims, limits
  POST /embed   -> {"texts": [...], "dims": [768]} -> vectors per requested dim
"""
from __future__ import annotations

import importlib.metadata
import os
import queue
import time
from pathlib import Path
from typing import List

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator
from tokenizers import Tokenizer

MODEL_DIR = Path(os.environ.get("GEMMA2_ONNX_DIR", "/models/embeddinggemma2/onnx-q8"))
MODEL_FILE = MODEL_DIR / "onnx" / "model_quantized.onnx"
TOKENIZER_FILE = MODEL_DIR / "tokenizer.json"
INTRA_THREADS = max(1, int(os.environ.get("ORT_INTRA_THREADS", "4")))
ORT_WORKERS = max(1, int(os.environ.get("ORT_WORKERS", "2")))
ORT_PROVIDER_MODE = os.environ.get("ORT_PROVIDER_MODE", "cpu").strip().lower()
TRT_RTX_TARGET_VERSION = "1.7"
TRT_CACHE_DIR = os.environ.get("ORT_TRT_CACHE_DIR", "/tmp/trt-rtx-cache")
MAX_BATCH = int(os.environ.get("GEMMA2_MAX_BATCH", "32"))
MAX_CHARS = int(os.environ.get("GEMMA2_MAX_CHARS", "8000"))
MAX_TOKENS = int(os.environ.get("GEMMA2_MAX_TOKENS", "512"))
ALLOWED_DIMS = (768, 512, 256, 128)
NATIVE_DIM = 768
MODEL_ID = "onnx-community/embeddinggemma2-q8:onnx/model_quantized.onnx"

app = FastAPI(title="gemma2-onnx-embed", version="1.2.0")
_session_pool: queue.Queue[ort.InferenceSession] = queue.Queue(maxsize=ORT_WORKERS)
_providers: List[str] = []
_tokenizer: Tokenizer | None = None
_load_error: str | None = None


def _detect_trt_rtx_version() -> str | None:
    for pkg in ("tensorrt-rtx", "tensorrt_rtx", "tensorrt"):
        try:
            return importlib.metadata.version(pkg)
        except importlib.metadata.PackageNotFoundError:
            continue
    return None


def _resolve_providers(mode: str, available: List[str]) -> List[object]:
    if mode == "cpu":
        return ["CPUExecutionProvider"]
    if mode == "cuda":
        if "CUDAExecutionProvider" not in available:
            raise RuntimeError(f"ORT_PROVIDER_MODE=cuda requested, available={available}")
        return ["CUDAExecutionProvider", "CPUExecutionProvider"]
    if mode in ("tensorrt_rtx", "trt_rtx", "trt-rtx"):
        if "NvTensorRtRtxExecutionProvider" in available:
            return [
                ("NvTensorRtRtxExecutionProvider", {"nv_trt_rtx_runtime_cache_path": TRT_CACHE_DIR}),
                "CUDAExecutionProvider",
                "CPUExecutionProvider",
            ]
        if "TensorrtExecutionProvider" in available:
            return [
                ("TensorrtExecutionProvider", {"trt_engine_cache_enable": True, "trt_engine_cache_path": TRT_CACHE_DIR}),
                "CUDAExecutionProvider",
                "CPUExecutionProvider",
            ]
        raise RuntimeError(
            f"ORT_PROVIDER_MODE={mode} requested, but NvTensorRtRtxExecutionProvider/TensorrtExecutionProvider not in {available}"
        )
    if mode == "auto":
        if "NvTensorRtRtxExecutionProvider" in available:
            return [
                ("NvTensorRtRtxExecutionProvider", {"nv_trt_rtx_runtime_cache_path": TRT_CACHE_DIR}),
                "CUDAExecutionProvider",
                "CPUExecutionProvider",
            ]
        if "TensorrtExecutionProvider" in available:
            return [
                ("TensorrtExecutionProvider", {"trt_engine_cache_enable": True, "trt_engine_cache_path": TRT_CACHE_DIR}),
                "CUDAExecutionProvider",
                "CPUExecutionProvider",
            ]
        if "CUDAExecutionProvider" in available:
            return ["CUDAExecutionProvider", "CPUExecutionProvider"]
        return ["CPUExecutionProvider"]
    raise ValueError(f"Unsupported ORT_PROVIDER_MODE={mode!r} (expected cpu|auto|cuda|tensorrt_rtx)")


def _load() -> None:
    global _providers, _tokenizer, _load_error
    try:
        if not MODEL_FILE.is_file():
            raise FileNotFoundError(f"missing model: {MODEL_FILE}")
        tok = Tokenizer.from_file(str(TOKENIZER_FILE))
        tok.enable_truncation(max_length=MAX_TOKENS)
        so = ort.SessionOptions()
        so.intra_op_num_threads = INTRA_THREADS
        so.inter_op_num_threads = 1
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        requested_providers = _resolve_providers(ORT_PROVIDER_MODE, ort.get_available_providers())
        for _ in range(ORT_WORKERS):
            sess = ort.InferenceSession(
                str(MODEL_FILE), so, providers=requested_providers
            )
            _session_pool.put(sess)
            if not _providers:
                _providers = sess.get_providers()
        _tokenizer = tok
    except Exception as exc:  # fail closed: health reports the error
        _load_error = f"{type(exc).__name__}: {exc}"


_load()


class EmbedRequest(BaseModel):
    texts: List[str] = Field(min_length=1)
    dims: List[int] = Field(default_factory=lambda: [NATIVE_DIM])

    @field_validator("texts")
    @classmethod
    def _check_texts(cls, v: List[str]) -> List[str]:
        if len(v) > MAX_BATCH:
            raise ValueError(f"batch exceeds {MAX_BATCH}")
        for t in v:
            if not t.strip():
                raise ValueError("empty text not allowed")
            if len(t) > MAX_CHARS:
                raise ValueError(f"text exceeds {MAX_CHARS} chars")
        return v

    @field_validator("dims")
    @classmethod
    def _check_dims(cls, v: List[int]) -> List[int]:
        if not v or any(d not in ALLOWED_DIMS for d in v):
            raise ValueError(f"dims must be a non-empty subset of {ALLOWED_DIMS}")
        return v


def _mrl(vecs: np.ndarray, dim: int) -> np.ndarray:
    """Matryoshka prefix + L2 renormalize (derived lane, not a new model)."""
    if dim == NATIVE_DIM:
        return vecs
    cut = vecs[:, :dim]
    return cut / np.linalg.norm(cut, axis=1, keepdims=True)


@app.get("/health")
def health() -> dict:
    trt_version = _detect_trt_rtx_version()
    return {
        "status": "ok" if _tokenizer is not None and _load_error is None else "unavailable",
        "model_id": MODEL_ID,
        "model_dir": str(MODEL_DIR),
        "provider_mode": ORT_PROVIDER_MODE,
        "providers": _providers,
        "available_providers": ort.get_available_providers(),
        "trt_rtx_target": TRT_RTX_TARGET_VERSION,
        "trt_rtx_installed_version": trt_version,
        "workers": ORT_WORKERS,
        "intra_threads": INTRA_THREADS,
        "graph_optimization": "ORT_ENABLE_ALL",
        "native_dim": NATIVE_DIM,
        "dims": list(ALLOWED_DIMS),
        "max_batch": MAX_BATCH,
        "max_tokens": MAX_TOKENS,
        "ownership": "EXPERIMENT",
        "load_error": _load_error,
    }


@app.post("/embed")
def embed(req: EmbedRequest) -> dict:
    if _tokenizer is None or _load_error is not None:
        raise HTTPException(status_code=503, detail=_load_error or "model not loaded")
    t0 = time.perf_counter()
    encs = _tokenizer.encode_batch(req.texts)
    truncated_indices = [i for i, e in enumerate(encs) if getattr(e, "overflowing", None)]
    width = max(len(e.ids) for e in encs)
    ids = np.zeros((len(encs), width), dtype=np.int64)
    mask = np.zeros((len(encs), width), dtype=np.int64)
    for i, e in enumerate(encs):
        ids[i, : len(e.ids)] = e.ids
        mask[i, : len(e.ids)] = e.attention_mask
    empty = np.zeros((0, 512), dtype=np.float32)
    feeds = {
        "input_ids": ids,
        "attention_mask": mask,
        "image_features": empty,
        "video_features": empty,
        "audio_features": empty,
    }
    sess = _session_pool.get()
    try:
        out = sess.run(["sentence_embedding"], feeds)[0]
    finally:
        _session_pool.put(sess)
    base = out.astype(np.float32)
    if not np.isfinite(base).all():
        raise HTTPException(status_code=500, detail="non-finite embedding")
    result = {str(d): _mrl(base, d).tolist() for d in req.dims}
    return {
        "model_id": MODEL_ID,
        "count": len(req.texts),
        "dims": req.dims,
        "max_tokens": MAX_TOKENS,
        "truncated_count": len(truncated_indices),
        "truncated_indices": truncated_indices,
        "embeddings": result,
        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8094")))
