#!/usr/bin/env python3
"""
Citation Fidelity Evaluator for Legal AI Platform
Checks whether citations in LLM-generated legal text are traceable to the corpus.

Measures:
  - cite_coverage_rate: % of extracted citations found in corpus
  - cite_hallucination_rate: % of citations NOT found anywhere in corpus
  - statute_validity_rate: % of statutes that parse to a real known code section
  - case_citation_validity: % of case names appearing in court_opinions collection

Usage:
    python scripts/eval/citation_fidelity.py --text "path/to/output.txt"
    python scripts/eval/citation_fidelity.py --text-inline "..."
    python scripts/eval/citation_fidelity.py --sample-from-ollama
"""
import sys, json, re, argparse, time, os, urllib.request
from pathlib import Path

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)
from typing import Optional

SCRIPT_DIR = Path(__file__).parent
REPORTS_DIR = SCRIPT_DIR.parent / "analysis_reports"
REPORTS_DIR.mkdir(exist_ok=True)

QDRANT_URL = os.getenv("QDRANT_URL", "http://127.0.0.1:6333")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
EMBED_MODEL = os.getenv("EMBED_MODEL", "embeddinggemma:latest")
LLM_MODEL = os.getenv("LLM_MODEL", "gemma3-legal:latest")

# ── Citation extraction patterns ──────────────────────────────────────────────
STAT_PATTERNS = [
    # 18 U.S.C. § 1001  /  18 USC 1001  /  18 U.S.C.A. § 1001
    re.compile(r'\b(\d+)\s+U\.?S\.?C\.?A?\.?\s+[§Ss]?\.?\s*(\d+\w*(?:\([a-z0-9]+\))*)', re.I),
    # Fed. R. Crim. P. 12(b)
    re.compile(r'\bFed(?:eral)?\.?\s+R(?:ules?)?\.?\s+(?:Crim|Evid|Civ)\.?(?:\s+P\.?)?\s+(\d+\w*)(?:\([a-z0-9]+\))*', re.I),
    # State codes:  Cal. Penal Code § 187  /  N.Y. Penal Law § 125.27
    re.compile(r'\b(?:Cal\.|California|N\.Y\.|New York|Tex\.|Texas|Fla\.|Florida)\s+\w+\s+(?:Code|Law|Stat)\s+[§Ss]?\s*(\d[\d\.]*)', re.I),
    # §§ with number  (may follow a code reference)
    re.compile(r'[§Ss][§Ss]?\s*(\d[\d\.\-]+)', re.I),
]

CASE_PATTERN = re.compile(
    r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:\s+(?:Inc\.|Corp\.|LLC|Co\.))?)\s+v\.?\s+'
    r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:\s+(?:Inc\.|Corp\.|LLC|Co\.))?)(?:,\s*\d+\s+\w+\.?\s+\d+)?'
)

# Known valid U.S.C. titles (not exhaustive but good coverage)
VALID_USC_TITLES = {
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38,
    39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 54
}

# Well-known sections per title for stronger validity check
COMMON_SECTIONS = {
    18: {1, 2, 3, 4, 111, 113, 115, 371, 372, 641, 666, 1001, 1028, 1030, 1035,
         1038, 1341, 1343, 1344, 1346, 1503, 1505, 1512, 1519, 1621, 1956, 1957,
         1961, 1962, 1963, 2252, 2314, 2315, 2339},
    21: {841, 843, 844, 846, 848, 952, 960, 963},
    26: {7201, 7206, 7212},
    42: {1983, 1985},
    47: {223, 230, 1030},
    49: {46303, 46501},
}


