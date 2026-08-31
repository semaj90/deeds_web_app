"""Bounded FastAPI service for the NestedSemanticAutoencoder transform.

This is a numerical projection service, not a text-generation service.  It
consumes EmbeddingGemma ``semantic_768`` vectors and returns the derived
``latent_256/128/64`` views or a reconstructed semantic vector.  Ornith on
llama-server remains the text synthesis owner.
"""

from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    import torch
    from atlas_compute.latent_autoencoder import NestedAutoencoderConfig, NestedSemanticAutoencoder
except Exception:  # pragma: no cover - reported by health when torch is unavailable
    torch = None  # type: ignore[assignment]
    NestedAutoencoderConfig = None  # type: ignore[assignment,misc]
    NestedSemanticAutoencoder = None  # type: ignore[assignment,misc]


SERVICE_SCHEMA = "atlas.neural-decoder-service.v1"
CHECKPOINT_REVISION = "d6e9395e60f0bb039dd03368012697c5c393d36bb001b8f020b6d7ba22654259"
MAX_BATCH = 32
DEFAULT_CHECKPOINTS = (
    Path("/models/nested-semantic-autoencoder/nested_semantic_autoencoder_v3_full01.pt"),
    Path("models/nested-semantic-autoencoder/nested_semantic_autoencoder_v3_full01.pt"),
    Path("python/checkpoints/nested_semantic_autoencoder_v3_full01.pt"),
)


class EncodeRequest(BaseModel):
    semantic_768: list[list[float]] = Field(min_length=1, max_length=MAX_BATCH)


class DecodeRequest(BaseModel):
    representation: Literal["latent_256", "latent_128", "latent_64"]
    vectors: list[list[float]] = Field(min_length=1, max_length=MAX_BATCH)


class ReconstructRequest(BaseModel):
    semantic_768: list[list[float]] = Field(min_length=1, max_length=MAX_BATCH)


def _checkpoint_path() -> Path:
    configured = os.getenv("ATLAS_NEURAL_DECODER_CHECKPOINT", "").strip()
    if configured:
        return Path(configured)
    for candidate in DEFAULT_CHECKPOINTS:
        if candidate.exists():
            return candidate
    return DEFAULT_CHECKPOINTS[0]


def _device() -> str:
    requested = os.getenv("ATLAS_NEURAL_DECODER_DEVICE", "auto").strip().lower()
    if requested not in {"auto", "cpu", "cuda"}:
        raise RuntimeError("ATLAS_NEURAL_DECODER_DEVICE must be auto, cpu, or cuda")
    if requested == "cuda":
        if torch is None or not torch.cuda.is_available():
            raise RuntimeError("NEURAL_DECODER_CUDA_UNAVAILABLE")
        return "cuda"
    if requested == "auto" and torch is not None and torch.cuda.is_available():
        return "cuda"
    return "cpu"


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _finite_matrix(values: list[list[float]], width: int, name: str) -> Any:
    if any(len(row) != width for row in values):
        raise HTTPException(status_code=422, detail=f"{name} must have shape [N,{width}]")
    if any(not all(isinstance(value, (int, float)) for value in row) for row in values):
        raise HTTPException(status_code=422, detail=f"{name} must contain numeric values")
    matrix = torch.tensor(values, dtype=torch.float32)  # type: ignore[union-attr]
    if not bool(torch.isfinite(matrix).all()):  # type: ignore[union-attr]
        raise HTTPException(status_code=422, detail=f"{name} contains non-finite values")
    return matrix


