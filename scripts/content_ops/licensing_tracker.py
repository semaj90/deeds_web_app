#!/usr/bin/env python3
"""
Licensing & Provenance Tracker
Tracks copyright status of all legal corpus documents.

License codes used throughout the system:
  cc0              — Creative Commons Zero (free for any use, no attribution required)
  free_of_restriction — CourtListener bulk data: "free of known copyright restrictions"
  public_domain    — Government works / pre-1928 materials
  fair_use_pointer — Source pointer only; no bulk copy; see Cornell LII policy
  subscription_only — Westlaw/Lexis editorial content; BLOCK from ingestion
  state_official   — Directly from official state government website (.gov)
  unknown          — License not yet verified

Policy enforcement:
  - BLOCK ingestion if license in BLOCKED_LICENSES
  - WARN if license == 'unknown' and source not in TRUSTED_GOV_DOMAINS
  - Constitutions from .gov domains → state_official
  - CourtListener bulk → free_of_restriction
  - CAP → cc0
  - Cornell LII → fair_use_pointer (do not copy full text, only cite URL)
  - Westlaw, Lexis, Bloomberg → subscription_only (BLOCKED)

Usage:
    python scripts/content_ops/licensing_tracker.py --check scripts/court_data/
    python scripts/content_ops/licensing_tracker.py --report
    python scripts/content_ops/licensing_tracker.py --check-file path/to/doc.jsonl
"""
import sys, json, re, argparse, os, time
from pathlib import Path
from urllib.parse import urlparse

SCRIPT_DIR = Path(__file__).parent
REPORTS_DIR = SCRIPT_DIR.parent / "analysis_reports"
REPORTS_DIR.mkdir(exist_ok=True)

# ── License policy tables ─────────────────────────────────────────────────────

BLOCKED_LICENSES = {"subscription_only"}
WARN_LICENSES = {"unknown", "fair_use_pointer"}
FREE_LICENSES = {"cc0", "free_of_restriction", "public_domain", "state_official"}

# Known source → license mapping
SOURCE_LICENSE_MAP = {
    # Data sources
    "courtlistener": "free_of_restriction",
    "court_listener": "free_of_restriction",
    "cap": "cc0",                           # Harvard Caselaw Access Project
    "caselaw_access_project": "cc0",
    "federal_register": "public_domain",
    "congress.gov": "public_domain",
    "law.cornell.edu": "fair_use_pointer",  # Cornell LII — pointer only
    "cornell_lii": "fair_use_pointer",
    "constitution": "state_official",       # All constitution fetches from .gov
    "fictionalcase": "public_domain",       # Generated fictional content
    "fictional": "public_domain",
    # Blocked sources
    "westlaw": "subscription_only",
    "lexisnexis": "subscription_only",
    "lexis": "subscription_only",
    "bloomberg_law": "subscription_only",
    "fastcase": "subscription_only",
}

# Trusted government domains → state_official
TRUSTED_GOV_DOMAINS = {
    ".gov", ".us", "legis.", "legislature.", "sos.", "courts.", "judiciary."
}

# Known free sources by URL pattern
URL_LICENSE_PATTERNS = [
    (re.compile(r'courtlistener\.com', re.I), "free_of_restriction"),
    (re.compile(r'case\.law', re.I), "cc0"),
    (re.compile(r'law\.cornell\.edu', re.I), "fair_use_pointer"),
    (re.compile(r'congress\.gov', re.I), "public_domain"),
    (re.compile(r'federalregister\.gov', re.I), "public_domain"),
    (re.compile(r'supremecourt\.gov', re.I), "public_domain"),
    (re.compile(r'pacer\.', re.I), "public_domain"),
    (re.compile(r'westlaw\.com|westlawnext\.com', re.I), "subscription_only"),
    (re.compile(r'lexisnexis\.com|lexis\.com', re.I), "subscription_only"),
    (re.compile(r'bloomberg\.law|bloomberglaw\.com', re.I), "subscription_only"),
]

