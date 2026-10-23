#!/usr/bin/env python3
"""Unit tests for ast_chunk_routing_helpers.py (hardened 2026-10-18).

Domain resolution is exact and crosswalk-driven; fixtures use real rows from
atlas_domain_vocabulary_crosswalk_v1, including its UNRESOLVED rows. Identity inputs fail closed.
"""

import os
import tempfile
import unittest
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "python"))

from atlas_compute.ast_chunk_routing_helpers import (
    AstChunkRouteTuple,
    AstChunkDomainRouter,
    HAVE_TORCH,
    HAVE_NUMPY,
)

R = AstChunkDomainRouter

# Real rows (source_vocab, source_value, taxonomy_domain_id, match_method) from the applied crosswalk.
CROSSWALK_ROWS = [
    ("feature_domain.domain_class", "Graph", "graph", "NORMALIZED_EXACT"),
    ("feature_domain.domain_class", "MachineLearning", "machine-learning", "NORMALIZED_EXACT"),
    ("feature_domain.domain_class", "API", "api", "NORMALIZED_EXACT"),
    ("feature_domain.domain_class", "Other", None, "UNRESOLVED"),
    ("feature_domain.domain_class", "Authentication", None, "UNRESOLVED"),
    ("codebase_chunk_index.domain", "frontend", "frontend", "NORMALIZED_EXACT"),
    ("codebase_chunk_index.domain", "retrieval", "retrieval", "NORMALIZED_EXACT"),
    ("codebase_chunk_index.domain", "backend", None, "UNRESOLVED"),
    ("codebase_chunk_index.domain", "utility", None, "UNRESOLVED"),
]


def chunk(ref="src/a.ts", start=0, end=10, rev="rev1", **extra):
    return {"source_ref": ref, "source_revision": rev, "start_byte": start, "end_byte": end, **extra}


class TestDomainResolution(unittest.TestCase):
    def setUp(self):
        self.cw = R.load_crosswalk(CROSSWALK_ROWS)

    def test_only_exact_rows_load(self):
        self.assertEqual(len(self.cw), 5)  # UNRESOLVED rows are never loaded

    def test_exact_and_case_punctuation_normalized(self):
        self.assertEqual(R.resolve_domain("feature_domain.domain_class", "MachineLearning", self.cw), "machine-learning")
        self.assertEqual(R.resolve_domain("feature_domain.domain_class", "machine_learning", self.cw), "machine-learning")
        self.assertEqual(R.resolve_domain("codebase_chunk_index.domain", "Frontend", self.cw), "frontend")

    def test_no_inferred_aliases(self):
        # These were hard-coded aliases before hardening; they must stay unresolved.
        self.assertEqual(R.resolve_domain("codebase_chunk_index.domain", "backend", self.cw), "unresolved")
        self.assertEqual(R.resolve_domain("codebase_chunk_index.domain", "utility", self.cw), "unresolved")
        self.assertEqual(R.resolve_domain("feature_domain.domain_class", "Other", self.cw), "unresolved")
        self.assertEqual(R.resolve_domain("feature_domain.domain_class", "Authentication", self.cw), "unresolved")
        # Values that never existed in this repo's vocabularies.
        for invented in ("billing", "crm", "workflow", "notification", "Inference", "Drizzle"):
            self.assertEqual(R.resolve_domain("feature_domain.domain_class", invented, self.cw), "unresolved")

    def test_vocabulary_is_part_of_the_key(self):
        self.assertEqual(R.resolve_domain("feature_domain.domain_class", "frontend", self.cw), "unresolved")

    def test_blank_and_missing_crosswalk(self):
        self.assertEqual(R.resolve_domain("codebase_chunk_index.domain", "", self.cw), "unresolved")
        self.assertEqual(R.resolve_domain_76("graph"), "unresolved")  # no crosswalk -> nothing resolves
        self.assertEqual(R.resolve_domain_76("Graph", self.cw), "graph")


class TestLspUtf16(unittest.TestCase):
    SRC = "a\U0001F600b\nline2\r\nx y\n".encode("utf-8")

    def test_astral_offsets(self):
        self.assertEqual(R.lsp_utf16_to_utf8_byte_offset(self.SRC, 0, 0), 0)
        self.assertEqual(R.lsp_utf16_to_utf8_byte_offset(self.SRC, 0, 1), 1)
        self.assertEqual(R.lsp_utf16_to_utf8_byte_offset(self.SRC, 0, 3), 5)  # a + 4-byte emoji
        self.assertEqual(R.lsp_utf16_to_utf8_byte_offset(self.SRC, 0, 4), 6)

    def test_rejects_column_inside_surrogate_pair(self):
        with self.assertRaises(ValueError):
            R.lsp_utf16_to_utf8_byte_offset(self.SRC, 0, 2)

    def test_rejects_out_of_range_and_negative(self):
        for line, col in ((-1, 0), (0, -1), (99, 0), (0, 99)):
            with self.assertRaises(ValueError):
                R.lsp_utf16_to_utf8_byte_offset(self.SRC, line, col)

    def test_crlf_and_unicode_line_separator(self):
        # line 1 starts after "a😀b\n" = 7 bytes; line 2 after "line2\r\n" = 7 + 7 bytes
        self.assertEqual(R.lsp_utf16_to_utf8_byte_offset(self.SRC, 1, 0), 7)
        self.assertEqual(R.lsp_utf16_to_utf8_byte_offset(self.SRC, 2, 0), 14)
        # U+2028 is NOT an LSP line break: "x", U+2028 (3 bytes), "y" stay on line 2
        self.assertEqual(R.lsp_utf16_to_utf8_byte_offset(self.SRC, 2, 2), 14 + 1 + 3)
        with self.assertRaises(ValueError):
            R.lsp_utf16_to_utf8_byte_offset(self.SRC, 3, 0 + 1)  # line 3 is the empty tail line; col 1 is out of range

    def test_rejects_invalid_utf8(self):
        with self.assertRaises(ValueError):
            R.lsp_utf16_to_utf8_byte_offset(b"ok\xff\n", 0, 1)


