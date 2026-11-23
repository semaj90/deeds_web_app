"""Tests for BeautifulSoup + Pydantic .okf HTML HyperGraphRAG packet extractor."""
from __future__ import annotations

from pathlib import Path

from atlas_graph_runtime.okf_html_hypergraph_extractor_v1 import (
    extract_okf_html_batch_v1,
    extract_okf_html_packet_v1,
)


def test_extract_okf_html_packet_v1_fixture(tmp_path: Path) -> None:
    sample = tmp_path / "gepa_overview.html"
    sample.write_text(
        "<html><head><title>DSPy GEPA Guide</title></head>"
        "<body><h1>GEPA</h1><p>GEPA optimizes DSPy predictors and retrieval metrics.</p>"
        "<a href='https://dspy.ai/'>DSPy</a></body></html>",
        encoding="utf-8",
    )
    pkt = extract_okf_html_packet_v1(sample, repo_root=tmp_path)
    assert pkt.canonicalAuthority is False
    assert pkt.writesPerformed is False
    assert pkt.hiddenStatePersisted is False
    assert pkt.status == "PROPOSED"
    assert pkt.sourceRef == "gepa_overview.html"
    assert "dspy_gepa" in pkt.domain_taxonomy
    assert "https://dspy.ai/" in pkt.citations
    assert len(pkt.keywords) > 0
    assert len(pkt.candidates) > 0


def test_extract_okf_html_batch_v1_live_repo_subset() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    docs_dir = repo_root / ".okf" / "docs" / "dspy"
    batch = extract_okf_html_batch_v1(docs_dir, limit=3, repo_root=repo_root)
    assert batch["canonicalAuthority"] is False
    assert batch["writesPerformed"] is False
    assert batch["processedCount"] == 3
    for pkt in batch["packets"]:
        assert pkt["status"] == "PROPOSED"
        assert pkt["sourceSha256"].startswith("sha256:")
