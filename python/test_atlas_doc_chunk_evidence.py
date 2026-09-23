"""EXTERNAL_DOC_CHUNK_EVIDENCE_IDENTITY_01: native page DocCoordinateV1 + chunk-grain evidence identity."""

from __future__ import annotations

import json

import pytest

import atlas_okf_docs_pipeline as P
from atlas_doc_coordinate import ExternalDocChunkEvidenceV1, build_doc_coordinate, canonical_encode_v1, chunk_evidence_revision
from atlas_external_docs import _normalize_ws, _sha, chunk_document

LONG_SECTION = "# Guide\n" + "\n".join(f"Paragraph {i} explains index tuning for halfvec and hnsw in some detail here." for i in range(40))


def _page_coordinate(text: str, **overrides: object):
    values = dict(provider="pgvector", product="pgvector", product_version="0.8", url="https://example.org/a", content_hash=_sha(_normalize_ws(text)))
    values.update(overrides)
    return build_doc_coordinate(**values)  # type: ignore[arg-type]


def _chunks(text: str, coordinate, **kw):
    return chunk_document(source_id="s", source_revision="r", source_url=coordinate.url, title="T", text=text,
                          maximum_chars=kw.get("maximum_chars", 400), overlap_chars=kw.get("overlap_chars", 50), doc_coordinate=coordinate)


def test_same_heading_multiple_chunks_get_distinct_chunk_evidence_and_one_parent_revision():  # A
    coordinate = _page_coordinate(LONG_SECTION)
    chunks = _chunks(LONG_SECTION, coordinate)
    assert len(chunks) > 3
    assert {c.heading_path for c in chunks} == {("Guide",)}
    assert {c.doc_coordinate.evidence_revision for c in chunks} == {coordinate.evidence_revision}
    revisions = [c.chunk_evidence_revision for c in chunks]
    assert len(set(revisions)) == len(revisions)
    assert coordinate.evidence_revision not in revisions  # page and chunk are different grains


def test_deterministic_replay_is_identical():  # B
    coordinate = _page_coordinate(LONG_SECTION)
    first = [c.chunk_evidence_revision for c in _chunks(LONG_SECTION, coordinate)]
    assert first == [c.chunk_evidence_revision for c in _chunks(LONG_SECTION, coordinate)]


def test_identical_chunk_text_at_different_byte_locations_differs():  # C
    same = chunk_evidence_revision(page_evidence_revision="sha256:pagepage", ordinal=0, start_byte=0, end_byte=10, chunk_checksum="a" * 64)
    moved = chunk_evidence_revision(page_evidence_revision="sha256:pagepage", ordinal=1, start_byte=50, end_byte=60, chunk_checksum="a" * 64)
    assert same != moved
    repeated = "# H\nrepeat me repeat me repeat me\n\n" * 1 + "repeat me repeat me repeat me\n"
    revisions = {c.chunk_evidence_revision for c in _chunks(repeated + repeated, _page_coordinate(repeated + repeated), maximum_chars=40, overlap_chars=5)}
    assert len(revisions) == len(_chunks(repeated + repeated, _page_coordinate(repeated + repeated), maximum_chars=40, overlap_chars=5))


@pytest.mark.parametrize("field,value", [("chunk_checksum", "b" * 64), ("start_byte", 1), ("end_byte", 11), ("page_evidence_revision", "sha256:otherpage")])
def test_changed_bytes_span_or_page_revision_changes_chunk_evidence(field, value):  # D E F
    base = dict(page_evidence_revision="sha256:pagepage", ordinal=0, start_byte=0, end_byte=10, chunk_checksum="a" * 64)
    assert chunk_evidence_revision(**base) != chunk_evidence_revision(**{**base, field: value})


def test_different_product_version_changes_page_and_child_chunk_evidence():  # G
    a = _page_coordinate(LONG_SECTION, product_version="0.8")
    b = _page_coordinate(LONG_SECTION, product_version="0.9")
    assert a.evidence_revision != b.evidence_revision
    revs_a = {c.chunk_evidence_revision for c in _chunks(LONG_SECTION, a)}
    revs_b = {c.chunk_evidence_revision for c in _chunks(LONG_SECTION, b)}
    assert revs_a.isdisjoint(revs_b)


