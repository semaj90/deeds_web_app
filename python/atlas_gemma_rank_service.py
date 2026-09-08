"""Bounded FastAPI service for AtlasGemmaRankV1 (parent-atlas-best-fit-score-fabric).

This is a numerical scoring service, not a text-generation service. It loads the
already-materialized standalone artifact (models/atlas-gemma-rank-v1/standalone-init-bf16/) and
scores a batch of texts via the same convention every other AtlasGemmaRank proof script uses:
last-token hidden state through a scalar rank head. Ornith on llama-server remains the text
synthesis owner; this service never generates text.

**The rank head is untrained (Xavier-random initialization).** Every response is explicit about
this (`rankHeadTrained: false`, `rankingQualityProven: false`) -- scores returned by this service
are NOT meaningful relevance signals yet. This service exists to prove the serving pattern (mirrors
python/atlas_neural_decoder_service.py's structure exactly), not to serve production reranking.
"""

from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    import torch
    from safetensors import safe_open
    from transformers import Gemma4ForCausalLM, Gemma4TextConfig, PreTrainedTokenizerFast
except Exception:  # pragma: no cover - reported by health when deps are unavailable
    torch = None  # type: ignore[assignment]
    safe_open = None  # type: ignore[assignment]
    Gemma4ForCausalLM = None  # type: ignore[assignment,misc]
    Gemma4TextConfig = None  # type: ignore[assignment,misc]
    PreTrainedTokenizerFast = None  # type: ignore[assignment,misc]


SERVICE_SCHEMA = "atlas.gemma-rank-service.v1"
MAX_BATCH = 32
NEW_SUFFIXES = (".self_attn.k_proj.weight", ".self_attn.v_proj.weight", ".self_attn.k_norm.weight")
DEFAULT_ARTIFACT_DIRS = (
    Path("/models/atlas-gemma-rank-v1/standalone-init-bf16"),
    Path("models/atlas-gemma-rank-v1/standalone-init-bf16"),
)


class ScoreRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=MAX_BATCH)


class RerankRequest(BaseModel):
    """OpenAI/llama-server-shaped request for bounded shadow evaluation.

    The endpoint deliberately remains non-promotional while the rank head is
    untrained.  ``model`` is echoed and checked so a caller cannot mistake a
    differently configured artifact for the requested model.
    """

    model: str = Field(min_length=1, max_length=256)
    query: str = Field(min_length=1, max_length=16_384)
    documents: list[str] = Field(min_length=1, max_length=MAX_BATCH)
    top_n: int | None = Field(default=None, ge=1, le=MAX_BATCH)


def _artifact_dir() -> Path:
    configured = os.getenv("ATLAS_GEMMA_RANK_ARTIFACT_DIR", "").strip()
    if configured:
        return Path(configured)
    for candidate in DEFAULT_ARTIFACT_DIRS:
        if candidate.exists():
            return candidate
    return DEFAULT_ARTIFACT_DIRS[0]


def _device() -> str:
    requested = os.getenv("ATLAS_GEMMA_RANK_DEVICE", "cpu").strip().lower()
    if requested not in {"cpu", "cuda"}:
        raise RuntimeError("ATLAS_GEMMA_RANK_DEVICE must be cpu or cuda")
    if requested == "cuda":
        if torch is None or not torch.cuda.is_available():
            raise RuntimeError("GEMMA_RANK_CUDA_UNAVAILABLE")
        return "cuda"
    return "cpu"


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


