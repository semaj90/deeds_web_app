"""BeautifulSoup + Pydantic extractor turning `.okf/docs/dspy/*.html` into PROPOSED HyperGraphRAG packets.

Emits bounded packets matching:
`[summary, citations, keywords, domain_taxonomy, potential_unknowns, candidates]`
with deterministic BoW term-frequency dicts (`dict[str, int]`) and SHA-256
source hashes. Strictly `PROPOSED` (`canonicalAuthority: False`,
`writesPerformed: False`, `hiddenStatePersisted: False`).
"""
from __future__ import annotations

import hashlib
import re
from collections import Counter
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

TOKEN_RE = re.compile(r"[a-z0-9_./:-]{3,}", re.IGNORECASE)
STOPWORDS = frozenset(
    {
        "the",
        "and",
        "for",
        "with",
        "that",
        "this",
        "from",
        "are",
        "was",
        "were",
        "have",
        "has",
        "had",
        "not",
        "but",
        "can",
        "use",
        "using",
        "into",
        "your",
        "you",
    }
)


class HyperGraphRagPacketProposalV1(BaseModel):
    schema_version: str = "atlas.okf-hypergraphrag-proposal.v1"
    canonicalAuthority: bool = False
    writesPerformed: bool = False
    hiddenStatePersisted: bool = False
    status: str = "PROPOSED"
    sourceRef: str
    sourceSha256: str
    title: str
    summary: str
    citations: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    bowTermFreq: dict[str, int] = Field(default_factory=dict)
    domain_taxonomy: list[str] = Field(default_factory=list)
    potential_unknowns: list[str] = Field(default_factory=list)
    candidates: list[dict[str, Any]] = Field(default_factory=list)


def _infer_domain_taxonomy_v1(text_lower: str) -> list[str]:
    domains: list[str] = []
    if any(k in text_lower for k in ("gepa", "dspy", "optimize", "teleprompt", "metric")):
        domains.append("dspy_gepa")
    if any(k in text_lower for k in ("retrieve", "rag", "pgvector", "embed", "rerank")):
        domains.append("retrieval_rag")
    if any(k in text_lower for k in ("signature", "predict", "chainofthought", "module")):
        domains.append("program_synthesis")
    return domains or ["general_docs"]


def extract_okf_html_packet_v1(html_path: str | Path, *, repo_root: Path | None = None) -> HyperGraphRagPacketProposalV1:
    """Parse one `.okf` HTML file via BeautifulSoup into a Pydantic HyperGraphRAG proposal."""
    path = Path(html_path)
    raw_bytes = path.read_bytes()
    sha256 = "sha256:" + hashlib.sha256(raw_bytes).hexdigest()
    rel = str(path.relative_to(repo_root) if repo_root else path).replace("\\", "/")

    soup = BeautifulSoup(raw_bytes.decode("utf-8", errors="replace"), "html.parser")
    for tag in soup(["script", "style", "nav"]):
        tag.decompose()

    title = (soup.title.string.strip() if soup.title and soup.title.string else path.stem)[:200]
    paragraphs = [p.get_text(" ", strip=True) for p in soup.find_all(["p", "h1", "h2", "li"])]
    clean_text = " ".join(p for p in paragraphs if p)
    summary = clean_text[:400] if clean_text else title

    citations = []
    for a in soup.find_all("a", href=True):
        href = str(a["href"]).strip()
        if href and not href.startswith("#") and href not in citations:
            citations.append(href)
        if len(citations) >= 15:
            break

    tokens = [
        t.lower()
        for t in TOKEN_RE.findall(clean_text)
        if t.lower() not in STOPWORDS and not t.isdigit()
    ]
    counts = Counter(tokens)
    top_bow = dict(counts.most_common(20))
    keywords = list(top_bow.keys())

    unknowns: list[str] = []
    if not citations:
        unknowns.append("NO_EXTERNAL_CITATIONS_EXTRACTED")
    if len(clean_text) < 80:
        unknowns.append("SHORT_BODY_NEEDS_REVIEW")

    candidates = [
        {
            "subject": title,
            "predicate": "MENTIONS_KEYWORD",
            "object": kw,
            "count": freq,
            "status": "PROPOSED",
        }
        for kw, freq in list(top_bow.items())[:5]
    ]

    return HyperGraphRagPacketProposalV1(
        sourceRef=rel,
        sourceSha256=sha256,
        title=title,
        summary=summary,
        citations=citations,
        keywords=keywords,
        bowTermFreq=top_bow,
        domain_taxonomy=_infer_domain_taxonomy_v1(clean_text.lower()),
        potential_unknowns=unknowns,
        candidates=candidates,
    )


def extract_okf_html_batch_v1(
    docs_dir: str | Path = ".okf/docs/dspy",
    *,
    limit: int = 10,
    repo_root: Path | None = None,
) -> dict[str, Any]:
    """Extract a bounded batch of `.okf` HTML files into PROPOSED HyperGraphRAG packets."""
    root = Path(docs_dir)
    files = sorted(root.rglob("*.html"))[:limit]
    packets = [extract_okf_html_packet_v1(f, repo_root=repo_root).model_dump() for f in files]
    return {
        "schema": "atlas.okf-hypergraphrag-batch.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "hiddenStatePersisted": False,
        "docsDir": str(docs_dir),
        "processedCount": len(packets),
        "packets": packets,
    }
