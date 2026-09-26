import pytest

from research_contracts import FetchedResearchDocumentV1, ParameterArtifactV1, WebSearchEnvelopeV1


def test_web_search_envelope_is_bounded_and_noncanonical():
    envelope = WebSearchEnvelopeV1(
        query="pgvector cosine similarity",
        provider="searxng",
        results=[{"title": "pgvector", "url": "https://github.com/pgvector/pgvector", "source": "searxng"}],
    )
    assert envelope.canonical_authority is False
    assert envelope.writes_performed is False
    assert envelope.results[0].url.startswith("https://")


def test_parameter_artifact_cannot_be_authority_by_default():
    artifact = ParameterArtifactV1(
        parameter_key="retrieval.top_k",
        value=10,
        input_checksum="sha256:input",
        producer_revision="atlas.test.v1",
    )
    assert artifact.canonical_authority is False
    assert artifact.writes_performed is False


def test_fetched_document_is_bounded_noncanonical_and_checksum_bound():
    text = "PostgreSQL 18 uses asynchronous I/O."
    document = FetchedResearchDocumentV1.model_validate({
        "query": "PostgreSQL 18 asynchronous I/O",
        "url": "https://www.postgresql.org/docs/18/runtime-config-resource.html",
        "resolved_url": "https://www.postgresql.org/docs/18/runtime-config-resource.html",
        "title": "Resource Consumption",
        "fetcher": "BEAUTIFULSOUP_HTTP",
        "normalized_text": text,
        "normalized_checksum": FetchedResearchDocumentV1.checksum_for(text),
    })
    assert document.canonical_authority is False
    assert document.writes_performed is False


def test_fetched_document_rejects_checksum_mismatch_and_unknown_authority_fields():
    base = {
        "query": "PostgreSQL",
        "url": "https://example.test/docs",
        "resolved_url": "https://example.test/docs",
        "title": "Docs",
        "fetcher": "BEAUTIFULSOUP_HTTP",
        "normalized_text": "evidence",
        "normalized_checksum": "0" * 64,
    }
    with pytest.raises(ValueError, match="FETCHED_DOCUMENT_CHECKSUM_MISMATCH"):
        FetchedResearchDocumentV1.model_validate(base)
    with pytest.raises(ValueError):
        FetchedResearchDocumentV1.model_validate({**base, "canonical_authority": True})
