import hashlib
import json
import unittest
from dataclasses import FrozenInstanceError

from atlas_grounded_nlp_fact_v1 import GroundedNlpFactV1


def digest(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def fixture() -> dict:
    return {
        "schema": "atlas.grounded-nlp-fact.v1",
        "factId": "grounded-nlp:fixture",
        "taskRef": "openspec/changes/example/tasks.md#L5",
        "canonicalTaskRef": "openspec-task:example/EX-01",
        "taskRevision": digest(b"task block"),
        "evidenceCardChecksum": digest(b"evidence card"),
        "sourceRef": "src/fixture.ts",
        "sourceRevision": digest(b"const x = 1;"),
        "workspaceRevision": "workspace:fixture-v1",
        "extractorRevision": "atlas:nlp-extractor:fixture-v1",
        "extractorKind": "langextract",
        "featureKind": "identifier",
        "featureName": "x",
        "proposedLabel": "x",
        "surfaceText": "x = 1",
        "confidence": 0.8,
        "evidenceSpan": {
            "byteStart": 6,
            "byteEnd": 11,
            "textSha256": hashlib.sha256(b"x = 1").hexdigest(),
        },
        "evidenceKey": "nlp-evidence:fixture",
        "canonicalAuthority": False,
        "ontologyPromotionAllowed": False,
    }


class GroundedNlpFactDataclassV1Tests(unittest.TestCase):
    def test_strict_json_round_trip_preserves_separate_revisions(self) -> None:
        payload = fixture()
        fact = GroundedNlpFactV1.from_json(json.dumps(payload))
        self.assertEqual(fact.to_mapping(), payload)
        self.assertNotEqual(fact.sourceRevision, fact.taskRevision)
        self.assertEqual(GroundedNlpFactV1.from_json(fact.to_json()).to_mapping(), payload)

    def test_rejects_unknown_missing_and_invalid_values(self) -> None:
        invalid_payloads = [
            {**fixture(), "extra": "no"},
            {key: value for key, value in fixture().items() if key != "sourceRevision"},
            {**fixture(), "sourceRevision": "unknown"},
            {**fixture(), "evidenceSpan": {**fixture()["evidenceSpan"], "byteEnd": 6}},
            {**fixture(), "canonicalAuthority": True},
            {**fixture(), "extractorKind": "unknown"},
            {**fixture(), "confidence": True},
        ]
        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    GroundedNlpFactV1.from_mapping(payload)

    def test_instance_is_frozen(self) -> None:
        fact = GroundedNlpFactV1.from_mapping(fixture())
        with self.assertRaises(FrozenInstanceError):
            fact.factId = "changed"


if __name__ == "__main__":
    unittest.main()
