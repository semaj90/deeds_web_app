"""EXTERNAL_DOC_SUMMARY_FAITHFULNESS_01 (deterministic token-level gate, READ ONLY, nothing persisted).

Generates real Ornith (:8090, NOT Ollama) summaries for a stratified sample of canonical chunks with the SAME prompt contract as the summary writer, then checks each
summary against ITS OWN canonical chunk: (1) every technical token/number the summary states must occur in the chunk (invented API names, settings, numbers, versions
=> UNSUPPORTED), (2) a token that matches a chunk token only after normalization but not verbatim => TECHNICAL_TOKEN_CORRUPTED, (3) missing key identifiers => SUPPORTED_WITH_OMISSION.
This is a strict token-support check, NOT a semantic entailment judge: PARTIALLY_SUPPORTED-style claims need a judge and are reported as NOT_RUN. A summary is a
compression/ranking aid and never replaces canonical chunk evidence. Writes only docs/reports/external-doc-summary-faithfulness-v1.json.
"""
from __future__ import annotations

import json
import re
import subprocess
import time
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LLAMA = "http://127.0.0.1:8090"
SYSTEM_PROMPT = ("You summarize one chunk of technical documentation. Write 1-3 plain sentences that state only what the chunk says. Keep exact identifiers, setting names, "
                 "function names and version numbers verbatim. Do not add facts, advice, or markdown headings.")
USER_TEMPLATE = "Product: {product} {productVersion}\nPage: {title}\nSection: {headingPath}\nChunk evidence: {chunkEvidenceRevision}\nText:\n{text}"
MUST_TRY = ["hnsw.iterative_scan", "hnsw.scan_mem_multiplier", "io_method", "uuidv7", "$derived"]
SAMPLE_PER_PRODUCT = 2
TOKEN_RE = re.compile(r"`([^`\n]{2,80})`|([A-Za-z_$][\w$]*(?:[._-][\w$]+)+)|([A-Za-z]+_[A-Za-z_]+)|\b(\d+(?:\.\d+)*)\b")


def norm(t: str) -> str:
    return re.sub(r"[\W_]+", "", t.lower())


def technical_tokens(text: str) -> set[str]:
    out: set[str] = set()
    for m in TOKEN_RE.finditer(text):
        tok = next(g for g in m.groups() if g)
        if tok.isdigit() and len(tok) < 2:
            continue
        out.add(tok.strip("`.,;:"))
    return {t for t in out if len(t) >= 2}


def assess(chunk_only: str, summary: str, meta: str = "") -> dict:
    chunk_text = chunk_only + " " + meta  # support may come from the chunk or the prompt's own product/version/title header
    src_tokens = technical_tokens(chunk_text)
    src_norm = {norm(t): t for t in src_tokens}
    sum_tokens = technical_tokens(summary)
    unsupported, corrupted = [], []
    for t in sorted(sum_tokens):
        if t in chunk_text:
            continue  # verbatim support anywhere in the chunk (the caller appends the prompt's own product/version metadata, which is legitimate input)
        parts = [x for x in re.split(r"-", t) if len(x) >= 3]
        if "-" in t and "_" not in t and "." not in t and parts and all(x.lower() in chunk_text.lower() or x.lower().rstrip("s") in chunk_text.lower() for x in parts):
            continue  # plain hyphenated compound built from words the chunk contains (e.g. low-selectivity); API-like tokens stay strict
        if norm(t) in src_norm:
            corrupted.append(f"{t} ~ {src_norm[norm(t)]}")
        elif norm(t) and norm(t) not in norm(chunk_text):
            unsupported.append(t)
    code_like = [t for t in technical_tokens(chunk_only) if re.search(r"[._$]", t) or re.search(r"[a-z][A-Z]", t)]  # key identifiers come from the CHUNK only
    key = sorted(code_like, key=lambda t: -len(t))[:3]
    omitted = [t for t in key if t not in summary]
    label = "TECHNICAL_TOKEN_CORRUPTED" if corrupted else "UNSUPPORTED" if unsupported else "SUPPORTED_WITH_OMISSION" if omitted and key else "SUPPORTED"
    return {"label": label, "unsupportedTokens": unsupported, "corruptedTokens": corrupted, "omittedKeyTokens": omitted}


JUDGE_SYSTEM = ("You audit a summary of one documentation chunk. Split the summary into its individual factual claims. For each claim answer SUPPORTED (the chunk states it), "
                "PARTIALLY_SUPPORTED (the chunk states part of it or it is a loose paraphrase) or UNSUPPORTED (the chunk does not say it). Judge only against the chunk text. "
                'Reply with JSON only: {"claims":[{"claim":"...","verdict":"SUPPORTED|PARTIALLY_SUPPORTED|UNSUPPORTED"}]}')


