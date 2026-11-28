"""Tests for Arrow IPC CSR graph export schema and checksum parity (no GPJSON)."""
from __future__ import annotations

import pytest

from atlas_graph_runtime.arrow_csr_graph_export_v1 import (
    export_graph_to_arrow_csr_v1,
    roundtrip_verify_arrow_csr_v1,
)


def test_arrow_csr_graph_export_deterministic_and_roundtrip() -> None:
    nodes = ["pkt:c", "pkt:a", "pkt:b"]
    edges = [("pkt:a", "pkt:b", 1.0), ("pkt:a", "pkt:c", 0.5), ("pkt:b", "pkt:c", 2.0)]

    b1 = export_graph_to_arrow_csr_v1(nodes, edges, graph_revision="rev:1")
    b2 = export_graph_to_arrow_csr_v1(list(reversed(nodes)), list(reversed(edges)), graph_revision="rev:1")

    assert b1.canonical_authority is False
    assert b1.writes_performed is False
    assert b1.ordinal_map_checksum == b2.ordinal_map_checksum
    assert b1.csr_ipc_checksum == b2.csr_ipc_checksum
    assert b1.node_count == 3
    assert b1.edge_count == 3

    verified = roundtrip_verify_arrow_csr_v1(b1)
    assert verified["verified"] is True


def test_arrow_csr_rejects_unknown_node() -> None:
    with pytest.raises(ValueError, match="EDGE_NODE_NOT_IN_ORDINAL_MAP"):
        export_graph_to_arrow_csr_v1(["pkt:a"], [("pkt:a", "pkt:missing", 1.0)], graph_revision="rev:1")
