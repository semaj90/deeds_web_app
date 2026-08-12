import asyncio
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
    assert payload["node_count"] > 0
    assert "MATERIALIZES" not in payload["included_edge_types"]
    assert "SEMANTIC_SIMILAR" in payload["excluded_edge_types"]
    assert abs(sum(score["pagerankRaw"] for score in payload["scores"]) - 1.0) <= 1e-8
    assert all(score["pagerankRaw"] >= 0 for score in payload["scores"])
    assert max(payload["scores"], key=lambda score: score["pagerankRaw"])["nodeKey"]

    repeated = subprocess.run([sys.executable, str(SCRIPT)], capture_output=True, text=True, check=False)
    assert repeated.returncode == 0
    assert json.loads(repeated.stdout)["topology_hash"] == payload["topology_hash"]
    assert json.loads(repeated.stdout)["result_hash"] == payload["result_hash"]


def test_miniforge_nlp_sidecar_health_exposes_import_proof():
    from python.miniforge_nlp_sidecar import health

    payload = health()

    assert payload["runtime"]["pythonExecutable"].endswith("python.exe")
    assert payload["imports"]["langextract"]["available"] is True
    assert payload["imports"]["langextract"]["importVerified"] is True
    assert payload["imports"]["langextract"]["version"] == "0.1.0"
    assert payload["imports"]["langextract"]["modulePath"].endswith(r"python\langextract\__init__.py")
    assert payload["imports"]["treesitterChunker"]["available"] is True
    assert payload["imports"]["treesitterChunker"]["importVerified"] is True
    assert payload["imports"]["treesitterChunker"]["moduleName"] == "chunker"
    assert payload["imports"]["treesitterChunker"]["version"] == "4.0.0"
    assert payload["capabilities"]["treesitter_chunker"] is True


def test_langextract_service_health_exposes_import_proof():
    from python.langextract_service import health

    payload = asyncio.run(health())

    assert payload["runtime"]["pythonExecutable"].endswith("python.exe")
    assert payload["langextract"]["available"] is True
    assert payload["langextract"]["factoryAvailable"] is False
    assert payload["langextract"]["version"] == "0.1.0"
    assert payload["langextract"]["importVerified"] is True
    assert payload["langextract"]["modulePath"].endswith(r"python\langextract\__init__.py")
    assert payload["langextract"]["beautifulsoup4"]["available"] is True
    assert payload["langextract"]["beautifulsoup4"]["importVerified"] is True


def test_langextract_service_bs4_html_parser_extracts_title_and_text():
    from python.langextract_service import _extract_html_text

    html = """
    <html>
      <head><title>Example Title</title><script>window.x = 1;</script></head>
      <body>
        <style>body { color: red; }</style>
        <main><h1>Hello</h1><p>World</p></main>
      </body>
    </html>
    """

    parsed = _extract_html_text(html)

    assert parsed["source"] == "beautifulsoup"
    assert parsed["title"] == "Example Title"
    assert "Hello" in parsed["text"]
    assert "World" in parsed["text"]
    assert "window.x" not in parsed["text"]


def test_miniforge_sidecar_bs4_html_parser_extracts_title_and_text():
    from python.miniforge_nlp_sidecar import _extract_html_text

    html = """
    <html>
      <head><title>Sidecar Title</title><script>window.y = 2;</script></head>
      <body>
        <style>body { color: blue; }</style>
        <main><h1>Alpha</h1><p>Beta</p></main>
      </body>
    </html>
    """

    parsed = _extract_html_text(html)

    assert parsed["source"] == "beautifulsoup"
    assert parsed["title"] == "Sidecar Title"
    assert "Alpha" in parsed["text"]
    assert "Beta" in parsed["text"]
    assert "window.y" not in parsed["text"]


def test_miniforge_sidecar_prefers_treesitter_chunker_module(monkeypatch):
    import python.miniforge_nlp_sidecar as sidecar

    class FakeChunk:
        node_type = "function_declaration"
        start_line = 1
        end_line = 1
        symbol = "demo"

    class FakeChunkerModule:
        @staticmethod
        def chunk_file(text, language):
            assert language == "typescript"
            assert "function demo" in text
            return [FakeChunk()]

    monkeypatch.setattr(sidecar, "TREESITTER_CHUNKER_AVAILABLE", True)
    monkeypatch.setattr(sidecar, "TREESITTER_CHUNKER_MODULE", FakeChunkerModule)
    monkeypatch.setattr(sidecar, "TREE_SITTER_AVAILABLE", False)

    chunks = sidecar._code_chunks_tree_sitter("function demo() {\n  return 1;\n}\n", "typescript")

    assert len(chunks) == 1
    assert chunks[0].kind == "function_declaration"
    assert chunks[0].symbol == "demo"
    assert chunks[0].start == 0
    assert chunks[0].end > 0
    assert chunks[0].text.startswith("function demo")


def test_miniforge_sidecar_grounded_extraction_is_opt_in():
    from python.miniforge_nlp_sidecar import AnalyzeRequest, _analyze

    default_response = _analyze(
        AnalyzeRequest(
            text="export function groundedExample() { return 1; }",
            source_type="codebase",
        )
    )
    assert default_response.metadata.get("grounded_extraction_required") is None
    assert default_response.metadata.get("grounded_extractions") is None
    assert default_response.pass_results == []

    grounded_response = _analyze(
        AnalyzeRequest(
            text="On 2026-08-09, Dr. Jane Doe paid $100.",
            source_type="plain_text",
            grounded_extraction_required=True,
            passes=["grounded"],
        )
    )
    assert grounded_response.metadata["grounded_extraction_required"] is True
    assert grounded_response.metadata["grounded_extraction_used"] is True
    assert isinstance(grounded_response.metadata["grounded_extractions"], list)
    assert grounded_response.metadata["grounded_extractions"]
    assert grounded_response.pass_results and grounded_response.pass_results[-1].family == "grounded"
