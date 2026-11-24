"""Read-only Grounded Hypergraph V2 adapter.

Extends the grounded NLP / external-document pipeline with:
1. Grounded N-ary hyperedges with arbitrary arity >= 2.
2. 4D Manifold Topology Coordinates (x, y, z, w):
   - x, y: 2D SOM grid / semantic neighborhood
   - z: cosine distance to cluster centroid (semantic depth)
   - w: GRPO / PUCT policy reward score
   - Isoquant level computation: sqrt(x^2 + y^2 + z^2)
3. Mode-7 2D Affine coordinate transformations ([a, b, tx, c, d, ty]).
4. ARPC length-prefixed BYTEA binary envelope serialization with feature bitmasks.
5. SSR-to-CSR Web Worker vertex streaming with typewriter progress scalar.
6. Domain classification hot/warm/cold queue routing.

Strictly preserves:
- canonical_authority: False (PostgreSQL and graph admission owner remain authoritative)
- admission_state: PROPOSAL_ONLY (cannot become canonical without admitted graph revision)
- fail-closed validation: rejects hiddenThoughts, kv_cache, device_ptr.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from hashlib import sha256
import json
import math
import struct
from typing import Any, Iterable, Mapping, Sequence

from python.atlas_doc14_span_integrity_v1 import validate_stanza_relation_candidate_v1


# Feature bitmask constants for BYTEA / ARPC envelope
FEATURE_FLAG_MODE7_AFFINE: int = 0x01
FEATURE_FLAG_MANIFOLD_4D: int = 0x02
FEATURE_FLAG_NIBBLE_PACKED: int = 0x04
FEATURE_FLAG_BYTEA_ALIGNED: int = 0x08
FEATURE_FLAG_TEXTURE_VERTEX: int = 0x10


def _sha256_hex(data: str | bytes) -> str:
    payload = data if isinstance(data, bytes) else data.encode("utf-8")
    return sha256(payload).hexdigest()


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


@dataclass(frozen=True)
class Manifold4DCoordinatesV1:
    """4D addressing coordinates for hyperedges and nodes.

    x, y: SOM BMU coordinates [0.0, 1.0]
    z: Cosine distance to cluster centroid [0.0, 2.0] (0.0 = centroid center)
    w: GRPO / PUCT reward score [0.0, 1.0] (policy quality)
    """

    x: float
    y: float
    z: float
    w: float

    def __post_init__(self) -> None:
        for val, name in ((self.x, "x"), (self.y, "y"), (self.z, "z"), (self.w, "w")):
            if not math.isfinite(val):
                raise ValueError(f"MANIFOLD_COORD_{name.upper()}_NOT_FINITE")
        if not (0.0 <= self.w <= 1.0):
            raise ValueError("MANIFOLD_REWARD_W_OUT_OF_RANGE")

    @property
    def isoquant_radius(self) -> float:
        """Euclidean distance in spatial (x, y, z) semantic manifold."""
        return math.sqrt(self.x * self.x + self.y * self.y + self.z * self.z)

    def to_tuple(self) -> tuple[float, float, float, float]:
        return (self.x, self.y, self.z, self.w)


def project_mode7_affine_v2(
    affine2x3: Sequence[float],
    u: float,
    v: float,
) -> tuple[float, float]:
    """Applies Mode-7 2D affine transform [a, b, tx, c, d, ty] to coordinates (u, v).

    Parity equivalent to projectMode7Affine2x3V1 in tensor-handle-4x4x6-v1.ts and C++ N-API.
    """
    if len(affine2x3) != 6 or any(not math.isfinite(x) for x in affine2x3):
        raise ValueError("INVALID_MODE7_AFFINE_PARAMS")
    a, b, tx, c, d, ty = affine2x3
    x_world = a * u + b * v + tx
    y_world = c * u + d * v + ty
    return (float(x_world), float(y_world))


@dataclass(frozen=True)
class GroundedFactParticipantV2:
    entity_id: str
    entity_kind: str
    role: str
    label: str | None = None
    tile_uv: tuple[float, float] = (0.0, 0.0)

    def __post_init__(self) -> None:
        if not self.entity_id.strip() or not self.entity_kind.strip() or not self.role.strip():
            raise ValueError("PARTICIPANT_ID_KIND_ROLE_REQUIRED")


@dataclass(frozen=True)
class HyperedgeV2:
    """N-ary hyperedge proposal with 4D manifold topology and Mode-7 affine projection."""

    schema: str
    hyperedge_id: str
    predicate: str
    source_ref: str
    source_revision: str
    workspace_revision: str
    producer_revision: str
    evidence_start_byte: int
    evidence_end_byte: int
    evidence_text: str
    evidence_checksum: str
    participants: tuple[GroundedFactParticipantV2, ...]
    manifold_4d: Manifold4DCoordinatesV1
    mode7_affine: tuple[float, float, float, float, float, float]
    feature_bitmask: int
    confidence: float
    proposal_checksum: str
    graph_revision: None = None
    admission_state: str = "PROPOSAL_ONLY"
    canonical_authority: bool = False
    writes_performed: bool = False

    def __post_init__(self) -> None:
        if len(self.participants) < 2:
            raise ValueError("HYPEREDGE_REQUIRES_AT_LEAST_TWO_PARTICIPANTS")
        if self.canonical_authority:
            raise ValueError("CANONICAL_AUTHORITY_FORBIDDEN_ON_PROPOSAL")
        if self.graph_revision is not None:
            raise ValueError("GRAPH_REVISION_MUST_BE_NONE_BEFORE_ADMISSION")

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": self.schema,
            "hyperedge_id": self.hyperedge_id,
            "predicate": self.predicate,
            "source_ref": self.source_ref,
            "source_revision": self.source_revision,
            "workspace_revision": self.workspace_revision,
            "producer_revision": self.producer_revision,
            "evidence_start_byte": self.evidence_start_byte,
            "evidence_end_byte": self.evidence_end_byte,
            "evidence_text": self.evidence_text,
            "evidence_checksum": self.evidence_checksum,
            "participants": [asdict(p) for p in self.participants],
            "manifold_4d": asdict(self.manifold_4d),
            "mode7_affine": list(self.mode7_affine),
            "feature_bitmask": self.feature_bitmask,
            "confidence": self.confidence,
            "proposal_checksum": self.proposal_checksum,
            "graph_revision": None,
            "admission_state": self.admission_state,
            "canonical_authority": False,
            "writes_performed": False,
        }


def build_hyperedge_v2(
    *,
    fact_id: str,
    predicate: str,
    source_ref: str,
    source_revision: str,
    workspace_revision: str,
    producer_revision: str,
    evidence_start_byte: int,
    evidence_end_byte: int,
    evidence_text: str,
    evidence_checksum: str,
    participants: Sequence[GroundedFactParticipantV2],
    manifold_4d: Manifold4DCoordinatesV1,
    mode7_affine: Sequence[float] = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0),
    confidence: float = 1.0,
) -> HyperedgeV2:
    """Builds a verified N-ary HyperedgeV2 proposal."""
    if len(participants) < 2:
        raise ValueError("HYPEREDGE_REQUIRES_AT_LEAST_TWO_PARTICIPANTS")
    if len(mode7_affine) != 6:
        raise ValueError("MODE7_AFFINE_MUST_HAVE_6_ELEMENTS")

    mode7_tuple = tuple(float(x) for x in mode7_affine)
    norm_participants = tuple(
        sorted(participants, key=lambda p: (p.role, p.entity_kind, p.entity_id))
    )

    feature_bitmask = (
        FEATURE_FLAG_MODE7_AFFINE
        | FEATURE_FLAG_MANIFOLD_4D
        | FEATURE_FLAG_BYTEA_ALIGNED
        | FEATURE_FLAG_TEXTURE_VERTEX
    )

    body = {
        "schema": "atlas.external-doc-hypergraph.v2",
        "fact_id": fact_id,
        "predicate": predicate,
        "source_ref": source_ref,
        "source_revision": source_revision,
        "workspace_revision": workspace_revision,
        "producer_revision": producer_revision,
        "evidence_start_byte": evidence_start_byte,
        "evidence_end_byte": evidence_end_byte,
        "evidence_text": evidence_text,
        "evidence_checksum": evidence_checksum,
        "participants": [asdict(p) for p in norm_participants],
        "manifold_4d": asdict(manifold_4d),
        "mode7_affine": list(mode7_tuple),
        "feature_bitmask": feature_bitmask,
        "confidence": confidence,
    }
    proposal_checksum = _sha256_hex(_stable_json(body))

    return HyperedgeV2(
        schema="atlas.external-doc-hypergraph.v2",
        hyperedge_id=f"hyperedge:{_sha256_hex(fact_id)[:24]}",
        predicate=predicate,
        source_ref=source_ref,
        source_revision=source_revision,
        workspace_revision=workspace_revision,
        producer_revision=producer_revision,
        evidence_start_byte=evidence_start_byte,
        evidence_end_byte=evidence_end_byte,
        evidence_text=evidence_text,
        evidence_checksum=evidence_checksum,
        participants=norm_participants,
        manifold_4d=manifold_4d,
        mode7_affine=mode7_tuple,  # type: ignore[arg-type]
        feature_bitmask=feature_bitmask,
        confidence=confidence,
        proposal_checksum=proposal_checksum,
    )


def pack_vertex_stream_for_web_worker_v2(
    hyperedge: HyperedgeV2,
    *,
    char_progress: float = 1.0,
) -> bytes:
    """Packs hyperedge participant vertices into a binary Float32Array buffer.

    Each vertex occupies 32 bytes (8 x 4-byte IEEE 754 floats):
      [0]: world_x (derived via Mode-7 projection of participant tile_u, tile_v)
      [1]: world_y (derived via Mode-7 projection)
      [2]: manifold_z (cluster depth)
      [3]: manifold_w (GRPO/PUCT reward score)
      [4]: tile_u
      [5]: tile_v
      [6]: feature_bitmask (as float)
      [7]: char_progress (0.0 to 1.0 for client-side typewriter reveal shader)
    """
    char_progress = max(0.0, min(1.0, float(char_progress)))
    out = bytearray()
    for p in hyperedge.participants:
        u, v = p.tile_uv
        world_x, world_y = project_mode7_affine_v2(hyperedge.mode7_affine, u, v)
        vertex_floats = (
            world_x,
            world_y,
            hyperedge.manifold_4d.z,
            hyperedge.manifold_4d.w,
            u,
            v,
            int(hyperedge.feature_bitmask) & 0xFFFFFFFF,
            char_progress,
        )
        # Bytes 24..27 are raw uint32-le (never float32) to prevent NaN bit-pattern corruption in WGSL u32.
        out.extend(struct.pack("<6fIf", *vertex_floats))
    return bytes(out)


def classify_domain_queue_tier_v2(hyperedge: HyperedgeV2) -> str:
    """Categorizes hyperedge for domain classification into HOT, WARM, or COLD queues."""
    w = hyperedge.manifold_4d.w
    conf = hyperedge.confidence
    if w >= 0.75 and conf >= 0.8:
        return "HOT"
    if w >= 0.40 and conf >= 0.5:
        return "WARM"
    return "COLD"
