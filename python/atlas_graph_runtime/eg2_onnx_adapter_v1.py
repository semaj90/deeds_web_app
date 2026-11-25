from __future__ import annotations

import functools
import json
import math
import os
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Optional, Sequence

SCHEMA_EG2_ONNX_V1 = "atlas.eg2-onnx-embed.v1"
EG2_ONNX_ALLOWED_DIMS: tuple[int, ...] = (768, 512, 256, 128)
DEFAULT_EG2_ONNX_DIR = Path(__file__).resolve().parents[2] / "models" / "embeddinggemma2" / "onnx-q8"
DEFAULT_EG2_ONNX_URL = os.getenv("GEMMA2_ONNX_URL", "http://127.0.0.1:8094").rstrip("/")


class Eg2OnnxError(RuntimeError):
    """Raised when the EG2 ONNX server or artifact validation fails."""


@dataclass(frozen=True)
class Eg2OnnxArtifactReport:
    model_dir: str
    text_encoder_present: bool
    vision_encoder_present: bool
    audio_encoder_present: bool
    tokenizer_present: bool
    config_present: bool
    architectures: tuple[str, ...]
    prompts_count: int

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["architectures"] = list(self.architectures)
        return d


@dataclass(frozen=True)
class Eg2OnnxEmbedResult:
    schema: str
    model_id: str
    encoder_profile: str
    dimensions: int
    vectors: list[list[float]]
    l2_norms: list[float]
    all_finite: bool
    all_normalized: bool
    latency_ms: Optional[float] = None

    def to_metadata_dict(self) -> dict[str, Any]:
        return {
            "schema": self.schema,
            "modelId": self.model_id,
            "encoderProfile": self.encoder_profile,
            "dimensions": self.dimensions,
            "count": len(self.vectors),
            "allFinite": self.all_finite,
            "allNormalized": self.all_normalized,
            "l2Norms": self.l2_norms,
            "latencyMs": self.latency_ms,
        }


def inspect_eg2_onnx_artifacts(model_dir: str | Path = DEFAULT_EG2_ONNX_DIR) -> Eg2OnnxArtifactReport:
    root = Path(model_dir)
    cfg_path = root / "config.json"
    st_path = root / "config_sentence_transformers.json"
    archs: tuple[str, ...] = ()
    if cfg_path.is_file():
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        archs = tuple(str(a) for a in (cfg.get("architectures") or ()))
    prompts_count = 0
    if st_path.is_file():
        st = json.loads(st_path.read_text(encoding="utf-8"))
        prompts_count = len(st.get("prompts") or {})
    return Eg2OnnxArtifactReport(
        model_dir=str(root),
        text_encoder_present=(root / "onnx" / "model_quantized.onnx").is_file(),
        vision_encoder_present=(root / "onnx" / "vision_encoder_quantized.onnx").is_file(),
        audio_encoder_present=(root / "onnx" / "audio_encoder_quantized.onnx").is_file(),
        tokenizer_present=(root / "tokenizer.json").is_file(),
        config_present=cfg_path.is_file(),
        architectures=archs,
        prompts_count=prompts_count,
    )


def load_task_prompts(model_dir: str | Path = DEFAULT_EG2_ONNX_DIR) -> dict[str, str]:
    st_path = Path(model_dir) / "config_sentence_transformers.json"
    if not st_path.is_file():
        return {}
    data = json.loads(st_path.read_text(encoding="utf-8"))
    prompts = data.get("prompts")
    return {str(k): str(v) for k, v in prompts.items()} if isinstance(prompts, dict) else {}


@functools.lru_cache(maxsize=4)
def _load_cached_tokenizer(tokenizer_path_str: str) -> Any:
    from tokenizers import Tokenizer

    return Tokenizer.from_file(tokenizer_path_str)


