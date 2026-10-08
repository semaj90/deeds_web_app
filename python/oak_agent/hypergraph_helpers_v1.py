"""Deterministic HyperGraphRAG-inspired helpers for the isolated OaK agent runtime.

These helpers adapt Parent Atlas admitted n-ary facts into request-local incidence
snapshots. They do not write canonical stores, mint identity, or make a graph
backend authoritative.

Design constraints:
- admitted facts only;
- exact workspace/ontology/policy revisions;
- role-preserving incidence rows;
- deterministic ordinals/checksums;
- NetworkX is the CPU reference;
- nx-cugraph is an optional executor reached through one-time conversion;
- no dependency on the default :8095 NLP sidecar.
"""

from __future__ import annotations

from hashlib import sha256
import json
from typing import Any, Iterable, Literal, Sequence

from pydantic import Field, field_validator, model_validator

from .structured_contracts_v1 import StrictFrozenModel


_SHA256_PATTERN = r"^sha256:[a-f0-9]{64}$"


class HypergraphParticipantV1(StrictFrozenModel):
    canonical_id: str = Field(min_length=1)
    role: str = Field(min_length=1)
    kind: str = Field(min_length=1)
    label: str | None = None


class AdmittedHypergraphFactV1(StrictFrozenModel):
    schema: Literal["atlas.oak.admitted-hypergraph-fact.v1"] = (
        "atlas.oak.admitted-hypergraph-fact.v1"
    )
    fact_id: str = Field(min_length=1)
    fact_checksum: str = Field(pattern=_SHA256_PATTERN)
    predicate: str = Field(min_length=1)
    participants: tuple[HypergraphParticipantV1, ...] = Field(min_length=2, max_length=256)
    evidence_refs: tuple[str, ...] = Field(min_length=1, max_length=256)
    workspace_revision: str = Field(min_length=1)
    ontology_revision: str = Field(min_length=1)
    policy_revision: str = Field(min_length=1)
    producer_revision: str = Field(min_length=1)
    canonical_authority: Literal[False] = False
    writes_performed: Literal[False] = False

    @field_validator("evidence_refs")
    @classmethod
    def _evidence_refs_unique(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if len(set(value)) != len(value):
            raise ValueError("DUPLICATE_EVIDENCE_REF")
        return value

    @model_validator(mode="after")
    def _participant_rows_unique(self) -> "AdmittedHypergraphFactV1":
        rows = [(p.canonical_id, p.role, p.kind) for p in self.participants]
        if len(set(rows)) != len(rows):
            raise ValueError("DUPLICATE_PARTICIPANT_ROLE_ROW")
        return self


class IncidenceRowV1(StrictFrozenModel):
    relation_key: str = Field(min_length=1)
    entity_key: str = Field(min_length=1)
    fact_id: str = Field(min_length=1)
    fact_checksum: str = Field(pattern=_SHA256_PATTERN)
    predicate: str = Field(min_length=1)
    participant_canonical_id: str = Field(min_length=1)
    participant_role: str = Field(min_length=1)
    participant_kind: str = Field(min_length=1)
    participant_ordinal: int = Field(ge=0)
    evidence_refs: tuple[str, ...]
    workspace_revision: str = Field(min_length=1)
    ontology_revision: str = Field(min_length=1)
    policy_revision: str = Field(min_length=1)


class HypergraphIncidenceSnapshotV1(StrictFrozenModel):
    schema: Literal["atlas.oak.hypergraph-incidence-snapshot.v1"] = (
        "atlas.oak.hypergraph-incidence-snapshot.v1"
    )
    workspace_revision: str = Field(min_length=1)
    ontology_revision: str = Field(min_length=1)
    policy_revision: str = Field(min_length=1)
    fact_ids: tuple[str, ...]
    fact_checksums: tuple[str, ...]
    node_keys: tuple[str, ...]
    node_ordinals: tuple[tuple[str, int], ...]
    incidence_rows: tuple[IncidenceRowV1, ...]
    snapshot_checksum: str = Field(pattern=_SHA256_PATTERN)
    canonical_authority: Literal[False] = False
    writes_performed: Literal[False] = False

    def ordinal_map(self) -> dict[str, int]:
        return dict(self.node_ordinals)


class TraversalHitV1(StrictFrozenModel):
    node_key: str
    distance: int = Field(ge=0, le=4)


class TraversalResultV1(StrictFrozenModel):
    schema: Literal["atlas.oak.hypergraph-traversal-result.v1"] = (
        "atlas.oak.hypergraph-traversal-result.v1"
    )
    seed_keys: tuple[str, ...]
    hits: tuple[TraversalHitV1, ...]
    max_hops: int = Field(ge=0, le=4)
    max_neighbors: int = Field(ge=1, le=256)
    truncated: bool
    canonical_authority: Literal[False] = False
    writes_performed: Literal[False] = False


class ScoreParityV1(StrictFrozenModel):
    keys_equal: bool
    max_abs_delta: float = Field(ge=0.0)
    mean_abs_delta: float = Field(ge=0.0)
    top_k: int = Field(ge=1)
    top_k_overlap: float = Field(ge=0.0, le=1.0)


def _stable_json(value: Any) -> str:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )


