from pathlib import Path
import json

from jsonschema import Draft202012Validator

from scripts.atlas.validate_okf_concept_gaps import validate_document


ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = ROOT / ".okf" / "schemas" / "okf-concept-gap-v1.schema.json"
CONCEPTS_ROOT = ROOT / ".okf" / "concepts"
SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
Draft202012Validator.check_schema(SCHEMA)
VALIDATOR = Draft202012Validator(SCHEMA)


def test_all_concept_gap_documents_validate_against_registered_schema():
    documents = sorted(CONCEPTS_ROOT.glob("*.yaml"))

    assert len(documents) == 6
    assert all(not validate_document(path.read_text(encoding="utf-8"), VALIDATOR) for path in documents)


def test_duplicate_yaml_keys_are_rejected():
    document = """schema: atlas.okf-concept-gap.v1
schema: atlas.okf-concept-gap.v1
"""

    errors = validate_document(document, VALIDATOR)

    assert len(errors) == 1
    assert errors[0].startswith("INVALID_YAML:")


def test_invalid_gap_identity_and_evidence_are_rejected():
    document = {
        "schema": "atlas.okf-concept-gap.v1",
        "gap_id": "",
        "title": "example",
        "status": "PASS",
        "owner": "atlas",
        "summary": "example gap",
        "evidence": [{"ref": ""}],
        "discovered_at": "2026-10-27",
    }

    errors = validate_document(json.dumps(document), VALIDATOR)

    assert len(errors) == 3
