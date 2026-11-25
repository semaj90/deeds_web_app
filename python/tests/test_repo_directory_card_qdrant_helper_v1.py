from __future__ import annotations

from pathlib import Path

import numpy as np

from atlas_compute.repo_directory_card_qdrant_helper_v1 import (
    SCHEMA_UNIVERSAL_DIR_CARD_V1,
    build_all_directory_cards_multicore_v1,
    card_id_for_dir,
    compute_gpu_directory_graph_and_rank_v1,
    sync_directory_cards_to_qdrant_v1,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_OBO = Path(__file__).resolve().parent / "fixtures" / "doc14-software-review-fixture.obo"


def test_multicore_directory_card_builder_and_gpu_parity(tmp_path: Path) -> None:
    src_dir = tmp_path / "python" / "atlas_compute"
    mcp_dir = tmp_path / "sveltekit-frontend" / "src" / "mcp"
    src_dir.mkdir(parents=True)
    mcp_dir.mkdir(parents=True)

    (src_dir / "LLMS.md").write_text("# Atlas Compute\nGPU ranking and OBO CSR bridges.\n", encoding="utf-8")
    (src_dir / "ranker.py").write_text(
        "def compute_fusion_rank():\n    return 1.0\n\nclass OboBridge:\n    pass\n",
        encoding="utf-8",
    )
    (mcp_dir / "trace.ts").write_text(
        "export function startTraceServer() {}\nserver.registerTool('trace.kag_search', {});\n",
        encoding="utf-8",
    )

    by_dir = {
        "python/atlas_compute": ["python/atlas_compute/LLMS.md", "python/atlas_compute/ranker.py"],
        "sveltekit-frontend/src/mcp": ["sveltekit-frontend/src/mcp/trace.ts"],
    }
    cards, stats = build_all_directory_cards_multicore_v1(
        tmp_path,
        by_dir=by_dir,
        obo_path=REPO_ROOT / ".okf" / "ontologies" / "atlas-domain-and-language-terms-v1.obo",
        max_workers=2,
    )

    assert stats["totalDirectories"] == 2
    assert stats["withOboConcepts"] >= 1
    assert any(c.obo_bitset_hex_64b != "00" * 64 for c in cards)
    assert all(c.schema == SCHEMA_UNIVERSAL_DIR_CARD_V1 for c in cards)
    assert all(c.canonical_authority is False for c in cards)
    assert card_id_for_dir("python/atlas_compute") == "agents:dir:python-atlas-compute"

    by_path = {c.dir_path: c for c in cards}
    assert "compute_fusion_rank" in by_path["python/atlas_compute"].top_symbols
    assert "trace.kag_search" in by_path["sveltekit-frontend/src/mcp"].mcp_tools
    assert by_path["sveltekit-frontend/src/mcp"].frontend_alias_path == "src/mcp"

    rng = np.random.default_rng(42)
    raw = rng.standard_normal((2, 64)).astype(np.float32)
    embs = raw / np.linalg.norm(raw, axis=1, keepdims=True)
    ranked, receipt = compute_gpu_directory_graph_and_rank_v1(cards, embs, prefer_cuda=True)

    assert len(ranked) == 2
    assert receipt["cpuParityMaxAbsDiff"] < 1e-4
    assert all(r.fusion_rank > 0.0 for r in ranked)
    assert all(len(r.semantic_neighbors) == 1 for r in ranked)

    offline_jsonl = tmp_path / "qdrant_ready.jsonl"
    q_res = sync_directory_cards_to_qdrant_v1(
        ranked,
        embs,
        qdrant_url="http://127.0.0.1:59999",
        offline_jsonl_path=offline_jsonl,
        timeout_seconds=0.2,
    )
    assert q_res["qdrantStatus"] == "QUEUED_OFFLINE_DOCKER_PAUSED"
    assert offline_jsonl.is_file()
    assert len(offline_jsonl.read_text(encoding="utf-8").strip().splitlines()) == 2