def _checksum(value: Any) -> str:
    return "sha256:" + sha256(_stable_json(value).encode("utf-8")).hexdigest()


def _relation_key(fact_id: str) -> str:
    return f"relation:{fact_id}"


def _entity_key(canonical_id: str) -> str:
    return f"entity:{canonical_id}"


def build_incidence_snapshot_v1(
    facts: Sequence[AdmittedHypergraphFactV1],
    *,
    workspace_revision: str,
    ontology_revision: str,
    policy_revision: str,
) -> HypergraphIncidenceSnapshotV1:
    """Freeze admitted facts into a deterministic bipartite incidence snapshot."""
    if not facts:
        raise ValueError("ADMITTED_FACTS_REQUIRED")

    seen_fact_ids: set[str] = set()
    rows: list[IncidenceRowV1] = []
    fact_checksums: list[str] = []

    for fact in facts:
        if fact.fact_id in seen_fact_ids:
            raise ValueError(f"DUPLICATE_FACT_ID:{fact.fact_id}")
        seen_fact_ids.add(fact.fact_id)

        if fact.workspace_revision != workspace_revision:
            raise ValueError(f"WORKSPACE_REVISION_MISMATCH:{fact.fact_id}")
        if fact.ontology_revision != ontology_revision:
            raise ValueError(f"ONTOLOGY_REVISION_MISMATCH:{fact.fact_id}")
        if fact.policy_revision != policy_revision:
            raise ValueError(f"POLICY_REVISION_MISMATCH:{fact.fact_id}")

        fact_checksums.append(fact.fact_checksum)
        participants = sorted(
            fact.participants,
            key=lambda p: (p.role, p.kind, p.canonical_id, p.label or ""),
        )
        for ordinal, participant in enumerate(participants):
            rows.append(
                IncidenceRowV1(
                    relation_key=_relation_key(fact.fact_id),
                    entity_key=_entity_key(participant.canonical_id),
                    fact_id=fact.fact_id,
                    fact_checksum=fact.fact_checksum,
                    predicate=fact.predicate,
                    participant_canonical_id=participant.canonical_id,
                    participant_role=participant.role,
                    participant_kind=participant.kind,
                    participant_ordinal=ordinal,
                    evidence_refs=tuple(sorted(fact.evidence_refs)),
                    workspace_revision=workspace_revision,
                    ontology_revision=ontology_revision,
                    policy_revision=policy_revision,
                )
            )

    rows.sort(
        key=lambda row: (
            row.relation_key,
            row.participant_ordinal,
            row.participant_role,
            row.entity_key,
        )
    )

    node_keys = tuple(
        sorted(
            {
                key
                for row in rows
                for key in (row.relation_key, row.entity_key)
            }
        )
    )
    node_ordinals = tuple((key, ordinal) for ordinal, key in enumerate(node_keys))

    body = {
        "schema": "atlas.oak.hypergraph-incidence-snapshot.v1",
        "workspace_revision": workspace_revision,
        "ontology_revision": ontology_revision,
        "policy_revision": policy_revision,
        "fact_ids": sorted(seen_fact_ids),
        "fact_checksums": sorted(fact_checksums),
        "node_keys": list(node_keys),
        "node_ordinals": [[key, ordinal] for key, ordinal in node_ordinals],
        "incidence_rows": [
            row.model_dump(mode="json", exclude_none=False) for row in rows
        ],
        "canonical_authority": False,
        "writes_performed": False,
    }

    return HypergraphIncidenceSnapshotV1(
        **body,
        snapshot_checksum=_checksum(body),
    )


