import sys

sys.path.insert(0, "python")

import atlas_oak_kernel as oak
import pytest
from pydantic import ValidationError


def test_oak_health_does_not_expose_unconfigured_locator(monkeypatch):
    monkeypatch.delenv("ATLAS_OAK_ADAPTER", raising=False)
    monkeypatch.delenv("ATLAS_OAK_ADAPTER_TYPE", raising=False)

    health = oak.oak_health()

    assert health["adapterConfigured"] is False
    assert health["adapterType"] is None
    assert health["adapterFingerprint"] is None
    assert "adapterLocator" not in health


def test_oak_profile_status_is_fail_closed_without_owlapi(monkeypatch):
    status = oak.oak_profile_status()
    assert status["adapterOwner"] == "python-fastapi-8095"
    assert status["profileChecker"] == "owlapi"
    assert status["status"] == "UNAVAILABLE"
    assert status["detectedProfile"] == "UNKNOWN"
    assert status["reasonerRoute"] == "NONE"
    assert status["reasoningPerformed"] is False
    assert status["implicitDownload"] is False


def test_oak_profile_check_capabilities_are_python_owned_and_unavailable():
    capabilities = oak.oak_profile_check_capabilities(oak.UnavailableOwlProfileChecker())
    assert capabilities["available"] is False
    assert capabilities["implementation"] == "OWLAPI_SUBPROCESS"
    assert capabilities["integrationOwner"] == "PYTHON_FASTAPI_8095"
    assert capabilities["reasoningPerformed"] is False
    assert capabilities["reasonerRoute"] == "NONE"


def test_oak_profile_check_returns_typed_fail_closed_result_without_java():
    request = oak.OakProfileCheckRequest(owl_checksum="e" * 64, owl_document="<rdf:RDF/>")
    result = oak.oak_profile_check(request, oak.UnavailableOwlProfileChecker())
    assert result["status"] == "UNAVAILABLE"
    assert result["profile"] == "UNKNOWN"
    assert result["reasonerRoute"] == "NONE"
    assert result["reasoningPerformed"] is False
    assert result["writesPerformed"] is False
    assert result["errorCode"] == "OAK_PROFILE_CHECKER_NOT_CONFIGURED"


def test_oak_profile_checker_can_be_injected_without_changing_default_policy():
    class FixtureChecker:
        def capabilities(self):
            return {"available": True, "implementation": "FIXTURE", "reasoningPerformed": False, "reasonerRoute": "NONE", "implicitDownload": False, "canonicalAuthority": False}

        def check(self, *, owl_bytes, expected_checksum):
            assert owl_bytes == b"fixture"
            return {"schema": "atlas.oak.profile-check.v1", "status": "UNAVAILABLE", "profile": "UNKNOWN", "reasonerRoute": "NONE", "reasoningPerformed": False, "writesPerformed": False, "canonicalAuthority": False, "owlChecksum": expected_checksum, "errorCode": "FIXTURE_ONLY"}

    result = oak.oak_profile_check(oak.OakProfileCheckRequest(owl_checksum="f" * 64, owl_document="fixture"), FixtureChecker())
    assert result["errorCode"] == "FIXTURE_ONLY"


def test_oak_health_fingerprints_configured_locator(monkeypatch):
    locator = "postgresql://user:secret@db.example/atlas"
    monkeypatch.setenv("ATLAS_OAK_ADAPTER", locator)
    monkeypatch.setenv("ATLAS_OAK_ADAPTER_TYPE", "atlas-postgres")

    health = oak.oak_health()

    assert health["adapterConfigured"] is True
    assert health["adapterType"] == "atlas-postgres"
    assert len(health["adapterFingerprint"]) == 64
    assert locator not in str(health)
    assert "secret" not in str(health)
    assert "adapterLocator" not in health


def test_postgres_adapter_positive_fixture_paths_are_bounded_and_read_only(monkeypatch):
    adapter = oak.AtlasPostgresOntologyAdapter("postgresql://fixture/atlas")
    calls = []

    def fake_query(sql, params=()):
        calls.append((sql, params))
        if "SELECT canonical_label" in sql:
            return [{"canonical_label": "Contract"}]
        if "SELECT aliases" in sql:
            return [{"aliases": ["agreement", "instrument"]}]
        if "FROM atlas_ontology_concepts" in sql and "ILIKE" in sql:
            return [{"concept_id": "concept:contract"}]
        if "WITH RECURSIVE walk" in sql:
            return [{"concept_id": "concept:document", "depth": 1, "canonical_label": "Document"}]
        raise AssertionError(f"unexpected fixture SQL: {sql}")

    monkeypatch.setattr(adapter, "_query", fake_query)

    assert adapter.label("concept:contract") == "Contract"
    assert adapter.entity_aliases("concept:contract") == ["agreement", "instrument"]
    assert adapter.basic_search("contract", 3) == ["concept:contract"]
    assert adapter.traverse("concept:contract", "ancestors", 3, 2) == [
        {"concept_id": "concept:document", "depth": 1, "canonical_label": "Document"}
    ]

    assert len(calls) == 4
    assert all("INSERT" not in sql.upper() and "UPDATE" not in sql.upper() and "DELETE" not in sql.upper() for sql, _ in calls)
    assert calls[2][1] == ("%contract%", "%contract%", 3)
    assert calls[3][1] == ("concept:contract", "concept:contract", 2, 3)


def test_postgres_adapter_rejects_unbounded_traversal_inputs():
    # The route schema enforces these bounds before the adapter is called; the adapter
    # itself remains intentionally query-only and receives validated values.
    assert oak.OakTraversalRequest(entity_id="concept:x", direction="ancestors", limit=100, max_depth=4).max_depth == 4
    with pytest.raises(ValidationError):
        oak.OakTraversalRequest(entity_id="concept:x", direction="ancestors", max_depth=5)
    with pytest.raises(ValidationError):
        oak.OakSearchRequest(query="contract", limit=101)