class NeuralDecoderRuntime:
    def __init__(self) -> None:
        self.model: Any = None
        self.device_name: str | None = None
        self.checkpoint_path: Path | None = None
        self.checkpoint_sha256: str | None = None

    def load(self) -> None:
        if torch is None or NestedSemanticAutoencoder is None or NestedAutoencoderConfig is None:
            raise RuntimeError("TORCH_UNAVAILABLE")
        path = _checkpoint_path()
        if not path.exists():
            raise RuntimeError(f"NEURAL_DECODER_CHECKPOINT_NOT_FOUND:{path}")
        if os.getenv("ATLAS_NEURAL_DECODER_CHECKPOINT_REVISION", CHECKPOINT_REVISION) != CHECKPOINT_REVISION:
            raise RuntimeError("NEURAL_DECODER_CHECKPOINT_REVISION_MISMATCH")
        self.device_name = _device()
        model = NestedSemanticAutoencoder(NestedAutoencoderConfig())
        state = torch.load(path, map_location=self.device_name, weights_only=True)
        model.load_state_dict(state)
        model.eval().to(self.device_name)
        self.model = model
        self.checkpoint_path = path
        self.checkpoint_sha256 = _sha256_file(path)

    def ensure_loaded(self) -> None:
        if self.model is None:
            try:
                self.load()
            except Exception as error:
                raise HTTPException(status_code=503, detail=f"NEURAL_DECODER_UNAVAILABLE:{error}") from error

    def encode(self, values: list[list[float]]) -> dict[str, Any]:
        self.ensure_loaded()
        source = _finite_matrix(values, 768, "semantic_768").to(self.device_name)
        with torch.inference_mode():  # type: ignore[union-attr]
            latent256, latent128, latent64 = self.model.encode(source)
        return {
            "latent_256": latent256.cpu().tolist(),
            "latent_128": latent128.cpu().tolist(),
            "latent_64": latent64.cpu().tolist(),
        }

    def decode(self, representation: str, values: list[list[float]]) -> list[list[float]]:
        self.ensure_loaded()
        widths = {"latent_256": 256, "latent_128": 128, "latent_64": 64}
        source = _finite_matrix(values, widths[representation], representation).to(self.device_name)
        with torch.inference_mode():  # type: ignore[union-attr]
            decoded = getattr(self.model, f"decode{representation.rsplit('_', 1)[1]}")(source)
        return decoded.cpu().tolist()


runtime = NeuralDecoderRuntime()
app = FastAPI(title="Parent Atlas Neural Decoder", version="1.0.0")


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "schema": SERVICE_SCHEMA,
        "status": "ok" if runtime.model is not None else "degraded",
        "available": torch is not None,
        "torchVersion": importlib.metadata.version("torch") if torch is not None else None,
        "device": runtime.device_name,
        "checkpointRevision": CHECKPOINT_REVISION,
        "checkpointPath": str(runtime.checkpoint_path) if runtime.checkpoint_path else None,
        "checkpointSha256": runtime.checkpoint_sha256,
        "representations": {
            "input": "semantic_768",
            "physical": "latent_256",
            "derived": ["latent_128", "latent_64"],
        },
        "canonicalAuthority": False,
        "textSynthesis": False,
        "writesPerformed": False,
    }


@app.post("/v1/neural-decoder/encode")
def encode(request: EncodeRequest) -> dict[str, Any]:
    result = runtime.encode(request.semantic_768)
    return {
        "schema": "atlas.neural-decoder-encode.v1",
        "checkpointRevision": CHECKPOINT_REVISION,
        "checkpointSha256": runtime.checkpoint_sha256,
        "representationRevision": CHECKPOINT_REVISION,
        "batchSize": len(request.semantic_768),
        "canonicalAuthority": False,
        "writesPerformed": False,
        **result,
    }


@app.post("/v1/neural-decoder/decode")
def decode(request: DecodeRequest) -> dict[str, Any]:
    return {
        "schema": "atlas.neural-decoder-decode.v1",
        "checkpointRevision": CHECKPOINT_REVISION,
        "checkpointSha256": runtime.checkpoint_sha256,
        "representationRevision": CHECKPOINT_REVISION,
        "representation": request.representation,
        "batchSize": len(request.vectors),
        "semantic_768": runtime.decode(request.representation, request.vectors),
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


@app.post("/v1/neural-decoder/reconstruct")
def reconstruct(request: ReconstructRequest) -> dict[str, Any]:
    encoded = runtime.encode(request.semantic_768)
    return {
        "schema": "atlas.neural-decoder-reconstruct.v1",
        "checkpointRevision": CHECKPOINT_REVISION,
        "checkpointSha256": runtime.checkpoint_sha256,
        "representationRevision": CHECKPOINT_REVISION,
        "batchSize": len(request.semantic_768),
        "semantic_768": request.semantic_768,
        "latent_256": encoded["latent_256"],
        "reconstructed_semantic_768": runtime.decode("latent_256", encoded["latent_256"]),
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


if __name__ == "__main__":
    import uvicorn

    # 8100 is owned by Go Retrieval and 8101 by topology search; keep this
    # numerical lane on its own port. Override for deployment when needed.
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("ATLAS_NEURAL_DECODER_PORT", "8121")))
