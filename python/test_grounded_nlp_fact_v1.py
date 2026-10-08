import hashlib
import unittest

from pydantic import ValidationError

from oak_agent.grounded_nlp_fact_v1 import GroundedNlpFactV1


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


class GroundedNlpFactV1Tests(unittest.TestCase):
    def test_round_trip_preserves_fact_and_separate_revisions(self) -> None:
        payload = fixture()
        fact = GroundedNlpFactV1.model_validate(payload)
        self.assertEqual(fact.model_dump(mode="json", by_alias=True), payload)
        self.assertNotEqual(fact.sourceRevision, fact.taskRevision)

    def test_rejects_unknown_or_missing_fields(self) -> None:
        with self.assertRaises(ValidationError):
            GroundedNlpFactV1.model_validate({**fixture(), "extra": "not allowed"})
        missing = fixture()
        del missing["sourceRevision"]
        with self.assertRaises(ValidationError):
            GroundedNlpFactV1.model_validate(missing)
        missing = fixture()
        del missing["confidence"]
        with self.assertRaises(ValidationError):
            GroundedNlpFactV1.model_validate(missing)

    def test_rejects_invalid_lineage_span_and_authority(self) -> None:
        invalid = fixture()
        invalid["sourceRevision"] = "sha256:invalid"
        with self.assertRaises(ValidationError):
            GroundedNlpFactV1.model_validate(invalid)
        invalid = fixture()
        invalid["evidenceSpan"] = {**invalid["evidenceSpan"], "byteEnd": 6}
        with self.assertRaises(ValidationError):
            GroundedNlpFactV1.model_validate(invalid)
        invalid = fixture()
        invalid["canonicalAuthority"] = True
        with self.assertRaises(ValidationError):
            GroundedNlpFactV1.model_validate(invalid)


if __name__ == "__main__":
    unittest.main()