def build_networkx_incidence_graph_v1(
    snapshot: HypergraphIncidenceSnapshotV1,
):
    """Build the role-preserving CPU oracle graph lazily.

    A simple Graph is intentional for the first executor-parity surface.
    If the same fact/entity pair carries multiple distinct roles, fail closed
    rather than silently collapsing role-bearing incidence.
    """
    import networkx as nx

    graph = nx.Graph()
    ordinals = snapshot.ordinal_map()
    for node_key in snapshot.node_keys:
        node_kind = "relation" if node_key.startswith("relation:") else "entity"
        graph.add_node(
            node_key,
            node_kind=node_kind,
            ordinal=ordinals[node_key],
        )

    for row in snapshot.incidence_rows:
        if graph.has_edge(row.relation_key, row.entity_key):
            prior = graph.edges[row.relation_key, row.entity_key]
            if (
                prior.get("participant_role") != row.participant_role
                or prior.get("participant_kind") != row.participant_kind
            ):
                raise ValueError(
                    "ROLE_COLLISION_REQUIRES_MULTIGRAPH:"
                    f"{row.fact_id}:{row.participant_canonical_id}"
                )
            continue
        graph.add_edge(
            row.relation_key,
            row.entity_key,
            participant_role=row.participant_role,
            participant_kind=row.participant_kind,
            fact_id=row.fact_id,
            fact_checksum=row.fact_checksum,
            participant_ordinal=row.participant_ordinal,
        )

    return graph


def bounded_traverse_networkx_v1(
    graph,
    *,
    seed_keys: Sequence[str],
    max_hops: int = 2,
    max_neighbors: int = 32,
) -> TraversalResultV1:
    """Deterministic BFS over the already-built request-local incidence graph."""
    if not 0 <= max_hops <= 4:
        raise ValueError("MAX_HOPS_OUT_OF_RANGE")
    if not 1 <= max_neighbors <= 256:
        raise ValueError("MAX_NEIGHBORS_OUT_OF_RANGE")

    seeds = tuple(sorted(set(seed_keys)))
    if not seeds:
        raise ValueError("SEED_KEYS_REQUIRED")
    missing = [key for key in seeds if key not in graph]
    if missing:
        raise ValueError(f"UNKNOWN_SEED_KEYS:{','.join(sorted(missing))}")

    distances: dict[str, int] = {key: 0 for key in seeds}
    frontier = list(seeds)
    truncated = False

    for distance in range(1, max_hops + 1):
        next_frontier: list[str] = []
        for current in sorted(frontier):
            neighbors = sorted(str(node) for node in graph.neighbors(current))
            unseen = [node for node in neighbors if node not in distances]
            if len(unseen) > max_neighbors:
                unseen = unseen[:max_neighbors]
                truncated = True
            for node in unseen:
                distances[node] = distance
                next_frontier.append(node)
        if not next_frontier:
            break
        frontier = sorted(set(next_frontier))

    hits = tuple(
        TraversalHitV1(node_key=node_key, distance=distance)
        for node_key, distance in sorted(
            distances.items(),
            key=lambda item: (item[1], item[0]),
        )
    )
    return TraversalResultV1(
        seed_keys=seeds,
        hits=hits,
        max_hops=max_hops,
        max_neighbors=max_neighbors,
        truncated=truncated,
        canonical_authority=False,
        writes_performed=False,
    )


def nx_cugraph_available_v1() -> bool:
    try:
        import nx_cugraph  # noqa: F401
    except Exception:
        return False
    return True


def convert_networkx_to_cugraph_once_v1(graph):
    """Convert once for repeated GPU execution; caller owns lifecycle/cache."""
    try:
        import nx_cugraph as nxcg
    except Exception as exc:
        raise RuntimeError("NX_CUGRAPH_UNAVAILABLE") from exc
    return nxcg.from_networkx(graph)


def compare_score_maps_v1(
    cpu_scores: dict[Any, float],
    gpu_scores: dict[Any, float],
    *,
    top_k: int = 20,
) -> ScoreParityV1:
    if top_k < 1:
        raise ValueError("TOP_K_MUST_BE_POSITIVE")

    cpu_keys = set(cpu_scores)
    gpu_keys = set(gpu_scores)
    common = sorted(cpu_keys & gpu_keys, key=str)
    deltas = [abs(float(cpu_scores[key]) - float(gpu_scores[key])) for key in common]

    cpu_top = {
        key
        for key, _ in sorted(
            cpu_scores.items(),
            key=lambda item: (-float(item[1]), str(item[0])),
        )[:top_k]
    }
    gpu_top = {
        key
        for key, _ in sorted(
            gpu_scores.items(),
            key=lambda item: (-float(item[1]), str(item[0])),
        )[:top_k]
    }
    denom = max(1, min(top_k, max(len(cpu_top), len(gpu_top))))
    overlap = len(cpu_top & gpu_top) / denom

    return ScoreParityV1(
        keys_equal=cpu_keys == gpu_keys,
        max_abs_delta=max(deltas, default=0.0),
        mean_abs_delta=(sum(deltas) / len(deltas)) if deltas else 0.0,
        top_k=top_k,
        top_k_overlap=overlap,
    )
