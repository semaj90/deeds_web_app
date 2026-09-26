from __future__ import annotations

import hashlib

from atlas_summary_claim_span_v1 import verify_summary_claim_byte_span_v1
from atlas_summary_claim_validation_v1 import SourceSpanSlot


def _span(text: str, start: int, end: int) -> str:
    return hashlib.sha256(text.encode("utf-8")[start:end]).hexdigest()


def test_verifies_exact_revision_and_utf8_byte_span() -> None:
    row = {"chunk_id": "doc:pgvector:abc:0", "evidence_revision": "sha256:" + "a" * 64, "text": "alpha 🧭 beta"}
    start = len("alpha ".encode("utf-8"))
    end = start + len("🧭".encode("utf-8"))
    result = verify_summary_claim_byte_span_v1(
        expected_chunk_id=row["chunk_id"],
        expected_chunk_evidence_revision=row["evidence_revision"],
        canonical_chunk_row=row,
        start_byte=start,
        end_byte=end,
        text_checksum=_span(row["text"], start, end),
    )
    assert result["status"] == "VERIFIED"
    assert result["reason"] == "EXACT_REVISION_AND_BYTES"


def test_rejects_wrong_chunk_or_revision_without_fallback() -> None:
    row = {"chunk_id": "doc:pgvector:abc:0", "evidence_revision": "sha256:" + "a" * 64, "text": "chunk text"}
    args = dict(expected_chunk_id=row["chunk_id"], expected_chunk_evidence_revision=row["evidence_revision"], canonical_chunk_row=row, start_byte=0, end_byte=5, text_checksum=_span(row["text"], 0, 5))
    assert verify_summary_claim_byte_span_v1(**{**args, "expected_chunk_id": "another-chunk"})["reason"] == "CHUNK_ID_MISMATCH"
    assert verify_summary_claim_byte_span_v1(**{**args, "expected_chunk_evidence_revision": "sha256:" + "b" * 64})["reason"] == "REVISION_MISMATCH"


def test_rejects_out_of_bounds_invalid_utf8_boundary_and_bad_checksum() -> None:
    row = {"chunk_id": "doc:pgvector:abc:0", "evidence_revision": "sha256:" + "a" * 64, "text": "alpha 🧭 beta"}
    base = dict(expected_chunk_id=row["chunk_id"], expected_chunk_evidence_revision=row["evidence_revision"], canonical_chunk_row=row)
    assert verify_summary_claim_byte_span_v1(**base, start_byte=0, end_byte=999, text_checksum="0" * 64)["reason"] == "OUT_OF_BOUNDS"
    assert verify_summary_claim_byte_span_v1(**base, start_byte=7, end_byte=8, text_checksum="0" * 64)["reason"] == "SPAN_NOT_UTF8_BOUNDARY"
    assert verify_summary_claim_byte_span_v1(**base, start_byte=0, end_byte=5, text_checksum="0" * 64)["reason"] == "CHECKSUM_MISMATCH"


def test_python_wire_mirror_matches_frontend_span_statuses() -> None:
    span = {"startByte": 0, "endByte": 1, "textChecksum": "0" * 64}
    for status in ("NOT_RUN", "CLAIMED", "VERIFIED", "REJECTED", "NO_CLAIMED_SPAN"):
        assert SourceSpanSlot.model_validate({"status": status, "spans": [span]}).status == status
    try:
        SourceSpanSlot.model_validate({"status": "UNVERIFIED", "spans": [span]})
    except Exception:
        pass
    else:
        raise AssertionError("stale UNVERIFIED status must not survive the strict mirror")


def test_deterministic_multibyte_fixture_verifies_on_code_point_boundaries_and_rejects_inside_sequences() -> None:
    import hashlib

    text = "PostgreSQL résumé — café 日本語 🚀"
    row = {"chunk_id": "doc:fixture:multibyte:0", "evidence_revision": "sha256:" + "a" * 64, "text": text}
    data = text.encode("utf-8")

    def verify(start: int, end: int) -> dict:
        return verify_summary_claim_byte_span_v1(
            expected_chunk_id=row["chunk_id"], expected_chunk_evidence_revision=row["evidence_revision"], canonical_chunk_row=row,
            start_byte=start, end_byte=end, text_checksum=hashlib.sha256(data[start:end]).hexdigest(),
        )

    for word in ("résumé", "—", "café", "日本語", "🚀"):
        start = data.index(word.encode("utf-8"))
        assert verify(start, start + len(word.encode("utf-8")))["status"] == "VERIFIED", word
    for label, (start, end) in {
        "inside é": (data.index("é".encode()) + 1, data.index("é".encode()) + 2),
        "inside em dash": (data.index("—".encode()) + 1, data.index("—".encode()) + 3),
        "inside 日": (data.index("日".encode()) + 1, data.index("日".encode()) + 3),
        "inside emoji": (data.index("🚀".encode()) + 1, data.index("🚀".encode()) + 3),
    }.items():
        result = verify(start, end)
        assert result["status"] == "REJECTED" and result["reason"] == "SPAN_NOT_UTF8_BOUNDARY", label
