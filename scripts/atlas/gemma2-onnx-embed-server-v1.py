"""EmbeddingGemma2 ONNX embedding server (EXPERIMENT challenger, port 8094).

Ownership: EXPERIMENT. Not the canonical semantic_768 owner (that is
embeddinggemma:latest via Ollama). Returns vectors only; never writes to
PostgreSQL, Qdrant, Redis or Neo4j. Callers apply their own recipe/prefix.

Endpoints:
  GET  /health  -> model, providers, dims, limits
  POST /tokenize -> token counts before truncation
  POST /embed   -> {"texts": [...], "dims": [768]} -> vectors per requested dim

Set ORT_PROFILE_PREFIX to capture optional ONNX Runtime profiles. Profiles
are finalized on graceful shutdown. Use one worker for request attribution.
"""
from __future__ import annotations

import hashlib
import importlib.metadata
import os
import queue
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator
from tokenizers import Tokenizer

MODEL_DIR = Path(os.environ.get("GEMMA2_ONNX_DIR", "/models/embeddinggemma2/onnx-q8"))
MODEL_FILE = Path(os.environ.get("GEMMA2_ONNX_FILE", str(MODEL_DIR / "onnx" / "model_quantized.onnx")))
TOKENIZER_FILE = MODEL_DIR / "tokenizer.json"
INTRA_THREADS = max(1, int(os.environ.get("ORT_INTRA_THREADS", "4")))
ORT_WORKERS = max(1, int(os.environ.get("ORT_WORKERS", "2")))
ORT_PROFILE_PREFIX = os.environ.get("ORT_PROFILE_PREFIX", "").strip()
ORT_DISABLE_GRAPH_OPTIMIZATION = os.environ.get("ORT_DISABLE_GRAPH_OPTIMIZATION", "0") == "1"
ORT_PROVIDER_MODE = os.environ.get("ORT_PROVIDER_MODE", "auto").strip().lower()
ORT_FALLBACK_TO_CPU = os.environ.get("ORT_FALLBACK_TO_CPU", "1").strip().lower() not in ("0", "false", "no")
TRT_RTX_TARGET_VERSION = "1.7"
TRT_CACHE_DIR = os.environ.get("ORT_TRT_CACHE_DIR", "/tmp/trt-rtx-cache")
MAX_BATCH = int(os.environ.get("GEMMA2_MAX_BATCH", "32"))
MAX_CHARS = int(os.environ.get("GEMMA2_MAX_CHARS", "8000"))
MAX_TOKENS = int(os.environ.get("GEMMA2_MAX_TOKENS", "512"))
REPORT_ARTIFACT_HASHES = os.environ.get("GEMMA2_REPORT_ARTIFACT_HASHES", "0") == "1"
# One value per worker process, so a client can tell that the same process served a whole run.
INSTANCE_ID = uuid.uuid4().hex
ALLOWED_DIMS = (768, 512, 256, 128)
NATIVE_DIM = 768
MODEL_ID = os.environ.get("GEMMA2_MODEL_ID", "onnx-community/embeddinggemma2-q8:onnx/model_quantized.onnx")

_session_pool: queue.Queue[ort.InferenceSession] = queue.Queue(maxsize=ORT_WORKERS)
_providers: List[str] = []
_requested_providers: List[str] = []
_tokenizer: Tokenizer | None = None
_count_tokenizer: Tokenizer | None = None
_load_error: str | None = None
_artifacts: dict | None = None


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _hash_artifacts() -> dict:
    """Digests of the files this process is about to load (EPContext engines sit beside the model)."""
    return {
        "model_file_sha256": _file_sha256(MODEL_FILE),
        "tokenizer_sha256": _file_sha256(TOKENIZER_FILE),
        "engines": [
            {"name": p.name, "sha256": _file_sha256(p)} for p in sorted(MODEL_FILE.parent.glob("*.engine"))
        ],
    }


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        yield
    finally:
        if ORT_PROFILE_PREFIX:
            while not _session_pool.empty():
                _session_pool.get_nowait().end_profiling()


app = FastAPI(title="gemma2-onnx-embed", version="1.2.0", lifespan=lifespan)


def _register_trt_rtx_plugin() -> str | None:
    try:
        import onnxruntime_ep_nv_tensorrt_rtx as trt_ep  # type: ignore

        ep_name = trt_ep.get_ep_name()
        if ep_name not in ort.get_available_providers():
            ort.register_execution_provider_library(ep_name, trt_ep.get_library_path())
        return ep_name
    except Exception:
        return None


