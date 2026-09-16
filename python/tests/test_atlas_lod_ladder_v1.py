"""Unit tests for AtlasLodLadderV1 (parent-atlas-bitfrost-sim-01, tasks.md 3.4).

Covers: a single-rung promotion succeeds without an override; a skipped-rung
promotion is caught (rejected, or accepted-with-logged-override) even when a
concurrent residency-tier promotion for the same node succeeds -- the two
state machines are validated independently per the
atlas-lod-promotion-ladder spec's "validated independently" requirement.
"""

from __future__ import annotations

from atlas_compute.gpu_mini_fabric.atlas_lod_ladder_v1 import AtlasLodLadderV1
from atlas_compute.gpu_mini_fabric.atlas_ace_residency_v1 import AtlasAceResidencyV1


def test_single_rung_promotion_succeeds_without_override() -> None:
    ladder = AtlasLodLadderV1()
    event = ladder.promote_one_rung("node-a")
    assert event.accepted is True
    assert event.from_rung == "identity"
    assert event.to_rung == "glyph"
    assert event.override_reason is None
    assert event.skipped_rungs == 0


def test_explicit_single_rung_request_succeeds_without_override() -> None:
    ladder = AtlasLodLadderV1()
    event = ladder.request_transition("node-a", "glyph")
    assert event.accepted is True
    assert event.override_reason is None


def test_skipped_rung_is_rejected_without_override_reason() -> None:
    ladder = AtlasLodLadderV1()
    event = ladder.request_transition("node-a", "semantic768")
    assert event.accepted is False
    assert event.skipped_rungs == 3
    assert event.to_rung == "identity"  # unchanged -- rejected


def test_skipped_rung_is_accepted_and_logged_with_override_reason() -> None:
    ladder = AtlasLodLadderV1()
    event = ladder.request_transition("node-a", "semantic768", override_reason="forced-refresh")
    assert event.accepted is True
    assert event.override_reason == "forced-refresh"
    assert event.to_rung == "semantic768"


def test_ladder_violation_detected_independently_of_residency_promotion_success() -> None:
    """A ladder-ordering violation is detected even when the corresponding
    residency-tier promotion for the same node succeeds -- the two state
    machines never mask each other's defects."""
    adjacency: dict[str, list[tuple[str, str]]] = {"node-a": [], "node-b": []}
    residency = AtlasAceResidencyV1(adjacency, eviction_mode="utility-score")

    # Residency promotion of node-a succeeds (single query -> promoted to HOT).
    residency.run(["node-a"])
    assert "node-a" in residency.hot  # residency promotion SUCCEEDED

    # A skip-rung LOD transition on the SAME node is independently rejected,
    # regardless of the residency promotion's own success.
    event = residency.ladder.request_transition("node-a", "prompt_ready")
    assert event.accepted is False
    assert event.skipped_rungs > 0
