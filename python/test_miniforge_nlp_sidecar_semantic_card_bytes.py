"""Regression tests for UTF-8 byte spans entering semantic-card excerpts."""
import hashlib
import sys
from pathlib import Path
from types import SimpleNamespace

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


def test_grounded_opt_in_adds_only_grounded_evidence_without_changing_structural_cards(monkeypatch):
    text = '"Runs a value."\nfunction run() { return 1; }'
    revision = "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()
    request = sidecar.AnalyzeRequest(
        text=text,
        source_type="codebase",
        source_ref="fixture/grounded-identity.ts",
        source_revision=revision,
        workspace_revision="workspace-fixture-v1",
        packet_key="packet:grounded-identity",
        language="typescript",
        passes=["structural", "semantic", "sequence", "rerank"],
    )
    extraction_calls = []

    monkeypatch.setattr(sidecar, "_spacy_entities", lambda _text: [])
    monkeypatch.setattr(sidecar, "_regex_entities", lambda _text: [])
    monkeypatch.setattr(
        sidecar,
        "_code_chunks_tree_sitter",
        lambda source, _language: [sidecar.Chunk(
            kind="function_declaration",
            text=source,
            start=0,
            end=len(source.encode("utf-8")),
            symbol="run",
        )],
    )
    monkeypatch.setattr(sidecar, "_code_features_ast_grep", lambda _text, _language: [])
    monkeypatch.setattr(sidecar, "_code_relationships", lambda _text: [])
    monkeypatch.setattr(sidecar, "_torch_summary", lambda _text: {})
    monkeypatch.setattr(sidecar, "CLASSIFICATION_HELPER_AVAILABLE", False)
    monkeypatch.setattr(sidecar, "LANGEXTRACT_AVAILABLE", True)
    monkeypatch.setattr(
        sidecar,
        "_grounded_extractions",
        lambda source, _model, **_kwargs: extraction_calls.append(source) or [{
            "extraction_class": "function_behavior",
            "extraction_text": "Runs a value.",
            "char_interval": {"start_pos": 1, "end_pos": 15},
            "attributes": {"source": "fixture"},
        }],
    )

    default_result = sidecar._analyze(request)
    assert extraction_calls == []
    assert "grounded_extraction_required" not in default_result.metadata

    grounded_result = sidecar._analyze(
        request.model_copy(update={"grounded_extraction_required": True})
    )
    assert extraction_calls == [text]

    def pass_artifact(result, family, artifact):
        pass_result = next(item for item in result.pass_results if item.family == family)
        return pass_result.artifacts[artifact]

    default_ast = pass_artifact(default_result, "structural", "ast_units")
    grounded_ast = pass_artifact(grounded_result, "structural", "ast_units")
    default_cards = pass_artifact(default_result, "semantic", "semantic_cards")
    grounded_cards = pass_artifact(grounded_result, "semantic", "semantic_cards")

    assert grounded_ast == default_ast
    assert grounded_cards == default_cards
    assert grounded_result.metadata["grounded_extractions"][0]["extraction_text"] == "Runs a value."
    assert grounded_result.metadata["grounded_execution"]["requestBinding"]["status"] == "SOURCE_BYTES_BOUND"
    assert grounded_result.metadata["grounded_execution"]["requestBinding"] == {
        "sourceRef": "fixture/grounded-identity.ts",
        "sourceRevision": revision,
        "workspaceRevision": "workspace-fixture-v1",
        "packetKey": "packet:grounded-identity",
        "status": "SOURCE_BYTES_BOUND",
        "reason": None,
    }
    unbound_result = sidecar._analyze(request.model_copy(update={
        "source_ref": " ",
        "source_revision": None,
        "workspace_revision": None,
        "packet_key": None,
        "grounded_extraction_required": True,
    }))
    assert unbound_result.metadata["grounded_execution"]["requestBinding"]["status"] == "INCOMPLETE"
    assert unbound_result.metadata["grounded_execution"]["state"] == "UNAVAILABLE_SOURCE_BINDING"
    mismatched_result = sidecar._analyze(request.model_copy(update={
        "source_revision": "sha256:" + "0" * 64,
        "grounded_extraction_required": True,
    }))
    assert extraction_calls == [text]
    assert mismatched_result.metadata["grounded_extractions"] == []
    assert mismatched_result.metadata["grounded_execution"]["requestBinding"]["status"] == "SOURCE_REVISION_MISMATCH"
    assert mismatched_result.metadata["grounded_execution"]["state"] == "UNAVAILABLE_SOURCE_BINDING"
    assert all(unit["canonical_authority"] is False for unit in grounded_ast)
    assert all(card["canonical_authority"] is False for card in grounded_cards)
    assert pass_artifact(grounded_result, "semantic", "embedding_status") == "NOT_RUN"
    assert pass_artifact(grounded_result, "sequence", "inference_status") == "NOT_RUN"
    assert next(item for item in grounded_result.pass_results if item.family == "rerank").status == "skipped"
    assert grounded_result.experiment_feature_matrix is None
    assert grounded_result.control5 is None


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