def judge(chunk_text: str, summary: str, model: str) -> dict:
    user = "Chunk:\n" + chunk_text + "\n\nSummary:\n" + summary
    body = json.dumps({"model": model, "temperature": 0, "max_tokens": 900, "stream": False, "seed": 1729, "messages": [{"role": "system", "content": JUDGE_SYSTEM}, {"role": "user", "content": user}]}).encode()
    try:
        d = json.load(urllib.request.urlopen(urllib.request.Request(f"{LLAMA}/v1/chat/completions", data=body, headers={"content-type": "application/json"}), timeout=90))
        raw = d["choices"][0]["message"]["content"].strip()
        start = min(i for i in (raw.find("{"), raw.find("[")) if i >= 0)
        parsed = json.JSONDecoder().raw_decode(raw[start:])[0]  # first complete JSON value only; fences/trailing prose are ignored
        claims = parsed["claims"] if isinstance(parsed, dict) else parsed  # the model sometimes returns a bare array instead of {"claims": [...]}
        claims = [c for c in claims if isinstance(c, dict)]
        verdicts = [c["verdict"] for c in claims if c.get("verdict") in ("SUPPORTED", "PARTIALLY_SUPPORTED", "UNSUPPORTED")]
        if not verdicts:
            return {"status": "JUDGE_PARSE_FAILED", "raw": raw[:300]}
        return {"status": "JUDGED", "claims": claims, "counts": dict(Counter(verdicts))}
    except Exception as e:  # recorded as null, never promoted
        return {"status": "JUDGE_ERROR", "error": str(e)[:200], "raw": locals().get("raw", "")[:300]}


def psql_json(sql: str):
    out = subprocess.run(["docker", "exec", "-i", "legal-ai-postgres", "psql", "-U", "legal_admin", "-d", "legal_ai_db", "-tA"], input=sql, capture_output=True, text=True, encoding="utf-8", check=True).stdout
    return json.loads(out)


