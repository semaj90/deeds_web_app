"""Unit tests for custom NetworkX PageRank over the 149 bound candidates, .okf taxonomy validation, and UUIDv5 PacketKeyV2 derivation."""

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))
sys.path.insert(0, str(ROOT / "scripts" / "atlas"))

from prove_domain_candidates_networkx_poincare_v1 import (
    DRAFT_V3_PATH,
    build_candidate_domain_networkx_graph,
    compute_packet_key_v2,
    load_taxonomy_domains,
)


class TestDomainCandidatesNetworkxPoincareV1(unittest.TestCase):
    def test_okf_taxonomy_schema_validation_and_counts(self):
        domains, edges, receipt = load_taxonomy_domains()
        self.assertEqual(receipt["status"], "VALID")
        self.assertEqual(len(domains), 17)
        self.assertEqual(len(edges), 4)
        self.assertIn(("database.postgresql", "database"), edges)
        self.assertIn(("frontend.sveltekit", "frontend"), edges)

    def test_packet_key_v2_uuidv5_determinism_and_guards(self):
        k1 = compute_packet_key_v2("repo:root", "sveltekit-frontend/src/routes/api/embed/+server.ts")
        k2 = compute_packet_key_v2("repo:root", "sveltekit-frontend/src/routes/api/embed/+server.ts")
        k_diff_repo = compute_packet_key_v2("repo:other", "sveltekit-frontend/src/routes/api/embed/+server.ts")
        self.assertEqual(k1, k2)
        self.assertNotEqual(k1, k_diff_repo)
        self.assertRegex(k1, r"^packet:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")

        with self.assertRaises(ValueError):
            compute_packet_key_v2("invalid-scope", "src/a.ts")
        with self.assertRaises(ValueError):
            compute_packet_key_v2("repo:root", "src\\backslash.ts")

    def test_networkx_pagerank_over_149_bound_candidates(self):
        candidates = [
            json.loads(line)
            for line in DRAFT_V3_PATH.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        domains, edges, _ = load_taxonomy_domains()
        _, sanity1 = build_candidate_domain_networkx_graph(candidates, domains, edges)
        _, sanity2 = build_candidate_domain_networkx_graph(candidates, domains, edges)

        self.assertEqual(sanity1["boundCandidateCount"], 149)
        self.assertTrue(sanity1["didConverge"])
        self.assertTrue(sanity1["l1Normalized"])
        self.assertTrue(sanity1["varianceAboveEpsilon"])
        self.assertGreater(sanity1["distinctScoreCount"], 100)
        self.assertEqual(sanity1["graphOrdinalMapChecksum"], sanity2["graphOrdinalMapChecksum"])
        self.assertEqual(sanity1["scoresChecksum"], sanity2["scoresChecksum"])


if __name__ == "__main__":
    unittest.main()
