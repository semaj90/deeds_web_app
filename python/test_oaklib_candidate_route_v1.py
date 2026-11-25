import hashlib
import pytest

from fastapi import HTTPException
from pydantic import ValidationError

import miniforge_nlp_sidecar_v2 as sidecar
from parent_atlas_ontology.oaklib_external_adapter import (
    build_oaklib_candidate_bundle_v1,
    search_oaklib_label_candidates_v1,
)


def test_candidate_route_refuses_when_source_is_not_configured(monkeypatch):
    monkeypatch.delenv("ATLAS_OAKLIB_ONTOLOGY_ROOT", raising=False)
    monkeypatch.delenv("ATLAS_OAKLIB_ONTOLOGY_FILE", raising=False)

    request = sidecar.OaklibCandidateRequestV1(external_ids=["EX:1"])
    try:
        sidecar.oaklib_candidates(request)
    except HTTPException as exc:
        assert exc.status_code == 503
        assert exc.detail == "OAKLIB_SOURCE_NOT_CONFIGURED"
    else:
        raise AssertionError("unconfigured ontology source must be refused")


def test_health_reports_oak_source_readiness_without_promoting_it(tmp_path, monkeypatch):
    ontology_root = tmp_path / "ontology"
    ontology_root.mkdir()
    ontology_file = ontology_root / "fixture.obo"
    ontology_file.write_text(
        "format-version: 1.2\n\n[Term]\nid: EX:1\nname: fixture entity\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("ATLAS_OAKLIB_ONTOLOGY_ROOT", str(ontology_root))
    monkeypatch.setenv("ATLAS_OAKLIB_ONTOLOGY_FILE", ontology_file.name)

    configured = sidecar.health()["oaklibSource"]
    assert configured["status"] == "SOURCE_CONFIGURED"
    assert configured["ontologyRevision"] == "sha256:" + hashlib.sha256(ontology_file.read_bytes()).hexdigest()
    assert configured["canonicalAuthority"] is False

    monkeypatch.delenv("ATLAS_OAKLIB_ONTOLOGY_ROOT")
    monkeypatch.delenv("ATLAS_OAKLIB_ONTOLOGY_FILE")
    unavailable = sidecar.health()["oaklibSource"]
    assert unavailable == {
        "status": "OAKLIB_SOURCE_NOT_CONFIGURED",
        "ontologyRevision": None,
        "canonicalAuthority": False,
    }


def test_candidate_route_uses_server_pinned_local_source_and_returns_proposals(tmp_path, monkeypatch):
    ontology_root = tmp_path / "ontology"
    ontology_root.mkdir()
    ontology_file = ontology_root / "fixture.obo"
    ontology_file.write_text(
        "format-version: 1.2\n\n[Term]\nid: EX:1\nname: fixture entity\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("ATLAS_OAKLIB_ONTOLOGY_ROOT", str(ontology_root))
    monkeypatch.setenv("ATLAS_OAKLIB_ONTOLOGY_FILE", "fixture.obo")

    observed = {}

    def load_candidates(**kwargs):
        observed.update(kwargs)
        return {
            "schema": "atlas.oaklib-candidate-bundle.v1",
            "sourceSelector": "atlas-local-ontology",
            "concepts": [],
            "relations": [],
            "canonicalAuthority": False,
        }

    monkeypatch.setattr(sidecar, "_load_oaklib_candidates", load_candidates)
    request = sidecar.OaklibCandidateRequestV1(external_ids=["EX:1"])
    response = sidecar.oaklib_candidates(request).model_dump(by_alias=True)

    expected_revision = "sha256:" + hashlib.sha256(ontology_file.read_bytes()).hexdigest()
    body = response
    assert body["status"] == "PROPOSAL_ONLY"
    assert body["ontologyRevision"] == expected_revision
    assert body["canonicalAuthority"] is False
    assert body["writesPerformed"] is False
    assert observed["resource_selector"] == str(ontology_file.resolve())
    assert observed["ontology_revision"] == expected_revision
    assert observed["subjects"] == ["EX:1"]
    assert str(ontology_root) not in str(body)


def test_candidate_route_rejects_source_path_escape(tmp_path, monkeypatch):
    ontology_root = tmp_path / "ontology"
    ontology_root.mkdir()
    (tmp_path / "escape.obo").write_text("format-version: 1.2\n", encoding="utf-8")
    monkeypatch.setenv("ATLAS_OAKLIB_ONTOLOGY_ROOT", str(ontology_root))
    monkeypatch.setenv("ATLAS_OAKLIB_ONTOLOGY_FILE", "../escape.obo")

    request = sidecar.OaklibCandidateRequestV1(external_ids=["EX:1"])
    try:
        sidecar.oaklib_candidates(request)
    except HTTPException as exc:
        assert exc.status_code == 503
        assert exc.detail == "OAKLIB_SOURCE_INVALID"
    else:
        raise AssertionError("path escape must be refused")


def test_candidate_route_rejects_duplicate_ids():
    request = sidecar.OaklibCandidateRequestV1(external_ids=["EX:1", "EX:1"])
    try:
        sidecar.oaklib_candidates(request)
    except HTTPException as exc:
        assert exc.status_code == 422
        assert exc.detail == "OAKLIB_EXTERNAL_IDS_DUPLICATED"
    else:
        raise AssertionError("duplicate IDs must be refused")


def test_candidate_route_rejects_control_characters_and_extra_fields():
    request = sidecar.OaklibCandidateRequestV1(external_ids=["EX:1\nname"])
    try:
        sidecar.oaklib_candidates(request)
    except HTTPException as exc:
        assert exc.status_code == 422
        assert exc.detail == "OAKLIB_EXTERNAL_ID_INVALID"
    else:
        raise AssertionError("control characters must be refused")

    try:
        sidecar.OaklibCandidateRequestV1(external_ids=["EX:1"], resource_selector="https://example.invalid")
    except ValidationError:
        pass
    else:
        raise AssertionError("client-selected ontology sources must be refused")


def test_capabilities_advertise_proposal_only_endpoint():
    capability = sidecar.capabilities()["ontologyCandidateResolution"]
    assert capability == {
        "endpoint": "/ontology/oaklib/candidates",
        "status": "OPTIONAL_LOCAL_SOURCE_REQUIRED",
        "requestSchema": "atlas.oaklib-candidate-request.v1",
        "responseSchema": "atlas.oaklib-candidate-response.v1",
        "proposalOnly": True,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def test_candidate_route_is_registered_in_fastapi_openapi():
    operation = sidecar.app.openapi()["paths"]["/ontology/oaklib/candidates"]["post"]
    assert operation["operationId"] == "oaklib_candidates_ontology_oaklib_candidates_post"
    assert operation["requestBody"]["content"]["application/json"]["schema"]["$ref"].endswith(
        "/OaklibCandidateRequestV1"
    )


def test_label_search_route_is_bounded_and_proposal_only(tmp_path, monkeypatch):
    ontology_root = tmp_path / "ontology"
    ontology_root.mkdir()
    ontology_file = ontology_root / "fixture.obo"
    ontology_file.write_text("format-version: 1.2\n", encoding="utf-8")
    monkeypatch.setenv("ATLAS_OAKLIB_ONTOLOGY_ROOT", str(ontology_root))
    monkeypatch.setenv("ATLAS_OAKLIB_ONTOLOGY_FILE", "fixture.obo")
    observed = {}

    def search_labels(**kwargs):
        observed.update(kwargs)
        return {
            "schema": "atlas.oaklib-candidate-bundle.v1",
            "sourceSelector": "atlas-local-ontology",
            "ontologyRevision": kwargs["ontology_revision"],
            "producerRevision": kwargs["producer_revision"],
            "concepts": [],
            "relations": [],
            "canonicalAuthority": False,
            "matches": [{"searchText": "continuant", "externalIds": ["EX:1"]}],
        }

    monkeypatch.setattr(sidecar, "_search_oaklib_labels", search_labels)
    request = sidecar.OaklibLabelSearchRequestV1(terms=["continuant"])
    body = sidecar.oaklib_label_search(request).model_dump(by_alias=True)
    assert body["status"] == "PROPOSAL_ONLY"
    assert body["canonicalAuthority"] is False
    assert body["writesPerformed"] is False
    assert body["matches"][0]["externalIds"] == ["EX:1"]
    assert observed["resource_selector"] == str(ontology_file.resolve())
    assert observed["terms"] == ["continuant"]


def test_label_search_route_rejects_control_characters_and_client_source():
    try:
        sidecar.oaklib_label_search(sidecar.OaklibLabelSearchRequestV1(terms=["bad\nterm"]))
    except HTTPException as exc:
        assert exc.status_code == 422
        assert exc.detail == "OAKLIB_SEARCH_TERM_INVALID"
    else:
        raise AssertionError("control characters must be refused")

    try:
        sidecar.OaklibLabelSearchRequestV1(terms=["term"], ontology_path="/tmp/evil.obo")
    except ValidationError:
        pass
    else:
        raise AssertionError("client-selected ontology paths must be refused")


def test_label_search_route_is_registered_in_openapi_and_capabilities():
    operation = sidecar.app.openapi()["paths"]["/ontology/oaklib/search"]["post"]
    assert operation["requestBody"]["content"]["application/json"]["schema"]["$ref"].endswith(
        "/OaklibLabelSearchRequestV1"
    )
    assert sidecar.capabilities()["ontologyLabelSearch"]["proposalOnly"] is True


class FakeOakAdapter:
    def basic_search(self, search_term, config=None):
        return iter(["EX:2", "EX:1", "EX:2"])

    def label(self, entity_id):
        return {"EX:1": "Continuant one", "EX:2": "Continuant two"}.get(entity_id)

    def definition(self, entity_id):
        return None

    def relationships(self, subjects):
        return iter(())

    def sssom_mappings(self, curies=None, source=None):
        return iter(())


def test_oaklib_relationship_read_fails_closed_after_bounded_iterator_sentinel():
    observed = {"consumed": 0}

    class CountingRelationshipAdapter(FakeOakAdapter):
        def relationships(self, subjects):
            def rows():
                for index in range(1000):
                    observed["consumed"] += 1
                    yield ("EX:subject", "EX:related_to", f"EX:{index}")

            return rows()

    with pytest.raises(ValueError, match="OAKLIB_RELATION_RESULT_LIMIT_EXCEEDED"):
        build_oaklib_candidate_bundle_v1(
            CountingRelationshipAdapter(),
            subjects=["EX:subject"],
            source_selector="atlas-local-ontology",
            ontology_revision="sha256:ontology",
            producer_revision="sidecar:test",
            max_relationships=2,
        )

    assert observed["consumed"] == 3


def test_oaklib_label_search_normalizes_deduplicates_and_caps_results():
    result = search_oaklib_label_candidates_v1(
        FakeOakAdapter(),
        terms=[" continuant ", "CONTINUANT"],
        source_selector="atlas-local-ontology",
        ontology_revision="sha256:ontology",
        producer_revision="sidecar:test",
        max_candidates_per_term=1,
    )
    assert result["matches"] == [{"searchText": "continuant", "externalIds": ["EX:1"]}]
    assert [candidate["externalId"] for candidate in result["concepts"]] == ["EX:1"]
    assert result["relations"] == []
    assert result["canonicalAuthority"] is False


def test_oaklib_label_search_consumes_only_the_bounded_iterator_prefix():
    observed = {"consumed": 0, "search_config_limit": None}

    class CountingOakAdapter(FakeOakAdapter):
        def basic_search(self, search_term, config=None):
            observed["search_config_limit"] = getattr(config, "limit", None)

            def results():
                for index in range(1000):
                    observed["consumed"] += 1
                    yield f"EX:{index:04d}"

            return results()

    result = search_oaklib_label_candidates_v1(
        CountingOakAdapter(),
        terms=["bounded"],
        source_selector="atlas-local-ontology",
        ontology_revision="sha256:ontology",
        producer_revision="sidecar:test",
        max_candidates_per_term=2,
    )

    # The producer-side SearchConfiguration and consumer-side islice must agree:
    # no adapter may force an unbounded iterator to be materialized.
    assert observed["consumed"] == 16
    if observed["search_config_limit"] is not None:
        assert observed["search_config_limit"] == 16
    assert result["matches"][0]["externalIds"] == ["EX:0000", "EX:0001"]


def test_oaklib_label_search_returns_bounded_sssom_mapping_suggestions():
    from types import SimpleNamespace

    class MappingOakAdapter(FakeOakAdapter):
        def sssom_mappings(self, curies=None, source=None):
            assert tuple(curies) == ("EX:1", "EX:2")
            return iter([SimpleNamespace(
                subject_id="EX:1", predicate_id="skos:exactMatch", object_id="EXT:1",
                mapping_justification="semapv:ManualMappingCuration",
                subject_source="EX", object_source="EXT", subject_source_version="1",
                object_source_version="2", confidence=0.9,
            )])

    result = search_oaklib_label_candidates_v1(
        MappingOakAdapter(), terms=["continuant"], source_selector="atlas-local-ontology",
        ontology_revision="sha256:ontology", producer_revision="sidecar:test",
    )

    assert result["mappingProviderStatus"] == "AVAILABLE"
    assert result["mappingCandidates"] == [{
        "schema": "atlas.oaklib-mapping-candidate.v1",
        "candidateId": result["mappingCandidates"][0]["candidateId"],
        "subjectId": "EX:1", "predicateId": "skos:exactMatch", "objectId": "EXT:1",
        "mappingJustification": "semapv:ManualMappingCuration",
        "subjectSource": "EX", "objectSource": "EXT",
        "subjectSourceVersion": "1", "objectSourceVersion": "2", "confidence": 0.9,
        "ontologyRevision": "sha256:ontology", "producerRevision": "sidecar:test",
        "evidenceRefs": ["oaklib:atlas-local-ontology:sssom:EX:1|skos:exactMatch|EXT:1"],
        "status": "PROPOSED", "canonicalAuthority": False,
    }]


def test_oaklib_mapping_iterator_fails_closed_at_result_limit():
    observed = {"consumed": 0}

    class CountingMappingAdapter(FakeOakAdapter):
        def sssom_mappings(self, curies=None, source=None):
            def rows():
                for index in range(300):
                    observed["consumed"] += 1
                    yield type("Mapping", (), {
                        "subject_id": "EX:1", "predicate_id": "skos:exactMatch",
                        "object_id": f"EXT:{index}",
                    })()
            return rows()

    with pytest.raises(ValueError, match="OAKLIB_MAPPING_RESULT_LIMIT_EXCEEDED"):
        search_oaklib_label_candidates_v1(
            CountingMappingAdapter(), terms=["continuant"], source_selector="local",
            ontology_revision="r1", producer_revision="p1",
        )
    assert observed["consumed"] == 257


@pytest.mark.parametrize("confidence", [True, 1.1, float("nan"), "0.8"])
def test_oaklib_mapping_confidence_must_be_finite_unit_interval_number(confidence):
    from types import SimpleNamespace

    class InvalidConfidenceAdapter(FakeOakAdapter):
        def sssom_mappings(self, curies=None, source=None):
            return iter([SimpleNamespace(
                subject_id="EX:1", predicate_id="skos:exactMatch", object_id="EXT:1",
                confidence=confidence,
            )])

    with pytest.raises(ValueError, match="OAKLIB_MAPPING_CONFIDENCE_INVALID"):
        search_oaklib_label_candidates_v1(
            InvalidConfidenceAdapter(), terms=["continuant"], source_selector="local",
            ontology_revision="r1", producer_revision="p1",
        )


def test_oaklib_label_search_rejects_invalid_bounds_and_missing_search_owner():
    for kwargs in (
        {"terms": [], "max_candidates_per_term": 1},
        {"terms": ["term"], "max_candidates_per_term": 17},
        {"terms": ["\n"], "max_candidates_per_term": 1},
    ):
        try:
            search_oaklib_label_candidates_v1(
                FakeOakAdapter(), source_selector="local", ontology_revision="r1",
                producer_revision="p1", **kwargs
            )
        except ValueError:
            pass
        else:
            raise AssertionError("invalid OAKLIB search request must be refused")


def test_label_search_route_reads_real_server_pinned_obo_when_oaklib_is_installed(tmp_path, monkeypatch):
    pytest.importorskip("oaklib")
    ontology_root = tmp_path / "ontology"
    ontology_root.mkdir()
    ontology_file = ontology_root / "fixture.obo"
    ontology_file.write_text(
        "format-version: 1.2\n\n[Term]\nid: EX:1\nname: Information Retrieval\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("ATLAS_OAKLIB_ONTOLOGY_ROOT", str(ontology_root))
    monkeypatch.setenv("ATLAS_OAKLIB_ONTOLOGY_FILE", "fixture.obo")

    response = sidecar.oaklib_label_search(
        sidecar.OaklibLabelSearchRequestV1(terms=["Information Retrieval"])
    ).model_dump(by_alias=True)

    assert response["status"] == "PROPOSAL_ONLY"
    assert response["matches"] == [{"searchText": "Information Retrieval", "externalIds": ["EX:1"]}]
    assert response["candidateBundle"]["concepts"][0]["label"] == "Information Retrieval"
    assert response["canonicalAuthority"] is False
    assert response["writesPerformed"] is False


def test_domain_candidate_binding_keeps_observed_hash_noncanonical(tmp_path, monkeypatch):
    workspace = tmp_path / "workspace"
    source = workspace / "src" / "sample.py"
    source.parent.mkdir(parents=True)
    source.write_text("def sample():\n    return 1\n", encoding="utf-8")
    monkeypatch.setenv("WORKSPACE_ROOT", str(workspace))

    response = sidecar.bind_domain_candidate(
        sidecar.DomainCandidateBindRequestV1(
            packetKey="packet:caller-forged",
            sourceRef="src/sample.py",
            sourceRevision="revision:caller-forged",
            textEvidence="def sample():",
        )
    ).model_dump(by_alias=True)

    candidate = response["candidate"]
    assert candidate["packetKey"] is None
    assert candidate["sourceRevision"] is None
    assert candidate["unverifiedPacketKey"] == "packet:caller-forged"
    assert candidate["unverifiedSourceRevision"] == "revision:caller-forged"
    assert candidate["revisionResolution"] == "CONTENT_HASH_OBSERVED_NOT_ADMITTED"
    assert candidate["evidenceSpanCheck"]["exact_match"] is True
    assert response["canonicalAuthority"] is False
    assert response["writesPerformed"] is False
