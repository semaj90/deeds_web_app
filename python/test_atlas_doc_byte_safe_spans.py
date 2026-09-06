"""Tests for byte-safe chunk span alignment (parent-atlas-versioned-doc-intelligence,
DOC-05 byte-safe span alignment).

start_byte/end_byte are the authoritative evidence span (UTF-8 byte offsets
into the normalized text), matching this repo's other canonical chunk contract
(CanonicalChunkV1 in parent-atlas-canonical-directory-ingestion-fabric/design.md,
which uses startByte/endByte over exact UTF-8 bytes). start_char/end_char remain
as secondary, diagnostic-only convenience fields.
"""

from __future__ import annotations

import unittest

from atlas_external_docs import _normalize_ws, _sha, chunk_document

# Deliberately irregular word lengths + a tight maximum_chars/overlap_chars
# window -- confirmed live (outside this test) that this combination reliably
# lands the overlap-window cursor on leading whitespace, the exact scenario
# that exposed the pre-fix start_char bug.
_ADVERSARIAL_WORDS = ["a", "bb", "ccc", "dddd", "eeeee", "ffffff", "ggg", "hh", "i", "jjjjjjj", "kk", "lll", "mmmmm"]


class ByteSafeSpanTests(unittest.TestCase):
    def test_byte_span_decodes_exactly_to_chunk_text_ascii_adversarial(self) -> None:
        text = "# H\n" + " ".join(_ADVERSARIAL_WORDS * 40)
        chunks = chunk_document(
            source_id="s", source_revision="sha256:" + "a" * 64, source_url="https://example.test/",
            title="T", text=text, maximum_chars=53, overlap_chars=7,
        )
        self.assertGreater(len(chunks), 10)  # sanity: this fixture must actually produce many windows
        normalized_bytes = _normalize_ws(text).encode("utf-8")
        for chunk in chunks:
            decoded = normalized_bytes[chunk.start_byte:chunk.end_byte].decode("utf-8")
            self.assertEqual(decoded, chunk.text, f"ordinal={chunk.ordinal}")

    def test_char_span_also_fixed_not_just_byte_span(self) -> None:
        """Regression guard for the underlying bug (pre-strip cursor used as
        start_char even when .strip() trimmed leading whitespace) -- fixing
        byte offsets must not leave the char offsets still broken."""
        text = "# H\n" + " ".join(_ADVERSARIAL_WORDS * 40)
        chunks = chunk_document(
            source_id="s", source_revision="sha256:" + "a" * 64, source_url="https://example.test/",
            title="T", text=text, maximum_chars=53, overlap_chars=7,
        )
        normalized = _normalize_ws(text)
        for chunk in chunks:
            self.assertEqual(normalized[chunk.start_char:chunk.end_char], chunk.text, f"ordinal={chunk.ordinal}")

    def test_non_ascii_multibyte_fixture_byte_span_exact(self) -> None:
        text = "# Café Résumé\n" + ("日本語のテキスト naïve café résumé emoji 🎉🔥 test façade coöperate " * 20)
        chunks = chunk_document(
            source_id="s2", source_revision="sha256:" + "b" * 64, source_url="https://example.test/2",
            title="T2", text=text, maximum_chars=53, overlap_chars=7,
        )
        normalized_bytes = _normalize_ws(text).encode("utf-8")
        for chunk in chunks:
            decoded = normalized_bytes[chunk.start_byte:chunk.end_byte].decode("utf-8")
            self.assertEqual(decoded, chunk.text, f"ordinal={chunk.ordinal}")

    def test_byte_offset_diverges_from_char_offset_when_multibyte_present(self) -> None:
        """Proves start_byte is actually doing different work than start_char,
        not silently equal to it -- a chunk starting after CJK/emoji content
        must have byte offset strictly greater than its char offset (the
        multi-byte prefix inflates byte count but not char count)."""
        text = "# H\n日本語のテキストです。 " + ("word " * 60)
        chunks = chunk_document(
            source_id="s3", source_revision="sha256:" + "c" * 64, source_url="https://example.test/3",
            title="T3", text=text, maximum_chars=40, overlap_chars=5,
        )
        self.assertGreater(len(chunks), 1)  # sanity: must actually produce a later chunk
        later_chunk = next(c for c in chunks if c.start_char > 15)  # past the CJK prefix
        self.assertGreater(later_chunk.start_byte, later_chunk.start_char)

    def test_chunk_checksum_matches_exact_chunk_bytes(self) -> None:
        text = "# Café\n" + ("café résumé naïve façade " * 10)
        chunks = chunk_document(
            source_id="s4", source_revision="sha256:" + "d" * 64, source_url="https://example.test/4",
            title="T4", text=text, maximum_chars=60, overlap_chars=10,
        )
        normalized_bytes = _normalize_ws(text).encode("utf-8")
        for chunk in chunks:
            serialized = chunk.to_dict()
            decoded = normalized_bytes[chunk.start_byte:chunk.end_byte].decode("utf-8")
            self.assertEqual(serialized["chunk_checksum"], _sha(decoded))

    def test_no_canonical_promotion_from_chunk_alone(self) -> None:
        """canonical_authority stays false on every chunk this pipeline
        produces -- Postgres admission (DOC-06A) is the only promotion path,
        never a hash or a plan by itself."""
        text = "# H\nSome content here."
        chunks = chunk_document(
            source_id="s5", source_revision="sha256:" + "e" * 64, source_url="https://example.test/5",
            title="T5", text=text,
        )
        for chunk in chunks:
            self.assertFalse(chunk.to_dict()["canonical_authority"])

    def test_direct_chunkrecord_construction_without_byte_fields_still_works(self) -> None:
        """Backward compat: start_byte/end_byte default to 0 so the existing
        direct ChunkRecord(...) test fixtures in this repo (that predate this
        field) are unaffected."""
        from atlas_external_docs import ChunkRecord

        chunk = ChunkRecord(
            chunk_id="doc:x:0", source_id="x", source_revision="r1", source_url="https://example.test/",
            document_checksum="c1", ordinal=0, heading_path=(), start_char=0, end_char=4,
            text="text", domain_class="documentation", ontology_classes=("CONCEPT",),
            lexical_tokens=(), ontology_tuples=(),
        )
        self.assertEqual(chunk.start_byte, 0)
        self.assertEqual(chunk.end_byte, 0)

    def test_deterministic_replay_produces_identical_byte_spans(self) -> None:
        text = "# H\n" + " ".join(_ADVERSARIAL_WORDS * 10)
        kwargs = dict(
            source_id="s6", source_revision="sha256:" + "f" * 64, source_url="https://example.test/6",
            title="T6", text=text, maximum_chars=53, overlap_chars=7,
        )
        first = chunk_document(**kwargs)
        second = chunk_document(**kwargs)
        self.assertEqual(
            [(c.start_byte, c.end_byte, c.chunk_id) for c in first],
            [(c.start_byte, c.end_byte, c.chunk_id) for c in second],
        )
