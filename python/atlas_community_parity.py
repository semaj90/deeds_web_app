"""Backend-neutral community partition parity evaluator.

Compares two frozen partitions over the same canonical node universe using
label-invariant clustering metrics. Backend-local partition ids are never
compared directly.

Metrics:
- Adjusted Rand Index (ARI)
- Normalized Mutual Information (NMI)
- exact pairwise co-membership agreement
- modularity/count/singleton deltas

The module is CPU-only and intentionally independent from cuGraph/Neo4j so it
can evaluate outputs from any two executors.
"""

from __future__ import annotations

from collections import Counter
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator
from sklearn.metrics import adjusted_rand_score, normalized_mutual_info_score


class PartitionAssignmentV1(BaseModel):
    nodeId: str = Field(min_length=1)
    communityId: str = Field(min_length=1)


class CommunityParityInputV1(BaseModel):
    schema: Literal["atlas.community-parity-input.v1"] = "atlas.community-parity-input.v1"
    graphRevision: str = Field(min_length=1)
    projectionRevision: str = Field(min_length=1)
    topologyHash: str = Field(min_length=1)
    algorithm: Literal["louvain", "leiden"]
    oracleBackend: str = Field(min_length=1)
    challengerBackend: str = Field(min_length=1)
    oracleAssignments: list[PartitionAssignmentV1] = Field(min_length=1)
    challengerAssignments: list[PartitionAssignmentV1] = Field(min_length=1)
    oracleModularity: float | None = None
    challengerModularity: float | None = None

    @model_validator(mode="after")
    def validate_assignments(self) -> "CommunityParityInputV1":
        def ids(rows: list[PartitionAssignmentV1], label: str) -> set[str]:
            values = [row.nodeId for row in rows]
            if len(values) != len(set(values)):
                raise ValueError(f"{label} partition contains duplicate nodeId")
            return set(values)

        left = ids(self.oracleAssignments, "oracle")
        right = ids(self.challengerAssignments, "challenger")
        if left != right:
            raise ValueError("partition node universes differ")
        return self


class CommunityBackendParityReceiptV1(BaseModel):
    schema: Literal["atlas.community-backend-parity.v1"] = "atlas.community-backend-parity.v1"
    graphRevision: str
    projectionRevision: str
    topologyHash: str
    algorithm: Literal["louvain", "leiden"]
    oracleBackend: str
    challengerBackend: str
    nodeCount: int = Field(ge=1)
    adjustedRandIndex: float = Field(ge=-1.0, le=1.0)
    normalizedMutualInformation: float = Field(ge=0.0, le=1.0)
    pairwiseMembershipAgreement: float = Field(ge=0.0, le=1.0)
    oracleCommunityCount: int = Field(ge=1)
    challengerCommunityCount: int = Field(ge=1)
    communityCountDelta: int = Field(ge=0)
    oracleSingletonRatio: float = Field(ge=0.0, le=1.0)
    challengerSingletonRatio: float = Field(ge=0.0, le=1.0)
    singletonRatioDelta: float = Field(ge=0.0, le=1.0)
    oracleModularity: float | None
    challengerModularity: float | None
    modularityDelta: float | None
    status: Literal["PROVEN", "PARTIAL", "FAILED"]
    reasonCodes: list[str]


def _singleton_ratio(labels: list[str]) -> float:
    counts = Counter(labels)
    if not counts:
        return 0.0
    singleton_communities = sum(1 for count in counts.values() if count == 1)
    return singleton_communities / len(counts)


def _pairwise_membership_agreement(left: list[str], right: list[str]) -> float:
    n = len(left)
    if n <= 1:
        return 1.0
    agreed = 0
    total = 0
    for i in range(n):
        for j in range(i + 1, n):
            total += 1
            if (left[i] == left[j]) == (right[i] == right[j]):
                agreed += 1
    return agreed / total if total else 1.0


def compare_community_partitions_v1(
    payload: CommunityParityInputV1,
    *,
    min_ari: float = 0.95,
    min_nmi: float = 0.95,
    min_pairwise_agreement: float = 0.98,
    max_modularity_delta: float = 0.02,
) -> CommunityBackendParityReceiptV1:
    parsed = CommunityParityInputV1.model_validate(payload)
    oracle_map = {row.nodeId: row.communityId for row in parsed.oracleAssignments}
    challenger_map = {row.nodeId: row.communityId for row in parsed.challengerAssignments}
    node_ids = sorted(oracle_map)
    oracle_labels = [oracle_map[node_id] for node_id in node_ids]
    challenger_labels = [challenger_map[node_id] for node_id in node_ids]

    ari = float(adjusted_rand_score(oracle_labels, challenger_labels))
    nmi = float(normalized_mutual_info_score(oracle_labels, challenger_labels, average_method="arithmetic"))
    pairwise = _pairwise_membership_agreement(oracle_labels, challenger_labels)

    oracle_count = len(set(oracle_labels))
    challenger_count = len(set(challenger_labels))
    oracle_singleton = _singleton_ratio(oracle_labels)
    challenger_singleton = _singleton_ratio(challenger_labels)

    if parsed.oracleModularity is None or parsed.challengerModularity is None:
        modularity_delta = None
    else:
        modularity_delta = abs(float(parsed.oracleModularity) - float(parsed.challengerModularity))

    reasons: list[str] = []
    if ari < min_ari:
        reasons.append("ARI_BELOW_THRESHOLD")
    if nmi < min_nmi:
        reasons.append("NMI_BELOW_THRESHOLD")
    if pairwise < min_pairwise_agreement:
        reasons.append("PAIRWISE_MEMBERSHIP_AGREEMENT_BELOW_THRESHOLD")
    if modularity_delta is not None and modularity_delta > max_modularity_delta:
        reasons.append("MODULARITY_DELTA_ABOVE_THRESHOLD")
    if modularity_delta is None:
        reasons.append("MODULARITY_NOT_COMPARABLE")

    hard_fail = ari < 0.5 or nmi < 0.5 or pairwise < 0.75
    status: Literal["PROVEN", "PARTIAL", "FAILED"]
    if hard_fail:
        status = "FAILED"
    elif reasons:
        status = "PARTIAL"
    else:
        status = "PROVEN"

    return CommunityBackendParityReceiptV1(
        graphRevision=parsed.graphRevision,
        projectionRevision=parsed.projectionRevision,
        topologyHash=parsed.topologyHash,
        algorithm=parsed.algorithm,
        oracleBackend=parsed.oracleBackend,
        challengerBackend=parsed.challengerBackend,
        nodeCount=len(node_ids),
        adjustedRandIndex=ari,
        normalizedMutualInformation=nmi,
        pairwiseMembershipAgreement=pairwise,
        oracleCommunityCount=oracle_count,
        challengerCommunityCount=challenger_count,
        communityCountDelta=abs(oracle_count - challenger_count),
        oracleSingletonRatio=oracle_singleton,
        challengerSingletonRatio=challenger_singleton,
        singletonRatioDelta=abs(oracle_singleton - challenger_singleton),
        oracleModularity=parsed.oracleModularity,
        challengerModularity=parsed.challengerModularity,
        modularityDelta=modularity_delta,
        status=status,
        reasonCodes=reasons,
    )