def extract_statute_citations(text: str) -> list[dict]:
    """Extract statute citations and assess basic validity."""
    citations = []
    seen = set()
    for pattern in STAT_PATTERNS:
        for m in pattern.finditer(text):
            raw = m.group(0).strip()
            if raw in seen:
                continue
            seen.add(raw)
            # Try to parse title + section from USC pattern
            usc_m = re.match(r'(\d+)\s+U\.?S\.?C', raw, re.I)
            is_valid_format = usc_m is not None
            is_plausible = False
            if usc_m:
                title = int(usc_m.group(1))
                sec_m = re.search(r'[§Ss]\s*(\d+)', raw, re.I)
                sec = int(sec_m.group(1)) if sec_m else None
                is_plausible = (title in VALID_USC_TITLES and
                                (title not in COMMON_SECTIONS or
                                 not COMMON_SECTIONS[title] or  # no filter for this title
                                 sec in COMMON_SECTIONS.get(title, set())))
            citations.append({
                "raw": raw,
                "type": "statute",
                "valid_format": is_valid_format,
                "plausibly_real": is_plausible,
            })
    return citations


def extract_case_citations(text: str) -> list[dict]:
    """Extract case name citations (Party v. Party)."""
    citations = []
    seen = set()
    for m in CASE_PATTERN.finditer(text):
        raw = m.group(0).strip()
        if raw in seen or len(raw) < 8:
            continue
        seen.add(raw)
        citations.append({
            "raw": raw,
            "type": "case",
            "party1": m.group(1),
            "party2": m.group(2),
            "valid_format": True,
            "plausibly_real": None,  # requires corpus lookup
        })
    return citations


def qdrant_text_search(collection: str, query: str, k: int = 3) -> list[dict]:
    """Embed query and search Qdrant for supporting text."""
    payload = json.dumps({"model": EMBED_MODEL, "prompt": query}).encode()
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/embeddings",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            vec = json.loads(resp.read()).get("embedding")
    except Exception:
        return []

    if not vec:
        return []

    payload2 = json.dumps({"vector": vec, "limit": k, "with_payload": True}).encode()
    req2 = urllib.request.Request(
        f"{QDRANT_URL}/collections/{collection}/points/search",
        data=payload2,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req2, timeout=15) as resp:
            return json.loads(resp.read()).get("result", [])
    except Exception:
        return []


def check_case_in_corpus(case_cite: dict, collections: list[str]) -> bool:
    """Check if a case name appears in corpus via semantic search."""
    party1 = case_cite.get("party1", "")
    party2 = case_cite.get("party2", "")
    query = f"{party1} v. {party2} court opinion"
    for coll in collections:
        hits = qdrant_text_search(coll, query, k=3)
        for h in hits:
            payload = h.get("payload", {})
            text = " ".join([
                str(payload.get("citation", "")),
                str(payload.get("title", "")),
                str(payload.get("opinion_text", ""))[:500],
            ]).lower()
            if party1.lower() in text or party2.lower() in text:
                return True
    return False


def sample_from_ollama(prompt_template: str) -> str:
    """Generate a sample legal text from the LLM for fidelity testing."""
    prompt = prompt_template or (
        "Write a two-paragraph legal analysis of wire fraud under 18 U.S.C. § 1343, "
        "citing at least two relevant federal cases and the applicable sentencing guidelines. "
        "Include specific section numbers and case citations."
    )
    payload = json.dumps({
        "model": LLM_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {"temperature": 0.3, "num_predict": 300},
    }).encode()
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=240) as resp:
                data = json.loads(resp.read())
                return data.get("message", {}).get("content", "")
        except Exception as e:
            if attempt == 0:
                print(f"  [retry] LLM timeout on attempt 1, retrying...", flush=True)
                continue
            return f"[ollama error: {e}]"
    return "[ollama error: exhausted retries]"


