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

    def test_remap_counts_and_normalized_domain_match(self):
        buckets = {"graph": 0, "ui": 1}
        recs = [
            {"som_row": 0, "som_col": 0, "domain_class": "graph"},   # token 0
            {"som_row": 19, "som_col": 19, "domain_class": "ui"},    # token 91
            {"som_row": 3, "som_col": 3, "domain_class": " Graph "}, # normalized spelling -> token 0
            {"som_row": None, "som_col": 3, "domain_class": "ui"},   # no SOM cell
            {"som_row": 3, "som_col": 3},                            # no domain
        ]
        out = m.remap_engram_tokens(recs, buckets)
        self.assertEqual(out["tokens"], [0, 91, 0, None, None])
        self.assertEqual(out["unresolved"], {"no_som_cell": 1, "unmapped_domain": 1})
        self.assertEqual(sum(out["histogram"]), 3)
        self.assertFalse(out["canonical_authority"])


class DomainBucketTable(unittest.TestCase):
    def test_generated_table_loads_with_normalized_keys(self):
        table = m.load_domain_buckets(Path(__file__).resolve().parent / "engram-domain-buckets-v1.json")
        self.assertEqual(len(table), 39)
        self.assertEqual(table["graph"], 0)
        self.assertTrue(all(0 <= v < 6 for v in table.values()))
        self.assertEqual(table["other"], 5)
        self.assertNotIn("GRAPH", table)

    def test_rejects_bad_tables(self):
        import json, tempfile, os
        with tempfile.TemporaryDirectory() as d:
            bad = os.path.join(d, "bad.json")
            Path(bad).write_text(json.dumps({"schema": "atlas.engram-domain-buckets.v1", "mapping": {"a": 6}}), encoding="utf-8")
            with self.assertRaises(ValueError):
                m.load_domain_buckets(bad)

    def test_rejects_conflicting_normalized_aliases(self):
        import json, tempfile, os
        with tempfile.TemporaryDirectory() as d:
            bad = os.path.join(d, "bad.json")
            Path(bad).write_text(json.dumps({"schema": "atlas.engram-domain-buckets.v1", "mapping": {"Graph": 0, " graph ": 1}}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "conflicting normalized domain bucket"):
                m.load_domain_buckets(bad)


class EngramTokenDescriptor(unittest.TestCase):
    GOOD_REV = "sha256:" + "a" * 64
    GOOD = {
        "packetKey": "ace:packet:auth:001",
        "sourceRef": "src/lib/server/auth.ts",
        "sourceRevision": "sha256:" + "a" * 64,
        "workspaceRevision": "sha256:" + "b" * 64,
        "somRow": 0, "somCol": 0, "domainBucket": 0,
    }

    def test_resolved_descriptor_carries_token_and_no_authority(self):
        d = m.build_engram_token_descriptor(dict(self.GOOD))
        self.assertEqual(d["status"], "RESOLVED")
        self.assertEqual(d["engramTokenId"], 0)
        self.assertEqual(d["reasons"], [])
        self.assertFalse(d["canonicalAuthority"])
        self.assertEqual(d["schema"], m.ENGRAM_DESCRIPTOR_SCHEMA)

    def test_missing_identity_is_rejected_never_defaulted(self):
        for field, reason in [("packetKey", "MISSING_PACKET_KEY"), ("sourceRef", "MISSING_SOURCE_REF"),
                              ("sourceRevision", "SOURCE_REVISION_NOT_SHA256"),
                              ("workspaceRevision", "WORKSPACE_REVISION_NOT_ADMITTED")]:
            rec = dict(self.GOOD)
            rec.pop(field)
            d = m.build_engram_token_descriptor(rec)
            self.assertEqual(d["status"], "REJECTED", field)
            self.assertIn(reason, d["reasons"])
            self.assertIsNone(d["engramTokenId"])

    def test_zero_or_malformed_revisions_rejected(self):
        for bad in ["0", "sha256:0", "sha256:ABC", "a" * 64]:
            rec = dict(self.GOOD, sourceRevision=bad, workspaceRevision=bad)
            d = m.build_engram_token_descriptor(rec)
            self.assertEqual(d["status"], "REJECTED", bad)

    def test_unresolved_axis_is_unresolved_not_zero(self):
        rec = dict(self.GOOD, domainBucket=None)
        d = m.build_engram_token_descriptor(rec)
        self.assertEqual(d["status"], "UNRESOLVED")
        self.assertIsNone(d["engramTokenId"])
        self.assertIn("ENGRAM_AXIS_UNRESOLVED", d["reasons"])

    def test_descriptor_is_bounded_scalars_only(self):
        d = m.build_engram_token_descriptor(dict(self.GOOD, embedding=[0.1] * 768))
        self.assertNotIn("embedding", d)
        for v in d.values():
            self.assertFalse(isinstance(v, (list, dict)) and v != d["reasons"])


if __name__ == "__main__":
    unittest.main()
