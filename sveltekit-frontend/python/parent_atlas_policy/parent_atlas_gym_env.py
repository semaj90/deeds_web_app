"""Offline/replay Gymnasium environment for Parent Atlas policy experiments.

This environment wraps the existing finite ACTIONS / RewardComponents contract
from ppo_policy_env.py. It NEVER invokes live MCP/gRPC mutation tools. Episodes
are immutable replay records derived from validated ExecutionLearningRecordV1
trajectories so PPO/TorchRL can be evaluated without mutating the repository.

TODO(TEST-LATER): add a loader from TrainingDatasetSnapshotV1 JSONL/Arrow once the
receipt-derived dataset materializer is wired.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Sequence

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from .ppo_policy_env import ACTIONS, RewardComponents

OBSERVATION_DIM = 16


@dataclass(frozen=True)
class ReplayStep:
    """One immutable transition captured from a historical Atlas execution."""

    observation: Sequence[float]
    expected_action: str
    next_observation: Sequence[float]
    reward_components: RewardComponents = RewardComponents()
    terminated: bool = False
    truncated: bool = False
    info: Mapping[str, Any] | None = None

    def validate(self) -> None:
        if self.expected_action not in ACTIONS:
            raise ValueError(f"unknown expected_action={self.expected_action!r}")
        if len(self.observation) != OBSERVATION_DIM:
            raise ValueError(f"observation must have {OBSERVATION_DIM} features")
        if len(self.next_observation) != OBSERVATION_DIM:
            raise ValueError(f"next_observation must have {OBSERVATION_DIM} features")
        if not np.all(np.isfinite(np.asarray(self.observation, dtype=np.float32))):
            raise ValueError("observation contains non-finite values")
        if not np.all(np.isfinite(np.asarray(self.next_observation, dtype=np.float32))):
            raise ValueError("next_observation contains non-finite values")


@dataclass(frozen=True)
class ReplayEpisode:
    episode_id: str
    steps: Sequence[ReplayStep]
    workspace_revision: str
    source_receipt_refs: Sequence[str]

    def validate(self) -> None:
        if not self.episode_id:
            raise ValueError("episode_id is required")
        if not self.workspace_revision:
            raise ValueError("workspace_revision is required")
        if not self.steps:
            raise ValueError("episode must contain at least one transition")
        for step in self.steps:
            step.validate()


class ParentAtlasReplayEnv(gym.Env[np.ndarray, int]):
    """Finite-action, mutation-free Parent Atlas replay environment.

    Reward is the recorded deterministic reward plus an invalid-action penalty if
    the learned policy chooses a different action from the immutable historical
    transition. This first experiment therefore learns/compares routing behavior;
    it does not pretend to simulate unseen tool outcomes.

    Future model-based/counterfactual environments must be separately versioned
    rather than changing these replay semantics.
    """

    metadata = {"render_modes": []}

    def __init__(
        self,
        episodes: Iterable[ReplayEpisode],
        *,
        action_mismatch_penalty: float = 1.0,
        max_steps: int | None = None,
    ) -> None:
        super().__init__()
        self._episodes = list(episodes)
        if not self._episodes:
            raise ValueError("at least one replay episode is required")
        for episode in self._episodes:
            episode.validate()

        self.action_space = spaces.Discrete(len(ACTIONS))
        self.observation_space = spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(OBSERVATION_DIM,),
            dtype=np.float32,
        )
        self._action_mismatch_penalty = float(action_mismatch_penalty)
        self._max_steps = max_steps
        self._episode: ReplayEpisode | None = None
        self._step_index = 0

    def reset(
        self,
        *,
        seed: int | None = None,
        options: dict[str, Any] | None = None,
    ) -> tuple[np.ndarray, dict[str, Any]]:
        super().reset(seed=seed)
        requested = (options or {}).get("episode_index")
        if requested is None:
            episode_index = int(self.np_random.integers(0, len(self._episodes)))
        else:
            episode_index = int(requested)
            if episode_index < 0 or episode_index >= len(self._episodes):
                raise IndexError("episode_index out of range")

        self._episode = self._episodes[episode_index]
        self._step_index = 0
        step = self._episode.steps[0]
        obs = np.asarray(step.observation, dtype=np.float32)
        return obs, {
            "episode_id": self._episode.episode_id,
            "workspace_revision": self._episode.workspace_revision,
            "source_receipt_refs": list(self._episode.source_receipt_refs),
            "replay_only": True,
        }

    def step(self, action: int) -> tuple[np.ndarray, float, bool, bool, dict[str, Any]]:
        if self._episode is None:
            raise RuntimeError("reset() must be called before step()")
        if not self.action_space.contains(action):
            raise ValueError(f"invalid action index={action}")

        transition = self._episode.steps[self._step_index]
        selected_action = ACTIONS[int(action)]
        action_matches = selected_action == transition.expected_action
        reward = float(transition.reward_components.total)
        if not action_matches:
            reward -= self._action_mismatch_penalty

        self._step_index += 1
        exhausted = self._step_index >= len(self._episode.steps)
        maxed = self._max_steps is not None and self._step_index >= self._max_steps
        terminated = bool(transition.terminated or exhausted)
        truncated = bool(transition.truncated or maxed)

        next_obs = np.asarray(transition.next_observation, dtype=np.float32)
        info = {
            **dict(transition.info or {}),
            "episode_id": self._episode.episode_id,
            "step_index": self._step_index - 1,
            "selected_action": selected_action,
            "expected_action": transition.expected_action,
            "action_matches_replay": action_matches,
            "recorded_reward": float(transition.reward_components.total),
            "replay_only": True,
        }
        return next_obs, reward, terminated, truncated, info


__all__ = [
    "ACTIONS",
    "OBSERVATION_DIM",
    "ParentAtlasReplayEnv",
    "ReplayEpisode",
    "ReplayStep",
]
