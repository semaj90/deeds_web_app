"""Proposal-only adapter helpers. No stores, network or GPU writes."""
from __future__ import annotations
from dataclasses import dataclass
from hashlib import sha256
import json
import math
from typing import Mapping

@dataclass(frozen=True)
class PacketRef:
    canonical_id: str
    packet_key: str
    workspace_revision: str
    source_revision: str
    graph_revision: str
    representation_revision: str

    def __post_init__(self):
        if not all(isinstance(v, str) and v.strip() for v in vars(self).values()):
            raise ValueError("all packet identity and revision fields are required")

def ordered_features(values: Mapping[str, float], registry: Mapping[str, int]) -> tuple[float, ...]:
    if not registry or set(values) - set(registry):
        raise ValueError("invalid or unknown feature keys")
    ordinals = list(registry.values())
    if any(type(v) is not int or v < 0 for v in ordinals) or sorted(ordinals) != list(range(len(ordinals))):
        raise ValueError("feature ordinals must be a dense 0-based permutation")
    output = [0.0] * len(ordinals)
    for key, value in values.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError("features must be finite numeric values")
        output[registry[key]] = float(value)
    return tuple(output)

def assert_revision(candidate: PacketRef, requested: PacketRef) -> None:
    if candidate != requested:
        raise ValueError("STALE_OR_MISMATCHED_PACKET")

def proposal(ref: PacketRef, features: Mapping[str, float], registry: Mapping[str, int]) -> dict:
    dense = ordered_features(features, registry)
    digest = sha256(json.dumps({"ref": vars(ref), "registry": dict(sorted(registry.items())), "features": dense},
                               sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")).hexdigest()
    return {"status": "PROPOSAL_ONLY", "packet_ref": vars(ref),
            "features": dense, "feature_digest": digest}

def admit_proposal(value: dict, expected: PacketRef) -> bool:
    if value.get("status") != "PROPOSAL_ONLY":
        raise ValueError("invalid status")
    assert_revision(PacketRef(**value["packet_ref"]), expected)
    return True
