from research_contracts import ParameterArtifactV1, WebSearchEnvelopeV1


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