def test_utf8_non_ascii_byte_spans_replay_identically():  # H
    text = "# Ünïcode\n" + "\n".join(f"Zeile {i}: 日本語 café naïve — 索引 halfvec." for i in range(30))
    coordinate = _page_coordinate(text)
    first, second = _chunks(text, coordinate), _chunks(text, coordinate)
    assert [c.chunk_evidence_revision for c in first] == [c.chunk_evidence_revision for c in second]
    normalized = _normalize_ws(text).encode("utf-8")
    for c in first:
        assert normalized[c.start_byte:c.end_byte].decode("utf-8") == c.text  # spans are exact UTF-8 bytes
        assert c.end_byte - c.start_byte == len(c.text.encode("utf-8"))
    assert len({c.chunk_evidence_revision for c in first}) == len(first)


def test_chunk_id_is_unchanged_and_never_the_evidence_revision():
    coordinate = _page_coordinate(LONG_SECTION)
    for c in _chunks(LONG_SECTION, coordinate):
        assert c.chunk_id == f"doc:s:{c.document_checksum[:16]}:{c.ordinal}"  # frozen form, audited separately
        assert c.chunk_id != c.chunk_evidence_revision


def test_heading_metadata_does_not_participate_in_chunk_evidence():
    base = dict(page_evidence_revision="sha256:pagepage", ordinal=0, start_byte=0, end_byte=10, chunk_checksum="a" * 64)
    model = ExternalDocChunkEvidenceV1(**base)
    assert model.chunk_evidence_revision == chunk_evidence_revision(**base)
    assert "headingPath" not in canonical_encode_v1({"schema": "x"}) and not hasattr(model, "heading_path")


def test_canonical_port_matches_the_typescript_encoding_for_the_identity_inputs():
    # Golden value computed with sveltekit-frontend canonicalEncodeV1/canonicalSha256V1 (also asserted in the TS spec).
    expected = "sha256:" + "98cbfe4d64ab8f50dd05e59da3b31ddcc8bd9445bde3327eada3bdcf732be786"
    assert chunk_evidence_revision(page_evidence_revision="sha256:abcdefgh", ordinal=0, start_byte=0, end_byte=5, chunk_checksum="a" * 64) == expected
    with pytest.raises(TypeError):
        canonical_encode_v1({"Not-Simple": 1})


def _manifest(tmp_path, **source_extra):
    source = {"source_id": "pgv", "source_revision": "pgv-r1", "title": "pgvector", "base_urls": ["https://github.com/pgvector/pgvector"],
              "allowed_domains": ["github.com"], "authority_class": "OFFICIAL_PRIMARY", "default_fetcher": "BEAUTIFULSOUP_HTTP",
              "output_namespace": "docs/.okf/pinned/pgv", "pages": ["https://github.com/pgvector/pgvector"], **source_extra}
    path = tmp_path / "m.json"
    path.write_text(json.dumps({"manifest_revision": "m1", "workspace_revision": "w", "source_snapshot_revision": "s", "producer_revision": "p",
                                "output_root": ".", "embedding": {"url": "http://x", "model": "m"}, "qdrant": {"collection": "c", "url": "http://q"},
                                "features": {"low_rank": 4, "kmeans_clusters": 2, "som": {"rows": 2, "columns": 2}}, "sources": [source]}), encoding="utf-8")
    return P.load_manifest(path).sources[0]


def _page(source, text=LONG_SECTION, url="https://github.com/pgvector/pgvector"):
    return P.PageArtifact(source_id=source.source_id, source_revision=source.source_revision, requested_url=url, resolved_url=url, title="T", text=text,
                          fetcher="BEAUTIFULSOUP_HTTP", raw_checksum="r" * 64, normalized_checksum=_sha(text), outgoing_urls=(), metadata={}, retrieved_at="2026-09-23T10:00:00Z")


def test_manifest_source_builds_the_page_coordinate_natively(tmp_path):
    source = _manifest(tmp_path, provider="pgvector", product="pgvector", language="sql", unversioned_urls=["https://github.com/pgvector/pgvector/issues/1"])
    page = _page(source)
    coordinate = P.build_page_coordinate(source, page)
    assert coordinate.product_version == "CURRENT_UPSTREAM@2026-09-23"  # never an invented exact version
    assert coordinate.content_hash == _sha(_normalize_ws(page.text))
    chunks = P.compile_chunks([page], stanza_pipeline=None, stanza_model_revision="none", maximum_chars=400, overlap_chars=50,
                              coordinate_for=lambda p: P.build_page_coordinate(source, p))
    assert chunks and all(c.doc_coordinate.evidence_revision == coordinate.evidence_revision for c in chunks)
    assert len({c.chunk_evidence_revision for c in chunks}) == len(chunks)
    issue = P.build_page_coordinate(source, _page(source, url="https://github.com/pgvector/pgvector/issues/1"))
    assert issue.product_version == "UNVERSIONED@2026-09-23"


