import hashlib
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent))

import miniforge_nlp_sidecar_v2 as sidecar_v2  # noqa: E402


def _install_fake_langextract(monkeypatch, extraction_text, start_char, end_char):
    legacy = sidecar_v2.legacy

    def fake_extract(**_kwargs):
        item = SimpleNamespace(
            extraction_class="CONCEPT",
            extraction_text=extraction_text,
            char_interval=SimpleNamespace(start_pos=start_char, end_pos=end_char),
            alignment_status="match_exact",
            attributes={"concept_id": "FIXTURE"},
        )
        return SimpleNamespace(extractions=[item])

    monkeypatch.setattr(legacy, "LANGEXTRACT_AVAILABLE", True)
    monkeypatch.setattr(legacy, "langextract", SimpleNamespace(extract=SimpleNamespace(extract=fake_extract)))
    monkeypatch.setattr(legacy, "_ensure_grounded_provider_controls", lambda: None)
    monkeypatch.setattr(legacy, "_set_grounded_extraction_context", lambda *_args: None)
    monkeypatch.setattr(legacy, "_clear_grounded_extraction_context", lambda: None)
    monkeypatch.setattr(legacy, "_grounded_output_schema", lambda: {})


def test_v2_langextract_adapter_accepts_receipt_kwargs_and_emits_exact_utf8_byte_span(monkeypatch):
    text = "const label = 'café';"
    start_char = text.index("café")
    end_char = start_char + len("café")
    _install_fake_langextract(monkeypatch, "café", start_char, end_char)
    diagnostics = []
    receipt = {}

    result = sidecar_v2._native_grounded_extractions(
        text,
        span_diagnostics=diagnostics,
        execution_receipt=receipt,
    )

    expected_start = len(text[:start_char].encode("utf-8"))
    expected_end = len(text[:end_char].encode("utf-8"))
    assert diagnostics == []
    assert result[0]["start_byte"] == expected_start
    assert result[0]["end_byte"] == expected_end
    assert text.encode("utf-8")[expected_start:expected_end].decode("utf-8") == "café"
    assert receipt["inputChecksum"] == hashlib.sha256(text.encode("utf-8")).hexdigest()
    assert receipt["state"] == "COMPLETED_GROUNDED"
    assert receipt["resultCount"] == 1


def test_v2_langextract_adapter_rejects_nonmatching_model_span(monkeypatch):
    text = "const label = 'café';"
    start_char = text.index("label")
    end_char = start_char + len("label")
    _install_fake_langextract(monkeypatch, "café", start_char, end_char)
    diagnostics = []
    receipt = {}

    result = sidecar_v2._native_grounded_extractions(
        text,
        span_diagnostics=diagnostics,
        execution_receipt=receipt,
    )

    assert result == []
    assert diagnostics[0]["classification"] == "TOKEN_ALIGNMENT_DIFFERENCE"
    assert receipt["state"] == "REJECTED_SPAN_MISMATCH"
    assert receipt["failureClass"] == "SPAN_REJECTION"


def test_v2_health_binds_loaded_source_digests_and_grounded_adapter_signature():
    health = sidecar_v2.health()
    bindings = health["runtimeSourceBindings"]
    assert bindings["modules"]["miniforge_nlp_sidecar_v2"] == (
        "sha256:" + hashlib.sha256(Path(sidecar_v2.__file__).read_bytes()).hexdigest()
    )
    assert bindings["modules"]["miniforge_nlp_sidecar"] == (
        "sha256:" + hashlib.sha256(Path(sidecar_v2.legacy.__file__).read_bytes()).hexdigest()
    )
    assert bindings["groundedExtractionAdapter"] == {
        "acceptsSpanDiagnostics": True,
        "acceptsExecutionReceipt": True,
    }
