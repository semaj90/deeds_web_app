from __future__ import annotations

import hashlib
import json
import unittest

from atlas_grounded_nlp_fact_v1 import GroundedNlpFactV1 as GroundedNlpFactDataclassV1
from oak_agent.grounded_nlp_fact_v1 import GroundedNlpFactV1 as GroundedNlpFactPydanticV1


def _digest(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def _fixture() -> dict[str, object]:
    return {
        "schema": "atlas.grounded-nlp-fact.v1",
        "factId": "grounded-nlp:parity-fixture",
        "taskRef": "openspec/changes/example/tasks.md#L5",
        "canonicalTaskRef": "openspec-task:example/EX-01",
        "taskRevision": _digest(b"task block"),
        "evidenceCardChecksum": _digest(b"evidence card"),
        "sourceRef": "src/fixture.ts",
        "sourceRevision": _digest(b"const value = 1;"),
        "workspaceRevision": "workspace:fixture-v1",
        "extractorRevision": "atlas:nlp-extractor:fixture-v1",
        "extractorKind": "langextract",
        "featureKind": "identifier",
        "featureName": "value",
        "proposedLabel": "variable",
        "surfaceText": "value = 1",
        "confidence": 0.8,
        "evidenceSpan": {
            "byteStart": 6,
            "byteEnd": 15,
            "textSha256": hashlib.sha256(b"value = 1").hexdigest(),
        },
        "evidenceKey": "nlp-evidence:fixture",
        "canonicalAuthority": False,
        "ontologyPromotionAllowed": False,
    }


class GroundedNlpFactPydanticParityV1Tests(unittest.TestCase):
    def test_dataclass_and_pydantic_emit_identical_canonical_json(self) -> None:
        payload = _fixture()
        dataclass_fact = GroundedNlpFactDataclassV1.from_mapping(payload)
        pydantic_fact = GroundedNlpFactPydanticV1.model_validate(payload)
        dataclass_json = dataclass_fact.to_json()
        pydantic_json = json.dumps(
            pydantic_fact.model_dump(mode="json", by_alias=True),
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
            allow_nan=False,
        )

        self.assertEqual(dataclass_json, pydantic_json)
        self.assertEqual(
            set(dataclass_fact.to_mapping()),
            {field.alias or name for name, field in GroundedNlpFactPydanticV1.model_fields.items()},
        )
        self.assertEqual(
            _digest(dataclass_json.encode("utf-8")),
            _digest(pydantic_json.encode("utf-8")),
        )

    def test_pydantic_rejects_unknown_missing_and_unqualified_values(self) -> None:
        invalid_payloads = (
            {**_fixture(), "unreviewed": True},
            {key: value for key, value in _fixture().items() if key != "sourceRevision"},
            {**_fixture(), "sourceRevision": "unknown"},
            {**_fixture(), "evidenceSpan": {**_fixture()["evidenceSpan"], "byteEnd": 6}},
            {**_fixture(), "canonicalAuthority": True},
        )
        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    GroundedNlpFactPydanticV1.model_validate(payload)


if __name__ == "__main__":
    unittest.main()
