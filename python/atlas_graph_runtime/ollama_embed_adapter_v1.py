from __future__ import annotations

import json
import math
import os
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from typing import Any, Literal, Optional, Sequence

SCHEMA_ADAPTER_V1 = "atlas.ollama-embed-adapter.v1"
ADAPTER_REVISION_V1 = "ollama-embed-adapter-v1"

EG2_SUPPORTED_MRL_DIMS: tuple[int, ...] = (768, 512, 256, 128)

TaskType = Literal[
    "query",
    "document",
    "code_retrieval",
    "classification",
    "clustering",
    "semantic_similarity",
]

TASK_PREFIXES: dict[str, str] = {
    "query": "task: search result | query: ",
    "document": "title: none | text: ",
    "code_retrieval": "task: code retrieval | query: ",
    "classification": "task: classification | query: ",
    "clustering": "task: clustering | query: ",
    "semantic_similarity": "task: sentence similarity | query: ",
}


class EmbedTransportError(RuntimeError):
    """Raised when Ollama /api/embed or /api/show fails or returns malformed data."""


class EmbedValidationError(ValueError):
    """Raised when returned vectors fail finiteness, dimension, or L2-norm checks."""


class MultimodalCapabilityError(RuntimeError):
    """Raised when vision or audio encoding is requested on a runtime lacking that encoder."""


@dataclass(frozen=True)
class ModelConfigurationSpec:
    tier: str
    approx_params: str
    supports_text: bool
    supports_code: bool
    supports_vision: bool
    supports_audio: bool


OFFICIAL_EG2_CONFIGS: dict[str, ModelConfigurationSpec] = {
    "270M": ModelConfigurationSpec("270M", "270M", True, True, False, False),
    "440M": ModelConfigurationSpec("440M", "440M", True, True, True, False),
    "570M": ModelConfigurationSpec("570M", "570M", True, True, False, True),
    "740M": ModelConfigurationSpec("740M", "740M", True, True, True, True),
}


@dataclass(frozen=True)
class EncoderProfile:
    profile_id: str
    space_id: str
    model: str
    dimensions: int
    supports_dimensions_param: bool
    apply_task_prefix: bool
    default_truncate: bool = False
    legacy_max_chars: Optional[int] = None


LEGACY_EMBEDDINGGEMMA_768 = EncoderProfile(
    profile_id="legacy-embeddinggemma-768",
    space_id="embeddinggemma-v1-768",
    model="embeddinggemma:latest",
    dimensions=768,
    supports_dimensions_param=False,
    apply_task_prefix=False,
    default_truncate=True,
    legacy_max_chars=2000,
)


def build_eg2_profile(dimensions: int = 512, *, model: str = "embeddinggemma2:q8_0") -> EncoderProfile:
    if dimensions not in EG2_SUPPORTED_MRL_DIMS:
        raise ValueError(f"Unsupported EG2 MRL dimension {dimensions}; expected one of {EG2_SUPPORTED_MRL_DIMS}")
    return EncoderProfile(
        profile_id=f"eg2-mrl-{dimensions}",
        space_id=f"embeddinggemma2-q8_0-mrl-{dimensions}",
        model=model,
        dimensions=dimensions,
        supports_dimensions_param=True,
        apply_task_prefix=True,
        default_truncate=False,
        legacy_max_chars=None,
    )


EG2_MRL_512 = build_eg2_profile(512)
EG2_MRL_768 = build_eg2_profile(768)
EG2_MRL_256 = build_eg2_profile(256)
EG2_MRL_128 = build_eg2_profile(128)


@dataclass(frozen=True)
class OllamaRuntimeCapabilities:
    model_tag: str
    digest: str
    license: str
    family: str
    parameter_size: str
    quantization_level: str
    context_length: Optional[int]
    native_dimensions: Optional[int]
    config_tier: str
    supports_text: bool
    supports_code: bool
    supports_vision: bool
    supports_audio: bool
    capabilities: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["capabilities"] = list(self.capabilities)
        return data


