import unittest
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from parent_atlas_learning.ace_compiler import compile_ace_packet_from_proposal


CHECKSUM = "sha256:" + "a" * 64
TIMESTAMP = "2026-10-21T12:00:00Z"


def make_manifest():
    return {"checksum": CHECKSUM, "evidenceRefs": ["src/z.ts", "src/a.ts"]}


def make_proposal():
    return {
        "schema": "atlas.ace-packet-proposal.v1",
        "taskId": "TASK_TEST_001",
        "contextManifestChecksum": CHECKSUM,
        "evidenceRefs": ["src/z.ts", "src/a.ts"],
        "instruction": 'Keep "quoted" source facts intact.',
        "conceptId": "concept:test:v1",
    }


class TestAceCompiler(unittest.TestCase):
    def compile_packet(self, proposal=None, **kwargs):
        return compile_ace_packet_from_proposal(
            proposal or make_proposal(),
            context_manifest=kwargs.pop("context_manifest", make_manifest()),
            created_at=TIMESTAMP,
            **kwargs,
        )

    def test_compiler_is_deterministic_and_never_claims_admission(self):
        first = self.compile_packet()
        second = self.compile_packet()

        self.assertEqual(first, second)
        self.assertEqual(first["source_ref"], "src/a.ts")
        self.assertIs(first["canonical_authority"], False)
        self.assertIs(first["writes_performed"], False)
        self.assertEqual(first["evidence_qualification"]["admission_status"], "PROPOSED_NOT_ADMITTED")
        self.assertIsNone(first["nes_lut"]["lut_byte"])
        self.assertEqual(first["nes_lut"]["mapping_status"], "LEGACY_CONFLICT_UNRESOLVED")
        self.assertTrue(first["checksum"].startswith("sha256:"))

    def test_rejects_invalid_proposal_inputs(self):
        cases = [
            ({"schema": "wrong"}, "UNSUPPORTED_PROPOSAL_SCHEMA"),
            ({"evidenceRefs": ["src/missing.ts"]}, "UNAUTHORIZED_EVIDENCE"),
            ({"evidenceRefs": ["src/a.ts", "src/a.ts"]}, "DUPLICATE_EVIDENCE_REFS"),
            ({"taskId": "../bad"}, "INVALID_TASK_ID"),
            ({"conceptId": ""}, "INVALID_CONCEPT_ID"),
            ({"instruction": ""}, "INVALID_INSTRUCTION"),
            ({"writesPerformed": True}, "PROPOSAL_CLAIMS_WRITES_PERFORMED"),
            ({"confidenceScore": 1.5}, "INVALID_CONFIDENCE_SCORE"),
        ]
        for changes, error in cases:
            with self.subTest(error=error):
                candidate = make_proposal()
                candidate.update(changes)
                with self.assertRaisesRegex(ValueError, error):
                    self.compile_packet(candidate)

    def test_escapes_oak_tuple_strings_and_does_not_invent_confidence(self):
        packet = self.compile_packet()

        self.assertIn('\\"quoted\\"', packet["oak_python_tuple"])
        self.assertIsNone(packet["confidence_score"])

    def test_packet_identity_changes_with_proposal_and_unknown_domain_stays_unresolved(self):
        first = self.compile_packet()
        revised = make_proposal()
        revised["instruction"] = "A different reviewed proposal."
        second = self.compile_packet(revised, domain="unreviewed-domain")

        self.assertNotEqual(first["packet_id"], second["packet_id"])
        self.assertEqual(second["nes_lut"]["resolved_domain"], "general")
        self.assertIsNone(second["nes_lut"]["lut_byte"])
        self.assertEqual(second["nes_lut"]["mapping_status"], "UNKNOWN_DOMAIN_FALLBACK_GENERAL")

    def test_rejects_invalid_manifest_and_ttl(self):
        with self.assertRaisesRegex(ValueError, "INVALID_CONTEXT_MANIFEST_CHECKSUM"):
            self.compile_packet(context_manifest={"checksum": "", "evidenceRefs": []})
        with self.assertRaisesRegex(ValueError, "INVALID_CONTEXT_MANIFEST_EVIDENCE_REFS"):
            self.compile_packet(context_manifest={"checksum": CHECKSUM, "evidenceRefs": "src/a.ts"})
        with self.assertRaisesRegex(ValueError, "INVALID_TTL_SECONDS"):
            self.compile_packet(ttl_seconds=True)


if __name__ == "__main__":
    unittest.main()
