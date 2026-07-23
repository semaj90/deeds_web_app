import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "python/parent_atlas_networkx_pagerank.py"


def test_parent_atlas_networkx_pagerank_fixture():
    result = subprocess.run([sys.executable, str(SCRIPT)], capture_output=True, text=True, check=False)
    payload = json.loads(result.stdout)
    assert result.returncode == 0, payload
    assert payload["status"] == "NETWORKX_REFERENCE_PROVEN"
    assert payload["node_count"] == 6
    assert payload["edge_count"] == 5  # MATERIALIZES is fixture evidence, not a PageRank edge.
    assert "MATERIALIZES" not in payload["included_edge_types"]
    assert "SEMANTIC_SIMILAR" in payload["excluded_edge_types"]
    assert abs(sum(score["pagerankRaw"] for score in payload["scores"]) - 1.0) <= 1e-8
    assert all(score["pagerankRaw"] >= 0 for score in payload["scores"])
    assert max(payload["scores"], key=lambda score: score["pagerankRaw"])["nodeKey"] == "symbol:b"

    repeated = subprocess.run([sys.executable, str(SCRIPT)], capture_output=True, text=True, check=False)
    assert repeated.returncode == 0
    assert json.loads(repeated.stdout)["topology_hash"] == payload["topology_hash"]
    assert json.loads(repeated.stdout)["result_hash"] == payload["result_hash"]
