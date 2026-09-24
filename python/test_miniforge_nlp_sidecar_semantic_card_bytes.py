"""Regression tests for UTF-8 byte spans entering semantic-card excerpts."""
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import miniforge_nlp_sidecar as sidecar  # noqa: E402


def test_line_fallback_returns_utf8_byte_offsets_after_multibyte_prefix():
    text = "🙂\nconst value = 1;\n"
    start, end = sidecar._line_span_to_offsets(text, 2, 2)

    assert start == len("🙂\n".encode("utf-8"))
    assert sidecar._slice_utf8_bytes(text, start, end) == "const value = 1;\n"


def test_empty_ast_fallback_uses_utf8_byte_length():
    text = "🙂\nplain source"
    revision = "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()
    request = sidecar.AnalyzeRequest(
        text=text,
        source_ref="fixture/empty-ast.ts",
        source_revision=revision,
        language="typescript",
    )

    units = sidecar._build_ast_units(request, text, [], "typescript")

    assert len(units) == 1
    assert units[0].byte_start == 0
    assert units[0].byte_end == len(text.encode("utf-8"))
    assert sidecar._slice_utf8_bytes(text, units[0].byte_start, units[0].byte_end) == text


def test_semantic_card_slices_ast_unit_byte_span_not_python_character_indexes():
    text = "🙂\nconst value = 1;"
    start = len("🙂\n".encode("utf-8"))
    end = len(text.encode("utf-8"))
    revision = "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()
    request = sidecar.AnalyzeRequest(
        text=text,
        source_ref="fixture/semantic-card.ts",
        source_revision=revision,
        language="typescript",
    )
    unit = sidecar.AstUnit(
        source_ref=request.source_ref,
        source_revision=request.source_revision,
        tree_node_id="fixture-tree-node",
        symbol_version_id=None,
        language="typescript",
        node_kind="lexical_declaration",
        qualified_symbol="value",
        byte_start=start,
        byte_end=end,
        line_start=2,
        line_end=2,
        parser_engine="tree-sitter",
        parser_revision="fixture-parser-v1",
        grammar_revision="typescript-fixture-v1",
        chunker="fixture-chunker",
        chunker_revision="fixture-chunker-v1",
        structural_revision="fixture-structural-v1",
        content_hash="sha256:fixture-node-v1",
    )

    cards = sidecar._build_semantic_cards(request, text, [unit], [], [])

    assert len(cards) == 1
    assert cards[0].excerpt == "const value = 1;"
    assert cards[0].canonical_authority is False


def test_semantic_card_rejects_byte_span_that_splits_utf8_code_point():
    text = "🙂value"
    start = len("🙂".encode("utf-8")) - 1
    revision = "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()
    request = sidecar.AnalyzeRequest(
        text=text,
        source_ref="fixture/invalid-span.ts",
        source_revision=revision,
        language="typescript",
    )
    unit = sidecar.AstUnit(
        source_ref=request.source_ref,
        source_revision=request.source_revision,
        tree_node_id="fixture-invalid-node",
        language="typescript",
        node_kind="identifier",
        qualified_symbol="value",
        byte_start=start,
        byte_end=len(text.encode("utf-8")),
        line_start=1,
        line_end=1,
        parser_engine="tree-sitter",
        parser_revision="fixture-parser-v1",
        grammar_revision="typescript-fixture-v1",
        chunker="fixture-chunker",
        chunker_revision="fixture-chunker-v1",
        structural_revision="fixture-structural-v1",
        content_hash="sha256:fixture-invalid-node-v1",
    )

    cards = sidecar._build_semantic_cards(request, text, [unit], [], [])

    assert cards == []


def test_semantic_pass_wires_ast_unit_and_linguistic_facts_into_bounded_card():
    text = "🙂\nconst value = 1;"
    start = len("🙂\n".encode("utf-8"))
    end = len(text.encode("utf-8"))
    revision = "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()
    request = sidecar.AnalyzeRequest(
        text=text,
        source_ref="fixture/wired-semantic-card.ts",
        source_revision=revision,
        language="typescript",
        model_id="fixture-analysis-model-not-an-embedding-revision",
        passes=["structural", "semantic"],
    )
    chunk = sidecar.Chunk(
        kind="lexical_declaration",
        text="const value = 1;",
        start=start,
        end=end,
        symbol="value",
    )

    pass_results, ast_units, _, _, control5, matrix = sidecar._build_pass_results(
        request,
        text,
        [sidecar.Entity(text="value", label="TECHNICAL_TERM")],
        [],
        [],
        [chunk],
        [sidecar.Feature(
            kind="lexical",
            name="declaration",
            description="fixture-only lexical cue",
            source="regex",
            confidence=1.0,
        )],
    )

    structural = next(result for result in pass_results if result.family == "structural")
    semantic = next(result for result in pass_results if result.family == "semantic")
    cards = semantic.artifacts["semantic_cards"]
    assert ast_units and structural.artifacts["ast_units"][0]["tree_node_id"] == ast_units[0].tree_node_id
    assert len(cards) == 1
    assert cards[0]["excerpt"] == "const value = 1;"
    assert cards[0]["linguistic_facts"] == ["value"]
    assert cards[0]["lexical_facts"] == ["declaration"]
    assert cards[0]["canonical_authority"] is False
    assert semantic.backend == "semantic-card-builder"
    assert semantic.backend_version == "semantic-card-v1"
    assert semantic.artifacts["embedding_status"] == "NOT_RUN"
    assert semantic.features == {}
    assert "SEMANTIC_768_EMBEDDING_NOT_RUN" in semantic.warnings
    assert matrix is None
    assert control5 is None


def test_pass_results_do_not_invent_source_identity_or_revision():
    request = sidecar.AnalyzeRequest(
        text="const value = 1;",
        document_id="ui-label-not-source-identity",
        source_revision="workspace:0",
        passes=["structural"],
    )

    results, ast_units, semantic_cards, observations, control5, matrix = sidecar._build_pass_results(
        request, request.text, [], [], [], [], []
    )

    assert results == []
    assert ast_units == []
    assert semantic_cards == []
    assert observations == []
    assert control5 is None
    assert matrix is None


def test_event_hypergraph_skips_fabricated_request_identity_and_revision_fallbacks():
    unqualified = sidecar.AnalyzeRequest(
        text="function run() {}",
        document_id="ui-document-label",
        model_id="ornith-runtime-model-label",
    )
    skipped = sidecar._build_event_hypergraph(
        unqualified, unqualified.text, [], [], [], [], [], [], [], None, None
    )

    assert skipped.status == "SKIPPED_LINEAGE"
    assert skipped.events == []
    assert "SOURCE_PACKET_WORKSPACE_LINEAGE_REQUIRED" in skipped.warnings

    qualified = sidecar.AnalyzeRequest(
        text="function run() {}",
        source_ref="fixture/src/run.ts",
        source_revision="sha256:" + hashlib.sha256(b"function run() {}").hexdigest(),
        workspace_revision="sha256:" + hashlib.sha256(b"fixture-workspace").hexdigest(),
        packet_key="fixture-packet-run",
        model_id="ornith-runtime-model-label",
    )
    built = sidecar._build_event_hypergraph(
        qualified, qualified.text, [], [], [], [], [], [], [], None, None
    )

    assert built.status == "BUILT"
    assert built.events
    event = built.events[0]
    assert event["source_ref"] == qualified.source_ref
    assert event["source_revision"] == qualified.source_revision
    assert event["workspace_revision"] == qualified.workspace_revision
    assert event["packet_key"] == qualified.packet_key
    assert event["representation_revision"] is None
