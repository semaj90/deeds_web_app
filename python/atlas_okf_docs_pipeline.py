"""Manifest-driven /docs/.okf external documentation pipeline for Parent Atlas.

This is the execution seam that composes the existing external-doc fabric:

  manifest -> discover/fetch -> normalize -> chunk/POS/tuples -> semantic_768
           -> low-rank/PageRank/KMeans/SOM -> Qdrant -> retrieval smoke receipt

The TypeScript Parent Atlas host remains authority. Every artifact produced here
is derived/non-canonical until exact source/evidence promotion in the host.

Network and GPU stages are explicit. Unit tests can exercise manifest, UUID,
payload-index, and query-plan construction without requiring external services.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import time
from typing import Any, Iterable, Mapping, Sequence
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen
from uuid import NAMESPACE_URL, UUID, uuid5

import numpy as np

from atlas_doc_manifest import parse_manifest_json_v1
from atlas_external_docs import (
    ChunkRecord,
    classify_domain,
    chunk_document,
    deterministic_pagerank,
    embed_llama_server_768,
    enforce_allowed_domain,
    fetch_beautifulsoup,
    fetch_firecrawl_v2,
    low_rank_sample_query_features,
    qdrant_points,
    stanza_observations,
    validate_okf_output_namespace,
)
from parent_atlas_ontology.domain_mapping import admit_domain_classification
from parent_atlas_ontology.domain_tuple_bridge import build_domain_classification_signal_from_chunk


Json = dict[str, Any]


def _sha(value: str | bytes) -> str:
    raw = value if isinstance(value, bytes) else value.encode("utf-8")
    return sha256(raw).hexdigest()


def _stable(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _http_json(
    url: str,
    *,
    method: str = "GET",
    body: Mapping[str, Any] | None = None,
    headers: Mapping[str, str] | None = None,
    timeout_seconds: int = 60,
) -> Json:
    encoded = None if body is None else json.dumps(body).encode("utf-8")
    request_headers = {"Accept": "application/json", **dict(headers or {})}
    if encoded is not None:
        request_headers.setdefault("Content-Type", "application/json")
    request = Request(url, data=encoded, headers=request_headers, method=method)
    with urlopen(request, timeout=timeout_seconds) as response:  # noqa: S310 - configured endpoints only
        payload = response.read()
    parsed = json.loads(payload or b"{}")
    if not isinstance(parsed, dict):
        raise RuntimeError(f"JSON_OBJECT_REQUIRED:{url}")
    return parsed


@dataclass(frozen=True)
class SourceConfig:
    source_id: str
    source_revision: str
    title: str
    base_urls: tuple[str, ...]
    allowed_domains: tuple[str, ...]
    authority_class: str
    default_fetcher: str
    output_namespace: str
    include_paths: tuple[str, ...]
    exclude_paths: tuple[str, ...]
    maximum_pages: int
    maximum_depth: int
    pages: tuple[str, ...]
    ldr_export_files: tuple[str, ...]
    source_namespace: str | None = None


@dataclass(frozen=True)
class PipelineManifest:
    manifest_revision: str
    workspace_revision: str
    source_snapshot_revision: str
    producer_revision: str
    output_root: str
    sources: tuple[SourceConfig, ...]
    qdrant_collection: str
    qdrant_url: str
    qdrant_api_key_env: str | None
    embedding_url: str
    embedding_model: str
    low_rank: int
    kmeans_clusters: int
    som_rows: int
    som_columns: int


@dataclass(frozen=True)
class PageArtifact:
    source_id: str
    source_revision: str
    requested_url: str
    resolved_url: str
    title: str
    text: str
    fetcher: str
    raw_checksum: str
    normalized_checksum: str
    outgoing_urls: tuple[str, ...]
    metadata: Mapping[str, Any]


QDRANT_PAYLOAD_INDEXES: tuple[tuple[str, Any], ...] = (
    ("source_id", "keyword"),
    ("source_revision", "keyword"),
    ("domain_class", "keyword"),
    ("ontology_classes", "keyword"),
    ("language", "keyword"),
    ("kmeans_cluster", "integer"),
    ("som_cell", "keyword"),
    ("document_checksum", "keyword"),
    ("chunk_checksum", "keyword"),
    ("producer_revision", "keyword"),
)


def deterministic_qdrant_uuid(chunk_id: str) -> str:
    """Return an RFC UUID string accepted as a Qdrant point ID.

    UUIDv5 is deterministic over the Atlas chunk identity. The chunk ID remains
    the domain identity; the UUID is only the storage projection key.
    """
    if not chunk_id:
        raise ValueError("chunk_id required")
    return str(uuid5(NAMESPACE_URL, f"atlas://external-doc/chunk/{chunk_id}"))


def is_uuid(value: str) -> bool:
    try:
        UUID(value)
        return True
    except (ValueError, AttributeError):
        return False


def _validate_output_namespace(value: str) -> None:
    """Thin compat wrapper -- the real check moved to atlas_external_docs.py
    (validate_okf_output_namespace) so atlas_doc_manifest.py's Pydantic layer
    (DOC-01) can share it without a circular import back into this module."""
    validate_okf_output_namespace(value)


def load_manifest(path: str | Path) -> PipelineManifest:
    """Load+validate a manifest JSON document, returning the dataclass every
    downstream pipeline stage already consumes.

    Validation itself lives in atlas_doc_manifest.py's Pydantic layer
    (DOC-01 / OKF-DOC-PYDANTIC-MANIFEST-01) -- this function is a thin front
    door that hands the raw file bytes straight to parse_manifest_json_v1()
    (model_validate_json -- no untyped dict passed through in between; a
    ValidationError, which subclasses ValueError, so every existing
    caller/test is unaffected) and converts the validated Pydantic model into
    the exact same SourceConfig/PipelineManifest dataclasses this function
    returned before DOC-01.
    """
    validated = parse_manifest_json_v1(Path(path).read_bytes())
    sources = tuple(
        SourceConfig(
            source_id=source.source_id,
            source_revision=source.source_revision,
            title=source.title,
            base_urls=source.base_urls,
            allowed_domains=source.allowed_domains,
            authority_class=source.authority_class,
            default_fetcher=source.default_fetcher,
            output_namespace=source.output_namespace,
            include_paths=source.include_paths,
            exclude_paths=source.exclude_paths,
            maximum_pages=source.maximum_pages,
            maximum_depth=source.maximum_depth,
            pages=source.pages,
            ldr_export_files=source.ldr_export_files,
            source_namespace=source.source_namespace,
        )
        for source in validated.sources
    )
    return PipelineManifest(
        manifest_revision=validated.manifest_revision,
        workspace_revision=validated.workspace_revision,
        source_snapshot_revision=validated.source_snapshot_revision,
        producer_revision=validated.producer_revision,
        output_root=validated.output_root,
        sources=sources,
        qdrant_collection=validated.qdrant.collection,
        qdrant_url=validated.qdrant.url,
        qdrant_api_key_env=validated.qdrant.api_key_env,
        embedding_url=validated.embedding.url,
        embedding_model=validated.embedding.model,
        low_rank=validated.features.low_rank,
        kmeans_clusters=validated.features.kmeans_clusters,
        som_rows=validated.features.som.rows,
        som_columns=validated.features.som.columns,
    )


def read_ldr_export_urls(path: str | Path, *, allowed_domains: Sequence[str]) -> tuple[str, ...]:
    """Read URLs from an authenticated LDR result exported by the host.

    The existing /api/ldr/research endpoint is auth-guarded. This pipeline does
    not bypass that guard; the host or MCP layer exports the result and this
    function consumes only its source URLs as discovery nominations.
    """
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    result = payload.get("result", payload)
    sources = result.get("sources") or [] if isinstance(result, dict) else []
    urls: set[str] = set()
    for source in sources:
        if not isinstance(source, dict) or not source.get("url"):
            continue
        url = str(source["url"])
        try:
            enforce_allowed_domain(url, allowed_domains)
        except ValueError:
            continue
        urls.add(url)
    return tuple(sorted(urls))


def _firecrawl_auth(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


def firecrawl_crawl_v2(
    source: SourceConfig,
    *,
    api_key: str,
    poll_seconds: float = 2.0,
    maximum_wait_seconds: int = 600,
) -> tuple[PageArtifact, ...]:
    """Run a bounded Firecrawl v2 crawl and return normalized page artifacts."""
    root_url = source.base_urls[0]
    body = {
        "url": root_url,
        "includePaths": list(source.include_paths),
        "excludePaths": list(source.exclude_paths),
        "maxDiscoveryDepth": source.maximum_depth,
        "limit": source.maximum_pages,
        "crawlEntireDomain": False,
        "allowExternalLinks": False,
        "allowSubdomains": False,
        "ignoreRobotsTxt": False,
        "scrapeOptions": {
            "formats": ["markdown"],
            "onlyMainContent": True,
            "removeBase64Images": True,
            "blockAds": True,
        },
    }
    submitted = _http_json(
        "https://api.firecrawl.dev/v2/crawl",
        method="POST",
        body=body,
        headers=_firecrawl_auth(api_key),
    )
    crawl_id = submitted.get("id")
    if not crawl_id:
        raise RuntimeError(f"FIRECRAWL_CRAWL_ID_MISSING:{submitted}")
    deadline = time.monotonic() + maximum_wait_seconds
    status: Json = {}
    while time.monotonic() < deadline:
        status = _http_json(
            f"https://api.firecrawl.dev/v2/crawl/{quote(str(crawl_id))}",
            headers=_firecrawl_auth(api_key),
        )
        state = str(status.get("status") or "")
        if state == "completed":
            break
        if state == "failed":
            raise RuntimeError(f"FIRECRAWL_CRAWL_FAILED:{crawl_id}")
        time.sleep(poll_seconds)
    else:
        raise TimeoutError(f"FIRECRAWL_CRAWL_TIMEOUT:{crawl_id}")

    pages: list[Json] = list(status.get("data") or [])
    next_url = status.get("next")
    while next_url:
        page = _http_json(str(next_url), headers=_firecrawl_auth(api_key))
        pages.extend(page.get("data") or [])
        next_url = page.get("next")
        if len(pages) >= source.maximum_pages:
            pages = pages[: source.maximum_pages]
            break

    artifacts: list[PageArtifact] = []
    for item in pages:
        if not isinstance(item, dict):
            continue
        metadata = item.get("metadata") or {}
        resolved = str(metadata.get("sourceURL") or metadata.get("url") or root_url)
        try:
            enforce_allowed_domain(resolved, source.allowed_domains)
        except ValueError:
            continue
        markdown = str(item.get("markdown") or "").strip()
        if not markdown:
            continue
        links = []
        for link in item.get("links") or []:
            try:
                enforce_allowed_domain(str(link), source.allowed_domains)
            except ValueError:
                continue
            links.append(str(link).split("#", 1)[0])
        artifacts.append(PageArtifact(
            source_id=source.source_id,
            source_revision=source.source_revision,
            requested_url=root_url,
            resolved_url=resolved,
            title=str(metadata.get("title") or urlparse(resolved).netloc),
            text=markdown,
            fetcher="FIRECRAWL_V2",
            raw_checksum=_sha(_stable(item)),
            normalized_checksum=_sha(markdown),
            outgoing_urls=tuple(sorted(set(links))),
            metadata={**metadata, "crawl_id": str(crawl_id)},
        ))
    return tuple(artifacts)


def _fetch_single(source: SourceConfig, url: str) -> PageArtifact:
    enforce_allowed_domain(url, source.allowed_domains)
    if source.default_fetcher == "FIRECRAWL_V2":
        api_key = os.environ.get("FIRECRAWL_API_KEY")
        if not api_key:
            raise RuntimeError("FIRECRAWL_API_KEY_REQUIRED")
        fetched = fetch_firecrawl_v2(url, api_key=api_key)
    else:
        fetched = fetch_beautifulsoup(url)
    enforce_allowed_domain(fetched.resolved_url, source.allowed_domains)
    return PageArtifact(
        source_id=source.source_id,
        source_revision=source.source_revision,
        requested_url=url,
        resolved_url=fetched.resolved_url,
        title=fetched.title,
        text=fetched.markdown,
        fetcher=fetched.fetcher,
        raw_checksum=fetched.raw_checksum,
        normalized_checksum=fetched.normalized_checksum,
        outgoing_urls=fetched.outgoing_urls,
        metadata=fetched.metadata,
    )


def discover_and_fetch(source: SourceConfig) -> tuple[PageArtifact, ...]:
    nominated: set[str] = set(source.pages or source.base_urls)
    for export in source.ldr_export_files:
        nominated.update(read_ldr_export_urls(export, allowed_domains=source.allowed_domains))
    if source.default_fetcher == "FIRECRAWL_CRAWL":
        api_key = os.environ.get("FIRECRAWL_API_KEY")
        if not api_key:
            raise RuntimeError("FIRECRAWL_API_KEY_REQUIRED")
        return firecrawl_crawl_v2(source, api_key=api_key)
    artifacts: list[PageArtifact] = []
    for url in sorted(nominated)[: source.maximum_pages]:
        artifacts.append(_fetch_single(source, url))
    return tuple(artifacts)


def make_stanza_pipeline(*, language: str = "en") -> Any:
    try:
        import stanza
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise RuntimeError("stanza is required when --stanza is enabled") from exc
    return stanza.Pipeline(lang=language, processors="tokenize,pos,lemma,depparse", use_gpu=True, verbose=False)


def compile_chunks(
    pages: Sequence[PageArtifact],
    *,
    stanza_pipeline: Any | None,
    stanza_model_revision: str,
    maximum_chars: int,
    overlap_chars: int,
) -> tuple[ChunkRecord, ...]:
    chunks: list[ChunkRecord] = []
    for page in pages:
        nlp = None
        if stanza_pipeline is not None:
            nlp = lambda text, pipeline=stanza_pipeline: stanza_observations(
                text,
                pipeline=pipeline,
                model_revision=stanza_model_revision,
            )
        chunks.extend(chunk_document(
            source_id=page.source_id,
            source_revision=page.source_revision,
            source_url=page.resolved_url,
            title=page.title,
            text=page.text,
            maximum_chars=maximum_chars,
            overlap_chars=overlap_chars,
            nlp=nlp,
        ))
    return tuple(chunks)


def preview_domain_ontology_admission(
    chunks: Sequence[ChunkRecord],
    *,
    source_namespace: str | None,
    ontology_revision: str | None,
    classification_revision: str,
    mapping_revision_value: str,
) -> Json:
    """Read-only OKF classifier admission preview; never persists or projects."""

    if not source_namespace:
        return {
            "schema": "atlas.okf-domain-ontology-admission-preview.v1",
            "status": "SOURCE_NAMESPACE_UNPROVEN",
            "chunkCount": len(chunks), "signalCount": 0, "admittedCount": 0,
            "rejectedCount": 0, "writesPerformed": False, "canonicalAuthority": False,
        }
    if not ontology_revision:
        return {
            "schema": "atlas.okf-domain-ontology-admission-preview.v1",
            "status": "ONTOLOGY_REVISION_UNPROVEN",
            "chunkCount": len(chunks), "signalCount": 0, "admittedCount": 0,
            "rejectedCount": 0, "writesPerformed": False, "canonicalAuthority": False,
        }

    statuses: list[str] = []
    evidence_refs: list[str] = []
    for chunk in chunks:
        signal = build_domain_classification_signal_from_chunk(
            domain_label=chunk.domain_class,
            confidence=1.0,
            classification_revision=classification_revision,
            mapping_revision_value=mapping_revision_value,
            ontology_revision=ontology_revision,
            source_namespace=source_namespace,
            source_revision=chunk.source_revision,
            chunk_id=chunk.chunk_id,
            start_char=chunk.start_char,
            end_char=chunk.end_char,
        )
        admission = admit_domain_classification(signal.domainLabel, confidence=signal.confidence)
        statuses.append(admission.status)
        evidence_refs.extend(signal.evidenceRefs)
    admitted = sum(status == "ADMITTED" for status in statuses)
    return {
        "schema": "atlas.okf-domain-ontology-admission-preview.v1",
        "status": "PREVIEW_PROVEN" if all(status == "ADMITTED" for status in statuses) else "PARTIAL",
        "chunkCount": len(chunks), "signalCount": len(statuses),
        "admittedCount": admitted, "rejectedCount": len(statuses) - admitted,
        "statusCounts": {status: statuses.count(status) for status in sorted(set(statuses))},
        "evidenceRefCount": len(set(evidence_refs)),
        "writesPerformed": False, "canonicalAuthority": False,
    }


def compute_page_rank_features(pages: Sequence[PageArtifact], chunks: Sequence[ChunkRecord]) -> tuple[dict[str, Json], Json]:
    urls = tuple(sorted({page.resolved_url for page in pages}))
    url_set = set(urls)
    edges: list[tuple[str, str]] = []
    for page in pages:
        for target in page.outgoing_urls:
            if target in url_set:
                edges.append((page.resolved_url, target))
    scores, receipt = deterministic_pagerank(urls, edges)
    rows: dict[str, Json] = {}
    for chunk in chunks:
        rows[chunk.chunk_id] = {"pagerank": float(scores.get(chunk.source_url, 0.0))}
    return rows, receipt


def compute_low_rank_features(embeddings: np.ndarray, chunks: Sequence[ChunkRecord], *, rank: int) -> tuple[dict[str, Json], Json]:
    probabilities, receipt = low_rank_sample_query_features(embeddings, rank=rank)
    rows = {
        chunk.chunk_id: {
            "low_rank_rank": int(receipt["rank"]),
            "tang_sampling_weight": float(probabilities[index]),
        }
        for index, chunk in enumerate(chunks)
    }
    return rows, receipt


def compute_cluster_features(
    embeddings: np.ndarray,
    chunks: Sequence[ChunkRecord],
    *,
    n_clusters: int,
    som_rows: int,
    som_columns: int,
) -> tuple[dict[str, Json], Json]:
    """Invoke the existing Parent Atlas cuVS KMeans and deterministic SOM."""
    from atlas_compute.cluster_softmax import run_cuvs_soft_kmeans
    from atlas_compute.som import train_deterministic_som

    clusters = min(n_clusters, len(chunks))
    labels, _centroids, probabilities, kmeans_receipt = run_cuvs_soft_kmeans(
        embeddings,
        n_clusters=clusters,
        input_normalization="l2_row",
        streaming_batch_size=max(1, min(8192, len(chunks))),
    )
    coordinates, _codebook, som_receipt = train_deterministic_som(
        embeddings,
        grid_rows=som_rows,
        grid_columns=som_columns,
    )
    coords = np.asarray(coordinates.detach().cpu().numpy() if hasattr(coordinates, "detach") else coordinates, dtype=np.int64)
    rows: dict[str, Json] = {}
    for index, chunk in enumerate(chunks):
        label = int(labels[index])
        rows[chunk.chunk_id] = {
            "kmeans_cluster": label,
            "kmeans_probability": float(probabilities[index, label]),
            "som_row": int(coords[index, 0]),
            "som_column": int(coords[index, 1]),
            "som_cell": f"{int(coords[index, 0])}:{int(coords[index, 1])}",
        }
    return rows, {
        "schema": "atlas.external-doc-cluster-receipt.v1",
        "kmeans": kmeans_receipt.to_dict(),
        "som": som_receipt.to_dict(),
        "canonical_authority": False,
    }


def merge_feature_rows(*feature_sets: Mapping[str, Mapping[str, Any]]) -> dict[str, Json]:
    result: dict[str, Json] = {}
    for feature_set in feature_sets:
        for chunk_id, values in feature_set.items():
            result.setdefault(chunk_id, {}).update(values)
    return result


def build_qdrant_points(
    chunks: Sequence[ChunkRecord],
    embeddings: np.ndarray,
    *,
    feature_rows: Mapping[str, Mapping[str, Any]],
    producer_revision: str,
) -> list[Json]:
    points = qdrant_points(
        chunks,
        embeddings,
        feature_rows=feature_rows,
        producer_revision=producer_revision,
    )
    for chunk, point in zip(chunks, points, strict=True):
        point["id"] = deterministic_qdrant_uuid(chunk.chunk_id)
        point["payload"]["qdrant_point_id"] = point["id"]
        point["payload"]["qdrant_point_id_is_canonical"] = False
        point["payload"].setdefault("language", "en")
    return points


def qdrant_headers(manifest: PipelineManifest) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if manifest.qdrant_api_key_env:
        api_key = os.environ.get(manifest.qdrant_api_key_env)
        if api_key:
            headers["api-key"] = api_key
    return headers


def qdrant_upsert(manifest: PipelineManifest, points: Sequence[Json], *, batch_size: int = 128) -> Json:
    receipts: list[Json] = []
    base = manifest.qdrant_url.rstrip("/")
    collection = quote(manifest.qdrant_collection, safe="")
    for start in range(0, len(points), batch_size):
        batch = list(points[start : start + batch_size])
        response = _http_json(
            f"{base}/collections/{collection}/points?wait=true",
            method="PUT",
            body={"points": batch},
            headers=qdrant_headers(manifest),
        )
        receipts.append(response)
    return {
        "schema": "atlas.external-doc-qdrant-upsert-receipt.v1",
        "collection": manifest.qdrant_collection,
        "points": len(points),
        "batches": len(receipts),
        "response_checksum": _sha(_stable(receipts)),
        "canonical_authority": False,
    }


def qdrant_payload_index_requests(manifest: PipelineManifest) -> tuple[tuple[str, Json], ...]:
    base = manifest.qdrant_url.rstrip("/")
    collection = quote(manifest.qdrant_collection, safe="")
    return tuple(
        (
            f"{base}/collections/{collection}/index?wait=true",
            {"field_name": field_name, "field_schema": field_schema},
        )
        for field_name, field_schema in QDRANT_PAYLOAD_INDEXES
    )


def qdrant_ensure_payload_indexes(manifest: PipelineManifest) -> Json:
    results = []
    for url, body in qdrant_payload_index_requests(manifest):
        results.append(_http_json(url, method="PUT", body=body, headers=qdrant_headers(manifest)))
    return {
        "schema": "atlas.external-doc-payload-index-receipt.v1",
        "collection": manifest.qdrant_collection,
        "fields": [field for field, _schema in QDRANT_PAYLOAD_INDEXES],
        "response_checksum": _sha(_stable(results)),
        "canonical_authority": False,
    }


def qdrant_query_body(
    query_vector: Sequence[float],
    *,
    prefetch_k: int,
    exact_refine_k: int,
    source_revision: str | None = None,
    domain_class: str | None = None,
) -> Json:
    if exact_refine_k <= 0 or prefetch_k < exact_refine_k:
        raise ValueError("INVALID_QDRANT_REFINEMENT_LIMITS")
    query = list(float(value) for value in query_vector)
    if len(query) != 768:
        raise ValueError("QUERY_VECTOR_MUST_BE_768D")
    must = []
    if source_revision:
        must.append({"key": "source_revision", "match": {"value": source_revision}})
    if domain_class:
        must.append({"key": "domain_class", "match": {"value": domain_class}})
    query_filter = {"must": must} if must else None
    body: Json = {
        "prefetch": {
            "query": query,
            "limit": prefetch_k,
            "params": {"quantization": {"ignore": False, "rescore": False}},
        },
        "query": query,
        "limit": exact_refine_k,
        "params": {"quantization": {"ignore": False, "rescore": True, "oversampling": 2.0}},
        "with_payload": True,
        "with_vector": False,
    }
    if query_filter:
        body["prefetch"]["filter"] = query_filter
        body["filter"] = query_filter
    return body


def qdrant_smoke_query(
    manifest: PipelineManifest,
    query_vector: Sequence[float],
    *,
    prefetch_k: int = 64,
    exact_refine_k: int = 8,
    source_revision: str | None = None,
    domain_class: str | None = None,
) -> Json:
    base = manifest.qdrant_url.rstrip("/")
    collection = quote(manifest.qdrant_collection, safe="")
    body = qdrant_query_body(
        query_vector,
        prefetch_k=prefetch_k,
        exact_refine_k=exact_refine_k,
        source_revision=source_revision,
        domain_class=domain_class,
    )
    response = _http_json(
        f"{base}/collections/{collection}/points/query",
        method="POST",
        body=body,
        headers=qdrant_headers(manifest),
    )
    result = response.get("result")
    points = result.get("points") if isinstance(result, dict) else None
    if not isinstance(points, list):
        points = result if isinstance(result, list) else []
    return {
        "schema": "atlas.external-doc-retrieval-smoke-receipt.v1",
        "collection": manifest.qdrant_collection,
        "prefetch_k": prefetch_k,
        "exact_refine_k": exact_refine_k,
        "result_count": len(points),
        "result_ids": [str(point.get("id")) for point in points if isinstance(point, dict)],
        "response_checksum": _sha(_stable(response)),
        "canonical_authority": False,
    }


def _safe_filename(url: str) -> str:
    parsed = urlparse(url)
    raw = f"{parsed.netloc}{parsed.path}".strip("/") or parsed.netloc
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", raw).strip("-")[:160]
    return slug or _sha(url)[:16]


def write_source_artifacts(root: Path, source: SourceConfig, pages: Sequence[PageArtifact], chunks: Sequence[ChunkRecord]) -> Json:
    source_root = root / source.output_namespace
    raw_root = source_root / "raw"
    raw_root.mkdir(parents=True, exist_ok=True)
    page_receipts = []
    for page in pages:
        name = _safe_filename(page.resolved_url)
        markdown_path = raw_root / f"{name}.md"
        receipt_path = raw_root / f"{name}.json"
        markdown_path.write_text(page.text, encoding="utf-8")
        receipt = {
            **asdict(page),
            "text": None,
            "markdown_path": str(markdown_path),
            "fetched_at": _now(),
            "canonical_authority": False,
        }
        receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True), encoding="utf-8")
        page_receipts.append(receipt)
    chunks_path = source_root / "chunks.jsonl"
    with chunks_path.open("w", encoding="utf-8") as handle:
        for chunk in chunks:
            handle.write(json.dumps(chunk.to_dict(), sort_keys=True, ensure_ascii=False) + "\n")
    return {
        "source_id": source.source_id,
        "source_namespace": source.source_namespace,
        "pages": len(pages),
        "chunks": len(chunks),
        "chunks_path": str(chunks_path),
        "page_receipt_checksum": _sha(_stable(page_receipts)),
    }


def run_pipeline(
    manifest: PipelineManifest,
    *,
    enable_stanza: bool,
    enable_clusters: bool,
    write_qdrant: bool,
    smoke_query: str | None,
    maximum_chars: int = 1600,
    overlap_chars: int = 200,
) -> Json:
    root = Path(manifest.output_root).resolve()
    stanza_pipeline = make_stanza_pipeline() if enable_stanza else None
    all_pages: list[PageArtifact] = []
    all_chunks: list[ChunkRecord] = []
    source_receipts: list[Json] = []
    for source in manifest.sources:
        pages = discover_and_fetch(source)
        chunks = compile_chunks(
            pages,
            stanza_pipeline=stanza_pipeline,
            stanza_model_revision="stanza-en-default",
            maximum_chars=maximum_chars,
            overlap_chars=overlap_chars,
        )
        all_pages.extend(pages)
        all_chunks.extend(chunks)
        source_receipts.append(write_source_artifacts(root, source, pages, chunks))

    if not all_chunks:
        raise RuntimeError("NO_EXTERNAL_DOC_CHUNKS")
    embeddings = embed_llama_server_768(
        [chunk.text for chunk in all_chunks],
        base_url=manifest.embedding_url,
        model=manifest.embedding_model,
        max_chars_per_request=maximum_chars,
    )
    page_features, pagerank_receipt = compute_page_rank_features(all_pages, all_chunks)
    low_rank_features, low_rank_receipt = compute_low_rank_features(embeddings, all_chunks, rank=manifest.low_rank)
    cluster_features: dict[str, Json] = {}
    cluster_receipt: Json | None = None
    if enable_clusters:
        cluster_features, cluster_receipt = compute_cluster_features(
            embeddings,
            all_chunks,
            n_clusters=manifest.kmeans_clusters,
            som_rows=manifest.som_rows,
            som_columns=manifest.som_columns,
        )
    features = merge_feature_rows(page_features, low_rank_features, cluster_features)
    points = build_qdrant_points(
        all_chunks,
        embeddings,
        feature_rows=features,
        producer_revision=manifest.producer_revision,
    )

    qdrant_receipts: Json = {"write": False}
    if write_qdrant:
        qdrant_receipts = {
            "write": True,
            "indexes": qdrant_ensure_payload_indexes(manifest),
            "upsert": qdrant_upsert(manifest, points),
        }

    smoke_receipt = None
    if smoke_query:
        query_embedding = embed_llama_server_768(
            [smoke_query],
            base_url=manifest.embedding_url,
            model=manifest.embedding_model,
            max_chars_per_request=maximum_chars,
        )[0]
        if write_qdrant:
            smoke_receipt = qdrant_smoke_query(manifest, query_embedding)
        else:
            smoke_receipt = {
                "schema": "atlas.external-doc-retrieval-smoke-receipt.v1",
                "status": "PLANNED_NOT_EXECUTED",
                "query_body_checksum": _sha(_stable(qdrant_query_body(query_embedding, prefetch_k=64, exact_refine_k=8))),
                "canonical_authority": False,
            }

    receipt = {
        "schema": "atlas.okf-docs-pipeline-receipt.v1",
        "manifest_revision": manifest.manifest_revision,
        "workspace_revision": manifest.workspace_revision,
        "source_snapshot_revision": manifest.source_snapshot_revision,
        "producer_revision": manifest.producer_revision,
        "source_receipts": source_receipts,
        "page_count": len(all_pages),
        "chunk_count": len(all_chunks),
        "embedding_shape": list(embeddings.shape),
        "embedding_checksum": _sha(np.ascontiguousarray(embeddings).tobytes()),
        "pagerank_receipt": pagerank_receipt,
        "low_rank_receipt": low_rank_receipt,
        "cluster_receipt": cluster_receipt,
        "qdrant": qdrant_receipts,
        "smoke": smoke_receipt,
        "canonical_authority": False,
    }
    receipt["receipt_checksum"] = _sha(_stable(receipt))
    receipt_root = root / "docs/.okf"
    receipt_root.mkdir(parents=True, exist_ok=True)
    receipt_path = receipt_root / f"pipeline-receipt-{manifest.manifest_revision}.json"
    receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True), encoding="utf-8")
    return receipt


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compile /docs/.okf external documentation into Parent Atlas retrieval artifacts")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--stanza", action="store_true", help="Run Stanza POS/lemma/dependency extraction")
    parser.add_argument("--clusters", action="store_true", help="Run existing cuVS KMeans + deterministic SOM stages")
    parser.add_argument("--write-qdrant", action="store_true", help="Create payload indexes and upsert external_programming_docs_768")
    parser.add_argument("--smoke-query")
    parser.add_argument("--maximum-chars", type=int, default=1600)
    parser.add_argument("--overlap-chars", type=int, default=200)
    args = parser.parse_args(argv)

    manifest = load_manifest(args.manifest)
    receipt = run_pipeline(
        manifest,
        enable_stanza=args.stanza,
        enable_clusters=args.clusters,
        write_qdrant=args.write_qdrant,
        smoke_query=args.smoke_query,
        maximum_chars=args.maximum_chars,
        overlap_chars=args.overlap_chars,
    )
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
