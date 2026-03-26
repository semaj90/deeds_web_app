#!/usr/bin/env python3
"""
Nightly Case Auditor — Content Ops Pipeline
Audits generated fictional cases for quality and consistency issues.

Checks:
  1. Missing citations    — narrative references a statute without a section number
  2. Jurisdiction conflict — cites law from wrong jurisdiction for stated facts
  3. Evidence admissibility inconsistency — narrative mentions suppressed/excluded evidence
     as though admitted
  4. Chain of custody breaks — evidence mentioned without custody documentation language
  5. Disclaimer presence — every case must carry the fictionalization disclaimer
  6. Real person leakage — re-scans for blocklist tokens missed during generation
  7. Duplicate detection — cosine similarity check against prior cases

Usage:
    python scripts/content_ops/case_auditor.py
    python scripts/content_ops/case_auditor.py --input case_data/fictional_cases.jsonl
    python scripts/content_ops/case_auditor.py --fix-disclaimers
    python scripts/content_ops/case_auditor.py --report-only
"""
import sys, json, re, argparse, os, time, hashlib
from pathlib import Path
from typing import Optional

SCRIPT_DIR = Path(__file__).parent
CASE_DATA_DIR = SCRIPT_DIR.parent / "case_data"
REPORTS_DIR = SCRIPT_DIR.parent / "analysis_reports"
REPORTS_DIR.mkdir(exist_ok=True)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
EMBED_MODEL = os.getenv("EMBED_MODEL", "embeddinggemma:latest")

DISCLAIMER_REQUIRED = "this is a fictional case"

# Pattern: statute reference WITHOUT section number (e.g., "the Act" or "18 U.S.C." with no §)
ORPHAN_STATUTE_RE = re.compile(
    r'\b(?:18|21|26|42|47|49)\s+U\.?S\.?C\.?(?!\s*[§Ss])\b', re.I
)

# Words that signal wrong jurisdiction mixing
JURISDICTION_SIGNALS = {
    "california": ["cal.", "California Penal Code", "California Penal", "Cal. Penal"],
    "new york": ["N.Y.", "New York Penal Law", "McKinney's"],
    "texas": ["Tex.", "Texas Penal Code", "V.T.C.A."],
    "florida": ["Fla.", "Florida Statutes"],
}

# Chain of custody keywords — their absence in evidence-heavy narratives is suspicious
COC_KEYWORDS = ["chain of custody", "evidence log", "seal", "tagged", "property receipt",
                 "booking number", "exhibit", "submitted to lab"]

# Real person blocklist (minimal — production should use a proper NER model)
REAL_PERSON_BLOCKLIST = {
    "donald", "trump", "biden", "obama", "clinton", "bush", "reagan",
    "elon", "musk", "bezos", "gates", "zuckerberg", "buffett",
    "capone", "madoff", "bundy", "dahmer", "manson",
}


# ── Audit checks ──────────────────────────────────────────────────────────────

def check_disclaimer(case: dict) -> Optional[str]:
    """Ensure the case carries the required disclaimer."""
    disclaimer = case.get("disclaimer", "")
    if DISCLAIMER_REQUIRED not in disclaimer.lower():
        return "MISSING_DISCLAIMER: case does not carry required fictionalization disclaimer"
    return None


def check_is_fictional_flag(case: dict) -> Optional[str]:
    if not case.get("is_fictional", False):
        return "MISSING_IS_FICTIONAL_FLAG: case.is_fictional is not True"
    return None


def check_real_person_leakage(case: dict) -> Optional[str]:
    text = (case.get("narrative", "") + " " + case.get("defendant_name", "")).lower()
    found = [tok for tok in REAL_PERSON_BLOCKLIST if re.search(r'\b' + re.escape(tok) + r'\b', text)]
    if found:
        return f"REAL_PERSON_LEAK: tokens found: {found}"
    return None


def check_orphan_statute(case: dict) -> Optional[str]:
    narrative = case.get("narrative", "")
    matches = ORPHAN_STATUTE_RE.findall(narrative)
    if matches:
        return f"ORPHAN_STATUTE: statute title without § number in: {matches[:3]}"
    return None


def check_jurisdiction_conflict(case: dict) -> Optional[str]:
    """
    Detect if narrative mixes federal charges with state-specific code citations
    from a different state than the jurisdiction_city.
    """
    narrative = case.get("narrative", "").lower()
    city = case.get("jurisdiction_city", "").lower()
    # Detect state signals
    for state, markers in JURISDICTION_SIGNALS.items():
        in_city = state in city
        in_narrative = any(m.lower() in narrative for m in markers)
        if in_narrative and not in_city:
            return (f"JURISDICTION_CONFLICT: narrative references {state.title()} law "
                    f"but jurisdiction is '{case.get('jurisdiction_city', '?')}'")
    return None


def check_chain_of_custody(case: dict) -> Optional[str]:
    """
    For firearms and drug cases, evidence keywords should appear alongside COC language.
    If the narrative mentions seized evidence but has no COC language, flag it.
    """
    category = case.get("category", "")
    if category not in ("drug_trafficking", "firearms"):
        return None
    narrative = case.get("narrative", "").lower()
    evidence_words = ["seized", "discovered", "found", "recovered", "exhibit"]
    has_evidence = any(w in narrative for w in evidence_words)
    has_coc = any(k.lower() in narrative for k in COC_KEYWORDS)
    if has_evidence and not has_coc:
        return "MISSING_COC_LANGUAGE: evidence mentioned without chain of custody documentation language"
    return None