def evaluate_text(text: str, check_corpus: bool = True) -> dict:
    """Full citation fidelity evaluation of a legal text."""
    stat_cites = extract_statute_citations(text)
    case_cites = extract_case_citations(text)
    all_cites = stat_cites + case_cites

    total = len(all_cites)
    valid_format = sum(1 for c in all_cites if c.get("valid_format"))
    plausibly_real = sum(1 for c in stat_cites if c.get("plausibly_real"))

    # Corpus cross-check for case citations
    corpus_verified = 0
    if check_corpus and case_cites:
        collections = ["court_opinions", "legal_documents"]
        for c in case_cites:
            found = check_case_in_corpus(c, collections)
            c["corpus_verified"] = found
            if found:
                corpus_verified += 1
            time.sleep(0.2)

    # Compute rates
    cite_format_rate = valid_format / total if total else 0.0
    statute_plausibility = plausibly_real / len(stat_cites) if stat_cites else 0.0
    case_corpus_rate = corpus_verified / len(case_cites) if case_cites else 0.0
    # Overall fidelity score (weighted)
    fidelity_score = 0.0
    if total > 0:
        fidelity_score = (
            0.4 * cite_format_rate +
            0.3 * statute_plausibility +
            0.3 * case_corpus_rate
        )

    hallucination_flags = [
        c for c in stat_cites if c.get("valid_format") and not c.get("plausibly_real")
    ]
    hallucination_flags += [
        c for c in case_cites if c.get("corpus_verified") is False
    ]

    return {
        "total_citations": total,
        "statute_citations": len(stat_cites),
        "case_citations": len(case_cites),
        "valid_format_count": valid_format,
        "plausibly_real_statutes": plausibly_real,
        "corpus_verified_cases": corpus_verified,
        "cite_format_rate": round(cite_format_rate, 4),
        "statute_plausibility_rate": round(statute_plausibility, 4),
        "case_corpus_verification_rate": round(case_corpus_rate, 4),
        "overall_fidelity_score": round(fidelity_score, 4),
        "hallucination_flags": hallucination_flags,
        "statute_citations_detail": stat_cites,
        "case_citations_detail": case_cites,
        "text_length": len(text),
    }


def main():
    parser = argparse.ArgumentParser(description="Citation fidelity evaluator")
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument("--text", type=str, help="Path to a .txt file with LLM legal output")
    g.add_argument("--text-inline", type=str, dest="text_inline", help="Inline legal text string")
    g.add_argument("--sample-from-ollama", action="store_true", dest="sample_ollama",
                   help="Generate a sample from Ollama LLM and evaluate it")
    parser.add_argument("--no-corpus", action="store_true", help="Skip Qdrant corpus lookup")
    parser.add_argument("--output", type=str, default="")
    args = parser.parse_args()

    if args.sample_ollama:
        print(f"Generating sample from {LLM_MODEL}...")
        text = sample_from_ollama("")
        print(f"--- Generated text ({len(text)} chars) ---\n{text[:500]}...\n")
    elif args.text:
        text = Path(args.text).read_text(encoding="utf-8")
    else:
        text = args.text_inline

    print("Evaluating citation fidelity...")
    result = evaluate_text(text, check_corpus=not args.no_corpus)
    result["source"] = "ollama_sample" if args.sample_ollama else (args.text or "inline")
    result["generated_text"] = text[:1000] + "..." if len(text) > 1000 else text

    print(f"\n=== CITATION FIDELITY REPORT ===")
    print(f"  Total citations found:      {result['total_citations']}")
    print(f"  Statute citations:          {result['statute_citations']}")
    print(f"  Case name citations:        {result['case_citations']}")
    print(f"  Valid format rate:          {result['cite_format_rate']:.1%}")
    print(f"  Statute plausibility rate:  {result['statute_plausibility_rate']:.1%}")
    print(f"  Case corpus verify rate:    {result['case_corpus_verification_rate']:.1%}")
    print(f"  OVERALL FIDELITY SCORE:     {result['overall_fidelity_score']:.1%}")
    if result["hallucination_flags"]:
        print(f"\n  ⚠ Potential hallucinations ({len(result['hallucination_flags'])}):")
        for h in result["hallucination_flags"]:
            print(f"    - {h['raw']}")

    out_path = args.output or str(REPORTS_DIR / f"citation_fidelity_{int(time.time())}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"\nSaved: {out_path}")


if __name__ == "__main__":
    main()