def _detect_trt_rtx_package_version() -> str | None:
    for pkg in ("onnxruntime-ep-nv-tensorrt-rtx-cu13", "tensorrt-rtx", "tensorrt_rtx", "tensorrt"):
        try:
            return importlib.metadata.version(pkg)
        except importlib.metadata.PackageNotFoundError:
            continue
    return None


def _detect_trt_rtx_engine_version() -> str | None:
    try:
        import onnxruntime_ep_nv_tensorrt_rtx as trt_ep  # type: ignore

        ep_dir = Path(trt_ep.get_library_path()).parent
        for dll in sorted(ep_dir.glob("tensorrt_rtx_*.dll")):
            stem = dll.stem  # e.g. tensorrt_rtx_1_7
            suffix = stem.removeprefix("tensorrt_rtx_").replace("_", ".")
            if suffix:
                return suffix
        for so in sorted(ep_dir.glob("libtensorrt_rtx.so*")):
            return so.name
    except Exception:
        return None
    return None


def _trt_rtx_ep_name(available: List[str]) -> str | None:
    for candidate in ("NvTensorRTRTXExecutionProvider", "NvTensorRtRtxExecutionProvider"):
        if candidate in available:
            return candidate
    return None


def _trt_rtx_provider_entry(ep_name: str) -> object:
    if TRT_CACHE_DIR:
        Path(TRT_CACHE_DIR).mkdir(parents=True, exist_ok=True)
        return (ep_name, {"nv_runtime_cache_path": TRT_CACHE_DIR})
    return ep_name


def _resolve_providers(mode: str, available: List[str], fallback_to_cpu: bool = ORT_FALLBACK_TO_CPU) -> List[object]:
    trt_rtx_ep = _trt_rtx_ep_name(available)
    if mode == "cpu":
        return ["CPUExecutionProvider"]
    if mode == "cuda":
        if "CUDAExecutionProvider" not in available:
            if fallback_to_cpu:
                return ["CPUExecutionProvider"]
            raise RuntimeError(f"ORT_PROVIDER_MODE=cuda requested, available={available}")
        return ["CUDAExecutionProvider", "CPUExecutionProvider"] if fallback_to_cpu else ["CUDAExecutionProvider"]
    if mode in ("tensorrt_rtx", "trt_rtx", "trt-rtx"):
        if trt_rtx_ep:
            entry = _trt_rtx_provider_entry(trt_rtx_ep)
            return [entry, "CPUExecutionProvider"] if fallback_to_cpu else [entry]
        if "TensorrtExecutionProvider" in available:
            trt_entry = ("TensorrtExecutionProvider", {"trt_engine_cache_enable": True, "trt_engine_cache_path": TRT_CACHE_DIR})
            return [trt_entry, "CUDAExecutionProvider", "CPUExecutionProvider"] if fallback_to_cpu else [trt_entry]
        raise RuntimeError(
            f"ORT_PROVIDER_MODE={mode} requested, but NvTensorRTRTXExecutionProvider/TensorrtExecutionProvider not in {available}"
        )
    if mode in ("tensorrt_rtx_or_cpu", "auto"):
        if trt_rtx_ep:
            entry = _trt_rtx_provider_entry(trt_rtx_ep)
            return [entry, "CPUExecutionProvider"] if fallback_to_cpu else [entry]
        if "TensorrtExecutionProvider" in available:
            trt_entry = ("TensorrtExecutionProvider", {"trt_engine_cache_enable": True, "trt_engine_cache_path": TRT_CACHE_DIR})
            return [trt_entry, "CUDAExecutionProvider", "CPUExecutionProvider"] if fallback_to_cpu else [trt_entry]
        if mode == "auto" and "CUDAExecutionProvider" in available:
            return ["CUDAExecutionProvider", "CPUExecutionProvider"] if fallback_to_cpu else ["CUDAExecutionProvider"]
        if mode == "tensorrt_rtx_or_cpu" and not fallback_to_cpu:
            raise RuntimeError(f"ORT_PROVIDER_MODE=tensorrt_rtx_or_cpu with ORT_FALLBACK_TO_CPU=0, available={available}")
        return ["CPUExecutionProvider"]
    raise ValueError(f"Unsupported ORT_PROVIDER_MODE={mode!r} (expected cpu|auto|cuda|tensorrt_rtx|tensorrt_rtx_or_cpu)")


