import unittest

from parent_atlas_ontology.domain_mapping import (
    admit_domain_classification,
    admit_domain_classifications,
)


class DomainOntologyMappingTests(unittest.TestCase):
    def test_known_label_is_admitted(self):
        result = admit_domain_classification("retrieval", confidence=0.91)
        self.assertEqual(result.status, "ADMITTED")
        self.assertEqual(result.classId, "atlas:RetrievalDomain")
        self.assertTrue(result.mappingRevision.startswith("sha256:"))
        self.assertFalse(result.canonicalAuthority)
        self.assertFalse(result.writesPerformed)

    def test_alias_is_admitted_without_minting_a_new_class(self):
        result = admit_domain_classification("search", confidence=1.0)
        self.assertEqual(result.classId, "atlas:RetrievalDomain")

    def test_unknown_label_fails_closed(self):
        result = admit_domain_classification("invented-domain", confidence=1.0)
        self.assertEqual(result.status, "UNMAPPED")
        self.assertIsNone(result.classId)

    def test_batch_order_is_stable(self):
        results = admit_domain_classifications({"workflow": 1.0, "database": 1.0})
        self.assertEqual([item.domainLabel for item in results], ["database", "workflow"])


if __name__ == "__main__":
    unittest.main()
