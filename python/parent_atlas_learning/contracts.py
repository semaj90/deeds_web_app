"""Typed dataclasses for Parent Atlas learning contracts."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence


@dataclass(frozen=True)
class CandidateFeature:
    """Fixed schema 8-dimensional numeric feature row grounded by packet identity."""
    packet_key: str
    evidence_ref: str
    semantic_score: float
    lexical_score: float
    graph_score: float
    dependency_score: float
    recency_score: float
    breadth_score: float
    risk_score: float
    provenance_score: float


@dataclass(frozen=True)
class FeatureSignalAlignmentV1:
    schema: str = "atlas.feature-signal-alignment.v1"
    version: str = "1.0.0"
    num_features: int = 8
    feature_names: Sequence[str] = (
        "semantic_score",
        "lexical_score",
        "graph_score",
        "dependency_score",
        "recency_score",
        "breadth_score",
        "risk_score",
        "provenance_score",
    )


@dataclass(frozen=True)
class CheckResult:
    """Strict deterministic checker outcome."""
    eligible: bool
    reward: float
    failures: tuple[str, ...] = ()
    diagnostics: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class AcePacketProposalV1:
    """Untrusted proposal from DSPy/agent before compiler admission."""
    schema: str
    taskId: str
    packetKey: str
    workspaceRevision: str
    sourceRevision: str
    contextManifestChecksum: str
    featureSchema: str
    modelRevision: str
    policyRevision: str
    evidenceRefs: Sequence[str]
    taskKind: str
    instruction: str
    advisoryOnly: bool = True


@dataclass(frozen=True)
class EpisodeResult:
    """Single episode rollout in an 8-episode evaluation group."""
    episode_id: int
    seed: int
    proposal: Mapping[str, Any]
    check: CheckResult
    reward_raw: float
    advantage: float = 0.0
    latency_ms: float = 0.0


@dataclass(frozen=True)
class EpisodeGroupReceiptV1:
    """Aggregate GRPO evaluation receipt across 8 isolated rollouts."""
    schema: str = "atlas.episode-group-receipt.v1"
    task_id: str = ""
    workspace_revision: str = "HEAD"
    context_manifest_checksum: str = ""
    num_episodes: int = 8
    episodes: Sequence[EpisodeResult] = field(default_factory=list)
    mean_reward: float = 0.0
    std_reward: float = 0.0
    eligible_count: int = 0
    immutable_sha256: str = ""
    canonical_authority: bool = False
    writes_performed: bool = False
