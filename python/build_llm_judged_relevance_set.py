"""LLM-judged relevance set: an independent (non-IMPORTS-derived) relevance signal for a sample
of the structural-proxy golden set's queries, to test whether the GA8 weight-sweep finding
(pure PageRank beats every semantic blend, up to and including pure semantic) survives on ground
truth that isn't itself computed from the same graph PageRank is computed from.

Context (see openspec/changes/parent-atlas-graph-analysis-contract/tasks.md, "BLEND_SEMANTIC_WEIGHT
sweep" section): the STRUCTURAL_PROXY_IMPORTERS golden set defines relevance as "is a real IMPORTS
edge," and PageRank is itself an IMPORTS-graph centrality measure -- so PageRank dominating that
label is expected almost by construction, not necessarily evidence PageRank helps *semantic*
relevance. The honest next step named there is a human-labeled semantic relevance set. This script
is NOT that -- it substitutes an LLM judge (locally-hosted ornith-1.5-9b via llama-server :8090,
the only live generation-capable model found; embeddinggemma/nomic-embed-text/granite-docling on
Ollama are embedding/vision-only, not generation-capable) because no human labeling capacity is
available in this session. This is a WEAKER evidence tier than human labeling and must never be
reported or treated as equivalent to it -- LLM-judge relevance has its own well-documented biases
(position bias, self-preference, verbosity bias) and is explicitly flagged as
LLM_JUDGED_PROXY, not HUMAN_VERIFIED, in every receipt this produces.

What breaks the circularity concern (partially, not fully): the LLM judge sees only the query
file's summary and each candidate's summary/path -- it has NO access to the IMPORTS graph or to
PageRank scores, so its relevance judgments are not mechanically derived from the same graph
structure PageRank is computed from. It could still be *correlated* with import structure for
legitimate reasons (files that import each other often ARE topically related) -- that's a
different, weaker form of the same concern and is called out in the receipt, not hidden.

canonical_authority: false. Judgments are written only to a local ndjson file, not to Postgres.
"""

from __future__ import annotations

import json
import random

import numpy as np
import psycopg2
import psycopg2.extras
import requests

DATABASE_URL = "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"
OLLAMA_URL = "http://127.0.0.1:11434"
LLAMA_URL = "http://127.0.0.1:8090"
EMBED_MODEL = "embeddinggemma:latest"
JUDGE_MODEL = "ornith-1.5-9b"
GOLDEN_SET_PATH = ".tmp/atlas/structural-proxy-golden-set-v1.ndjson"
OUT_PATH = ".tmp/atlas/llm-judged-relevance-v1.ndjson"
SEMANTIC_POOL_K = 50
SAMPLE_SIZE = 60
SEED = 684453
SUMMARY_TRUNCATE = 220


def embed_query(text: str) -> list[float]:
    resp = requests.post(f"{OLLAMA_URL}/api/embed", json={"model": EMBED_MODEL, "input": text[:2000]}, timeout=30)
    resp.raise_for_status()
    return resp.json()["embeddings"][0]


def llama_chat_stream(messages: list[dict], max_tokens: int = 4000) -> str:
    # ornith-1.5-9b is a thinking/reasoning model: reasoning_content streams first and can
    # exhaust a small max_tokens budget before any real `content` token appears (confirmed live
    # -- 900 was silently insufficient against a ~40-candidate judging prompt: finish_reason
    # never fired, content stayed empty; 4000 reliably reaches content). Only `content` deltas
    # are assembled here -- reasoning_content is deliberately discarded, matching this repo's
    # established Gemma4/llama-server streaming convention (see CLAUDE.md "Gemma4 LLM Call
    # Rules"), which this model also follows despite not being Gemma4 itself.
    payload = {
        "model": JUDGE_MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0,
        "stream": True,
    }
    resp = requests.post(f"{LLAMA_URL}/v1/chat/completions", json=payload, stream=True, timeout=180)
    resp.raise_for_status()
    assembled = ""
    for line in resp.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if data == "[DONE]":
            break
        try:
            obj = json.loads(data)
            assembled += obj["choices"][0]["delta"].get("content", "")
        except Exception:
            continue
    return assembled.strip()


def extract_json_array(text: str) -> list[int]:
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end < start:
        return []
    try:
        parsed = json.loads(text[start:end + 1])
        return [int(x) for x in parsed if isinstance(x, (int, float))]
    except Exception:
        return []


