"""Model-topology audit for Parent Atlas execution planning.

MoE is a model architecture fact, not an executor-policy metaphor. This module
only reports MoE when explicit configuration fields prove expert topology. Model
names/tags alone never promote a model to MoE.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
from pathlib import Path
from typing import Any, Mapping


@dataclass(frozen=True)
class ModelTopologyDetection:
    schema: str
    model_id: str
    status: str
    architecture: str
    num_experts: int | None
    top_k: int | None
    hidden_size: int | None
    evidence_fields: list[str]
    source_checksum: str
    grouped_mm_eligible_by_topology: bool
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


EXPERT_COUNT_KEYS = (
    "num_experts",
    "num_local_experts",
    "n_experts",
    "expert_count",
)
TOP_K_KEYS = (
    "num_experts_per_tok",
    "experts_per_token",
    "top_k",
    "moe_top_k",
)
HIDDEN_SIZE_KEYS = (
    "hidden_size",
    "n_embd",
    "d_model",
)


def _first_int(mapping: Mapping[str, Any], keys: tuple[str, ...]) -> tuple[int | None, str | None]:
    for key in keys:
        value = mapping.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)) and int(value) == value and int(value) > 0:
            return int(value), key
    return None, None


def detect_model_topology(model_id: str, config: Mapping[str, Any]) -> ModelTopologyDetection:
    canonical = json.dumps(config, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    source_checksum = hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    num_experts, experts_key = _first_int(config, EXPERT_COUNT_KEYS)
    top_k, topk_key = _first_int(config, TOP_K_KEYS)
    hidden_size, hidden_key = _first_int(config, HIDDEN_SIZE_KEYS)
    evidence = [value for value in (experts_key, topk_key, hidden_key) if value]

    explicit_architecture = str(config.get("architecture", config.get("model_type", ""))).lower()
    explicit_moe_flag = config.get("is_moe") is True or config.get("moe") is True

    if num_experts is not None and top_k is not None and top_k <= num_experts:
        architecture = "moe"
        status = "PROVEN_MOE"
    elif explicit_moe_flag or "moe" in explicit_architecture:
        architecture = "unknown"
        status = "MOE_DECLARED_TOPOLOGY_INCOMPLETE"
    elif config.get("is_moe") is False or config.get("moe") is False:
        architecture = "dense"
        status = "PROVEN_DENSE"
    else:
        architecture = "unknown"
        status = "TOPOLOGY_UNPROVEN"

    return ModelTopologyDetection(
        schema="atlas.model-topology-detection.v1",
        model_id=model_id,
        status=status,
        architecture=architecture,
        num_experts=num_experts,
        top_k=top_k,
        hidden_size=hidden_size,
        evidence_fields=evidence,
        source_checksum=source_checksum,
        grouped_mm_eligible_by_topology=architecture == "moe",
        canonical_authority=False,
    )


def audit_model_manifest(path: str | Path) -> dict[str, Any]:
    manifest_path = Path(path)
    raw = manifest_path.read_bytes()
    manifest = json.loads(raw)
    detections: list[dict[str, Any]] = []
    for model in manifest.get("models", []):
        model_id = str(model.get("id", "")).strip()
        if not model_id:
            continue
        # Registry entries are deployment descriptors. Only explicit topology
        # fields count; tags and display names are intentionally ignored.
        detections.append(detect_model_topology(model_id, model).to_dict())

    canonical_dimensions = manifest.get("canonicalDimensions", {})
    return {
        "schema": "atlas.model-manifest-topology-audit.v1",
        "manifest_path": str(manifest_path),
        "manifest_checksum": hashlib.sha256(raw).hexdigest(),
        "schema_version": manifest.get("schemaVersion"),
        "declared_semantic_dimension": canonical_dimensions.get("semantic"),
        "declared_latent_dimension": canonical_dimensions.get("latent"),
        "models": detections,
        "proven_moe_count": sum(item["status"] == "PROVEN_MOE" for item in detections),
        "proven_dense_count": sum(item["status"] == "PROVEN_DENSE" for item in detections),
        "unproven_count": sum(item["architecture"] == "unknown" for item in detections),
        "canonical_authority": False,
    }
