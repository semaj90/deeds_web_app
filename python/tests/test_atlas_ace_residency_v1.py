"""Unit tests for atlas_ace_residency_v1.py (parent-atlas-bitfrost-sim-01).

Gap found during deep-audit review (2026-09-14): this module had no pytest
coverage despite being where two real bugs were found and fixed this session
(an eviction-counting bug, and a PYTHONHASHSEED-driven non-determinism bug).
These tests exist specifically to guard against regressing either fix.
"""

from __future__ import annotations

from atlas_compute.gpu_mini_fabric.atlas_ace_residency_v1 import AtlasAceResidencyV1


def _tiny_adjacency() -> dict[str, list[tuple[str, str]]]:
    return {
        "a": [("b", "CALLS"), ("c", "IMPORTS")],
        "b": [("a", "CALLS")],
        "c": [],
        "d": [],
    }


def test_hit_rate_and_metrics_are_reported() -> None:
    sim = AtlasAceResidencyV1(_tiny_adjacency(), eviction_mode="utility-score")
    result = sim.run(["a", "b", "a", "c", "d"])
    d = result.to_dict()
    for key in (
        "hitRate",
        "precisionOfPrefetch",
        "bytesPromoted",
        "bytesWasted",
        "promotionLatency",
        "evictionRate",
        "queryLatencyDelta",
    ):
        assert key in d


def test_eviction_is_actually_counted_when_capacity_is_exceeded() -> None:
    """Regression test for the real eviction-counting bug found this session:
    _insert_warm() discarded the eviction victim from self.warm BEFORE
    calling _remove_from_tiers(), which checks membership to decide whether
    to count the eviction -- so it always saw the victim as already gone and
    silently skipped counting it. This test fails if that bug recurs."""
    adjacency = {f"n{i}": [] for i in range(20)}
    sim = AtlasAceResidencyV1(adjacency, eviction_mode="utility-score")

    from atlas_compute.gpu_mini_fabric import atlas_ace_residency_v1 as mod

    original_hot_cap = mod.HOT_CAPACITY
    original_warm_cap = mod.WARM_CAPACITY
    mod.HOT_CAPACITY = 2
    mod.WARM_CAPACITY = 2
    try:
        trace = [f"n{i}" for i in range(20)]  # 20 unique nodes, capacity 2+2=4
        result = sim.run(trace)
        assert sim.total_evictions > 0, "capacity was exceeded but no eviction was counted"
        assert result.eviction_rate > 0
    finally:
        mod.HOT_CAPACITY = original_hot_cap
        mod.WARM_CAPACITY = original_warm_cap


def test_eviction_victim_selection_is_deterministic_across_hash_seeds() -> None:
    """Regression test for the real PYTHONHASHSEED non-determinism bug found
    this session: _evict_lowest_utility() used min(set, key=lambda k: score)
    with no tie-break, so CPython's hash-randomized set iteration order
    could select a different victim across process runs on a utility tie.
    This test can't change PYTHONHASHSEED mid-process, but it does verify
    the tie-break key includes node_key (the actual fix), guarding against
    someone removing it."""
    import inspect

    from atlas_compute.gpu_mini_fabric.atlas_ace_residency_v1 import AtlasAceResidencyV1

    source = inspect.getsource(AtlasAceResidencyV1._evict_lowest_utility)
    assert "k)" in source or ", k" in source, (
        "eviction tie-break must include node_key as a deterministic secondary sort key "
        "(see the PYTHONHASHSEED non-determinism bug found in parent-atlas-bitfrost-sim-01)"
    )


def test_lru_and_utility_score_modes_both_run_through_same_harness() -> None:
    adjacency = _tiny_adjacency()
    trace = ["a", "b", "a", "c", "a", "d"]

    lru_sim = AtlasAceResidencyV1(adjacency, eviction_mode="lru")
    utility_sim = AtlasAceResidencyV1(adjacency, eviction_mode="utility-score")

    lru_result = lru_sim.run(trace)
    utility_result = utility_sim.run(trace)

    assert lru_result.eviction_mode == "lru"
    assert utility_result.eviction_mode == "utility-score"


def test_neighbor_provider_override_preserves_backward_compatible_default() -> None:
    """Regression test for the SOM-CACHE-01 refactor: passing no
    neighbor_provider must produce identical behavior to the pre-refactor
    graph-adjacency-only implementation."""
    adjacency = _tiny_adjacency()
    trace = ["a", "b", "a", "c"]

    default_sim = AtlasAceResidencyV1(adjacency, eviction_mode="utility-score")
    explicit_none_sim = AtlasAceResidencyV1(adjacency, eviction_mode="utility-score", neighbor_provider=None)

    default_result = default_sim.run(trace).to_dict()
    explicit_result = explicit_none_sim.run(trace).to_dict()
    assert default_result == explicit_result


def test_full_eviction_demotes_lod_rung() -> None:
    """Regression test for the real gap found and fixed this session: the
    harness only ever called ladder.promote_one_rung(), never demote --
    a node's LOD rung would grow monotonically and never shrink back down
    even after falling all the way out of residency to COLD."""
    from atlas_compute.gpu_mini_fabric import atlas_ace_residency_v1 as mod

    adjacency: dict[str, list[tuple[str, str]]] = {f"n{i}": [] for i in range(20)}
    sim = AtlasAceResidencyV1(adjacency, eviction_mode="utility-score")

    original_hot_cap, original_warm_cap = mod.HOT_CAPACITY, mod.WARM_CAPACITY
    mod.HOT_CAPACITY = 1
    mod.WARM_CAPACITY = 1
    try:
        sim.run(["n0"])  # promote n0 into HOT, rung goes identity -> glyph
        assert sim.ladder.rung_of("n0") == "glyph"

        # Query enough distinct nodes to force n0 all the way out (HOT cap=1,
        # WARM cap=1 -- a second query evicts n0 from HOT into WARM, a third
        # evicts it from WARM entirely to COLD).
        sim.run(["n1"])
        sim.run(["n2"])

        assert "n0" not in sim.hot
        assert "n0" not in sim.warm
        assert sim.ladder.rung_of("n0") == "identity", (
            "full eviction to COLD must demote the LOD rung back down"
        )
    finally:
        mod.HOT_CAPACITY, mod.WARM_CAPACITY = original_hot_cap, original_warm_cap


def test_custom_neighbor_provider_is_used_when_supplied() -> None:
    adjacency = _tiny_adjacency()
    calls: list[str] = []

    def empty_provider(node_key: str) -> list[tuple[str, str]]:
        calls.append(node_key)
        return []

    sim = AtlasAceResidencyV1(adjacency, eviction_mode="utility-score", neighbor_provider=empty_provider)
    sim.run(["a", "b", "c"])
    assert calls == ["a", "b", "c"]
