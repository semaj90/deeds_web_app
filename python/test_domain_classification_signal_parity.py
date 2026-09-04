import json
import unittest
from pathlib import Path

from parent_atlas_ontology.domain_tuple_bridge import (
    DomainClassificationSignalV1,
    domain_classification_signal_checksum,
)


FIXTURE = Path(__file__).resolve().parents[1] / "docs" / "reports" / "fixtures" / "domain-classification-admission-v1.json"


class DomainClassificationSignalParityTests(unittest.TestCase):
    def test_shared_fixture_matches_typescript_checksum_contract(self):
        fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
        signal = DomainClassificationSignalV1.from_contract_dict(fixture["signal"])
        self.assertEqual(domain_classification_signal_checksum(signal), fixture["signalChecksum"])

    def test_shared_fixture_keeps_evidence_source_revision_bound(self):
        fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
        signal = fixture["signal"]
        evidence = fixture["evidence"][signal["evidence_refs"][0]]
        self.assertEqual(signal["source_ref"], evidence["sourceRef"])
        self.assertEqual(signal["source_revision"], evidence["sourceRevision"])


if __name__ == "__main__":
    unittest.main()