def summarize(chunk: dict, model: str) -> tuple[str, str, int, float]:
    user = (USER_TEMPLATE.replace("{product}", chunk["product"]).replace("{productVersion}", chunk["ver"]).replace("{title}", chunk["title"])
            .replace("{headingPath}", " > ".join(chunk["head"] or []) or "none").replace("{chunkEvidenceRevision}", chunk["rev"]).replace("{text}", chunk["text"]))
    body = json.dumps({"model": model, "temperature": 0.2, "max_tokens": 300, "stream": False, "seed": 1729, "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}]}).encode()
    t0 = time.perf_counter()
    d = json.load(urllib.request.urlopen(urllib.request.Request(f"{LLAMA}/v1/chat/completions", data=body, headers={"content-type": "application/json"}), timeout=90))
    return d["choices"][0]["message"]["content"].strip(), d["choices"][0]["finish_reason"], d["usage"]["completion_tokens"], (time.perf_counter() - t0) * 1000


def main() -> int:
    props = json.load(urllib.request.urlopen(f"{LLAMA}/props", timeout=10))
    models = [m["id"] for m in json.load(urllib.request.urlopen(f"{LLAMA}/v1/models", timeout=10))["data"]]
    model = props["model_alias"]
    if not re.match(r"^ornith-1[._-]?5", model, re.I) or model not in models:
        raise SystemExit(f"SUMMARY_MODEL_NOT_APPROVED:{model}")
    rows = psql_json("SELECT json_agg(x) FROM (SELECT c.chunk_id id, c.evidence_revision rev, c.text, c.heading_path head, p.title, p.product, p.product_version ver FROM atlas_external_doc_chunks c JOIN atlas_external_doc_pages p ON p.id = c.page_id ORDER BY c.chunk_id) x")
    by_product: dict[str, list[dict]] = {}
    for r in rows:
        if len(r["text"]) < 2500:
            by_product.setdefault(r["product"], []).append(r)
    picked: list[dict] = []
    for prod, items in sorted(by_product.items()):
        seeded = [r for r in items if any(t in r["text"] for t in MUST_TRY)]
        rest = [r for r in items if r not in seeded]
        take = (seeded + rest[:: max(1, len(rest) // SAMPLE_PER_PRODUCT)])[:SAMPLE_PER_PRODUCT + (1 if seeded else 0)]
        picked.extend(take)
    items = []
    for r in picked:
        text, finish, toks, ms = summarize(r, model)
        a = assess(r["text"], text, r["product"] + " " + r["ver"] + " " + r["title"])
        a["semanticJudge"] = judge("Header (page context, legitimate support): " + r["product"] + " " + r["ver"] + " | " + r["title"] + " | " + (" > ".join(r["head"] or []) or "none") + "\n" + r["text"], text, model)
        items.append({"chunkId": r["id"], "chunkEvidenceRevision": r["rev"], "product": r["product"], "productVersion": r["ver"], "finishReason": finish, "completionTokens": toks, "latencyMs": round(ms),
                      "containsSeedIdentifiers": [t for t in MUST_TRY if t in r["text"]], "summary": text, **a})
    counts = Counter(i["label"] for i in items)
    bad = counts["UNSUPPORTED"] + counts["TECHNICAL_TOKEN_CORRUPTED"]
    jstat = Counter(i["semanticJudge"]["status"] for i in items)
    jclaims = Counter(v for i in items for v, n in i["semanticJudge"].get("counts", {}).items() for _ in range(n))
    judge_unsupported = [i["chunkId"] for i in items if i["semanticJudge"].get("counts", {}).get("UNSUPPORTED")]
    judge_unrun = jstat["JUDGED"] != len(items)
    receipt = {
        "schema": "atlas.external-doc-summary-faithfulness.v1", "generatedAt": datetime.now(timezone.utc).isoformat(), "gate": "EXTERNAL_DOC_SUMMARY_FAITHFULNESS_01",
        "backend": {"kind": "llama-server (NOT Ollama)", "url": LLAMA, "resolvedModelId": model, "listedModels": models}, "method": "deterministic token/number support against the same canonical chunk plus the prompt's own product/version/title metadata; plain hyphenated compounds whose words occur in the chunk are accepted, API-like tokens (dotted/underscored/backticked/numeric) stay strict; NOT a semantic entailment judge", "firstPassNote": "the first pass flagged 4/19 UNSUPPORTED (version 18 from the metadata header, low-selectivity, re-runs); all four were checker limits, so the checker was refined, not the acceptance bar",
        "semanticJudge": {"kind": "LLM self-judge (same Ornith model, temperature 0); a weak second signal, not independent ground truth", "statusCounts": dict(jstat), "claimVerdictCounts": dict(jclaims), "chunksWithUnsupportedClaim": judge_unsupported}, "sample": {"chunks": len(items), "products": sorted(by_product), "perProductTarget": SAMPLE_PER_PRODUCT}, "labelCounts": dict(counts),
        "acceptance": {"rule": "a summary is accepted only if: 0 UNSUPPORTED/TECHNICAL_TOKEN_CORRUPTED under the token gate AND the judge ran and found 0 UNSUPPORTED claims; PARTIALLY_SUPPORTED claims are counted and routed to review, not auto-rejected; a judge failure is null and never counts as a pass; concise omission allowed", "invalid": bad + len(judge_unsupported), "judgeIncomplete": judge_unrun},
        "seedIdentifiersCovered": sorted({t for i in items for t in i["containsSeedIdentifiers"]}), "items": items,
        "invariant": "SUMMARY = context compression / ranking aid; citations and evidence stay on the canonical chunkEvidenceRevision",
        "persistence": "none (analysis table untouched)", "writes": {"postgres": 0, "qdrant": 0, "valkey": 0, "neo4j": 0, "graphify": 0},
        "result": "EXTERNAL_DOC_SUMMARY_FAITHFULNESS_GATE_PASSED" if bad == 0 and not judge_unsupported and not judge_unrun else "EXTERNAL_DOC_SUMMARY_FAITHFULNESS_JUDGE_INCOMPLETE" if bad == 0 and not judge_unsupported else "EXTERNAL_DOC_SUMMARY_FAITHFULNESS_FINDINGS",
    }
    (ROOT / "docs/reports/external-doc-summary-faithfulness-v1.json").write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"result": receipt["result"], "chunks": len(items), "labels": dict(counts), "judgeStatus": dict(jstat), "judgeClaims": dict(jclaims), "judgeUnsupportedChunks": judge_unsupported, "seedsCovered": receipt["seedIdentifiersCovered"]}, indent=1))
    for i in items:
        if i["label"] in ("UNSUPPORTED", "TECHNICAL_TOKEN_CORRUPTED"):
            print(i["chunkId"], i["label"], i["unsupportedTokens"], i["corruptedTokens"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
