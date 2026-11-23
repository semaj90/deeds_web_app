"""Experimental preference-ranking diagnostic, array builder, 4D topology projection, and O(1) linked queue.

Per AGENTS.md:
  - Preference diagnostics are not PPO/GRPO policy optimization or model training.
  - 4D topology/UMAP coordinates are derived metadata only (never identity or a retrieval vote).
  - Read-only / non-canonical (`canonicalAuthority=False`, `writesPerformed=False`, `promotionAllowed=False`).
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import numpy as np


@dataclass
class _ListNode:
    key: str
    value: Any
    byte_size: int
    prev: _ListNode | None = None
    next: _ListNode | None = None


class BoundedLinkedQueueV1:
    """O(1) doubly-linked FIFO/LRU queue with bounded item count and byte budget."""

    def __init__(self, *, max_items: int = 256, max_bytes: int = 1024 * 1024) -> None:
        if max_items < 1 or max_bytes < 1:
            raise ValueError("QUEUE_BOUNDS_INVALID")
        self.max_items = int(max_items)
        self.max_bytes = int(max_bytes)
        self._nodes: dict[str, _ListNode] = {}
        self._head: _ListNode | None = None
        self._tail: _ListNode | None = None
        self.total_bytes = 0

    def __len__(self) -> int:
        return len(self._nodes)

    def _unlink(self, node: _ListNode) -> None:
        if node.prev is not None:
            node.prev.next = node.next
        else:
            self._head = node.next
        if node.next is not None:
            node.next.prev = node.prev
        else:
            self._tail = node.prev
        node.prev = None
        node.next = None

    def _append_tail(self, node: _ListNode) -> None:
        node.prev = self._tail
        node.next = None
        if self._tail is not None:
            self._tail.next = node
        else:
            self._head = node
        self._tail = node

    def push_or_touch(self, key: str, value: Any, *, byte_size: int = 1) -> list[str]:
        if byte_size < 0 or byte_size > self.max_bytes:
            raise ValueError("QUEUE_ITEM_EXCEEDS_MAX_BYTES")
        evicted: list[str] = []
        existing = self._nodes.get(key)
        if existing is not None:
            self.total_bytes -= existing.byte_size
            existing.value = value
            existing.byte_size = byte_size
            self.total_bytes += byte_size
            self._unlink(existing)
            self._append_tail(existing)
        else:
            node = _ListNode(key=key, value=value, byte_size=byte_size)
            self._nodes[key] = node
            self._append_tail(node)
            self.total_bytes += byte_size

        while len(self._nodes) > self.max_items or self.total_bytes > self.max_bytes:
            oldest = self._head
            if oldest is None:
                break
            self._unlink(oldest)
            del self._nodes[oldest.key]
            self.total_bytes -= oldest.byte_size
            evicted.append(oldest.key)
        return evicted

    def pop_front(self) -> tuple[str, Any] | None:
        node = self._head
        if node is None:
            return None
        self._unlink(node)
        del self._nodes[node.key]
        self.total_bytes -= node.byte_size
        return node.key, node.value

    def keys_in_order(self) -> list[str]:
        out: list[str] = []
        cur = self._head
        while cur is not None:
            out.append(cur.key)
            cur = cur.next
        return out


def build_feature_and_topology_arrays_v1(
    rows: Sequence[Sequence[float]],
    *,
    prefer_cuml_umap: bool = False,
) -> dict[str, Any]:
    """Build contiguous float32 [N, D] feature array and derived 4D TopologyCoordinate4V1 array."""
    arr = np.ascontiguousarray(np.asarray(rows, dtype=np.float32))
    if arr.ndim != 2 or arr.shape[0] == 0 or arr.shape[1] == 0:
        raise ValueError("ARRAY_SHAPE_INVALID")

    backend = "cpu_svd_4d"
    if prefer_cuml_umap:
        try:
            import cuml  # type: ignore  # noqa: F401
            # Live WSL2 cuML path only when explicitly reachable; CPU remains oracle.
            backend = "cuml_available_cpu_oracle"
        except ImportError:
            backend = "cpu_svd_4d_cuml_unavailable"

    centered = arr - np.mean(arr, axis=0, keepdims=True)
    _u, _s, vt = np.linalg.svd(centered, full_matrices=False)
    k = min(4, vt.shape[0])
    proj = centered @ vt[:k].T
    if k < 4:
        pad = np.zeros((arr.shape[0], 4 - k), dtype=np.float32)
        topo4 = np.ascontiguousarray(np.hstack([proj, pad]), dtype=np.float32)
    else:
        topo4 = np.ascontiguousarray(proj[:, :4], dtype=np.float32)

    return {
        "featureArray": arr,
        "topology4Array": topo4,
        "featureShape": list(arr.shape),
        "topologyShape": list(topo4.shape),
        "featureChecksum": f"sha256:{hashlib.sha256(arr.tobytes()).hexdigest()}",
        "topologyChecksum": f"sha256:{hashlib.sha256(topo4.tobytes()).hexdigest()}",
        "topologyBackend": backend,
        "derivedMetadataOnly": True,
        "canonicalAuthority": False,
    }


def run_mcts_grpo_rollout_v1(
    pairs: Sequence[dict[str, Any]],
    *,
    max_simulations: int = 32,
    c_puct: float = 1.4,
) -> dict[str, Any]:
    """Run a bounded MCTS ranking diagnostic; this is not PPO/GRPO policy training."""
    if not pairs:
        return {
            "schema": "atlas.mcts-preference-diagnostic.v1",
            "status": "EMPTY_PAIRS",
            "experimentalLane": True,
            "promotionAllowed": False,
            "canonicalAuthority": False,
            "writesPerformed": False,
            "trainingRunPerformed": False,
            "policyUpdated": False,
        }
    sims = min(64, max(1, int(max_simulations)))
    queue = BoundedLinkedQueueV1(max_items=max(8, len(pairs) * 2), max_bytes=64 * 1024)

    n_actions = len(pairs)
    visits = np.zeros(n_actions, dtype=np.int32)
    value_sum = np.zeros(n_actions, dtype=np.float64)
    priors = np.full(n_actions, 1.0 / n_actions, dtype=np.float64)

    rewards = []
    for idx, pair in enumerate(pairs):
        if (
            pair.get("schema") != "atlas.verified-preference-pair.v1"
            or pair.get("rewardSource") != "INDEPENDENTLY_VERIFIED"
            or pair.get("trainingEligible") is not True
            or not str(pair.get("rewardReceiptId") or "").strip()
            or not isinstance(pair.get("evidenceRefs"), list)
            or not pair["evidenceRefs"]
        ):
            raise ValueError("PREFERENCE_PAIR_NOT_INDEPENDENTLY_VERIFIED")
        try:
            chosen_r = float(pair["chosenReward"])
            rejected_r = float(pair["rejectedReward"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("VERIFIED_PAIR_REWARDS_REQUIRED") from exc
        if not (math.isfinite(chosen_r) and math.isfinite(rejected_r)):
            raise ValueError("VERIFIED_PAIR_REWARD_NOT_FINITE")
        if chosen_r < rejected_r:
            raise ValueError("VERIFIED_REWARD_ORDER_INVALID")
        margin = max(0.0, min(1.0, chosen_r - rejected_r))
        rewards.append(margin)
        queue.push_or_touch(f"pair:{idx}", {"chosen": pair.get("chosen"), "margin": margin}, byte_size=64)

    for step in range(1, sims + 1):
        sqrt_total = math.sqrt(step)
        q_vals = np.divide(value_sum, np.maximum(1, visits))
        u_vals = c_puct * priors * (sqrt_total / (1.0 + visits))
        arm = int(np.argmax(q_vals + u_vals))
        visits[arm] += 1
        value_sum[arm] += rewards[arm]
        queue.push_or_touch(f"pair:{arm}", {"visits": int(visits[arm]), "reward": rewards[arm]}, byte_size=64)

    mean_reward = float(np.mean(rewards))
    std_reward = float(np.std(rewards)) + 1e-6
    advantages = [round((r - mean_reward) / std_reward, 6) for r in rewards]
    best_arm = int(np.argmax(visits))

    return {
        "schema": "atlas.mcts-preference-diagnostic.v1",
        "status": "ROLLOUT_COMPLETE",
        "simulations": sims,
        "pairCount": n_actions,
        "bestPairIndex": best_arm,
        "visitCounts": visits.tolist(),
        "normalizedRewardMargins": advantages,
        "queueTailOrder": queue.keys_in_order(),
        "rewardSource": "INDEPENDENTLY_VERIFIED_INPUT",
        "experimentalLane": True,
        "promotionAllowed": False,
        "canonicalAuthority": False,
        "writesPerformed": False,
        "trainingRunPerformed": False,
        "policyUpdated": False,
    }


def load_grpo_pairs_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            row = json.loads(line)
            if not isinstance(row, dict):
                raise ValueError("VERIFIED_PREFERENCE_ROW_OBJECT_REQUIRED")
            if (
                row.get("schema") != "atlas.verified-preference-pair.v1"
                or row.get("rewardSource") != "INDEPENDENTLY_VERIFIED"
                or row.get("trainingEligible") is not True
                or not str(row.get("rewardReceiptId") or "").strip()
                or not isinstance(row.get("evidenceRefs"), list)
                or not row["evidenceRefs"]
            ):
                raise ValueError("PREFERENCE_PAIR_NOT_INDEPENDENTLY_VERIFIED")
            rows.append(row)
    return rows