IN_PRODUCT_DISCLAIMERS = {
    "simulation": (
        "This is a fictional simulation for educational and training purposes only. "
        "It does not constitute legal advice."
    ),
    "generated_content": (
        "Generated content may be inaccurate or incomplete. "
        "Consult qualified legal counsel for any real matter."
    ),
    "fictional_case": (
        "All cases are fictional. Any resemblance to real persons, events, or entities is coincidental."
    ),
    "no_pii": (
        "Do not input private, confidential, or identifying information into this system."
    ),
    "ai_limitations": (
        "AI-generated legal analysis may contain errors. Do not rely on this output without "
        "independent verification by a licensed attorney."
    ),
}


def infer_license(doc: dict, source_filename: str = "") -> str:
    """Infer license from document metadata and/or filename."""
    # Explicit license field
    if "license" in doc:
        return doc["license"]

    # Source field lookup
    source = doc.get("source", "").lower().replace("-", "_").replace(" ", "_")
    if source in SOURCE_LICENSE_MAP:
        return SOURCE_LICENSE_MAP[source]

    # URL-based detection
    url = doc.get("source_url", "") or doc.get("url", "")
    if url:
        for pattern, lic in URL_LICENSE_PATTERNS:
            if pattern.search(url):
                return lic
        # Check if it's a .gov URL
        parsed = urlparse(url)
        hostname = parsed.hostname or ""
        if hostname.endswith(".gov") or hostname.endswith(".us"):
            return "state_official"
        if any(term in hostname for term in ["legis.", "legislature.", "sos.", "courts."]):
            return "state_official"

    # Document type
    doc_type = doc.get("document_type", "").lower()
    if doc_type == "constitution":
        return "state_official"
    if doc_type in ("fictional_case", "fictional"):
        return "public_domain"

    # is_official flag
    if doc.get("is_official"):
        return "state_official"

    # Filename-based heuristics (for datasets without source metadata)
    fname = source_filename.lower()
    if "lex_glue" in fname or "lexglue" in fname or "courtlistener" in fname:
        return "free_of_restriction"  # LexGLUE is CourtListener-derived (CC0 / free of restriction)
    if "cap_" in fname or "caselaw_access" in fname:
        return "cc0"
    if "doj_" in fname or "scotus_" in fname or "federal_register" in fname:
        return "public_domain"
    if "fictionalcase" in fname or "fictional_case" in fname:
        return "public_domain"

    # LexGLUE format detection: docs with only {text, label} are from HF/CourtListener
    doc_keys = set(doc.keys())
    if doc_keys <= {"text", "label"} or doc_keys == {"text", "label", "id"}:
        return "free_of_restriction"

    return "unknown"


def check_document(doc: dict, source_filename: str = "") -> dict:
    """Check a single document's license and return a compliance record."""
    license_code = infer_license(doc, source_filename)
    is_blocked = license_code in BLOCKED_LICENSES
    is_warning = license_code in WARN_LICENSES and not is_blocked
    is_free = license_code in FREE_LICENSES

    return {
        "doc_id": doc.get("source_id") or doc.get("id") or doc.get("case_id", "?"),
        "title": doc.get("title", "?")[:80],
        "source": doc.get("source", ""),
        "source_url": (doc.get("source_url") or "")[:100],
        "license_inferred": license_code,
        "is_blocked": is_blocked,
        "is_warning": is_warning,
        "is_free": is_free,
        "status": "BLOCKED" if is_blocked else ("WARN" if is_warning else "OK"),
    }


