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


def test_typed_assertion_request_is_strict_and_uses_only_known_predicates():
    valid = oak.OakTypedAssertionRequest.model_validate({
        "subject": "concept:hnsw", "predicate": "PART_OF",
        "object": "concept:pgvector", "evidenceRef": "span:10-20",
    })
    assert valid.subject_concept_id == "concept:hnsw"
    for payload in (
        {"subject": "concept:hnsw", "predicate": "INVENTED", "object": "concept:pgvector", "evidenceRef": "span:10-20"},
        {"subject": "concept:hnsw", "predicate": "PART_OF", "object": "concept:pgvector", "evidenceRef": ""},
        {"subject": "concept:hnsw", "predicate": "PART_OF", "object": "concept:pgvector", "evidenceRef": "span:10-20", "claimText": "arbitrary prose"},
    ):
        with pytest.raises(ValidationError):
            oak.OakTypedAssertionRequest.model_validate(payload)


def test_postgres_typed_assertion_query_is_exact_bounded_and_read_only(monkeypatch):
    adapter = oak.AtlasPostgresOntologyAdapter("postgresql://fixture/atlas")
    calls = []
    relation = {
        "relation_id": "rel-1", "subject_concept_id": "concept:hnsw",
        "predicate": "PART_OF", "object_concept_id": "concept:pgvector",
        "confidence": 1.0, "extractor_version": "test-v1",
    }

    def fake_query(sql, params=()):
        calls.append((sql, params))
        return [relation]

    monkeypatch.setattr(adapter, "_query", fake_query)
    assert adapter.match_typed_assertion("concept:hnsw", "PART_OF", "concept:pgvector") == [relation]
    sql, params = calls[0]
    assert params == ("concept:hnsw", "PART_OF", "concept:pgvector")
    assert "subject_concept_id = %s" in sql
    assert "predicate = %s" in sql
    assert "object_concept_id = %s" in sql
    assert "LIMIT 2" in sql
    assert "ILIKE" not in sql.upper()
    assert not any(word in sql.upper() for word in ("INSERT", "UPDATE", "DELETE", "UPSERT"))


def test_typed_assertion_route_reports_relation_match_without_claiming_source_verification(monkeypatch):
    adapter = oak.AtlasPostgresOntologyAdapter("postgresql://fixture/atlas")
    monkeypatch.setattr(oak, "_adapter", lambda: adapter)
    monkeypatch.setattr(adapter, "match_typed_assertion", lambda *_: [{
        "relation_id": "rel-1", "subject_concept_id": "concept:hnsw",
        "predicate": "PART_OF", "object_concept_id": "concept:pgvector",
        "confidence": 1.0, "extractor_version": "test-v1",
    }])
    request = oak.OakTypedAssertionRequest.model_validate({
        "subject": "concept:hnsw", "predicate": "PART_OF",
        "object": "concept:pgvector", "evidenceRef": "span:10-20",
    })
    result = oak.oak_check_typed_assertion(request)
    assert result["status"] == "MATCHED"
    assert result["sourceSpanVerification"] == "NOT_PERFORMED"
    assert result["canonicalAuthority"] is False
    assert result["writesPerformed"] is False
    assert result["assertion"]["evidenceRef"] == "span:10-20"


@pytest.mark.parametrize(("rows", "expected_status"), [([], "NOT_FOUND"), ([{}, {}], "AMBIGUOUS")])
def test_typed_assertion_route_fails_closed_for_missing_or_ambiguous_relations(monkeypatch, rows, expected_status):
    adapter = oak.AtlasPostgresOntologyAdapter("postgresql://fixture/atlas")
    monkeypatch.setattr(oak, "_adapter", lambda: adapter)
    monkeypatch.setattr(adapter, "match_typed_assertion", lambda *_: rows)
    request = oak.OakTypedAssertionRequest.model_validate({
        "subject": "concept:hnsw", "predicate": "PART_OF",
        "object": "concept:pgvector", "evidenceRef": "span:10-20",
    })
    result = oak.oak_check_typed_assertion(request)
    assert result["status"] == expected_status
    assert result["matchedRelation"] is None
    assert result["canonicalAuthority"] is False


def test_typed_assertion_route_fails_closed_for_non_postgres_adapter(monkeypatch):
    class FixtureAdapter:
        pass

    monkeypatch.setattr(oak, "_adapter", lambda: FixtureAdapter())
    request = oak.OakTypedAssertionRequest.model_validate({
        "subject": "concept:hnsw", "predicate": "PART_OF",
        "object": "concept:pgvector", "evidenceRef": "span:10-20",
    })
    with pytest.raises(oak.HTTPException) as error:
        oak.oak_check_typed_assertion(request)
    assert error.value.status_code == 503
    assert error.value.detail == "OAK_TYPED_ASSERTION_POSTGRES_ADAPTER_REQUIRED"


def test_oaklib_traversal_route_reuses_obograph_interface_for_both_directions(monkeypatch):
    calls = []

    class FixtureOboGraphInterface:
        def ancestors(self, entity_id, **kwargs):
            calls.append(("ancestors", entity_id, kwargs))
            return ["PARENT:1"]

        def descendants(self, entity_id, **kwargs):
            calls.append(("descendants", entity_id, kwargs))
            return ["CHILD:1"]

        def label(self, entity_id):
            return f"label:{entity_id}"

    adapter = FixtureOboGraphInterface()
    monkeypatch.setattr(oak, "OboGraphInterface", FixtureOboGraphInterface)
    monkeypatch.setattr(oak, "_adapter", lambda: adapter)

    ancestors = oak.oak_traverse(oak.OakTraversalRequest(
        entity_id="TERM:0", direction="ancestors", predicates=["is_a"], limit=5, max_depth=2,
    ))
    descendants = oak.oak_traverse(oak.OakTraversalRequest(
        entity_id="TERM:0", direction="descendants", predicates=["part_of"], limit=5, max_depth=2,
    ))

    assert [node["entityId"] for node in ancestors["nodes"]] == ["PARENT:1"]
    assert [node["entityId"] for node in descendants["nodes"]] == ["CHILD:1"]
    assert calls == [
        ("ancestors", "TERM:0", {"predicates": ["is_a"]}),
        ("descendants", "TERM:0", {"predicates": ["part_of"]}),
    ]
    assert ancestors["canonicalAuthority"] is False
    assert descendants["canonicalAuthority"] is False