def test_grounded_span_probe_derives_utf8_bytes_from_exact_python_character_span():
    text = "🙂 café"
    probe = sidecar._grounded_span_probe(
        text,
        SimpleNamespace(extraction_text="café", start_char=2, end_char=6, alignment_status="match_exact"),
    )

    assert probe["classification"] == "SOURCE_EXACT"
    assert probe["charSliceExact"] is True
    assert probe["byteSliceExact"] is True
    assert probe["startByte"] == len("🙂 ".encode("utf-8"))
    assert probe["endByte"] == len(text.encode("utf-8"))


def test_grounded_span_probe_classifies_newline_normalization_without_mutating_source():
    text = "x\r\ny"
    probe = sidecar._grounded_span_probe(
        text,
        SimpleNamespace(extraction_text="y", start_char=2, end_char=3, alignment_status="match_exact"),
    )

    assert probe["classification"] == "CRLF_NORMALIZATION"
    assert probe["charSliceExact"] is False
    assert probe["normalizationProbes"]["LF_NORMALIZED"]["exact"] is True
    assert text == "x\r\ny"


def test_grounded_span_probe_classifies_unicode_normalization_without_accepting_it():
    text = "A Cafe\u0301."
    probe = sidecar._grounded_span_probe(
        text,
        SimpleNamespace(extraction_text="Café", start_char=2, end_char=6, alignment_status="match_exact"),
    )

    assert probe["classification"] == "UNICODE_NORMALIZATION"
    assert probe["charSliceExact"] is False
    assert probe["normalizationProbes"]["NFC_NORMALIZED"]["exact"] is True


def test_grounded_span_probe_rejects_invalid_offsets_as_sidecar_defect():
    probe = sidecar._grounded_span_probe(
        "short",
        SimpleNamespace(extraction_text="long", start_char=3, end_char=99, alignment_status="match_exact"),
    )

    assert probe["classification"] == "SIDECAR_OFFSET_DEFECT"
    assert probe["rejectionReason"] == "CHAR_INTERVAL_OUT_OF_BOUNDS"


def test_grounded_extraction_receipt_distinguishes_completed_empty_from_not_attempted(monkeypatch):
    monkeypatch.setattr(sidecar, "LANGEXTRACT_AVAILABLE", True)
    monkeypatch.setattr(sidecar, "langextract", SimpleNamespace(extract=lambda *args, **kwargs: SimpleNamespace(extractions=[])))
    monkeypatch.setattr(sidecar, "_ensure_grounded_provider_controls", lambda: None)
    monkeypatch.setattr(sidecar, "_grounded_output_schema", lambda: {})
    receipt = {}

    result = sidecar._grounded_extractions("no concepts", execution_receipt=receipt)

    assert result == []
    assert receipt["executorAttempted"] is True
    assert receipt["executorCompleted"] is True
    assert receipt["state"] == "COMPLETED_EMPTY"


def test_grounded_extraction_receipt_retains_rejected_span_diagnostic(monkeypatch):
    item = SimpleNamespace(
        extraction_class="CONCEPT",
        extraction_text="y",
        start_char=2,
        end_char=3,
        alignment_status="match_exact",
        attributes={},
    )
    monkeypatch.setattr(sidecar, "LANGEXTRACT_AVAILABLE", True)
    monkeypatch.setattr(sidecar, "langextract", SimpleNamespace(extract=lambda *args, **kwargs: SimpleNamespace(extractions=[item])))
    monkeypatch.setattr(sidecar, "_ensure_grounded_provider_controls", lambda: None)
    monkeypatch.setattr(sidecar, "_grounded_output_schema", lambda: {})
    receipt = {}
    diagnostics = []

    result = sidecar._grounded_extractions(
        "x\r\ny",
        span_diagnostics=diagnostics,
        execution_receipt=receipt,
    )

    assert result == []
    assert receipt["state"] == "REJECTED_SPAN_MISMATCH"
    assert diagnostics[0]["classification"] == "CRLF_NORMALIZATION"
    assert diagnostics[0]["extractionText"] == "y"
