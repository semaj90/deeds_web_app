#!/usr/bin/env python3
"""Tests for the existing DomainClassificationV1 parity oracle. No service or store access."""
import unittest
from pydantic import ValidationError
from atlas_okf_domain_parity_oracle_v1 import DomainClassificationV1, canonical

BASE = {
    "schemaVersion": "atlas.okf.domain-classification.v1",
    "classificationId": "classification:fixture:one",
    "subjectRef": "symbol:fixture:one",
    "subjectKind": "symbol",
    "domainId": "domain:code",
    "taxonomyRevision": "taxonomy:fixture:r1",
    "confidence": .875,
    "evidenceRefs": ["fixture:span:1"],
    "sourceRevision": "sha256:" + "a"*64,
    "producerId": "fixture",
    "producerRevision": "fixture:r1",
    "lifecycle": "OBSERVED",
}

class DomainOracleTests(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(DomainClassificationV1.model_validate(BASE).domainId, "domain:code")
    def test_empty_evidence(self):
        with self.assertRaises(ValidationError):
            DomainClassificationV1.model_validate({**BASE, "evidenceRefs": []})
    def test_empty_evidence_string(self):
        with self.assertRaises(ValidationError):
            DomainClassificationV1.model_validate({**BASE, "evidenceRefs": [""]})
    def test_boolean_confidence_rejected(self):
        with self.assertRaises(ValidationError):
            DomainClassificationV1.model_validate({**BASE, "confidence": True})
    def test_extra_field_rejected(self):
        with self.assertRaises(ValidationError):
            DomainClassificationV1.model_validate({**BASE, "unexpectedAuthority": True})
    def test_invalid_subject_kind(self):
        with self.assertRaises(ValidationError):
            DomainClassificationV1.model_validate({**BASE, "subjectKind": "unknown"})
    def test_canonical_sorted(self):
        self.assertEqual(canonical({"b": 1, "a": 2}), '{"a":2,"b":1}')

if __name__ == "__main__":
    unittest.main()