def test_manifest_versions_are_explicit_and_legacy_sources_get_no_coordinate(tmp_path):
    exact = _manifest(tmp_path, provider="postgresql", product="postgresql", version_qualification="MAJOR_VERSION", product_version="18")
    assert P.build_page_coordinate(exact, _page(exact)).product_version == "18"
    missing = _manifest(tmp_path, provider="postgresql", product="postgresql", version_qualification="EXACT_VERSION")
    with pytest.raises(ValueError, match="DOC_COORDINATE_PRODUCT_VERSION_REQUIRED"):
        P.build_page_coordinate(missing, _page(missing))
    legacy = _manifest(tmp_path)
    assert P.build_page_coordinate(legacy, _page(legacy)) is None
    chunks = P.compile_chunks([_page(legacy)], stanza_pipeline=None, stanza_model_revision="none", maximum_chars=400, overlap_chars=50)
    assert all(c.doc_coordinate is None and c.chunk_evidence_revision is None for c in chunks)


# ---- cross-language fixture: Python native output -> committed JSON -> TypeScript admission adapter test ----
import pathlib  # noqa: E402

FIXTURE_PATH = pathlib.Path(__file__).resolve().parents[1] / "sveltekit-frontend/src/lib/server/atlas/docs/__fixtures__/external-doc-python-envelope-v1.json"


def build_fixture_envelopes() -> list[dict]:
    """One page, same heading, several chunks, non-ASCII text. Regenerate the committed fixture with
    `python -c "import test_atlas_doc_chunk_evidence as t; t.write_fixture()"` from python/."""
    text = "# Guide\n" + "\n".join(f"Zeile {i}: 日本語 café naïve — halfvec hnsw index tuning here." for i in range(24))
    coordinate = build_doc_coordinate(provider="pgvector", product="pgvector", product_version="0.8", url="https://example.org/fixture",
                                      content_hash=_sha(_normalize_ws(text)), language="sql")
    chunks = chunk_document(source_id="fixture", source_revision="fixture-r1", source_url=coordinate.url, title="Fixture", text=text,
                            maximum_chars=300, overlap_chars=40, doc_coordinate=coordinate)
    return [{
        "manifestRevision": "fixture-m1", "sourceRevision": "fixture-r1", "sourceId": "fixture", "authorityClass": "OFFICIAL_PRIMARY",
        "versionQualification": "EXACT_VERSION",
        "page": {"provider": coordinate.provider, "product": coordinate.product, "productVersion": coordinate.product_version, "architecture": None,
                 "language": coordinate.language, "url": coordinate.url, "title": "Fixture", "publisher": None, "sourceAuthority": "OFFICIAL",
                 "fetcher": "BEAUTIFULSOUP_HTTP", "crawlRevision": "fixture-r1", "parserRevision": "beautifulsoup4==fixture/html.parser",
                 "contentHash": coordinate.content_hash, "evidenceRevision": coordinate.evidence_revision, "retrievedAt": "2026-09-23T00:00:00Z"},
        "chunks": [{"chunkId": c.chunk_id, "ordinal": c.ordinal, "headingPath": list(c.heading_path), "sectionAnchor": "/".join(c.heading_path) or None,
                    "startChar": c.start_char, "endChar": c.end_char, "startByte": c.start_byte, "endByte": c.end_byte, "text": c.text,
                    "domainClass": c.domain_class, "ontologyClasses": list(c.ontology_classes), "codeBlocks": [dict(b) for b in c.code_blocks],
                    "apiSignatures": list(c.api_signatures), "chunkChecksum": _sha(c.text), "evidenceRevision": c.chunk_evidence_revision} for c in chunks],
    }]


def write_fixture() -> None:
    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE_PATH.write_text(json.dumps(build_fixture_envelopes(), indent=1, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def test_committed_cross_language_fixture_is_the_current_python_output():
    committed = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    assert committed == json.loads(json.dumps(build_fixture_envelopes(), ensure_ascii=False))
    chunks = committed[0]["chunks"]
    assert len(chunks) >= 3 and len({c["evidenceRevision"] for c in chunks}) == len(chunks)
    assert {tuple(c["headingPath"]) for c in chunks} == {("Guide",)}
