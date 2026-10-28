import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cudf_feature_json_ingest as m  # noqa: E402


class EngramRemap(unittest.TestCase):
    def test_token_range_and_corners(self):
        self.assertEqual(m.ENGRAM_TOKEN_COUNT, 96)
        self.assertEqual(m.engram_token_id(0, 0, 0), 0)
        self.assertEqual(m.engram_token_id(19, 19, 5), 95)
        self.assertEqual(m.engram_token_id(5, 0, 0), 24)   # row quadrant 1
        self.assertEqual(m.engram_token_id(0, 5, 0), 6)    # col quadrant 1
        self.assertEqual(m.engram_token_id(0, 0, 3), 3)

    def test_all_96_tokens_reachable_and_unique(self):
        seen = {m.engram_token_id(r, c, d) for r in (0, 5, 10, 15) for c in (0, 5, 10, 15) for d in range(6)}
        self.assertEqual(seen, set(range(96)))

    def test_quadrant_boundaries_for_20_grid(self):
        self.assertEqual([m.som_quadrant(i, 20) for i in (0, 4, 5, 9, 10, 14, 15, 19)], [0, 0, 1, 1, 2, 2, 3, 3])

    def test_missing_or_invalid_inputs_are_none_not_zero(self):
        for bad in [(None, 0, 0), (0, None, 0), (0, 0, None), (20, 0, 0), (-1, 0, 0), (0, 0, 6), (0, 0, -1),
                    (True, 0, 0), (float("nan"), 0, 0), (1.5, 0, 0), ("3", 0, 0)]:
            self.assertIsNone(m.engram_token_id(*bad), bad)

    def test_remap_counts_and_exact_domain_match(self):
        buckets = {"graph": 0, "ui": 1}
        recs = [
            {"som_row": 0, "som_col": 0, "domain_class": "graph"},   # token 0
            {"som_row": 19, "som_col": 19, "domain_class": "ui"},    # token 91
            {"som_row": 3, "som_col": 3, "domain_class": "Graph"},   # case differs -> unmapped
            {"som_row": None, "som_col": 3, "domain_class": "ui"},   # no SOM cell
            {"som_row": 3, "som_col": 3},                            # no domain
        ]
        out = m.remap_engram_tokens(recs, buckets)
        self.assertEqual(out["tokens"], [0, 91, None, None, None])
        self.assertEqual(out["unresolved"], {"no_som_cell": 1, "unmapped_domain": 2})
        self.assertEqual(sum(out["histogram"]), 2)
        self.assertFalse(out["canonical_authority"])


class DomainBucketTable(unittest.TestCase):
    def test_generated_table_loads_and_is_exact_case(self):
        table = m.load_domain_buckets(Path(__file__).resolve().parent / "engram-domain-buckets-v1.json")
        self.assertEqual(len(table), 41)
        self.assertEqual(table["Graph"], table["graph"])          # both raw spellings listed explicitly
        self.assertTrue(all(0 <= v < 6 for v in table.values()))
        self.assertEqual(table["Other"], 5)
        self.assertNotIn("GRAPH", table)                           # no fuzzy matching for unseen spellings

    def test_rejects_bad_tables(self):
        import json, tempfile, os
        with tempfile.TemporaryDirectory() as d:
            bad = os.path.join(d, "bad.json")
            Path(bad).write_text(json.dumps({"schema": "atlas.engram-domain-buckets.v1", "mapping": {"a": 6}}), encoding="utf-8")
            with self.assertRaises(ValueError):
                m.load_domain_buckets(bad)


if __name__ == "__main__":
    unittest.main()
