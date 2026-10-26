"""Parent Atlas Learning Pipeline: Contracts, Strict Checker, Advisory Ranker, 8-Episode GRPO Group Rollout & ACE Packet Compiler."""

from __future__ import annotations

from .contracts import (
    CandidateFeature,
    FeatureSignalAlignmentV1,
    CheckResult,
    AcePacketProposalV1,
    EpisodeResult,
    EpisodeGroupReceiptV1,
)
from .strict_checker import check_episode
from .advisory_ranker import AdvisoryRanker, to_feature_matrix, train_advisory_step
from .episode_runner import run_episode_group_rollout
from .ace_compiler import compile_ace_packet_from_proposal

__all__ = [
    "CandidateFeature",
    "FeatureSignalAlignmentV1",
    "CheckResult",
    "AcePacketProposalV1",
    "EpisodeResult",
    "EpisodeGroupReceiptV1",
    "check_episode",
    "AdvisoryRanker",
    "to_feature_matrix",
    "train_advisory_step",
    "run_episode_group_rollout",
    "compile_ace_packet_from_proposal",
]
