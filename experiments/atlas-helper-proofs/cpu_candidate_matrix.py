"""Opt-in CPU parity projection for canonical SvelteKit [C,25] feature order.

Only explicit source evidence may populate features; 0 with presence=0 means
missing, not a measured zero. No admission, ranking or persistence.
"""
from dataclasses import dataclass
from hashlib import sha256
import json
import math
import struct
from typing import Mapping, Sequence

FEATURE_NAMES = (
    "semantic_similarity_768", "lexical_score", "exact_symbol_match",
    "ast_signal", "authority_norm", "community_fit", "domain_fit_query",
    "concept_fit", "nary_relation_fit", "kmeans_centroid_similarity",
    "kmeans_cluster_rank", "som_distance", "som_neighbor_radius",
    "hilbert_locality", "summary_quality", "summary_provenance",
    "recency", "retrieval_frequency", "execution_utility", "graph_distance",
    "process_fit", "dependency_fanout", "feature_label_confidence",
    "source_revision_match", "representation_revision_match",
)
assert len(FEATURE_NAMES) == 25

@dataclass(frozen=True)
class Candidate:
    packet_key: str
    source_ref: str
    source_revision: str
    workspace_revision: str
    values: Mapping[str, float | None]

@dataclass(frozen=True)
class CandidateMatrix:
    packet_keys: tuple[str, ...]
    identities: tuple[tuple[str, str, str, str], ...]
    features: tuple[tuple[float, ...], ...]
    mask: tuple[tuple[int, ...], ...]
    schema: str = "atlas.cpu-candidate-feature-parity.v1"
    canonical_authority: bool = False
    writes_performed: bool = False

def build_cpu_candidate_matrix(candidates: Sequence[Candidate]) -> CandidateMatrix:
    if not candidates:
        raise ValueError("CANDIDATES_EMPTY")
    keys, identities, rows, masks = [], [], [], []
    seen = set()
    workspace = candidates[0].workspace_revision
    for candidate in candidates:
        ident = (candidate.packet_key, candidate.source_ref, candidate.source_revision, candidate.workspace_revision)
        if any(not isinstance(part, str) or not part.strip() for part in ident):
            raise ValueError("IDENTITY_MISSING")
        if candidate.workspace_revision != workspace:
            raise ValueError("WORKSPACE_REVISION_MISMATCH")
        if candidate.packet_key in seen:
            raise ValueError("DUPLICATE_PACKET_KEY")
        seen.add(candidate.packet_key)
        unknown = set(candidate.values) - set(FEATURE_NAMES)
        if unknown:
            raise ValueError("UNKNOWN_FEATURE")
        row, mask = [], []
        for name in FEATURE_NAMES:
            value = candidate.values.get(name)
            if value is None:
                row.append(0.0)
                mask.append(0)
                continue
            if type(value) not in (int, float) or not math.isfinite(value):
                raise ValueError("NONFINITE_FEATURE")
            try:
                rounded = struct.unpack("<f", struct.pack("<f", value))[0]
            except (OverflowError, struct.error) as exc:
                raise ValueError("FLOAT32_OVERFLOW") from exc
            if not math.isfinite(rounded):
                raise ValueError("FLOAT32_OVERFLOW")
            row.append(rounded)
            mask.append(1)
        keys.append(candidate.packet_key)
        identities.append(ident)
        rows.append(tuple(row))
        masks.append(tuple(mask))
    return CandidateMatrix(tuple(keys), tuple(identities), tuple(rows), tuple(masks))

def matrix_receipt(matrix: CandidateMatrix) -> dict:
    """Experiment-specific checksum; not the canonical TS adapter checksum."""
    body = {"schema": matrix.schema, "identities": matrix.identities,
            "features": matrix.features, "presence_mask": matrix.mask}
    encoded = json.dumps(body, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    return {"schema": matrix.schema, "sha256": "sha256:" + sha256(encoded).hexdigest(),
            "candidate_count": len(matrix.packet_keys), "feature_count": 25,
            "canonical_authority": False, "writes_performed": False}