def chunk_text_by_tokens(
    text: str,
    *,
    tokenizer_path: str | Path = DEFAULT_EG2_ONNX_DIR / "tokenizer.json",
    max_tokens: int = 512,
    overlap_tokens: int = 64,
    max_chunks: int = 16,
) -> list[str]:
    """Token-aware chunking using cached EG2 tokenizer.json (replaces arbitrary text[:2000])."""
    cleaned = text.strip()
    if not cleaned:
        return []
    if max_tokens <= 0:
        raise ValueError("max_tokens must be positive")
    if overlap_tokens < 0 or overlap_tokens >= max_tokens:
        raise ValueError("overlap_tokens must satisfy 0 <= overlap_tokens < max_tokens")

    tok = _load_cached_tokenizer(str(Path(tokenizer_path).resolve()))
    encoded = tok.encode(cleaned, add_special_tokens=False)
    ids = encoded.ids
    if not ids:
        return [cleaned]
    if len(ids) <= max_tokens:
        return [cleaned]

    step = max_tokens - overlap_tokens
    chunks: list[str] = []
    for start in range(0, len(ids), step):
        window = ids[start : start + max_tokens]
        decoded = tok.decode(window, skip_special_tokens=True).strip()
        if decoded:
            chunks.append(decoded)
        if len(chunks) >= max_chunks or start + max_tokens >= len(ids):
            break
    return chunks


class Eg2OnnxClientV1:
    """Client for the local ONNX EmbeddingGemma 2 server (:8094) — no Ollama dependency."""

    def __init__(
        self,
        *,
        base_url: str = DEFAULT_EG2_ONNX_URL,
        model_dir: str | Path = DEFAULT_EG2_ONNX_DIR,
        timeout_seconds: float = 30.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model_dir = Path(model_dir)
        self.timeout_seconds = timeout_seconds
        self._prompts = load_task_prompts(self.model_dir)

    def health(self) -> dict[str, Any]:
        req = urllib.request.Request(f"{self.base_url}/health", method="GET")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            raise Eg2OnnxError(f"GET {self.base_url}/health failed: {exc}") from exc

    def embed(
        self,
        texts: Sequence[str],
        *,
        dim: int = 768,
        task_prompt_name: Optional[str] = "CodeRetrieval",
        require_normalized: bool = True,
    ) -> Eg2OnnxEmbedResult:
        if dim not in EG2_ONNX_ALLOWED_DIMS:
            raise ValueError(f"Unsupported EG2 ONNX dim={dim}; expected {EG2_ONNX_ALLOWED_DIMS}")
        if not texts:
            raise ValueError("texts must be non-empty")

        prefix = self._prompts.get(task_prompt_name, "") if task_prompt_name else ""
        formatted: list[str] = []
        for t in texts:
            s = str(t).strip()
            if not s:
                raise ValueError("empty text not allowed")
            formatted.append(f"{prefix}{s}" if prefix else s)

        payload = json.dumps({"texts": formatted, "dims": [dim]}).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/embed",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace") if exc.fp else str(exc)
            raise Eg2OnnxError(f"POST {self.base_url}/embed HTTP {exc.code}: {detail}") from exc
        except Exception as exc:
            raise Eg2OnnxError(f"POST {self.base_url}/embed failed: {exc}") from exc

        raw_vectors = (body.get("embeddings") or body.get("vectors") or {}).get(str(dim))
        if not isinstance(raw_vectors, list) or len(raw_vectors) != len(formatted):
            raise Eg2OnnxError(f"Expected {len(formatted)} vectors for dim={dim}, got {type(raw_vectors).__name__}")

        vectors: list[list[float]] = []
        norms: list[float] = []
        all_finite = True
        all_normalized = True
        for idx, vec in enumerate(raw_vectors):
            if not isinstance(vec, list) or len(vec) != dim:
                raise Eg2OnnxError(f"Vector[{idx}] expected dim={dim}")
            floats = [float(x) for x in vec]
            if not all(math.isfinite(x) for x in floats):
                all_finite = False
                raise Eg2OnnxError(f"Vector[{idx}] contains non-finite value")
            norm = math.sqrt(sum(x * x for x in floats))
            norms.append(norm)
            if abs(norm - 1.0) > 1e-2:
                all_normalized = False
                if require_normalized:
                    raise Eg2OnnxError(f"Vector[{idx}] failed L2 norm check: {norm:.6f}")
            vectors.append(floats)

        return Eg2OnnxEmbedResult(
            schema=SCHEMA_EG2_ONNX_V1,
            model_id=str(body.get("model_id") or "onnx-community/embeddinggemma2-q8:onnx/model_quantized.onnx"),
            encoder_profile=f"eg2-onnx-q8-mrl-{dim}",
            dimensions=dim,
            vectors=vectors,
            l2_norms=norms,
            all_finite=all_finite,
            all_normalized=all_normalized,
            latency_ms=float(body["elapsed_ms"]) if body.get("elapsed_ms") is not None else (float(body["latency_ms"]) if body.get("latency_ms") is not None else None),
        )
