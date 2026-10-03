"""Ordinal- and seed-bound NetworkX/cuGraph personalized PageRank parity."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import math
from typing import Mapping, Sequence

from .contracts import GraphExecutionReceiptV2
from .pagerank_parity import pagerank_scores_checksum
from .rank_metrics import compare_ranked_scores


@dataclass(frozen=True)
class PprExecutionIdentityV1:
    graph_revision: str
    candidate_snapshot_revision: str
    candidate_ordinal_map_checksum: str
    graph_ordinal_map_checksum: str
    candidate_ordinals: tuple[int, ...]
    edge_ordinals: tuple[tuple[int, int], ...]
    seed_weights: tuple[tuple[int, float], ...]
    alpha: float
    epsilon: float
    max_iterations: int
    dangling_policy: str = "PERSONALIZATION"

    def canonical_input_checksum(self) -> str:
        payload = {
            "schema": "atlas.graph-ppr-input.v1",
            "graphRevision": self.graph_revision,
            "candidateSnapshotRevision": self.candidate_snapshot_revision,
            "candidateOrdinalMapChecksum": self.candidate_ordinal_map_checksum,
            "graphOrdinalMapChecksum": self.graph_ordinal_map_checksum,
            "candidateOrdinals": list(self.candidate_ordinals),
            "edges": [list(edge) for edge in self.edge_ordinals],
            "seedWeights": [[ordinal, float(weight).hex()] for ordinal, weight in self.seed_weights],
            "alpha": float(self.alpha).hex(),
            "epsilon": float(self.epsilon).hex(),
            "maxIterations": self.max_iterations,
            "danglingPolicy": self.dangling_policy,
        }
        raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
        return "sha256:" + hashlib.sha256(raw.encode("ascii")).hexdigest()


@dataclass(frozen=True)
class PprParityReceiptV1:
    schema: str
    input_checksum: str
    graph_revision: str
    candidate_snapshot_revision: str
    candidate_ordinal_map_checksum: str
    graph_ordinal_map_checksum: str
    seed_weights: tuple[tuple[int, float], ...]
    alpha: float
    epsilon: float
    max_iterations: int
    dangling_policy: str
    dangling_ordinals: tuple[int, ...]
    dangling_mass_reference: float
    dangling_mass_challenger: float
    reference_output_checksum: str
    challenger_output_checksum: str
    metrics: dict[str, object]
    tolerance: float
    status: str
    canonical_authority: bool = False
    retrieval_vote_added: bool = False
    writes_performed: bool = False

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def build_ppr_execution_identity_v1(
    *,
    graph_revision: str,
    candidate_snapshot_revision: str,
    candidate_ordinal_map_checksum: str,
    graph_ordinal_map_checksum: str,
    candidate_ordinals: Sequence[int],
    edge_ordinals: Sequence[tuple[int, int]],
    seed_weights: Mapping[int, float],
    alpha: float = 0.85,
    epsilon: float = 1e-6,
    max_iterations: int = 100,
) -> PprExecutionIdentityV1:
    ordinals = tuple(sorted(candidate_ordinals))
    if not ordinals or any(isinstance(value, bool) or not isinstance(value, int) or value < 0 for value in ordinals):
        raise ValueError("PPR_CANDIDATE_ORDINALS_INVALID")
    if len(set(ordinals)) != len(ordinals):
        raise ValueError("PPR_CANDIDATE_ORDINAL_DUPLICATE")
    if not graph_revision.strip() or not candidate_snapshot_revision.strip():
        raise ValueError("PPR_REVISION_REQUIRED")
    for checksum in (candidate_ordinal_map_checksum, graph_ordinal_map_checksum):
        if len(checksum) != 71 or not checksum.startswith("sha256:") or any(c not in "0123456789abcdef" for c in checksum[7:]):
            raise ValueError("PPR_MAP_CHECKSUM_INVALID")
    if not 0.0 < alpha < 1.0 or not math.isfinite(alpha):
        raise ValueError("PPR_ALPHA_INVALID")
    if not 0.0 < epsilon or not math.isfinite(epsilon):
        raise ValueError("PPR_EPSILON_INVALID")
    if isinstance(max_iterations, bool) or max_iterations < 1:
        raise ValueError("PPR_MAX_ITERATIONS_INVALID")
    ordinal_set = set(ordinals)
    normalized_edges: list[tuple[int, int]] = []
    for src, dst in edge_ordinals:
        if src not in ordinal_set or dst not in ordinal_set:
            raise ValueError("PPR_EDGE_ORDINAL_UNKNOWN")
        normalized_edges.append((int(src), int(dst)))
    edges = tuple(sorted(normalized_edges))
    if len(set(edges)) != len(edges):
        raise ValueError("PPR_DUPLICATE_EDGE")
    normalized_seeds = normalize_seed_weights(seed_weights)
    if any(ordinal not in ordinal_set for ordinal, _ in normalized_seeds):
        raise ValueError("PPR_SEED_ORDINAL_UNKNOWN")
    return PprExecutionIdentityV1(
        graph_revision=graph_revision,
        candidate_snapshot_revision=candidate_snapshot_revision,
        candidate_ordinal_map_checksum=candidate_ordinal_map_checksum,
        graph_ordinal_map_checksum=graph_ordinal_map_checksum,
        candidate_ordinals=ordinals,
        edge_ordinals=edges,
        seed_weights=normalized_seeds,
        alpha=float(alpha),
        epsilon=float(epsilon),
        max_iterations=max_iterations,
    )


def dangling_ordinals(identity: PprExecutionIdentityV1) -> tuple[int, ...]:
    has_out_edge = {src for src, _ in identity.edge_ordinals}
    return tuple(ordinal for ordinal in identity.candidate_ordinals if ordinal not in has_out_edge)


def normalize_seed_weights(seed_weights: Mapping[int, float]) -> tuple[tuple[int, float], ...]:
    if not seed_weights:
        raise ValueError("PPR_SEEDS_REQUIRED")
    checked: list[tuple[int, float]] = []
    for ordinal, weight in seed_weights.items():
        if isinstance(ordinal, bool) or not isinstance(ordinal, int) or ordinal < 0:
            raise ValueError("PPR_SEED_ORDINAL_INVALID")
        if isinstance(weight, bool) or not math.isfinite(float(weight)) or float(weight) <= 0:
            raise ValueError("PPR_SEED_WEIGHT_INVALID")
        checked.append((ordinal, float(weight)))
    total = math.fsum(weight for _, weight in checked)
    return tuple((ordinal, weight / total) for ordinal, weight in sorted(checked))


def compare_ppr_v1(
    *,
    identity: PprExecutionIdentityV1,
    reference_receipt: GraphExecutionReceiptV2,
    challenger_receipt: GraphExecutionReceiptV2,
    reference_scores: Mapping[int, float],
    challenger_scores: Mapping[int, float],
    dangling_ordinals: Sequence[int],
    tolerance: float = 1e-5,
    rank_displacement_tolerance: float = 0.0,
) -> PprParityReceiptV1:
    if not math.isfinite(tolerance) or tolerance < 0:
        raise ValueError("PPR_PARITY_TOLERANCE_INVALID")
    if not math.isfinite(rank_displacement_tolerance) or rank_displacement_tolerance < 0:
        raise ValueError("PPR_RANK_DISPLACEMENT_TOLERANCE_INVALID")
    expected_input = identity.canonical_input_checksum()
    receipts = (reference_receipt, challenger_receipt)
    if any(
        receipt.status != "PROVEN"
        or receipt.operation != "GRAPH_PPR"
        or receipt.canonical_authority
        or receipt.writes_performed
        or receipt.input_checksum != expected_input
        or receipt.graph_revision != identity.graph_revision
        for receipt in receipts
    ):
        raise ValueError("PPR_PARITY_RECEIPT_IDENTITY_MISMATCH")
    if reference_receipt.effective_backend != "networkx":
        raise ValueError("PPR_PARITY_NETWORKX_RECEIPT_REQUIRED")
    if challenger_receipt.effective_backend != "cugraph":
        raise ValueError("PPR_PARITY_CUGRAPH_RECEIPT_REQUIRED")
    if (
        reference_receipt.node_count != len(identity.candidate_ordinals)
        or challenger_receipt.node_count != len(identity.candidate_ordinals)
        or reference_receipt.edge_count != len(identity.edge_ordinals)
        or challenger_receipt.edge_count != len(identity.edge_ordinals)
    ):
        raise ValueError("PPR_PARITY_GRAPH_SHAPE_MISMATCH")

    metrics = compare_ranked_scores(reference_scores, challenger_scores)
    reference_sum = float(metrics["referenceScoreSum"])
    challenger_sum = float(metrics["challengerScoreSum"])
    dangling = tuple(sorted(set(dangling_ordinals)))
    if not set(dangling).issubset(identity.candidate_ordinals):
        raise ValueError("PPR_DANGLING_ORDINAL_UNKNOWN")
    dangling_mass_ref = math.fsum(float(reference_scores[o]) for o in dangling)
    dangling_mass_chal = math.fsum(float(challenger_scores[o]) for o in dangling)
    max_error = float(metrics["scoreLInf"])
    max_rank_delta = int(metrics["maxAbsoluteRankDisplacement"])
    conserved = abs(reference_sum - 1.0) <= max(tolerance, 1e-12) and abs(challenger_sum - 1.0) <= max(tolerance, 1e-12)
    overlap_ok = all(
        float(item["fraction"]) == 1.0
        for item in dict(metrics["topKOverlap"]).values()  # type: ignore[arg-type]
    )
    status = (
        "PARITY_PROVEN"
        if max_error <= tolerance and overlap_ok and max_rank_delta <= rank_displacement_tolerance and conserved
        else "PARITY_DIVERGED"
    )
    return PprParityReceiptV1(
        schema="atlas.graph-ppr-parity-receipt.v1",
        input_checksum=expected_input,
        graph_revision=identity.graph_revision,
        candidate_snapshot_revision=identity.candidate_snapshot_revision,
        candidate_ordinal_map_checksum=identity.candidate_ordinal_map_checksum,
        graph_ordinal_map_checksum=identity.graph_ordinal_map_checksum,
        seed_weights=identity.seed_weights,
        alpha=identity.alpha,
        epsilon=identity.epsilon,
        max_iterations=identity.max_iterations,
        dangling_policy=identity.dangling_policy,
        dangling_ordinals=dangling,
        dangling_mass_reference=dangling_mass_ref,
        dangling_mass_challenger=dangling_mass_chal,
        reference_output_checksum=pagerank_scores_checksum(reference_scores),
        challenger_output_checksum=pagerank_scores_checksum(challenger_scores),
        metrics=metrics,
        tolerance=tolerance,
        status=status,
    )