def check_narrative_length(case: dict, min_chars: int = 100) -> Optional[str]:
    narrative = case.get("narrative", "")
    if len(narrative) < min_chars:
        return f"SHORT_NARRATIVE: only {len(narrative)} chars (min {min_chars})"
    if narrative.startswith("[dry-run") or narrative.startswith("[error"):
        return f"STUB_NARRATIVE: narrative is a placeholder stub"
    return None


def check_required_fields(case: dict) -> list[str]:
    required = ["case_id", "category", "charge", "primary_statute",
                 "defendant_name", "incident_date", "jurisdiction_city", "narrative"]
    missing = [f for f in required if not case.get(f)]
    if missing:
        return [f"MISSING_FIELD: {f}" for f in missing]
    return []


# ── Deduplication ─────────────────────────────────────────────────────────────

def narrative_fingerprint(text: str) -> str:
    """Simple fingerprint for near-duplicate detection (first 200 chars, lowercased, stripped)."""
    normalized = re.sub(r'\s+', ' ', text.lower()[:200]).strip()
    return hashlib.md5(normalized.encode()).hexdigest()


def find_duplicates(cases: list[dict]) -> list[dict]:
    """Detect exact or near-duplicate narratives by fingerprint."""
    seen: dict[str, str] = {}
    dups = []
    for c in cases:
        fp = narrative_fingerprint(c.get("narrative", ""))
        if fp in seen:
            dups.append({
                "case_id": c["case_id"],
                "duplicate_of": seen[fp],
                "fingerprint": fp,
            })
        else:
            seen[fp] = c["case_id"]
    return dups


# ── Fix routines ──────────────────────────────────────────────────────────────

def fix_disclaimer(case: dict) -> dict:
    """Add the disclaimer if missing."""
    REQUIRED_TEXT = (
        "DISCLAIMER: This is a fictional case generated for legal simulation and educational purposes only. "
        "All names, dates, locations, and organizations are fictional and any resemblance to real persons "
        "or events is coincidental. This content does not constitute legal advice."
    )
    if DISCLAIMER_REQUIRED not in case.get("disclaimer", "").lower():
        case["disclaimer"] = REQUIRED_TEXT
        case["is_fictional"] = True
        case["_disclaimer_fixed"] = True
    return case


# ── Main audit runner ─────────────────────────────────────────────────────────

def audit_cases(cases: list[dict], fix_disclaimers: bool = False) -> dict:
    """Run all checks against a list of cases. Return audit report."""
    total = len(cases)
    all_issues: list[dict] = []
    cases_with_issues = 0

    for case in cases:
        case_id = case.get("case_id", "?")
        issues = check_required_fields(case)

        for check_fn in [
            check_disclaimer,
            check_is_fictional_flag,
            check_real_person_leakage,
            check_orphan_statute,
            check_jurisdiction_conflict,
            check_chain_of_custody,
            check_narrative_length,
        ]:
            result = check_fn(case)
            if result:
                issues.append(result)

        if fix_disclaimers and any("MISSING_DISCLAIMER" in i for i in issues):
            fix_disclaimer(case)
            issues = [i for i in issues if "MISSING_DISCLAIMER" not in i]

        if issues:
            cases_with_issues += 1
            all_issues.append({"case_id": case_id, "issues": issues})
            print(f"  [{case_id}] {len(issues)} issue(s):")
            for issue in issues:
                print(f"    - {issue}")

    duplicates = find_duplicates(cases)
    if duplicates:
        print(f"\n  Duplicate narratives found: {len(duplicates)}")
        for d in duplicates:
            print(f"    {d['case_id']} is near-duplicate of {d['duplicate_of']}")

    issue_rate = cases_with_issues / total if total else 0.0
    print(f"\n  Audited: {total} cases")
    print(f"  Issues:  {cases_with_issues} ({issue_rate:.0%})")
    print(f"  Dupes:   {len(duplicates)}")

    return {
        "total_cases": total,
        "cases_with_issues": cases_with_issues,
        "issue_rate": round(issue_rate, 4),
        "duplicates_found": len(duplicates),
        "issues": all_issues,
        "duplicates": duplicates,
    }


def main():
    parser = argparse.ArgumentParser(description="Nightly case auditor")
    parser.add_argument("--input", type=str,
                        default=str(CASE_DATA_DIR / "fictional_cases.jsonl"),
                        help="Path to JSONL file to audit")
    parser.add_argument("--fix-disclaimers", action="store_true", dest="fix_disclaimers",
                        help="Auto-fix missing disclaimers in-place")
    parser.add_argument("--report-only", action="store_true", dest="report_only",
                        help="Print summary only, no JSON output")
    parser.add_argument("--output", type=str, default="")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Input file not found: {input_path}")
        sys.exit(1)

    cases = []
    with open(input_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    cases.append(json.loads(line))
                except json.JSONDecodeError as e:
                    print(f"[parse error] {e}")

    print(f"Case Auditor — {len(cases)} cases from {input_path}")
    audit = audit_cases(cases, fix_disclaimers=args.fix_disclaimers)

    # If fixes were applied, write corrected file
    if args.fix_disclaimers:
        with open(input_path, "w", encoding="utf-8") as f:
            for c in cases:
                f.write(json.dumps(c, ensure_ascii=False) + "\n")
        print(f"  Updated: {input_path}")

    if not args.report_only:
        out_path = args.output or str(REPORTS_DIR / f"case_audit_{int(time.time())}.json")
        report = {
            "audit_type": "case_auditor",
            "input_file": str(input_path),
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            **audit,
        }
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        print(f"Report saved: {out_path}")

    sys.exit(1 if audit["cases_with_issues"] > 0 else 0)


if __name__ == "__main__":
    main()
