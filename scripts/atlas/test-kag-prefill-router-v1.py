"""Tests for scripts/atlas/kag_prefill_router_v1.py (pin, routing, authority flags)."""
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("kag_prefill_router_v1", HERE / "kag_prefill_router_v1.py")
router = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = router  # dataclasses look the module up by name while it executes
spec.loader.exec_module(router)

PINNED = router.REPO_ROOT / "docs" / "reports" / f"openspec-task-rank-fuse-v1.{router.PINNED_FUSE_STAMP}.jsonl"


class PinTests(unittest.TestCase):
    def test_pinned_run_is_accepted(self):
        routing, digest = router.check_pin(PINNED, allow_unpinned=False)
        self.assertEqual(routing, "PINNED")
        self.assertEqual(digest, router.PINNED_FUSE_SHA256)

    def test_wrong_name_is_refused_without_flag(self):
        with tempfile.TemporaryDirectory() as tmp:
            other = Path(tmp) / "openspec-task-rank-fuse-v1.20261107T204016Z.jsonl"
            other.write_text("{}\n", encoding="utf-8")
            with self.assertRaises(SystemExit) as ctx:
                router.check_pin(other, allow_unpinned=False)
            self.assertIn("ROUTING_PIN_MISMATCH", str(ctx.exception))

    def test_same_name_different_content_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            edited = Path(tmp) / PINNED.name
            edited.write_text("{}\n", encoding="utf-8")
            with self.assertRaises(SystemExit):
                router.check_pin(edited, allow_unpinned=False)

    def test_unpinned_allowed_only_with_flag(self):
        with tempfile.TemporaryDirectory() as tmp:
            other = Path(tmp) / "openspec-task-rank-fuse-v1.20261107T204016Z.jsonl"
            other.write_text("{}\n", encoding="utf-8")
            routing, _ = router.check_pin(other, allow_unpinned=True)
            self.assertEqual(routing, "UNPINNED")


class RoutingTests(unittest.TestCase):
    def _packet(self, community):
        row = {"id": "openspec/changes/x/tasks.md#1", "text": "task text", "community": community, "rrf": 0.5}
        return router.synthesize_kag_candidate_from_ranked_row(row, ordinal=0)

    def test_unmapped_community_is_unrouted(self):
        pkt = self._packet(99)
        self.assertEqual(pkt.hyperedge.llms_txt_refs, [])
        self.assertIsNone(pkt.hyperedge.remediation_test_cmd)
        self.assertEqual(pkt.prefill_context_slice, "")
        self.assertIsNone(pkt.prefill_sha256)

    def test_community_10_gate_is_unavailable_not_a_dead_path(self):
        pkt = self._packet(10)
        self.assertIsNone(pkt.hyperedge.remediation_test_cmd)
        self.assertNotIn("index-okf-dev-corpus", str(pkt.ontology_tuples))

    def test_mutation_never_authorized(self):
        for comm in (1, 6, 10, 99):
            self.assertFalse(self._packet(comm).mutation_authorized)

    def test_no_tuple_is_canonical_and_no_verified_predicate(self):
        for comm in (1, 6, 99):
            for t in self._packet(comm).ontology_tuples:
                self.assertFalse(t.canonical_authority)
                self.assertNotEqual(t.predicate, "VERIFIED_BY_GATE_CMD")

    def test_morton_code_not_invented(self):
        self.assertIsNone(self._packet(6).ordinal_map.morton_or_lut_code)


if __name__ == "__main__":
    unittest.main()
