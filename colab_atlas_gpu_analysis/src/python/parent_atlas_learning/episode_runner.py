"""8-Episode group rollout runner and group relative advantage calculator for GRPO."""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any, Callable, Mapping, Sequence, Set
from .contracts import CheckResult, EpisodeGroupReceiptV1, EpisodeResult
from .strict_checker import check_episode


def compute_group_advantages(rewards: Sequence[float], eps: float = 1e-6) -> tuple[float, float, list[float]]:
    """Compute standardized group relative advantage: A_i = (R_i - mean) / (std + eps)."""
    n = len(rewards)
    if n == 0:
        return 0.0, 0.0, []

    mean = sum(rewards) / n
    variance = sum((r - mean) ** 2 for r in rewards) / n
    std = math.sqrt(variance)

    if std < eps:
        # If all rewards are identical, advantage is 0.0
        advantages = [0.0 for _ in rewards]
    else:
        advantages = [round((r - mean) / (std + eps), 4) for r in rewards]

    return round(mean, 4), round(std, 4), advantages


def run_episode_group_rollout(
    task_id: str,
    *,
    allowed_evidence: Set[str],
    proposals: Sequence[Mapping[str, Any]],
    test_outcomes: Sequence[bool],
    scope_outcomes: Sequence[bool],
    latencies_ms: Sequence[float] | None = None,
    context_manifest_checksum: str = "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    workspace_revision: str = "HEAD",
) -> EpisodeGroupReceiptV1:
    """Execute an 8-episode evaluation group against the strict deterministic checker.

    Computes group relative advantage across all 8 rollouts and signs an immutable receipt.
    """
    num_episodes = len(proposals)
    if latencies_ms is None:
        latencies_ms = [100.0 + i * 20.0 for i in range(num_episodes)]

    raw_episodes: list[tuple[int, Mapping[str, Any], CheckResult, float]] = []

    for i in range(num_episodes):
        proposal = proposals[i]
        tests_passed = test_outcomes[i] if i < len(test_outcomes) else False
        scope_valid = scope_outcomes[i] if i < len(scope_outcomes) else False
        lat_ms = latencies_ms[i] if i < len(latencies_ms) else 100.0

        chk = check_episode(
            proposal,
            allowed_evidence=allowed_evidence,
            approved_task_id=task_id,
            tests_passed=tests_passed,
            scope_valid=scope_valid,
            latency_ms=lat_ms,
        )
        raw_episodes.append((i, proposal, chk, lat_ms))

    raw_rewards = [chk.reward for _, _, chk, _ in raw_episodes]
    mean_reward, std_reward, advantages = compute_group_advantages(raw_rewards)

    episodes: list[EpisodeResult] = []
    eligible_count = 0

    for (idx, prop, chk, lat_ms), adv in zip(raw_episodes, advantages):
        if chk.eligible:
            eligible_count += 1
        episodes.append(
            EpisodeResult(
                episode_id=idx,
                seed=1000 + idx,
                proposal=prop,
                check=chk,
                reward_raw=chk.reward,
                advantage=adv,
                latency_ms=lat_ms,
            )
        )

    receipt_body = {
        "schema": "atlas.episode-group-receipt.v1",
        "taskId": task_id,
        "workspaceRevision": workspace_revision,
        "contextManifestChecksum": context_manifest_checksum,
        "numEpisodes": num_episodes,
        "meanReward": mean_reward,
        "stdReward": std_reward,
        "eligibleCount": eligible_count,
        "rewards": raw_rewards,
        "advantages": advantages,
    }
    serialized = json.dumps(receipt_body, sort_keys=True, separators=(",", ":"))
    sha = hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    return EpisodeGroupReceiptV1(
        schema="atlas.episode-group-receipt.v1",
        task_id=task_id,
        workspace_revision=workspace_revision,
        context_manifest_checksum=context_manifest_checksum,
        num_episodes=num_episodes,
        episodes=episodes,
        mean_reward=mean_reward,
        std_reward=std_reward,
        eligible_count=eligible_count,
        immutable_sha256=f"sha256:{sha}",
        canonical_authority=False,
        writes_performed=False,
    )
