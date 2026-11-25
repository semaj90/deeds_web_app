"""Read-only PG18 readback binding for the reviewed CUDA C++ -> PTX proposal."""
from __future__ import annotations

import hashlib
import json
import os
import argparse
from pathlib import Path
import sys
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from atlas_external_docs import fetch_beautifulsoup  # noqa: E402
from atlas_graph_runtime.doc14_canonical_source_binding_v1 import (  # noqa: E402
    build_doc14_canonical_source_binding_v1,
)

SOURCE_URL = "https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/cuda-platform.html"
QUOTE = "NVRTC can be used to compile CUDA C++ device code to PTX at runtime."
PROPOSAL_PATH = ROOT / "docs/reports/doc14-nvidia-cuda-ptx-relation-proposal-v1.json"
REVIEW_PATH = ROOT / "docs/reports/doc14-nvidia-cuda-ptx-human-review-v1.json"
OUTPUT_PATH = ROOT / "docs/reports/doc14-nvidia-cuda-ptx-canonical-source-binding-v1.json"
LANGEXTRACT_URL = "http://127.0.0.1:8095/extract/documentation-facts"


def run_live_langextract_probe(
    *,
    chunk_text: str,
    chunk_id: str,
    chunk_start_byte: int,
    chunk_checksum: str,
    chunk_evidence_revision: str,
    page_markdown: str,
    page_content_sha256: str,
    page_evidence_revision: str,
) -> dict[str, object]:
    """Run bounded extraction on a canonical chunk, then rebase exact spans to its page."""
    chunk_bytes = chunk_text.encode("utf-8")
    page_bytes = page_markdown.encode("utf-8")
    actual_chunk_sha256 = hashlib.sha256(chunk_bytes).hexdigest()
    actual_page_sha256 = hashlib.sha256(page_bytes).hexdigest()
    if page_content_sha256.removeprefix("sha256:") != actual_page_sha256:
        raise RuntimeError("DOC14_LANGEXTRACT_PAGE_CONTENT_CHECKSUM_MISMATCH")
    if actual_chunk_sha256 != chunk_checksum:
        raise RuntimeError("DOC14_LANGEXTRACT_CHUNK_CHECKSUM_MISMATCH")
    if page_bytes[chunk_start_byte:chunk_start_byte + len(chunk_bytes)] != chunk_bytes:
        raise RuntimeError("DOC14_LANGEXTRACT_CHUNK_PAGE_REBASE_MISMATCH")
    quote_char_start = chunk_text.find(QUOTE)
    if quote_char_start < 0:
        raise RuntimeError("DOC14_LANGEXTRACT_REVIEWED_QUOTE_NOT_IN_CHUNK")
    quote_char_end = quote_char_start + len(QUOTE)
    previous_sentence = chunk_text.rfind(". ", 0, quote_char_start)
    window_start_char = previous_sentence + 2 if previous_sentence >= 0 else 0
    window_text = chunk_text[window_start_char:quote_char_end]
    window_start_byte = len(chunk_text[:window_start_char].encode("utf-8"))
    window_bytes = window_text.encode("utf-8")
    actual_window_sha256 = hashlib.sha256(window_bytes).hexdigest()
    source_revision = f"sha256:{actual_window_sha256}"
    payload = json.dumps({
        "text": window_text,
        "sourceUrl": SOURCE_URL,
        "sourceRevision": source_revision,
        "productVersion": "CURRENT_UPSTREAM",
    }).encode("utf-8")
    request = Request(
        LANGEXTRACT_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=120) as response:
        result = json.loads(response.read().decode("utf-8"))

    if result.get("inputHash") != actual_window_sha256:
        raise RuntimeError("DOC14_LANGEXTRACT_INPUT_HASH_MISMATCH")
    facts = result.get("facts")
    if not isinstance(facts, list):
        raise RuntimeError("DOC14_LANGEXTRACT_FACTS_INVALID")
    quote_start = window_bytes.find(QUOTE.encode("utf-8"))
    quote_end = quote_start + len(QUOTE.encode("utf-8"))
    exact_facts: list[dict[str, object]] = []
    quote_supported = False
    for fact in facts:
        if not isinstance(fact, dict):
            continue
        start_byte, end_byte = fact.get("startByte"), fact.get("endByte")
        start_char, end_char = fact.get("startChar"), fact.get("endChar")
        if not all(isinstance(n, int) and not isinstance(n, bool) for n in (start_byte, end_byte, start_char, end_char)):
            continue
        if start_byte < 0 or end_byte <= start_byte or end_byte > len(window_bytes):
            continue
        if start_char < 0 or end_char <= start_char or end_char > len(window_text):
            continue
        evidence = window_bytes[start_byte:end_byte]
        try:
            evidence_text = evidence.decode("utf-8", errors="strict")
        except UnicodeDecodeError:
            continue
        if (fact.get("sourceUrl") != SOURCE_URL
                or fact.get("sourceRevision") != source_revision
                or fact.get("alignmentStatus") != "MATCH_EXACT"
                or fact.get("evidenceText") != evidence_text
                or len(window_text[:start_char].encode("utf-8")) != start_byte
                or len(window_text[:end_char].encode("utf-8")) != end_byte
                or window_text[start_char:end_char] != evidence_text):
            continue
        exact_facts.append({
            "subject": fact.get("subject"),
            "predicate": fact.get("predicate"),
            "object": fact.get("object"),
            "startByte": start_byte,
            "endByte": end_byte,
            "pageStartByte": chunk_start_byte + window_start_byte + start_byte,
            "pageEndByte": chunk_start_byte + window_start_byte + end_byte,
            "evidenceTextSha256": hashlib.sha256(evidence).hexdigest(),
            "extractionMethod": fact.get("extractionMethod"),
            "canonicalAuthority": fact.get("canonicalAuthority"),
        })
        if (quote_start >= 0 and start_byte <= quote_start and end_byte >= quote_end
                and page_bytes[chunk_start_byte + window_start_byte + quote_start:
                               chunk_start_byte + window_start_byte + quote_end] == QUOTE.encode("utf-8")):
            quote_supported = True

    return {
        "status": "LIVE_LANGEXTRACT_EXACT_SPANS" if exact_facts else "LIVE_LANGEXTRACT_NO_EXACT_FACTS",
        "chunkId": chunk_id,
        "canonicalChunkContentSha256": actual_chunk_sha256,
        "windowSourceRevision": source_revision,
        "chunkEvidenceRevision": chunk_evidence_revision,
        "windowStartByteInChunk": window_start_byte,
        "windowSha256": actual_window_sha256,
        "pageContentSha256": page_content_sha256,
        "pageEvidenceRevision": page_evidence_revision,
        "modelId": result.get("modelId"),
        "producerRevision": result.get("producerRevision"),
        "inputHash": result.get("inputHash"),
        "outputHash": result.get("outputHash"),
        "returnedFactCount": len(facts),
        "error": result.get("error"),
        "exactFactCount": len(exact_facts),
        "reviewedQuoteByteSpan": [quote_start, quote_end] if quote_start >= 0 else None,
        "pageReviewedQuoteByteSpan": (
            [chunk_start_byte + window_start_byte + quote_start,
             chunk_start_byte + window_start_byte + quote_end]
            if quote_start >= 0 else None
        ),
        "reviewedQuoteCoveredByExactFact": quote_supported,
        "facts": exact_facts,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--live-langextract",
        action="store_true",
        help="send the independently rebound normalized page to the existing :8095 route",
    )
    args = parser.parse_args()
    try:
        from dotenv import dotenv_values
        config = dotenv_values(ROOT / ".env")
    except ImportError:
        config = {}
    database_url = os.environ.get("DATABASE_URL") or config.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL_REQUIRED_FOR_READ_ONLY_BINDING")
    import psycopg

    proposal_bytes = PROPOSAL_PATH.read_bytes()
    proposal = json.loads(proposal_bytes.decode("utf-8"))
    review = json.loads(REVIEW_PATH.read_text(encoding="utf-8"))
    fetched = fetch_beautifulsoup(SOURCE_URL)
    if fetched.resolved_url != SOURCE_URL:
        raise RuntimeError("DOC14_CAPTURE_URL_MISMATCH")
    normalized_source_bytes = fetched.markdown.encode("utf-8")

    with psycopg.connect(
        database_url,
        options="-c default_transaction_read_only=on",
        connect_timeout=5,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id::text, url, content_hash, evidence_revision
                   FROM public.atlas_external_doc_pages WHERE url = %s""",
                (SOURCE_URL,),
            )
            page_rows = cur.fetchall()
            if len(page_rows) != 1:
                raise RuntimeError(f"DOC14_CANONICAL_PAGE_CARDINALITY:{len(page_rows)}")
            page_id, page_url, content_hash, page_revision = page_rows[0]
            cur.execute(
                """SELECT chunk_id, ordinal, start_byte, end_byte, chunk_checksum,
                          evidence_revision, text
                   FROM public.atlas_external_doc_chunks
                   WHERE page_id = %s AND text LIKE %s""",
                (page_id, f"%{QUOTE}%"),
            )
            chunk_rows = cur.fetchall()
            if len(chunk_rows) != 1:
                raise RuntimeError(f"DOC14_CANONICAL_CHUNK_CARDINALITY:{len(chunk_rows)}")
            (chunk_id, ordinal, start_byte, end_byte, chunk_checksum,
             chunk_revision, chunk_text) = chunk_rows[0]
            cur.execute("SELECT count(*) FROM public.atlas_ontology_linked_tuples")
            tuple_rows = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM public.atlas_ontology_relations")
            relation_rows = cur.fetchone()[0]
            cur.execute(
                "SELECT count(*) FILTER (WHERE graph_revision IS NOT NULL) "
                "FROM public.atlas_graph_snapshots_v2"
            )
            graph_revisions = cur.fetchone()[0]

    receipt = build_doc14_canonical_source_binding_v1(
        proposal_envelope=proposal,
        proposal_file_sha256=hashlib.sha256(proposal_bytes).hexdigest(),
        review_receipt=review,
        page={
            "id": page_id, "url": page_url, "content_hash": content_hash,
            "evidence_revision": page_revision,
        },
        chunk={
            "chunk_id": chunk_id, "ordinal": ordinal, "start_byte": start_byte,
            "end_byte": end_byte, "chunk_checksum": chunk_checksum,
            "evidence_revision": chunk_revision, "text": chunk_text,
        },
        normalized_source_bytes=normalized_source_bytes,
        graph_state={
            "nonNullGraphRevisionCount": graph_revisions,
            "ontologyTupleRows": tuple_rows,
            "ontologyRelationRows": relation_rows,
        },
    )
    receipt["capture"] = {
        "fetcher": fetched.fetcher,
        "rawHtmlSha256": fetched.raw_checksum,
        "normalizedTextSha256": fetched.normalized_checksum,
        "normalizedUtf8ByteLength": len(normalized_source_bytes),
    }
    receipt["canonicalAuthority"] = False
    receipt["writesPerformed"] = False
    if args.live_langextract:
        receipt["langextractProbe"] = run_live_langextract_probe(
            chunk_text=chunk_text,
            chunk_id=chunk_id,
            chunk_start_byte=start_byte,
            chunk_checksum=chunk_checksum,
            chunk_evidence_revision=chunk_revision,
            page_markdown=fetched.markdown,
            page_content_sha256=content_hash,
            page_evidence_revision=page_revision,
        )
    OUTPUT_PATH.write_text(
        json.dumps(receipt, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "status": receipt["status"],
        "reportPath": str(OUTPUT_PATH),
        "canonicalChunkId": receipt["chunk"]["chunkId"],
        "span": [receipt["evidence"]["startByte"], receipt["evidence"]["endByte"]],
        "graphReadback": receipt["graphReadback"],
        "langextractProbe": receipt.get("langextractProbe"),
        "canonicalAuthority": False,
        "writesPerformed": False,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