def check_directory(data_dir: Path) -> dict:
    """Scan all JSONL files in a directory for licensing compliance."""
    records = []
    for jsonl_path in sorted(data_dir.rglob("*.jsonl")):
        with open(jsonl_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    doc = json.loads(line)
                    rec = check_document(doc, source_filename=jsonl_path.name)
                    rec["source_file"] = str(jsonl_path.relative_to(data_dir.parent))
                    records.append(rec)
                except json.JSONDecodeError:
                    pass
    return summarize_records(records)


def summarize_records(records: list[dict]) -> dict:
    total = len(records)
    blocked = [r for r in records if r["is_blocked"]]
    warnings = [r for r in records if r["is_warning"]]
    free = [r for r in records if r["is_free"]]
    unknown = [r for r in records if r["license_inferred"] == "unknown"]

    # License distribution
    dist: dict[str, int] = {}
    for r in records:
        lic = r["license_inferred"]
        dist[lic] = dist.get(lic, 0) + 1

    return {
        "total_documents": total,
        "license_distribution": dist,
        "free_count": len(free),
        "blocked_count": len(blocked),
        "warning_count": len(warnings),
        "unknown_count": len(unknown),
        "compliance_rate": round(len(free) / total, 4) if total else 0.0,
        "blocked_documents": blocked,
        "warning_documents": warnings[:20],  # cap for report size
        "unknown_documents": unknown[:20],
    }


def main():
    parser = argparse.ArgumentParser(description="Licensing and provenance tracker")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", type=str, metavar="DIR",
                       help="Scan all JSONL files in directory")
    group.add_argument("--check-file", type=str, metavar="FILE",
                       help="Check a single JSONL file")
    group.add_argument("--report", action="store_true",
                       help="Generate licensing report for all known data directories")
    group.add_argument("--list-disclaimers", action="store_true", dest="list_disclaimers",
                       help="Print all in-product disclaimer texts")
    parser.add_argument("--output", type=str, default="")
    args = parser.parse_args()

    result = {}

    if args.list_disclaimers:
        print("=== IN-PRODUCT DISCLAIMER TEXTS ===\n")
        for key, text in IN_PRODUCT_DISCLAIMERS.items():
            print(f"[{key}]")
            print(f"  {text}\n")
        return

    if args.check:
        data_dir = Path(args.check)
        print(f"Scanning: {data_dir}")
        result = check_directory(data_dir)

    elif args.check_file:
        path = Path(args.check_file)
        records = []
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        doc = json.loads(line)
                        rec = check_document(doc)
                        rec["source_file"] = str(path)
                        records.append(rec)
                    except json.JSONDecodeError:
                        pass
        result = summarize_records(records)

    elif args.report:
        # Scan all known data directories
        base = SCRIPT_DIR.parent
        dirs_to_scan = [
            base / "court_data",
            base / "case_data",
            base / "data",
        ]
        all_records = []
        for d in dirs_to_scan:
            if d.exists():
                print(f"Scanning {d}...")
                for jsonl_path in d.rglob("*.jsonl"):
                    with open(jsonl_path, encoding="utf-8") as f:
                        for line in f:
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                doc = json.loads(line)
                                rec = check_document(doc)
                                rec["source_file"] = str(jsonl_path.relative_to(base))
                                all_records.append(rec)
                            except json.JSONDecodeError:
                                pass
        result = summarize_records(all_records)

    # Print summary
    print(f"\n=== LICENSING COMPLIANCE REPORT ===")
    print(f"  Total documents:   {result.get('total_documents', 0)}")
    print(f"  Free/permitted:    {result.get('free_count', 0)} ({result.get('compliance_rate', 0):.0%})")
    print(f"  BLOCKED:           {result.get('blocked_count', 0)}")
    print(f"  Warnings (unknown): {result.get('warning_count', 0) + result.get('unknown_count', 0)}")
    print(f"\n  License distribution:")
    for lic, count in sorted(result.get("license_distribution", {}).items(), key=lambda x: -x[1]):
        icon = "✓" if lic in FREE_LICENSES else ("✗" if lic in BLOCKED_LICENSES else "?")
        print(f"    {icon} {lic}: {count}")

    if result.get("blocked_documents"):
        print(f"\n  ⛔ BLOCKED DOCUMENTS:")
        for d in result["blocked_documents"][:10]:
            print(f"    [{d['doc_id']}] {d['title']} — {d['license_inferred']}")

    if result.get("warning_documents"):
        print(f"\n  ⚠ WARNING DOCUMENTS:")
        for d in result["warning_documents"][:10]:
            print(f"    [{d['doc_id']}] {d['title']} — {d['license_inferred']}")

    if not args.output and result.get("blocked_count", 0) == 0 and result.get("total_documents", 0) == 0:
        return  # Nothing to save

    out_path = args.output or str(REPORTS_DIR / f"licensing_report_{int(time.time())}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "report_type": "licensing",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "in_product_disclaimers": IN_PRODUCT_DISCLAIMERS,
            **result,
        }, f, indent=2, ensure_ascii=False)
    print(f"\nSaved: {out_path}")

    # Exit with error code if blocked documents found
    sys.exit(1 if result.get("blocked_count", 0) > 0 else 0)


if __name__ == "__main__":
    main()
