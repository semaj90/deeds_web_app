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

def verify_proposal(value: dict, expected: PacketRef, registry: Mapping[str, int]) -> bool:
    """Verify integrity of a proposal; this does NOT admit canonical evidence."""
    if not isinstance(value, dict) or set(value) != {"status", "packet_ref", "features", "feature_digest"}:
        raise ValueError("INVALID_PROPOSAL_SHAPE")
    if value["status"] != "PROPOSAL_ONLY":
        raise ValueError("INVALID_PROPOSAL_STATUS")
    try:
        ref = PacketRef(**value["packet_ref"])
    except (TypeError, ValueError, KeyError) as exc:
        raise ValueError("INVALID_PACKET_REF") from exc
    assert_revision(ref, expected)
    dense = value["features"]
    if not isinstance(dense, (list, tuple)) or len(dense) != len(registry):
        raise ValueError("INVALID_FEATURE_WIDTH")
    if any(type(x) not in (int, float) or not math.isfinite(x) for x in dense):
        raise ValueError("INVALID_FEATURE_VALUE")
    if not isinstance(value["feature_digest"], str) or len(value["feature_digest"]) != 64:
        raise ValueError("INVALID_FEATURE_DIGEST")
    # Reuse the canonical ordering and digest function instead of having a second serializer.
    inverted = {v: k for k, v in registry.items()}
    if len(inverted) != len(registry):
        raise ValueError("INVALID_REGISTRY")
    reconstructed = {inverted[i]: dense[i] for i in range(len(dense)) if i in inverted}
    try:
        expected_digest = proposal(ref, reconstructed, registry)["feature_digest"]
    except (ValueError, KeyError, TypeError) as exc:
        raise ValueError("INVALID_REGISTRY") from exc
    from hmac import compare_digest
    if not compare_digest(value["feature_digest"], expected_digest):
        raise ValueError("FEATURE_DIGEST_MISMATCH")
    return True


def admit_proposal(value: dict, expected: PacketRef, registry: Mapping[str, int]) -> bool:
    """Legacy name: integrity check only. Never implies EvidenceCard admission."""
    return verify_proposal(value, expected, registry)
