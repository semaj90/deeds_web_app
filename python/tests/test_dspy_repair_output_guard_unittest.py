import copy
import unittest

from python.parent_atlas_dspy_repair import validate_dspy_repair_output_v1


class DspyRepairOutputGuardTests(unittest.TestCase):
    def setUp(self):
        self.manifest_checksum = "sha256:" + "a" * 64
        self.allowed_evidence_refs = ["src/cache.ts#symbol:lookup", "tests/cache.test.ts"]
        self.allowed_target_ids = ["function:cache.lookup", "file:src/cache.ts"]
        self.output = {
            "schema": "atlas.dspy-repair-output.v1",
            "contextManifestChecksum": self.manifest_checksum,
            "diagnosis": "The cache key is stale.",
            "targetCandidates": ["function:cache.lookup", "file:src/cache.ts"],
            "patchPlan": "Update the key derivation.",
            "validationPlan": "Run the cache tests.",
            "evidenceRefs": ["tests/cache.test.ts", "src/cache.ts#symbol:lookup"],
        }

    def validate(self, output):
        return validate_dspy_repair_output_v1(
            output,
            context_manifest_checksum=self.manifest_checksum,
            allowed_evidence_refs=self.allowed_evidence_refs,
            allowed_target_ids=self.allowed_target_ids,
        )

    def test_valid_output_is_manifest_bound_and_preserves_target_rank(self):
        result = self.validate(self.output)
        self.assertEqual(result["targetCandidates"], ["function:cache.lookup", "file:src/cache.ts"])
        self.assertEqual(result["evidenceRefs"], ["src/cache.ts#symbol:lookup", "tests/cache.test.ts"])

    def test_invented_evidence_ref_is_rejected(self):
        output = copy.deepcopy(self.output)
        output["evidenceRefs"].append("invented.ts")
        with self.assertRaisesRegex(ValueError, "UNAUTHORIZED_EVIDENCE_REF"):
            self.validate(output)

    def test_invented_target_id_is_rejected(self):
        output = copy.deepcopy(self.output)
        output["targetCandidates"] = ["function:not-in-manifest"]
        with self.assertRaisesRegex(ValueError, "UNAUTHORIZED_TARGET_ID"):
            self.validate(output)

    def test_manifest_drift_and_extra_fields_are_rejected(self):
        output = copy.deepcopy(self.output)
        output["contextManifestChecksum"] = "sha256:" + "b" * 64
        with self.assertRaisesRegex(ValueError, "CONTEXT_MANIFEST_CHECKSUM_MISMATCH"):
            self.validate(output)
        output = copy.deepcopy(self.output)
        output["newAuthority"] = True
        with self.assertRaisesRegex(ValueError, "exactly"):
            self.validate(output)


if __name__ == "__main__":
    unittest.main()
