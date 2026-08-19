from __future__ import annotations

import types

import pytest

from parent_atlas_policy import dspy_policy_program as mod


class FakePrediction(dict):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        for key, value in kwargs.items():
            setattr(self, key, value)


class FakeDspy:
    Prediction = FakePrediction


class Gold:
    allowed_actions = ["INSPECT_SOURCE", "PATCH"]
    action = "INSPECT_SOURCE"
    receipt_id = "execution-receipt:test"
    validation_passed = True
    exact_promotion_required = True
    exact_promotion_satisfied = True
    latency_ms = 20
    latency_budget_ms = 100
    tool_calls = 1
    tool_call_budget = 3
    feedback_context = "Exact source evidence existed."


class Pred:
    def __init__(self, action: str):
        self.action = action


def test_metric_rejects_action_outside_finite_set(monkeypatch):
    monkeypatch.setattr(mod, "_require_dspy", lambda: FakeDspy)
    result = mod.parent_atlas_gepa_metric(Gold(), Pred("DELETE_REPO"), None, "route", None)
    assert result.score == 0.0
    assert "Invalid action" in result.feedback


def test_metric_rewards_validated_historical_action(monkeypatch):
    monkeypatch.setattr(mod, "_require_dspy", lambda: FakeDspy)
    result = mod.parent_atlas_gepa_metric(Gold(), Pred("INSPECT_SOURCE"), None, "route", None)
    assert result.score == pytest.approx(1.0)
    assert "Executable validation passed" in result.feedback
    assert "Exact-promotion" in result.feedback


def test_metric_does_not_assume_unexecuted_legal_action_is_good(monkeypatch):
    monkeypatch.setattr(mod, "_require_dspy", lambda: FakeDspy)
    result = mod.parent_atlas_gepa_metric(Gold(), Pred("PATCH"), None, "route", None)
    assert result.score == pytest.approx(0.15)
    assert "Offline replay cannot assume" in result.feedback


def test_trajectory_requires_expected_action_in_allowed_set():
    with pytest.raises(ValueError):
        mod.trajectory_from_mapping(
            {
                "state": "s",
                "allowed_actions": ["INSPECT_SOURCE"],
                "expected_action": "PATCH",
            }
        )


def test_gepa_budget_requires_exactly_one_mode(monkeypatch):
    fake_gepa_calls = []

    class FakeGepa:
        def __init__(self, **kwargs):
            fake_gepa_calls.append(kwargs)

    fake_dspy = types.SimpleNamespace(GEPA=FakeGepa)
    monkeypatch.setattr(mod, "_require_dspy", lambda: fake_dspy)

    with pytest.raises(ValueError):
        mod.build_gepa_optimizer(
            reflection_lm=object(),
            auto="light",
            max_metric_calls=10,
        )

    mod.build_gepa_optimizer(reflection_lm=object(), auto="light")
    assert fake_gepa_calls[0]["candidate_selection_strategy"] == "pareto"
    assert fake_gepa_calls[0]["component_selector"] == "round_robin"
    assert fake_gepa_calls[0]["track_stats"] is True