@dataclass(frozen=True)
class EmbedBatchResult:
    schema: str
    adapter_revision: str
    profile_id: str
    space_id: str
    model: str
    dimensions: int
    truncate: bool
    vectors: list[list[float]]
    l2_norms: list[float]
    all_finite: bool
    all_normalized: bool
    total_duration_ns: Optional[int] = None

    def to_metadata_dict(self) -> dict[str, Any]:
        return {
            "schema": self.schema,
            "adapterRevision": self.adapter_revision,
            "profileId": self.profile_id,
            "spaceId": self.space_id,
            "model": self.model,
            "dimensions": self.dimensions,
            "count": len(self.vectors),
            "truncate": self.truncate,
            "allFinite": self.all_finite,
            "allNormalized": self.all_normalized,
            "l2Norms": self.l2_norms,
            "totalDurationNs": self.total_duration_ns,
        }


def _normalize_ollama_url(ollama_url: Optional[str] = None) -> str:
    raw = (ollama_url or os.getenv("OLLAMA_URL") or "http://127.0.0.1:11434").strip().rstrip("/")
    if raw.startswith("http://0.0.0.0:"):
        raw = "http://127.0.0.1:" + raw.split("http://0.0.0.0:", 1)[1]
    return raw


def _post_json(url: str, payload: dict[str, Any], *, timeout_seconds: float) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace") if exc.fp else str(exc)
        raise EmbedTransportError(f"POST {url} failed with HTTP {exc.code}: {detail}") from exc
    except Exception as exc:
        raise EmbedTransportError(f"POST {url} transport error: {exc}") from exc
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise EmbedTransportError(f"POST {url} returned invalid JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise EmbedTransportError(f"POST {url} returned non-object JSON")
    return parsed


def _infer_config_tier(supports_vision: bool, supports_audio: bool, param_size: str) -> str:
    if supports_vision and supports_audio:
        return "740M"
    if supports_audio:
        return "570M"
    if supports_vision:
        return "440M"
    if "270" in param_size or "271" in param_size:
        return "270M"
    return "270M" if not (supports_vision or supports_audio) else "unknown"


def inspect_ollama_runtime(
    model_tag: str,
    *,
    ollama_url: Optional[str] = None,
    timeout_seconds: float = 10.0,
) -> OllamaRuntimeCapabilities:
    base_url = _normalize_ollama_url(ollama_url)
    show = _post_json(f"{base_url}/api/show", {"model": model_tag}, timeout_seconds=timeout_seconds)
    details = show.get("details") if isinstance(show.get("details"), dict) else {}
    model_info = show.get("model_info") if isinstance(show.get("model_info"), dict) else {}
    raw_caps = show.get("capabilities") if isinstance(show.get("capabilities"), list) else []
    caps = tuple(str(c) for c in raw_caps)

    has_vision_projector = any("vision" in str(k).lower() or "clip" in str(k).lower() for k in model_info.keys())
    has_audio_encoder = any("audio" in str(k).lower() for k in model_info.keys())
    supports_vision = ("vision" in caps) or has_vision_projector
    supports_audio = ("audio" in caps) or has_audio_encoder
    supports_embedding = ("embedding" in caps) or bool(model_info)

    ctx_len: Optional[int] = None
    emb_len: Optional[int] = None
    for k, v in model_info.items():
        lk = str(k).lower()
        if lk.endswith(".context_length") and isinstance(v, int):
            ctx_len = v
        elif lk.endswith(".embedding_length") and isinstance(v, int):
            emb_len = v

    param_size = str(details.get("parameter_size") or "")
    tier = _infer_config_tier(supports_vision, supports_audio, param_size)

    return OllamaRuntimeCapabilities(
        model_tag=model_tag,
        digest=str(show.get("digest") or ""),
        license=str(show.get("license") or ""),
        family=str(details.get("family") or ""),
        parameter_size=param_size,
        quantization_level=str(details.get("quantization_level") or ""),
        context_length=ctx_len,
        native_dimensions=emb_len,
        config_tier=tier,
        supports_text=supports_embedding,
        supports_code=supports_embedding,
        supports_vision=supports_vision,
        supports_audio=supports_audio,
        capabilities=caps,
    )


def validate_vectors(
    vectors: Any,
    *,
    expected_count: int,
    expected_dim: int,
    require_normalized: bool = True,
    norm_tolerance: float = 1e-2,
) -> tuple[list[list[float]], list[float], bool, bool]:
    if not isinstance(vectors, list) or len(vectors) != expected_count:
        raise EmbedValidationError(
            f"Expected {expected_count} embeddings, got {len(vectors) if isinstance(vectors, list) else type(vectors).__name__}"
        )
    validated: list[list[float]] = []
    norms: list[float] = []
    all_finite = True
    all_normalized = True
    for idx, vec in enumerate(vectors):
        if not isinstance(vec, list) or len(vec) != expected_dim:
            actual_len = len(vec) if isinstance(vec, list) else type(vec).__name__
            raise EmbedValidationError(f"Vector[{idx}] expected dim={expected_dim}, got {actual_len}")
        floats: list[float] = []
        sq_sum = 0.0
        for val in vec:
            fval = float(val)
            if not math.isfinite(fval):
                all_finite = False
                raise EmbedValidationError(f"Vector[{idx}] contains non-finite value {val!r}")
            floats.append(fval)
            sq_sum += fval * fval
        norm = math.sqrt(sq_sum)
        norms.append(norm)
        if abs(norm - 1.0) > norm_tolerance:
            all_normalized = False
            if require_normalized:
                raise EmbedValidationError(
                    f"Vector[{idx}] failed normalization check: L2 norm={norm:.6f} (tol={norm_tolerance})"
                )
        validated.append(floats)
    return validated, norms, all_finite, all_normalized


class OllamaEmbedAdapterV1:
    """Versioned Ollama /api/embed adapter with explicit legacy & EG2 MRL profiles."""

    def __init__(
        self,
        *,
        ollama_url: Optional[str] = None,
        timeout_seconds: float = 15.0,
    ) -> None:
        self.ollama_url = _normalize_ollama_url(ollama_url)
        self.timeout_seconds = timeout_seconds
        self._runtime_cache: dict[str, OllamaRuntimeCapabilities] = {}

    def inspect_runtime(self, model_tag: str, *, force_refresh: bool = False) -> OllamaRuntimeCapabilities:
        if force_refresh or model_tag not in self._runtime_cache:
            self._runtime_cache[model_tag] = inspect_ollama_runtime(
                model_tag,
                ollama_url=self.ollama_url,
                timeout_seconds=self.timeout_seconds,
            )
        return self._runtime_cache[model_tag]

    def format_inputs(
        self,
        texts: Sequence[str],
        *,
        profile: EncoderProfile,
        task_type: Optional[TaskType] = None,
    ) -> list[str]:
        if not texts:
            raise ValueError("texts must be non-empty")
        prefix = ""
        if profile.apply_task_prefix and task_type is not None:
            if task_type not in TASK_PREFIXES:
                raise ValueError(f"Unknown task_type {task_type!r}")
            prefix = TASK_PREFIXES[task_type]
        formatted: list[str] = []
        for raw in texts:
            cleaned = str(raw).strip()
            if not cleaned:
                raise ValueError("Input text cannot be empty after stripping")
            if profile.legacy_max_chars is not None:
                cleaned = cleaned[: profile.legacy_max_chars]
            formatted.append(f"{prefix}{cleaned}" if prefix else cleaned)
        return formatted

    def embed_batch(
        self,
        inputs: Sequence[str],
        *,
        profile: EncoderProfile = EG2_MRL_512,
        task_type: Optional[TaskType] = None,
        truncate: Optional[bool] = None,
        require_normalized: bool = True,
        dimensions: Optional[int] = None,
    ) -> EmbedBatchResult:
        target_dim = dimensions if dimensions is not None else profile.dimensions
        if profile.supports_dimensions_param and target_dim not in EG2_SUPPORTED_MRL_DIMS:
            raise ValueError(f"Unsupported EG2 MRL dimension {target_dim}; expected {EG2_SUPPORTED_MRL_DIMS}")
        if not profile.supports_dimensions_param and target_dim != profile.dimensions:
            raise ValueError(
                f"Profile {profile.profile_id} does not support dynamic dimensions (fixed={profile.dimensions}, got={target_dim})"
            )

        effective_truncate = profile.default_truncate if truncate is None else bool(truncate)
        formatted = self.format_inputs(inputs, profile=profile, task_type=task_type)
        payload: dict[str, Any] = {
            "model": profile.model,
            "input": formatted if len(formatted) > 1 else formatted[0],
            "truncate": effective_truncate,
        }
        if profile.supports_dimensions_param:
            payload["dimensions"] = target_dim

        resp = _post_json(f"{self.ollama_url}/api/embed", payload, timeout_seconds=self.timeout_seconds)
        vectors, norms, all_finite, all_normalized = validate_vectors(
            resp.get("embeddings"),
            expected_count=len(formatted),
            expected_dim=target_dim,
            require_normalized=require_normalized,
        )
        duration = resp.get("total_duration")
        return EmbedBatchResult(
            schema=SCHEMA_ADAPTER_V1,
            adapter_revision=ADAPTER_REVISION_V1,
            profile_id=profile.profile_id,
            space_id=profile.space_id if target_dim == profile.dimensions else f"{profile.model}-mrl-{target_dim}",
            model=profile.model,
            dimensions=target_dim,
            truncate=effective_truncate,
            vectors=vectors,
            l2_norms=norms,
            all_finite=all_finite,
            all_normalized=all_normalized,
            total_duration_ns=int(duration) if isinstance(duration, int) else None,
        )

    def encode_text(
        self,
        texts: Sequence[str],
        *,
        profile: EncoderProfile = EG2_MRL_512,
        task_type: TaskType = "document",
        truncate: bool = False,
    ) -> EmbedBatchResult:
        return self.embed_batch(texts, profile=profile, task_type=task_type, truncate=truncate)

    def encode_code(
        self,
        snippets: Sequence[str],
        *,
        profile: EncoderProfile = EG2_MRL_512,
        task_type: TaskType = "code_retrieval",
        truncate: bool = False,
    ) -> EmbedBatchResult:
        return self.embed_batch(snippets, profile=profile, task_type=task_type, truncate=truncate)

    def encode_image(
        self,
        images_b64: Sequence[str],
        *,
        model_tag: str = "embeddinggemma2:q8_0",
    ) -> EmbedBatchResult:
        caps = self.inspect_runtime(model_tag)
        if not caps.supports_vision:
            raise MultimodalCapabilityError(
                f"Runtime model {model_tag!r} (tier={caps.config_tier}) does not advertise vision capability; refusing multimodal image encode"
            )
        raise NotImplementedError("Vision input encoding is gated to verified 440M/740M runtimes")

    def encode_audio(
        self,
        audio_b64: Sequence[str],
        *,
        model_tag: str = "embeddinggemma2:q8_0",
    ) -> EmbedBatchResult:
        caps = self.inspect_runtime(model_tag)
        if not caps.supports_audio:
            raise MultimodalCapabilityError(
                f"Runtime model {model_tag!r} (tier={caps.config_tier}) does not advertise audio capability; refusing multimodal audio encode"
            )
        raise NotImplementedError("Audio input encoding is gated to verified 570M/740M runtimes")
