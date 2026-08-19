from __future__ import annotations

import numpy as np
import pytest

pytest.importorskip("gymnasium")

from parent_atlas_policy.parent_atlas_gym_env import (
    ACTIONS,
    OBSERVATION_DIM,
    ParentAtlasReplayEnv,
    ReplayEpisode,
    ReplayStep,
)
from parent_atlas_policy.ppo_policy_env import RewardComponents


def vec(value: float) -> list[float]:
    return [value] * OBSERVATION_DIM


def make_episode() -> ReplayEpisode:
    return ReplayEpisode(
        episode_id="episode:test:1",
        workspace_revision="ws:742",
        source_receipt_refs=("receipt:1",),
        steps=(
            ReplayStep(
                observation=vec(0.0),
                expected_action="SEMANTIC_SEARCH",
                next_observation=vec(0.25),
                reward_components=RewardComponents(retrieval_gain=0.5),
            ),
            ReplayStep(
                observation=vec(0.25),
                expected_action="TEST",
                next_observation=vec(1.0),
                reward_components=RewardComponents(test_success=1.0),
                terminated=True,
            ),
        ),
    )


def test_reset_is_seeded_and_replay_only() -> None:
    env = ParentAtlasReplayEnv([make_episode()])
    observation, info = env.reset(seed=123, options={"episode_index": 0})
    assert observation.dtype == np.float32
    assert observation.shape == (OBSERVATION_DIM,)
    assert info["replay_only"] is True
    assert info["workspace_revision"] == "ws:742"


def test_matching_action_receives_recorded_reward() -> None:
    env = ParentAtlasReplayEnv([make_episode()])
    env.reset(options={"episode_index": 0})
    action = ACTIONS.index("SEMANTIC_SEARCH")
    _, reward, terminated, truncated, info = env.step(action)
    assert reward == pytest.approx(0.5)
    assert terminated is False
    assert truncated is False
    assert info["action_matches_replay"] is True


def test_mismatched_action_is_penalized_without_live_side_effects() -> None:
    env = ParentAtlasReplayEnv([make_episode()], action_mismatch_penalty=2.0)
    env.reset(options={"episode_index": 0})
    action = ACTIONS.index("PATCH")
    _, reward, _, _, info = env.step(action)
    assert reward == pytest.approx(-1.5)
    assert info["selected_action"] == "PATCH"
    assert info["expected_action"] == "SEMANTIC_SEARCH"
    assert info["replay_only"] is True


def test_invalid_observation_dimension_fails_closed() -> None:
    episode = ReplayEpisode(
        episode_id="bad",
        workspace_revision="ws:1",
        source_receipt_refs=(),
        steps=(ReplayStep(
            observation=[0.0],
            expected_action="TERMINATE",
            next_observation=[0.0],
        ),),
    )
    with pytest.raises(ValueError, match="observation must have"):
        ParentAtlasReplayEnv([episode])
