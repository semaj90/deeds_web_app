import unittest

from parent_atlas_ontology.source_authority import SourceAuthorityBindingV1


class SourceAuthorityBindingTests(unittest.TestCase):
    def test_requires_explicit_namespace_and_revisions(self):
        binding = SourceAuthorityBindingV1(
            sourceNamespace="workspace:deeds-web-app",
            sourceRef="src/example.ts",
            sourceRevision="sha256:" + "a" * 64,
            workspaceRevision="sha256:" + "b" * 64,
            contentDigest="c" * 64,
            evidenceRefs=("graphify:run-1:src/example.ts",),
        )
        self.assertFalse(binding.canonicalAuthority)
        self.assertFalse(binding.writesPerformed)

    def test_rejects_missing_or_inferred_authority(self):
        with self.assertRaisesRegex(ValueError, "SOURCE_NAMESPACE_UNPROVEN"):
            SourceAuthorityBindingV1(
                sourceNamespace="", sourceRef="src/example.ts",
                sourceRevision="sha256:" + "a" * 64,
                workspaceRevision="sha256:" + "b" * 64,
                contentDigest="c" * 64,
                evidenceRefs=("graphify:run-1:src/example.ts",),
            )


if __name__ == "__main__":
    unittest.main()
