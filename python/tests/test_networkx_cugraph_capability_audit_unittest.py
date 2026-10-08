from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "atlas" / "audit-networkx-cugraph-capabilities-v1.py"
SPEC = importlib.util.spec_from_file_location("networkx_cugraph_capability_audit_v1", SCRIPT_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("NETWORKX_CUGRAPH_CAPABILITY_AUDIT_IMPORT_FAILED")
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


class NetworkXCugraphCapabilityAuditTests(unittest.TestCase):
    def test_collects_module_alias_and_direct_import_call_sites(self) -> None:
        source = """
import networkx as nx
from networkx import pagerank as rank

def run(graph):
    nx.pagerank(graph)
    rank(graph)
    nx.DiGraph()
"""
        calls = AUDIT.collect_networkx_calls(source, "fixture.py")
        self.assertEqual(
            [(call["api"], call["line"]) for call in calls],
            [("pagerank", 6), ("pagerank", 7), ("DiGraph", 8)],
        )

    def test_maps_backend_declaration_and_fallback_without_claiming_parity(self) -> None:
        calls = [
            {"api": "pagerank", "line": 1, "sourceRef": "fixture.py"},
            {"api": "strongly_connected_components", "line": 2, "sourceRef": "fixture.py"},
            {"api": "DiGraph", "line": 3, "sourceRef": "fixture.py"},
        ]
        records = AUDIT.classify_calls(calls, {"pagerank"})
        self.assertEqual(records[0]["status"], "GRAPH_CONSTRUCTION_NOT_ACCELERATION_CLASSIFIED")
        by_api = {record["api"]: record["status"] for record in records}
        self.assertEqual(by_api["pagerank"], "NX_CUGRAPH_API_DECLARED_PARITY_UNVERIFIED")
        self.assertEqual(by_api["strongly_connected_components"], "CPU_FALLBACK_REQUIRED_FOR_NX_CUGRAPH_26_6")

    def test_ignores_repository_helpers_with_networkx_in_module_name(self) -> None:
        source = "from .networkx_executor import run_personalized_pagerank\nrun_personalized_pagerank(graph)\n"
        self.assertEqual(AUDIT.collect_networkx_calls(source, "fixture.py"), [])


if __name__ == "__main__":
    unittest.main()