class AtlasGemmaRankWrapper(torch.nn.Module):  # type: ignore[misc]
    def __init__(self, backbone: Any, rank_head: Any) -> None:
        super().__init__()
        self.backbone = backbone
        self.rank_head = rank_head

    def forward(self, input_ids: Any, attention_mask: Any) -> Any:
        hidden = self.backbone(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        return self.rank_head(hidden[:, -1, :])


class GemmaRankRuntime:
    def __init__(self) -> None:
        self.model: Any = None
        self.tokenizer: Any = None
        self.device_name: str | None = None
        self.artifact_dir: Path | None = None
        self.weights_sha256: str | None = None

    def load(self) -> None:
        if torch is None or Gemma4ForCausalLM is None:
            raise RuntimeError("GEMMA_RANK_DEPS_UNAVAILABLE")
        artifact_dir = _artifact_dir()
        config_path = artifact_dir / "config.json"
        weights_path = artifact_dir / "model.safetensors"
        if not config_path.exists() or not weights_path.exists():
            raise RuntimeError(f"GEMMA_RANK_ARTIFACT_NOT_FOUND:{artifact_dir}")

        upstream = json.loads(config_path.read_text(encoding="utf-8"))
        config = Gemma4TextConfig.from_dict(upstream) if "text_config" not in upstream else Gemma4TextConfig.from_dict({
            **upstream["text_config"],
            "num_kv_shared_layers": 0,
            "use_bidirectional_attention": "all",
            "use_cache": False,
        })

        model = Gemma4ForCausalLM(config)
        if hasattr(model, "lm_head"):
            del model.lm_head
        model = model.to(dtype=torch.float32).eval()
        state = model.state_dict()
        rank_head = torch.nn.Linear(config.hidden_size, 1, bias=True, dtype=torch.float32)

        with safe_open(str(weights_path), framework="pt", device="cpu") as handle:
            for name in sorted(handle.keys()):
                tensor = handle.get_tensor(name).to(dtype=torch.float32)
                if name == "atlas.rank_head.weight":
                    with torch.no_grad():
                        rank_head.weight.copy_(tensor)
                elif name == "atlas.rank_head.bias":
                    with torch.no_grad():
                        rank_head.bias.copy_(tensor)
                elif name in state:
                    with torch.no_grad():
                        state[name].copy_(tensor)

        self.device_name = _device()
        self.model = AtlasGemmaRankWrapper(model.model, rank_head).eval().to(self.device_name)
        self.tokenizer = PreTrainedTokenizerFast(tokenizer_file=str(artifact_dir / "tokenizer.json"))
        self.artifact_dir = artifact_dir
        self.weights_sha256 = _sha256_file(weights_path)

    def ensure_loaded(self) -> None:
        if self.model is None:
            try:
                self.load()
            except Exception as error:
                raise HTTPException(status_code=503, detail=f"GEMMA_RANK_UNAVAILABLE:{error}") from error

    def score(self, texts: list[str]) -> list[float]:
        self.ensure_loaded()
        scores: list[float] = []
        for text in texts:
            encoded = self.tokenizer(text, return_tensors="pt")
            input_ids = encoded["input_ids"].to(self.device_name)
            attention_mask = encoded.get("attention_mask", torch.ones_like(input_ids)).to(self.device_name)
            with torch.inference_mode():
                output = self.model(input_ids, attention_mask)
            scores.append(float(output.item()))
        return scores


runtime = GemmaRankRuntime()
app = FastAPI(title="Parent Atlas AtlasGemmaRank Service", version="0.1.0")


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "schema": SERVICE_SCHEMA,
        "status": "ok" if runtime.model is not None else "degraded",
        "available": torch is not None,
        "torchVersion": importlib.metadata.version("torch") if torch is not None else None,
        "device": runtime.device_name,
        "artifactDir": str(runtime.artifact_dir) if runtime.artifact_dir else None,
        "weightsSha256": runtime.weights_sha256,
        "rankHeadTrained": False,
        "rankingQualityProven": False,
        "canonicalAuthority": False,
        "textSynthesis": False,
        "writesPerformed": False,
    }


@app.post("/v1/gemma-rank/score")
def score(request: ScoreRequest) -> dict[str, Any]:
    scores = runtime.score(request.texts)
    return {
        "schema": "atlas.gemma-rank-score.v1",
        "weightsSha256": runtime.weights_sha256,
        "batchSize": len(request.texts),
        "scores": scores,
        "rankHeadTrained": False,
        "rankingQualityProven": False,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


@app.post("/v1/rerank")
def rerank(request: RerankRequest) -> dict[str, Any]:
    """Return bounded, normalized shadow scores in the canonical rerank shape."""

    requested_model = request.model.strip()
    configured_model = os.getenv("ATLAS_GEMMA_RANK_MODEL", "atlas-gemma-rank-v1").strip()
    if requested_model != configured_model:
        raise HTTPException(
            status_code=400,
            detail=f"GEMMA_RANK_MODEL_MISMATCH:requested={requested_model}:configured={configured_model}",
        )

    raw_scores = runtime.score([
        f"[QUERY]\n{request.query}\n\n[DOCUMENT]\n{document}"
        for document in request.documents
    ])

    # The model emits a logit.  Normalize once at the adapter boundary; do not
    # let downstream fusion apply a second sigmoid.
    import math

    normalized = [1.0 / (1.0 + math.exp(-max(-60.0, min(60.0, value)))) for value in raw_scores]
    order = sorted(range(len(normalized)), key=lambda index: (-normalized[index], index))
    if request.top_n is not None:
        order = order[: request.top_n]

    return {
        "object": "rerank",
        "model": configured_model,
        "results": [
            {"index": index, "relevance_score": normalized[index]}
            for index in order
        ],
        "rankHeadTrained": False,
        "rankingQualityProven": False,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


if __name__ == "__main__":
    import uvicorn

    # 8121 is owned by the neural decoder; keep this reranker lane on its own port.
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("ATLAS_GEMMA_RANK_PORT", "8122")))
