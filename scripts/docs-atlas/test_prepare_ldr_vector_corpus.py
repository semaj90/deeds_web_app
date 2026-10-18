from pathlib import Path
import sys
import unittest
import importlib.util

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

MODULE_PATH = Path(__file__).with_name("prepare-ldr-vector-corpus.py")
MODULE_SPEC = importlib.util.spec_from_file_location("prepare_ldr_vector_corpus", MODULE_PATH)
MODULE = importlib.util.module_from_spec(MODULE_SPEC)
assert MODULE_SPEC is not None and MODULE_SPEC.loader is not None
MODULE_SPEC.loader.exec_module(MODULE)
build_chunk_rows = MODULE.build_chunk_rows
load_verified_captures = MODULE.load_verified_captures


class PrepareLdrVectorCorpusTests(unittest.TestCase):
    def test_verified_firecrawl_captures_build_external_chunk_proposals(self):
        manifests = [
            "docs/.okf/ldr/manifest-ebab0307-97e2-4026-ab7e-6d08db44499b.json",
            "docs/.okf/ldr/manifest-76839544-4775-496e-9102-846ff58d3368.json",
        ]
        captures = load_verified_captures(manifests, "FIRECRAWL_V2")
        rows = build_chunk_rows(captures, maximum_chars=1200, overlap_chars=100)

        self.assertEqual(len(captures), 4)
        self.assertGreater(len(rows), 4)
        self.assertTrue(all(row["canonicalAuthority"] is False for row in rows))
        self.assertTrue(all(row["embedding"] is None for row in rows))
        self.assertTrue(all(row["page"]["sourceEvidenceRevision"].startswith("sha256:") for row in rows))
        self.assertTrue(all(row["chunk"]["start_byte"] < row["chunk"]["end_byte"] for row in rows))

    def test_verified_beautifulsoup_captures_are_a_distinct_capture_cohort(self):
        captures = load_verified_captures(
            ["docs/.okf/ldr/manifest-76839544-4775-496e-9102-846ff58d3368.json"],
            "BEAUTIFULSOUP_HTTP",
        )
        self.assertEqual(len(captures), 4)
        self.assertTrue(all(capture["metadata"]["fetcher"] == "BEAUTIFULSOUP_HTTP" for capture in captures))

    def test_chunk_window_validation_fails_closed(self):
        captures = load_verified_captures(
            ["docs/.okf/ldr/manifest-ebab0307-97e2-4026-ab7e-6d08db44499b.json"],
            "FIRECRAWL_V2",
        )
        with self.assertRaisesRegex(ValueError, "INVALID_CHUNK_WINDOW"):
            build_chunk_rows(captures, maximum_chars=0, overlap_chars=0)


if __name__ == "__main__":
    unittest.main()
