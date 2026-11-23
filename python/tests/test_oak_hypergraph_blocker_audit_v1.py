"""Unit tests for Valkey HyperLogLog PFCOUNT inspector and blocker audit."""
from __future__ import annotations

import pytest

from atlas_graph_runtime.oak_hypergraph_blocker_audit_v1 import (
    inspect_valkey_hll_cardinality_v1,
)


def test_inspect_valkey_hll_rejects_empty_keys() -> None:
    with pytest.raises(ValueError, match="HLL_KEYS_EMPTY"):
        inspect_valkey_hll_cardinality_v1([])


def test_inspect_valkey_hll_live_or_graceful_unreachable() -> None:
    res = inspect_valkey_hll_cardinality_v1(["atlas:hll:test:nonexistent"])
    assert res["canonicalAuthority"] is False
    assert res["writesPerformed"] is False
    assert res["monitoringOnly"] is True
    assert res["identityOrAuthAllowed"] is False
    if res["reachable"]:
        assert res["counts"]["atlas:hll:test:nonexistent"] == 0
