"""Unit tests for Parent Atlas strict deterministic checker, advantage calculation, and ACE compiler."""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "python"))

from parent_atlas_learning.strict_checker import check_episode
from parent_atlas_learning.episode_runner import compute_group_advantages, run_episode_group_rollout
from parent_atlas_learning.advisory_ranker import AdvisoryRanker, to_feature_matrix
from parent_atlas_learning.ace_compiler import compile_ace_packet_from_proposal
from parent_atlas_learning.contracts import CandidateFeature


class TestStrictChecker(unittest.TestCase):
    def setUp(self):
        self.task_id = "TASK_TEST_001"
        self.manifest_checksum = "sha256:1111111111111111111111111111111111111111111111111111111111111111"
        self.allowed_evidence = {"file_a.ts", "file_b.md"}
        self.valid_proposal = {
            "schema": "atlas.ace-packet-proposal.v1",
            "taskId": self.task_id,
            "contextManifestChecksum": self.manifest_checksum,
            "evidenceRefs": ["file_a.ts"],
            "instruction": "Fix bug",
            "writesPerformed": False,
        }

    def test_valid_proposal_passes_hard_gates(self):
        result = check_episode(
            self.valid_proposal,
            allowed_evidence=self.allowed_evidence,
            approved_task_id=self.task_id,
            tests_passed=True,
            scope_valid=True,
            latency_ms=100.0,
        )
        self.assertTrue(result.eligible)
        self.assertGreaterEqual(result.reward, 0.60)
        self.assertEqual(len(result.failures), 0)

    def test_scope_violation_zeros_reward(self):
        result = check_episode(
            self.valid_proposal,
            allowed_evidence=self.allowed_evidence,
            approved_task_id=self.task_id,
            tests_passed=True,
            scope_valid=False,
        )
        self.assertFalse(result.eligible)
        self.assertEqual(result.reward, 0.0)
        self.assertIn("SCOPE_VIOLATION", result.failures)

    def test_unqualified_evidence_zeros_reward(self):
        bad_proposal = dict(self.valid_proposal)
        bad_proposal["evidenceRefs"] = ["file_a.ts", "unauthorized_file.ts"]
        result = check_episode(
            bad_proposal,
            allowed_evidence=self.allowed_evidence,
            approved_task_id=self.task_id,
            tests_passed=True,
            scope_valid=True,
        )
        self.assertFalse(result.eligible)
        self.assertEqual(result.reward, 0.0)
        self.assertTrue(any("UNQUALIFIED_EVIDENCE" in f for f in result.failures))

    def test_test_failure_zeros_reward(self):
        result = check_episode(
            self.valid_proposal,
            allowed_evidence=self.allowed_evidence,
            approved_task_id=self.task_id,
            tests_passed=False,
            scope_valid=True,
        )
        self.assertFalse(result.eligible)
        self.assertEqual(result.reward, 0.0)
        self.assertIn("TEST_FAILURE", result.failures)


class TestGroupAdvantages(unittest.TestCase):
    def test_advantage_zero_mean_property(self):
        rewards = [0.90, 0.00, 0.75, 0.00, 0.00, 0.60, 0.00, 0.00]
        mean, std, advs = compute_group_advantages(rewards)
        self.assertAlmostEqual(mean, 0.281, places=2)
        self.assertGreater(std, 0.0)
        self.assertEqual(len(advs), 8)
        self.assertGreater(advs[0], 0.0)  # 0.90 has positive advantage
        self.assertLess(advs[1], 0.0)     # 0.00 has negative advantage


class TestAceCompiler(unittest.TestCase):
    def test_compile_ace_packet(self):
        manifest = {
            "checksum": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
            "evidenceRefs": ["file_a.ts"],
        }
        proposal = {
            "schema": "atlas.ace-packet-proposal.v1",
            "taskId": "TASK_TEST_001",
            "contextManifestChecksum": manifest["checksum"],
            "evidenceRefs": ["file_a.ts"],
            "instruction": "A11y fix",
            "conceptId": "concept:ui:test:v1",
        }
        packet = compile_ace_packet_from_proposal(proposal, context_manifest=manifest, domain="ui")
        self.assertTrue(packet["packet_id"].startswith("ace:packet:"))
        self.assertEqual(packet["nes_lut"]["palette_byte"], "0x2A")
        self.assertEqual(packet["canonical_authority"], False)
        self.assertEqual(packet["writes_performed"], False)
        self.assertIn("hiddenThoughts", packet["prompt_injection_guard"]["forbidden_payloads"])


if __name__ == "__main__":
    unittest.main()
