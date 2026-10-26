import hashlib
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

import miniforge_nlp_sidecar_v2 as sidecar  # noqa: E402


def test_documentation_fact_route_preserves_custom_attributes(monkeypatch):
    text = "PostgreSQL uses a GIN index."
    attributes = {"domain": "database", "rank": 2, "reviewed": False, "optional": None}
    start = text.index("GIN index")
    monkeypatch.setattr(
        sidecar,
        "_native_documentation_facts",
        lambda *_args, **_kwargs: [{
            "extraction_class": "DOCUMENTATION_FACT",
            "subject": "PostgreSQL",
            "predicate": "uses",
            "object": "a GIN index",
            "statement": "PostgreSQL uses a GIN index.",
            "evidence_text": "GIN index",
            "start_char": start,
            "end_char": start + len("GIN index"),
            "start_byte": len(text[:start].encode("utf-8")),
            "end_byte": len(text[:start + len("GIN index")].encode("utf-8")),
            "confidence": 0.9,
            "custom_attributes": attributes,
        }],
    )
    request = sidecar.DocumentationFactRequestV1(
        text=text,
        sourceUrl="https://example.test/postgres",
        sourceRevision=f"sha256:{hashlib.sha256(text.encode()).hexdigest()}",
    )

    response = sidecar.extract_documentation_facts(request).model_dump(by_alias=True)

    assert response["facts"][0]["customAttributesVersion"] == sidecar.CUSTOM_ATTRIBUTES_SCHEMA
    assert response["facts"][0]["customAttributes"] == attributes
    assert response["outputHash"] == hashlib.sha256(
        __import__("json").dumps(
            {"facts": response["facts"], "apiRules": response["apiRules"]},
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()


def test_custom_attributes_reject_nested_values_and_oversize_payloads():
    with pytest.raises(ValueError):
        sidecar.DocumentationFactV1.model_validate({
            "subject": "x", "predicate": "p", "object": "y", "statement": "x p y",
            "evidenceText": "x p y", "sourceUrl": "https://example.test",
            "sourceRevision": "rev1", "startChar": 0, "endChar": 5,
            "startByte": 0, "endByte": 5, "productVersion": "",
            "confidence": 0.5, "customAttributes": {"nested": {"bad": True}},
        })

    with pytest.raises(ValueError, match="CUSTOM_ATTRIBUTES_TOO_LARGE"):
        sidecar._validate_custom_attributes({f"key-{index}": "x" * 300 for index in range(32)})