class TestNonAstRouting(unittest.TestCase):
    def test_routes_and_no_domain_from_extension(self):
        for path, target in (
            ("docs/config.json", "simdjson_okf_validator"),
            (".opencode/outcome.ndjson", "simdjson_okf_validator"),
            ("docs/spec.md", "doc_intelligence_spacy_pos"),
            ("docs/spec.mdx", "doc_intelligence_spacy_pos"),
            ("notes/readme.txt", "doc_intelligence_spacy_pos"),
            ("drizzle/0001_init.sql", "ddl_migration_regex_extractor"),
            ("cargo.toml", "unresolved_generic_carrier"),
        ):
            r = R.route_non_ast_chunk(path, "")
            self.assertEqual(r["route_target"], target)
            self.assertEqual(r["lang_id"], 255)
            self.assertEqual(r["domain"], "unresolved")  # a file extension is not classification evidence
            self.assertEqual(r["lut_byte"], 0x00)
            if path.endswith(".toml"):
                self.assertEqual(r["route_status"], "NO_PARSER_RULE")
            else:
                self.assertEqual(r["route_status"], "ROUTE_RULE_PRESENT_NOT_EXECUTED")
        jsonc = R.route_non_ast_chunk("opencode.jsonc", "{ // comment\n}")
        self.assertEqual(jsonc["route_status"], "NO_PARSER_RULE")
        self.assertEqual(jsonc["reason"], "unsupported extension: .jsonc")


class TestBuildLinkedTuplesAndMmap(unittest.TestCase):
    def build(self, chunks, crosswalk=None):
        with tempfile.TemporaryDirectory() as tmp:
            return R.build_linked_tuples_and_mmap_features(chunks, os.path.join(tmp, "f.f32bin"), crosswalk)

    def test_links_are_per_file_and_in_byte_order(self):
        chunks = [
            chunk("src/a.ts", 100, 200),
            chunk("src/b.svelte", 0, 50, has_svelte_runes=True),
            chunk("src/a.ts", 0, 100),
        ]
        kv, tensor = self.build(chunks)
        a_head, a_tail = kv[("src/a.ts", 0, 100)], kv[("src/a.ts", 100, 200)]
        self.assertEqual((a_head.prev_ordinal, a_head.next_ordinal), (-1, 0))
        self.assertEqual((a_tail.prev_ordinal, a_tail.next_ordinal), (2, -1))
        b = kv[("src/b.svelte", 0, 50)]
        self.assertEqual((b.prev_ordinal, b.next_ordinal), (-1, -1))  # never linked across files
        self.assertEqual(b.lang_id, 2)
        self.assertEqual(b.nes_lut_byte, 0x2A)
        if HAVE_TORCH:
            import torch
            self.assertEqual(tuple(tensor.shape), (3, 25))
            self.assertEqual(tensor.dtype, torch.float32)
            self.assertEqual(tensor[0, 0].item(), 100.0)

    def test_fail_closed_on_missing_identity(self):
        with self.assertRaises(ValueError):
            self.build([{"source_revision": "r", "start_byte": 0, "end_byte": 1}])
        with self.assertRaises(ValueError):
            self.build([{"source_ref": "src/a.ts", "start_byte": 0, "end_byte": 1}])  # no pending_revision default

    def test_rejects_bad_spans_and_duplicates(self):
        with self.assertRaises(ValueError):
            self.build([chunk(start=5, end=2)])
        with self.assertRaises(ValueError):
            self.build([chunk(start=-1, end=2)])
        with self.assertRaises(ValueError):
            self.build([chunk(start=0, end=10), chunk(start=0, end=10)])

    def test_palette_comes_only_from_resolved_domain(self):
        cw = R.load_crosswalk(CROSSWALK_ROWS)
        kv, _ = self.build([chunk(domain_proposal="Graph")], cw)
        self.assertEqual(kv[("src/a.ts", 0, 10)].nes_lut_byte, R.NES_DOMAIN_LUT["graph"])  # 'graph' resolves exactly
        kv, _ = self.build([chunk(domain_proposal="backend")], cw)
        self.assertEqual(kv[("src/a.ts", 0, 10)].nes_lut_byte, 0x00)  # unresolved


if __name__ == "__main__":
    unittest.main()