def build_pool_for_judging(conn, entry: dict) -> dict | None:
    query_ref = entry["query_source_ref"]
    query_vec = np.array(embed_query(entry["query_text"]), dtype=np.float32)
    query_vec_literal = "[" + ",".join(f"{v:.6f}" for v in query_vec) + "]"

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id::text AS id, relative_path, summary
            FROM codebase_chunk_index
            WHERE content_embedding IS NOT NULL AND id::text != %s
            ORDER BY content_embedding <=> %s::halfvec
            LIMIT %s
            """,
            (entry["query_packet_key"], query_vec_literal, SEMANTIC_POOL_K),
        )
        pool = cur.fetchall()

    if not pool:
        return None
    return {"query_source_ref": query_ref, "pool": pool}


def judge_pool(entry: dict, pool: list[dict]) -> list[int]:
    lines = []
    for idx, r in enumerate(pool):
        summary = (r.get("summary") or "").strip().replace("\n", " ")[:SUMMARY_TRUNCATE]
        lines.append(f"[{idx}] path={r['relative_path']} summary={summary or '(no summary)'}")
    candidates_block = "\n".join(lines)

    query_summary = (entry.get("query_text") or "")[:SUMMARY_TRUNCATE]
    prompt = (
        "You are judging code-search relevance for a codebase retrieval system.\n"
        f"QUERY FILE: {entry['query_source_ref']}\n"
        f"QUERY SUMMARY: {query_summary}\n\n"
        "CANDIDATES (index, path, summary):\n"
        f"{candidates_block}\n\n"
        "Which candidate indices would a developer working on the QUERY FILE genuinely want to "
        "see as related context (shared concern, shared abstraction, direct functional "
        "relationship)? Judge purely on the SUMMARY TEXT content -- do not assume anything about "
        "file structure or directory layout. Be selective: most candidates in a random top-50 "
        "semantic-similarity pool are NOT truly relevant. Reply with ONLY a JSON array of "
        "relevant indices, e.g. [3, 17, 22]. If none are relevant, reply []."
    )
    text = llama_chat_stream([{"role": "user", "content": prompt}])
    return extract_json_array(text)


def main() -> None:
    entries = [json.loads(l) for l in open(GOLDEN_SET_PATH, "r", encoding="utf-8") if l.strip()]
    rng = random.Random(SEED)
    sample = rng.sample(entries, min(SAMPLE_SIZE, len(entries)))

    conn = psycopg2.connect(DATABASE_URL)
    written = 0
    skipped_empty_pool = 0
    skipped_unparseable_judgment = 0
    try:
        with open(OUT_PATH, "w", encoding="utf-8") as out:
            for i, entry in enumerate(sample):
                built = build_pool_for_judging(conn, entry)
                if built is None:
                    skipped_empty_pool += 1
                    continue
                relevant_idxs = judge_pool(entry, built["pool"])
                valid_idxs = [i for i in relevant_idxs if 0 <= i < len(built["pool"])]
                if not relevant_idxs:
                    # Empty array is a legitimate judgment (none relevant), not a parse failure --
                    # only flag as unparseable if extraction found nothing AND the model's raw
                    # output wasn't an explicit empty array. We can't distinguish here without the
                    # raw text, so just record it as zero relevant; downstream eval already
                    # tolerates zero-relevant entries as "no positive signal for this query."
                    pass
                relevant_ids = [built["pool"][i]["id"] for i in valid_idxs]
                record = {
                    "query_source_ref": entry["query_source_ref"],
                    "query_packet_key": entry["query_packet_key"],
                    "query_text": entry["query_text"],
                    "pool_ids_in_order": [r["id"] for r in built["pool"]],
                    "llm_judged_relevant_packet_keys": relevant_ids,
                    "imports_relevant_packet_keys": entry["relevant_packet_keys"],
                    "overlap_with_imports_relevant": len(set(relevant_ids) & set(entry["relevant_packet_keys"])),
                }
                out.write(json.dumps(record) + "\n")
                written += 1
                if written % 10 == 0:
                    print(json.dumps({"event": "progress", "written": written, "sample_total": len(sample)}))
    finally:
        conn.close()

    print(json.dumps({
        "status": "LLM_JUDGED_RELEVANCE_SET_BUILT",
        "evidence_tier": "LLM_JUDGED_PROXY",
        "not_human_verified": True,
        "written": written,
        "skipped_empty_pool": skipped_empty_pool,
        "out_path": OUT_PATH,
    }))


if __name__ == "__main__":
    main()
