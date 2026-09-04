"""Revisioned external-document knowledge fabric for Parent Atlas.

This module intentionally keeps external docs non-canonical. It provides bounded
fetch/normalize/classify/POS/tuple/chunk/embed/low-rank stages whose outputs carry
source revisions and checksums. Qdrant, PageRank, KMeans, SOM and Tang-inspired
sampling are derived retrieval signals; exact source content remains the evidence
promotion boundary.

Network calls are explicit and injectable so unit tests can remain offline.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from hashlib import sha256
import json
import math
from pathlib import PurePosixPath
import re
from typing import Any, Callable, Iterable, Mapping, Sequence
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

import numpy as np


Json = dict[str, Any]


def _sha(text: str | bytes) -> str:
    payload = text if isinstance(text, bytes) else text.encode("utf-8")
    return sha256(payload).hexdigest()


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _normalize_ws(text: str) -> str:
    return re.sub(r"[ \t]+", " ", re.sub(r"\r\n?", "\n", text)).strip()


@dataclass(frozen=True)
class FetchResult:
    fetcher: str
    url: str
    resolved_url: str
    title: str
    markdown: str
    raw_checksum: str
    normalized_checksum: str
    outgoing_urls: tuple[str, ...]
    metadata: Mapping[str, Any]

    def to_dict(self) -> Json:
        result = asdict(self)
        result["canonical_authority"] = False
        return result


@dataclass(frozen=True)
class ChunkRecord:
    chunk_id: str
    source_id: str
    source_revision: str
    source_url: str
    document_checksum: str
    ordinal: int
    heading_path: tuple[str, ...]
    start_char: int
    end_char: int
    text: str
    domain_class: str
    ontology_classes: tuple[str, ...]
    lexical_tokens: tuple[Json, ...]
    ontology_tuples: tuple[Json, ...]
    # DocCoordinateV1 | None, kept as `Any` here (not a hard import) so this
    # module's existing dataclass-only callers are unaffected -- optional,
    # additive, per parent-atlas-versioned-doc-intelligence DOC-02. None for
    # any caller that hasn't been updated to pass a manifest-source-derived
    # DocCoordinateV1 yet; such chunks simply carry no version qualifier.
    doc_coordinate: Any = None

    def to_dict(self) -> Json:
        result = asdict(self)
        result["chunk_checksum"] = _sha(self.text)
        result["canonical_authority"] = False
        if self.doc_coordinate is not None:
            result["doc_coordinate"] = self.doc_coordinate.to_json_dict()
        return result


DOMAIN_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("gpu", re.compile(r"\b(cuda|cuvs|cugraph|cusparse|gpu|tensor core|triton|cutlass)\b", re.I)),
    ("graph", re.compile(r"\b(pagerank|personalized pagerank|ppr|graph|hypergraph|n-ary|edge|node)\b", re.I)),
    ("retrieval", re.compile(r"\b(qdrant|embedding|retrieval|rerank|hnsw|cagra|knn|vector search|hybrid search)\b", re.I)),
    ("training", re.compile(r"\b(qlora|lora|training|fine[- ]?tun|gradient|optimizer|adapter)\b", re.I)),
    ("model_runtime", re.compile(r"\b(llama-server|inference|decode|prefill|kv cache|model runtime)\b", re.I)),
    ("database", re.compile(r"\b(postgres|database|sql|schema|transaction|qdrant)\b", re.I)),
    ("cache", re.compile(r"\b(redis|valkey|cache|residency|evict)\b", re.I)),
    ("protocol", re.compile(r"\b(mcp|acp|a2a|grpc|protobuf|ipc|arrow)\b", re.I)),
    ("testing", re.compile(r"\b(test|validator|assert|benchmark|parity|receipt)\b", re.I)),
    ("error_fixing", re.compile(r"\b(error|failure|debug|repair|rollback|diagnostic)\b", re.I)),
    ("api", re.compile(r"\b(api|endpoint|request|response|sdk)\b", re.I)),
)

ONTOLOGY_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("API", re.compile(r"\bapi\b", re.I)),
    ("ENDPOINT", re.compile(r"\b(endpoint|route|url)\b", re.I)),
    ("FUNCTION", re.compile(r"\b(function|method|callable)\b", re.I)),
    ("TYPE", re.compile(r"\b(type|schema|interface|struct)\b", re.I)),
    ("ALGORITHM", re.compile(r"\b(algorithm|pagerank|ppr|kmeans|som|svd|knn|cagra|hnsw)\b", re.I)),
    ("MODEL", re.compile(r"\b(model|llm|embedding model|reranker)\b", re.I)),
    ("TRAINING", re.compile(r"\b(training|qlora|lora|fine[- ]?tuning)\b", re.I)),
    ("RETRIEVAL", re.compile(r"\b(retrieval|search|rerank|query)\b", re.I)),
    ("GRAPH", re.compile(r"\b(graph|node|edge|pagerank|community)\b", re.I)),
    ("RELATIONSHIP", re.compile(r"\b(relationship|relation|hyperedge|n-ary|participant)\b", re.I)),
    ("STORAGE", re.compile(r"\b(database|storage|qdrant|postgres|redis|valkey)\b", re.I)),
    ("PROTOCOL", re.compile(r"\b(mcp|acp|a2a|grpc|ipc|protobuf)\b", re.I)),
    ("TEST", re.compile(r"\b(test|validation|validator|benchmark)\b", re.I)),
    ("METRIC", re.compile(r"\b(metric|recall|precision|mrr|ndcg|latency|throughput)\b", re.I)),
    ("TOOL", re.compile(r"\b(tool|cli|sdk|library)\b", re.I)),
    ("WORKFLOW", re.compile(r"\b(workflow|dag|pipeline|stage|lane)\b", re.I)),
)


def classify_domain(title: str, text: str) -> str:
    haystack = f"{title}\n{text}"
    scored: list[tuple[int, int, str]] = []
    for order, (label, pattern) in enumerate(DOMAIN_RULES):
        count = len(pattern.findall(haystack))
        if count:
            scored.append((count, -order, label))
    return max(scored)[2] if scored else "documentation"


def classify_ontology(text: str) -> tuple[str, ...]:
    labels = [label for label, pattern in ONTOLOGY_RULES if pattern.search(text)]
    return tuple(labels or ["CONCEPT"])


def fetch_firecrawl_v2(url: str, *, api_key: str, timeout_seconds: int = 60) -> FetchResult:
    body = json.dumps({"url": url, "formats": ["markdown"], "onlyMainContent": True}).encode("utf-8")
    request = Request(
        "https://api.firecrawl.dev/v2/scrape",
        data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=timeout_seconds) as response:  # noqa: S310 - caller controls allowlist
        raw = response.read()
    payload = json.loads(raw)
    data = payload.get("data", payload)
    markdown = _normalize_ws(str(data.get("markdown") or ""))
    metadata = data.get("metadata") or {}
    resolved = str(metadata.get("sourceURL") or metadata.get("url") or url)
    if not markdown:
        raise ValueError("FIRECRAWL_EMPTY_MARKDOWN")
    return FetchResult(
        fetcher="FIRECRAWL_V2",
        url=url,
        resolved_url=resolved,
        title=str(metadata.get("title") or urlparse(resolved).netloc),
        markdown=markdown,
        raw_checksum=_sha(raw),
        normalized_checksum=_sha(markdown),
        outgoing_urls=tuple(),
        metadata=metadata,
    )


def fetch_beautifulsoup(url: str, *, timeout_seconds: int = 30, user_agent: str = "Parent-Atlas-OKF/1.0") -> FetchResult:
    try:
        from bs4 import BeautifulSoup
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise RuntimeError("beautifulsoup4 is required for BEAUTIFULSOUP_HTTP") from exc

    request = Request(url, headers={"User-Agent": user_agent})
    with urlopen(request, timeout=timeout_seconds) as response:  # noqa: S310 - caller controls allowlist
        raw = response.read()
        resolved = response.geturl()
    soup = BeautifulSoup(raw, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    title = soup.title.get_text(" ", strip=True) if soup.title else urlparse(resolved).netloc
    main = soup.find("main") or soup.find("article") or soup.body or soup
    text = _normalize_ws(main.get_text("\n", strip=True))
    urls: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        target = urljoin(resolved, str(anchor.get("href")))
        parsed = urlparse(target)
        if parsed.scheme in {"http", "https"}:
            urls.add(target.split("#", 1)[0])
    if not text:
        raise ValueError("BEAUTIFULSOUP_EMPTY_TEXT")
    return FetchResult(
        fetcher="BEAUTIFULSOUP_HTTP",
        url=url,
        resolved_url=resolved,
        title=title,
        markdown=text,
        raw_checksum=_sha(raw),
        normalized_checksum=_sha(text),
        outgoing_urls=tuple(sorted(urls)),
        metadata={"parser": "html.parser"},
    )


def enforce_allowed_domain(url: str, allowed_domains: Sequence[str]) -> None:
    hostname = (urlparse(url).hostname or "").lower()
    allowed = {domain.lower().lstrip(".") for domain in allowed_domains}
    if not hostname or not any(hostname == domain or hostname.endswith(f".{domain}") for domain in allowed):
        raise ValueError(f"EXTERNAL_DOC_DOMAIN_NOT_ALLOWED:{hostname}")


def validate_okf_output_namespace(value: str) -> None:
    """Shared with atlas_okf_docs_pipeline.py's manifest loader and
    atlas_doc_manifest.py's Pydantic layer (DOC-01) -- kept here, not
    duplicated, so both validate identically."""
    normalized = value.replace("\\", "/")
    if not re.fullmatch(r"docs/\.okf/[A-Za-z0-9_./-]+", normalized):
        raise ValueError(f"INVALID_OKF_OUTPUT_NAMESPACE:{value}")
    if ".." in PurePosixPath(normalized).parts:
        raise ValueError(f"INVALID_OKF_OUTPUT_NAMESPACE:{value}")


def stanza_observations(text: str, *, pipeline: Any, model_revision: str) -> tuple[tuple[Json, ...], tuple[Json, ...]]:
    """Produce POS/dependency observations plus conservative dependency tuples.

    The tuples are nominations only. A predicate with subject/object/oblique
    participants becomes an N-ary tuple when at least two participants exist.
    """
    doc = pipeline(text)
    tokens: list[Json] = []
    tuples: list[Json] = []
    search_from = 0
    for sentence_index, sentence in enumerate(doc.sentences):
        words = list(sentence.words)
        by_id = {int(word.id): word for word in words if isinstance(word.id, int)}
        child_by_head: dict[int, list[Any]] = {}
        for word in words:
            if isinstance(word.head, int):
                child_by_head.setdefault(word.head, []).append(word)

        for word in words:
            token_text = str(word.text)
            start = getattr(word, "start_char", None)
            end = getattr(word, "end_char", None)
            if start is None or end is None:
                start = text.find(token_text, search_from)
                if start < 0:
                    start = search_from
                end = start + len(token_text)
                search_from = end
            tokens.append({
                "token_id": f"tok:{sentence_index}:{word.id}",
                "text": token_text,
                "lemma": getattr(word, "lemma", None),
                "upos": getattr(word, "upos", None),
                "xpos": getattr(word, "xpos", None),
                "morphology": getattr(word, "feats", None),
                "dependency_relation": getattr(word, "deprel", None),
                "head_token_index": int(word.head) if isinstance(word.head, int) and word.head > 0 else None,
                "start_char": int(start),
                "end_char": int(end),
                "producer": "STANZA",
                "producer_revision": "stanza-pos-depparse-v1",
                "model_revision": model_revision,
                "canonical_authority": False,
            })

        for predicate in words:
            if getattr(predicate, "upos", None) not in {"VERB", "AUX"}:
                continue
            participants: list[Json] = []
            for child in child_by_head.get(int(predicate.id), []):
                dep = str(getattr(child, "deprel", ""))
                if not (dep.startswith("nsubj") or dep in {"obj", "iobj"} or dep.startswith("obl")):
                    continue
                role = "subject" if dep.startswith("nsubj") else ("object" if dep in {"obj", "iobj"} else dep)
                participants.append({
                    "role": role,
                    "text": str(child.text),
                    "normalized_text": str(getattr(child, "lemma", None) or child.text).lower(),
                    "ontology_class": "CONCEPT",
                    "start_char": getattr(child, "start_char", None),
                    "end_char": getattr(child, "end_char", None),
                })
            if len(participants) >= 2:
                tuples.append({
                    "schema": "atlas.external-doc-ontology-tuple.v1",
                    "tuple_id": f"tuple:{sentence_index}:{predicate.id}",
                    "predicate": str(predicate.text),
                    "predicate_lemma": getattr(predicate, "lemma", None),
                    "participants": participants,
                    "degree": len(participants),
                    "extraction_method": "STANZA_DEPENDENCY",
                    "evidence_span_refs": [f"sentence:{sentence_index}"],
                    "confidence": 1.0,
                    "canonical_authority": False,
                })
    return tuple(tokens), tuple(tuples)


def _heading_sections(text: str) -> list[tuple[tuple[str, ...], int, int, str]]:
    lines = text.splitlines(keepends=True)
    heading_stack: list[str] = []
    sections: list[tuple[tuple[str, ...], int, int, str]] = []
    offset = 0
    section_start = 0
    section_heading: tuple[str, ...] = tuple()
    buffer: list[str] = []
    for line in lines:
        match = re.match(r"^(#{1,6})\s+(.+?)\s*$", line.rstrip("\n"))
        if match:
            if buffer:
                body = "".join(buffer).strip()
                if body:
                    sections.append((section_heading, section_start, offset, body))
            level = len(match.group(1))
            heading_stack = heading_stack[: level - 1] + [match.group(2).strip()]
            section_heading = tuple(heading_stack)
            section_start = offset + len(line)
            buffer = []
        else:
            buffer.append(line)
        offset += len(line)
    if buffer:
        body = "".join(buffer).strip()
        if body:
            sections.append((section_heading, section_start, len(text), body))
    return sections or [(tuple(), 0, len(text), text)]


def chunk_document(
    *,
    source_id: str,
    source_revision: str,
    source_url: str,
    title: str,
    text: str,
    maximum_chars: int = 3000,
    overlap_chars: int = 300,
    nlp: Callable[[str], tuple[tuple[Json, ...], tuple[Json, ...]]] | None = None,
    doc_coordinate: Any = None,
) -> tuple[ChunkRecord, ...]:
    if maximum_chars <= 0 or overlap_chars < 0 or overlap_chars >= maximum_chars:
        raise ValueError("INVALID_CHUNK_WINDOW")
    normalized = _normalize_ws(text)
    document_checksum = _sha(normalized)
    domain = classify_domain(title, normalized)
    chunks: list[ChunkRecord] = []
    ordinal = 0
    for heading_path, section_start, _section_end, body in _heading_sections(normalized):
        cursor = 0
        while cursor < len(body):
            end = min(len(body), cursor + maximum_chars)
            if end < len(body):
                boundary = body.rfind("\n", cursor, end)
                if boundary <= cursor:
                    boundary = body.rfind(". ", cursor, end)
                    if boundary > cursor:
                        boundary += 1
                if boundary > cursor + maximum_chars // 3:
                    end = boundary
            chunk_text = body[cursor:end].strip()
            if chunk_text:
                lexical, tuples = nlp(chunk_text) if nlp else (tuple(), tuple())
                absolute_start = max(0, section_start + cursor)
                absolute_end = absolute_start + len(chunk_text)
                chunk_id = f"doc:{source_id}:{document_checksum[:16]}:{ordinal}"
                chunk_coordinate = None
                if doc_coordinate is not None:
                    section_anchor = "/".join(heading_path) or None
                    chunk_coordinate = doc_coordinate.model_copy(
                        update={"content_hash": document_checksum, "section_anchor": section_anchor}
                    )
                chunks.append(ChunkRecord(
                    chunk_id=chunk_id,
                    source_id=source_id,
                    source_revision=source_revision,
                    source_url=source_url,
                    document_checksum=document_checksum,
                    ordinal=ordinal,
                    heading_path=heading_path,
                    start_char=absolute_start,
                    end_char=absolute_end,
                    text=chunk_text,
                    domain_class=domain,
                    ontology_classes=classify_ontology(chunk_text),
                    lexical_tokens=lexical,
                    ontology_tuples=tuples,
                    doc_coordinate=chunk_coordinate,
                ))
                ordinal += 1
            if end >= len(body):
                break
            cursor = max(cursor + 1, end - overlap_chars)
    return tuple(chunks)


def embed_llama_server_768(
    texts: Sequence[str],
    *,
    base_url: str = "http://127.0.0.1:8081",
    model: str = "embeddinggemma-300m-f16.gguf",
    timeout_seconds: int = 60,
    max_chars_per_request: int = 1500,
) -> np.ndarray:
    """Embed through llama-server and fail closed on missing/wrong dimensions.

    The repo has recorded a prior physical-batch boundary on port 8081, so this
    caller deliberately keeps requests bounded and never substitutes zero vectors.
    """
    vectors: list[np.ndarray] = []
    for text in texts:
        bounded = text[:max_chars_per_request]
        body = json.dumps({"model": model, "input": bounded}).encode("utf-8")
        request = Request(
            f"{base_url.rstrip('/')}/v1/embeddings",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=timeout_seconds) as response:  # noqa: S310 - local configured endpoint
            payload = json.loads(response.read())
        data = payload.get("data") or []
        if not data or "embedding" not in data[0]:
            raise RuntimeError("EMBEDDING_RESPONSE_MISSING_VECTOR")
        vector = np.asarray(data[0]["embedding"], dtype=np.float32)
        if vector.shape != (768,) or not np.isfinite(vector).all():
            raise RuntimeError(f"EMBEDDING_VECTOR_INVALID:{vector.shape}")
        vectors.append(vector)
    return np.ascontiguousarray(np.stack(vectors), dtype=np.float32)


def low_rank_sample_query_features(matrix: np.ndarray, *, rank: int = 64) -> tuple[np.ndarray, Json]:
    """Compute deterministic SVD low-rank row masses for Tang-inspired nomination.

    This is not Tang's full recommendation algorithm. It implements the reusable
    l2 sample/query idea over a bounded low-rank approximation. The returned
    probabilities nominate candidates only and carry no canonical authority.
    """
    source = np.asarray(matrix, dtype=np.float32)
    if source.ndim != 2 or source.shape[0] == 0 or source.shape[1] == 0:
        raise ValueError("matrix must be non-empty rank-2")
    if not np.isfinite(source).all():
        raise ValueError("matrix contains non-finite values")
    k = min(int(rank), source.shape[0], source.shape[1])
    if k <= 0:
        raise ValueError("rank must be positive")
    u, s, vt = np.linalg.svd(source.astype(np.float64), full_matrices=False)
    approx = (u[:, :k] * s[:k]) @ vt[:k, :]
    row_mass = np.sum(approx * approx, axis=1, dtype=np.float64)
    total = float(row_mass.sum())
    probabilities = np.full(source.shape[0], 1.0 / source.shape[0], dtype=np.float64) if total <= 0 else row_mass / total
    receipt = {
        "schema": "atlas.low-rank-sample-query-receipt.v1",
        "rows": int(source.shape[0]),
        "dimensions": int(source.shape[1]),
        "rank": k,
        "singular_values_checksum": _sha(np.ascontiguousarray(s[:k]).tobytes()),
        "probabilities_checksum": _sha(np.ascontiguousarray(probabilities).tobytes()),
        "frobenius_residual": float(np.linalg.norm(source.astype(np.float64) - approx)),
        "canonical_authority": False,
    }
    return probabilities.astype(np.float32), receipt


def deterministic_pagerank(
    node_ids: Sequence[str],
    edges: Sequence[tuple[str, str]],
    *,
    alpha: float = 0.85,
    max_iter: int = 100,
    tolerance: float = 1e-9,
) -> tuple[dict[str, float], Json]:
    """Small deterministic CPU PageRank oracle for documentation-link graphs."""
    if not node_ids:
        return {}, {"schema": "atlas.external-doc-pagerank-receipt.v1", "rows": 0, "canonical_authority": False}
    if not (0.0 < alpha < 1.0):
        raise ValueError("alpha must be between 0 and 1")
    ordered = list(dict.fromkeys(node_ids))
    index = {node: i for i, node in enumerate(ordered)}
    n = len(ordered)
    outgoing: list[list[int]] = [[] for _ in range(n)]
    for source, target in sorted(edges):
        if source in index and target in index:
            outgoing[index[source]].append(index[target])
    score = np.full(n, 1.0 / n, dtype=np.float64)
    teleport = (1.0 - alpha) / n
    iterations = 0
    for iteration in range(max_iter):
        nxt = np.full(n, teleport, dtype=np.float64)
        dangling = 0.0
        for src, targets in enumerate(outgoing):
            if targets:
                share = alpha * score[src] / len(targets)
                for target in targets:
                    nxt[target] += share
            else:
                dangling += score[src]
        nxt += alpha * dangling / n
        iterations = iteration + 1
        if float(np.abs(nxt - score).sum()) <= tolerance:
            score = nxt
            break
        score = nxt
    result = {node: float(score[i]) for i, node in enumerate(ordered)}
    receipt = {
        "schema": "atlas.external-doc-pagerank-receipt.v1",
        "rows": n,
        "edges": len(edges),
        "alpha": alpha,
        "iterations": iterations,
        "score_checksum": _sha(_stable_json(result)),
        "canonical_authority": False,
    }
    return result, receipt


def qdrant_points(
    chunks: Sequence[ChunkRecord],
    embeddings: np.ndarray,
    *,
    feature_rows: Mapping[str, Mapping[str, Any]] | None = None,
    producer_revision: str,
) -> list[Json]:
    source = np.asarray(embeddings, dtype=np.float32)
    if source.shape != (len(chunks), 768):
        raise ValueError(f"QDRANT_EMBEDDING_SHAPE_MISMATCH:{source.shape}")
    if not np.isfinite(source).all() or np.any(np.linalg.norm(source, axis=1) == 0):
        raise ValueError("QDRANT_EMBEDDINGS_MUST_BE_FINITE_NONZERO")
    features = feature_rows or {}
    points: list[Json] = []
    for ordinal, chunk in enumerate(chunks):
        extra = dict(features.get(chunk.chunk_id, {}))
        point_id = _sha(chunk.chunk_id)[:32]
        points.append({
            "id": point_id,
            "vector": source[ordinal].tolist(),
            "payload": {
                **chunk.to_dict(),
                **extra,
                "producer_revision": producer_revision,
                "semantic_dimension": 768,
                "semantic_lane": "external_docs",
                "canonical_authority": False,
            },
        })
    return points


def build_context_payload(
    ranked_chunk_ids: Sequence[str],
    chunks_by_id: Mapping[str, ChunkRecord],
    *,
    maximum_hops: int,
    maximum_chunks: int,
) -> Json:
    selected: list[Json] = []
    for chunk_id in ranked_chunk_ids[:maximum_chunks]:
        chunk = chunks_by_id.get(chunk_id)
        if chunk is None:
            continue
        selected.append({
            "chunk_id": chunk.chunk_id,
            "source_revision": chunk.source_revision,
            "source_url": chunk.source_url,
            "heading_path": list(chunk.heading_path),
            "text": chunk.text,
            "ontology_tuples": list(chunk.ontology_tuples),
        })
    return {
        "schema": "atlas.external-doc-context-payload.v1",
        "maximum_hops": maximum_hops,
        "chunks": selected,
        "payload_checksum": _sha(_stable_json(selected)),
        "canonical_authority": False,
    }
