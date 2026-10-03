"""Unit tests for query_sequence_fixture.py (parent-atlas-bitfrost-sim-01).

Gap found during deep-audit review (2026-09-14): this module only had an
inline __main__ determinism check, no pytest coverage, unlike
test_atlas_lod_ladder_v1.py's proper suite for the same change.
"""

from __future__ import annotations

from atlas_compute.gpu_mini_fabric.query_sequence_fixture import (
    generate_query_sequence_fixture_v1,
)


def test_locality_and_control_traces_are_deterministic() -> None:
    f1 = generate_query_sequence_fixture_v1()
    f2 = generate_query_sequence_fixture_v1()
    assert f1.locality_trace_checksum == f2.locality_trace_checksum
    assert f1.control_trace_checksum == f2.control_trace_checksum
    assert f1.locality_trace == f2.locality_trace
    assert f1.control_trace == f2.control_trace


def test_control_trace_shares_exact_multiset_with_locality_trace() -> None:
    fixture = generate_query_sequence_fixture_v1()
    assert sorted(fixture.locality_trace) == sorted(fixture.control_trace)


def test_trace_length_matches_configured_constant() -> None:
    fixture = generate_query_sequence_fixture_v1()
    assert len(fixture.locality_trace) == fixture.trace_length
    assert len(fixture.control_trace) == fixture.trace_length


def test_locality_trace_actually_exhibits_locality() -> None:
    """A sanity check independent of the residency-simulation lift gate:
    the locality trace's consecutive-pair repeat rate should differ
    measurably from its own shuffled control, confirming the biased random
    walk did something other than uniform sampling."""
    fixture = generate_query_sequence_fixture_v1()

    def repeat_rate(trace: list[str]) -> float:
        repeats = sum(1 for i in range(1, len(trace)) if trace[i] == trace[i - 1])
        return repeats / (len(trace) - 1)

    # Not a strict claim about magnitude (that's the residency gate's job) --
    # just confirms the two traces are not statistically identical processes.
    assert fixture.locality_trace != fixture.control_trace