def _load() -> None:
    global _providers, _requested_providers, _tokenizer, _count_tokenizer, _load_error, _artifacts
    try:
        if not MODEL_FILE.is_file():
            raise FileNotFoundError(f"missing model: {MODEL_FILE}")
        if REPORT_ARTIFACT_HASHES:
            _artifacts = _hash_artifacts()
        _register_trt_rtx_plugin()
        tok = Tokenizer.from_file(str(TOKENIZER_FILE))
        tok.enable_truncation(max_length=MAX_TOKENS)
        count_tok = Tokenizer.from_file(str(TOKENIZER_FILE))
        count_tok.no_truncation()
        so = ort.SessionOptions()
        so.intra_op_num_threads = INTRA_THREADS
        so.inter_op_num_threads = 1
        so.graph_optimization_level = (
            ort.GraphOptimizationLevel.ORT_DISABLE_ALL
            if ORT_DISABLE_GRAPH_OPTIMIZATION
            else ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        )
        if not ORT_FALLBACK_TO_CPU:
            so.add_session_config_entry("session.disable_cpu_ep_fallback", "1")
        if ORT_PROFILE_PREFIX:
            Path(ORT_PROFILE_PREFIX).parent.mkdir(parents=True, exist_ok=True)
            so.enable_profiling = True
            so.profile_file_prefix = ORT_PROFILE_PREFIX
        requested_providers = _resolve_providers(ORT_PROVIDER_MODE, ort.get_available_providers())
        _requested_providers = [p[0] if isinstance(p, tuple) else str(p) for p in requested_providers]
        for _ in range(ORT_WORKERS):
            sess = ort.InferenceSession(
                str(MODEL_FILE), so, providers=requested_providers,
                enable_fallback=ORT_FALLBACK_TO_CPU,
            )
            if not ORT_FALLBACK_TO_CPU:
                sess.disable_fallback()
            _session_pool.put(sess)
            if not _providers:
                _providers = sess.get_providers()
        _tokenizer = tok
        _count_tokenizer = count_tok
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


class TokenizeRequest(BaseModel):
    texts: List[str] = Field(min_length=1)

    @field_validator("texts")
    @classmethod
    def _check_tokenize_texts(cls, v: List[str]) -> List[str]:
        if len(v) > MAX_BATCH:
            raise ValueError(f"batch exceeds {MAX_BATCH}")
        for t in v:
            if not t.strip():
                raise ValueError("empty text not allowed")
        return v


def _mrl(vecs: np.ndarray, dim: int) -> np.ndarray:
    """Matryoshka prefix + L2 renormalize (derived lane, not a new model)."""
    if dim == NATIVE_DIM:
        return vecs
    cut = vecs[:, :dim]
    return cut / np.linalg.norm(cut, axis=1, keepdims=True)


@app.get("/health")
def health() -> dict:
    ep_pkg_version = _detect_trt_rtx_package_version()
    trt_engine_version = _detect_trt_rtx_engine_version()
    primary_provider = _providers[0] if _providers else None
    fallback_used = ORT_PROVIDER_MODE != "cpu" and primary_provider == "CPUExecutionProvider"
    mixed_provider_session = (
        len(_providers) > 1
        and "CPUExecutionProvider" in _providers
        and primary_provider != "CPUExecutionProvider"
    )
    return {
        "status": "ok" if _tokenizer is not None and _load_error is None else "unavailable",
        "model_id": MODEL_ID,
        "model_dir": str(MODEL_DIR),
        "ort_version": ort.__version__,
        "provider_mode": ORT_PROVIDER_MODE,
        "fallback_to_cpu": ORT_FALLBACK_TO_CPU,
        "fallback_used": fallback_used,
        "mixed_provider_session": mixed_provider_session,
        "requested_providers": _requested_providers,
        "providers": _providers,
        "available_providers": ort.get_available_providers(),
        "trt_cache_dir": TRT_CACHE_DIR,
        "ort_profile_prefix": ORT_PROFILE_PREFIX or None,
        "instance_id": INSTANCE_ID,
        "artifacts": _artifacts,
        "trt_rtx_target": TRT_RTX_TARGET_VERSION,
        "trt_rtx_installed_version": ep_pkg_version,
        "ep_package_version": ep_pkg_version,
        "trt_rtx_engine_version": trt_engine_version,
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


@app.post("/tokenize")
def tokenize(req: TokenizeRequest) -> dict:
    if _count_tokenizer is None or _load_error is not None:
        raise HTTPException(status_code=503, detail=_load_error or "model not loaded")
    t0 = time.perf_counter()
    encs = _count_tokenizer.encode_batch(req.texts)
    token_counts = [len(e.ids) for e in encs]
    return {
        "model_id": MODEL_ID,
        "instance_id": INSTANCE_ID,
        "count": len(req.texts),
        "max_tokens": MAX_TOKENS,
        "token_counts": token_counts,
        "would_truncate": [c > MAX_TOKENS for c in token_counts],
        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2),
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
        "instance_id": INSTANCE_ID,
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

    uvicorn.run(
        app,
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8094")),
    )
