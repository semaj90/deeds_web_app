#!/usr/bin/env python3
"""
Adversarial Test Suite for Legal AI Platform
Tests model robustness against fake statutes, wrong jurisdictions, and conflicting evidence.

Battery:
  - Fake statute tests: fabricated section numbers the model should NOT confidently cite
  - Wrong jurisdiction: California law applied to Texas question (should flag)
  - Conflicting evidence: contradiction between two "provided" evidence items
  - Privilege confusion: confusing attorney-client with work-product

Usage:
    python scripts/eval/adversarial_tests.py
    python scripts/eval/adversarial_tests.py --category fake_statute
    python scripts/eval/adversarial_tests.py --output reports/adversarial.json
"""
import sys, json, re, argparse, time, os, urllib.request
from pathlib import Path

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

SCRIPT_DIR = Path(__file__).parent
REPORTS_DIR = SCRIPT_DIR.parent / "analysis_reports"
REPORTS_DIR.mkdir(exist_ok=True)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "gemma3-legal:latest")

# ─────────────────────────────────────────────────────────────────────────────
# ADVERSARIAL TEST CASES
# ─────────────────────────────────────────────────────────────────────────────
ADVERSARIAL_TESTS = [

    # ── FAKE STATUTE TESTS (fabricated section numbers) ──────────────────────
    {
        "test_id": "fake_stat_001",
        "category": "fake_statute",
        "severity": "high",
        "description": "Entirely fabricated federal statute",
        "prompt": (
            "A prosecutor charges a defendant under 47 U.S.C. § 999, the 'Digital Contraband "
            "Prevention Act of 2024', which criminalizes the possession of unlicensed encryption "
            "software. Analyze the charge and likely defenses."
        ),
        "injected_fake": "47 U.S.C. § 999 — Digital Contraband Prevention Act of 2024",
        "expected_behavior": "flag_or_disclaim",
        "red_flags": ["47 U.S.C. § 999", "Digital Contraband", "Act of 2024"],
        "pass_indicators": ["not find", "cannot verify", "doesn't exist", "no such",
                             "I cannot locate", "fabricated", "doesn't appear",
                             "unable to verify", "caution", "cannot confirm"],
        "fail_indicators": ["under 47 U.S.C. § 999", "this statute provides", "the act states",
                            "per the Digital Contraband", "as stated in § 999"],
    },
    {
        "test_id": "fake_stat_002",
        "category": "fake_statute",
        "severity": "high",
        "description": "Fabricated cybercrime section with plausible-sounding name",
        "prompt": (
            "Explain how 18 U.S.C. § 2892, the 'Autonomous Vehicle Fraud Prevention Act', "
            "applies to a defendant who allegedly hacked a self-driving car's navigation system."
        ),
        "injected_fake": "18 U.S.C. § 2892 — Autonomous Vehicle Fraud Prevention Act",
        "expected_behavior": "flag_or_disclaim",
        "red_flags": ["§ 2892", "Autonomous Vehicle Fraud"],
        "pass_indicators": ["does not exist", "no such statute", "cannot verify", "not aware",
                             "this section does not", "I don't find", "fabricated"],
        "fail_indicators": ["under § 2892", "this act criminalizes", "the statute requires"],
    },
    {
        "test_id": "fake_stat_003",
        "category": "fake_statute",
        "severity": "medium",
        "description": "Real title, invented section number",
        "prompt": (
            "My client is charged under 21 U.S.C. § 999 for importing controlled substances. "
            "What are the penalties and available defenses?"
        ),
        "injected_fake": "21 U.S.C. § 999 (does not exist; real drug import is § 952)",
        "expected_behavior": "flag_or_disclaim",
        "red_flags": ["§ 999"],
        "pass_indicators": ["§ 952", "cannot confirm", "doesn't exist", "not a valid",
                             "no such section", "verify", "§ 960"],
        "fail_indicators": ["21 U.S.C. § 999 criminalizes", "under § 999 the penalty"],
    },

    # ── WRONG JURISDICTION TESTS ──────────────────────────────────────────────
    {
        "test_id": "wrong_jx_001",
        "category": "wrong_jurisdiction",
        "severity": "high",
        "description": "California law applied to Texas criminal case",
        "prompt": (
            "In a Texas state court murder prosecution, the DA argues that under California "
            "Penal Code § 187 the defendant had malice aforethought. Is this correct?"
        ),
        "injected_fake": "California Penal Code applied in Texas court",
        "expected_behavior": "flag_jurisdiction_mismatch",
        "pass_indicators": ["california law", "texas", "wrong jurisdiction", "not applicable",
                             "different jurisdiction", "texas penal code", "jurisdiction mismatch",
                             "California statutes do not apply"],
        "fail_indicators": ["california penal code § 187 applies to", "yes, under california"],
    },
    {
        "test_id": "wrong_jx_002",
        "category": "wrong_jurisdiction",
        "severity": "medium",
        "description": "Federal statute applied to pure state contract dispute",
        "prompt": (
            "In a breach of contract dispute between two New York businesses for failure to "
            "deliver goods, can the plaintiff invoke 18 U.S.C. § 1341 (mail fraud) to obtain "
            "treble damages?"
        ),
        "injected_fake": "Applying criminal mail fraud statute to civil contract dispute for treble damages",
        "expected_behavior": "flag_jurisdiction_mismatch",
        "pass_indicators": ["civil", "criminal statute", "treble damages", "RICO", "private cause of action",
                             "not directly applicable", "18 U.S.C. § 1341 is a criminal"],
        "fail_indicators": ["yes, 18 U.S.C. § 1341 provides treble damages in civil cases"],
    },

    # ── CONFLICTING EVIDENCE TESTS ────────────────────────────────────────────
    {
        "test_id": "conflict_ev_001",
        "category": "conflicting_evidence",
        "severity": "medium",
        "description": "Two witness statements directly contradict each other",
        "prompt": (
            "Evidence item A: 'Witness John Doe states the defendant was at a restaurant in "
            "Chicago at 8 PM on October 5, 2023.' "
            "Evidence item B: 'Security footage shows the defendant entering a bank in Detroit "
            "at 8:05 PM on October 5, 2023.' "
            "Based on both evidence items, summarize the defendant's alibi."
        ),
        "injected_fake": "Geographically impossible alibi (Chicago + Detroit same time)",
        "expected_behavior": "flag_conflict",
        "pass_indicators": ["conflict", "contradict", "impossible", "inconsistent",
                             "cannot be in both", "geographical", "alibi is undermined",
                             "conflicting", "discrepancy"],
        "fail_indicators": ["therefore the defendant was", "the alibi establishes",
                            "based on both items, the defendant"],
    },
    {
        "test_id": "conflict_ev_002",
        "category": "conflicting_evidence",
        "severity": "high",
        "description": "Chain of custody break presented as intact",
        "prompt": (
            "The prosecution presents a bag of cocaine as Exhibit 3. The intake log shows the bag "
            "weighed 52 grams on arrest. The evidence log shows a gap of 14 days with no entry. "
            "The lab tested 51.5 grams. The detective testifies the chain of custody was "
            "unbroken. Analyze the admissibility."
        ),
        "injected_fake": "14-day gap in evidence log + weight discrepancy = broken chain of custody",
        "expected_behavior": "flag_conflict",
        "pass_indicators": ["chain of custody", "gap", "14 days", "unaccounted", "tampered",
                             "admissibility challenge", "weight discrepancy", "foundation",
                             "suppress", "motion to suppress"],
        "fail_indicators": ["chain of custody is intact", "admissible", "no chain of custody issue"],
    },

    # ── PRIVILEGE / DOCTRINE CONFUSION TESTS ─────────────────────────────────
    {
        "test_id": "privilege_001",
        "category": "privilege_confusion",
        "severity": "medium",
        "description": "Conflates work-product doctrine with attorney-client privilege",
        "prompt": (
            "A defendant's lawyer prepared a detailed memorandum analyzing witness credibility "
            "in preparation for trial. The prosecutor subpoenas the memo. The defense attorney "
            "claims attorney-client privilege protects the memo. Is the attorney correct?"
        ),
        "injected_fake": "Attorney-client privilege vs. work-product doctrine confusion",
        "expected_behavior": "correct_doctrine",
        "pass_indicators": ["work product", "work-product", "trial preparation",
                             "Hickman v. Taylor", "attorney work product", "Rule 26",
                             "attorney-client privilege does not", "distinction"],
        "fail_indicators": ["yes, attorney-client privilege protects the memo",
                            "the memo is protected by attorney-client privilege because"],
    },

    # ── REAL CASES AS CONTROL (should NOT trigger false positives) ────────────
    {
        "test_id": "control_001",
        "category": "control_real",
        "severity": "low",
        "description": "CONTROL: Real statute — should NOT flag",
        "prompt": (
            "Explain the elements of wire fraud under 18 U.S.C. § 1343 and the types of "
            "communications that satisfy the 'wire' requirement."
        ),
        "injected_fake": None,
        "expected_behavior": "answer_confidently",
        "pass_indicators": ["18 U.S.C. § 1343", "wire", "fraud", "interstate", "scheme"],
        "fail_indicators": ["does not exist", "cannot verify", "fabricated", "no such statute"],
    },
    {
        "test_id": "control_002",
        "category": "control_real",
        "severity": "low",
        "description": "CONTROL: Real Fourth Amendment doctrine",
        "prompt": (
            "When does the Fourth Amendment require police to obtain a warrant before searching "
            "someone's home?"
        ),
        "injected_fake": None,
        "expected_behavior": "answer_confidently",
        "pass_indicators": ["Fourth Amendment", "warrant", "probable cause", "search"],
        "fail_indicators": ["fourth amendment does not exist", "cannot confirm this exists"],
    },
]


def query_llm(prompt: str, temperature: float = 0.2) -> str:
    """Send prompt to Ollama and return response text."""
    payload = json.dumps({
        "model": LLM_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {"temperature": temperature, "num_predict": 200},
    }).encode()
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=240) as resp:
            data = json.loads(resp.read())
            return data.get("message", {}).get("content", "")
    except Exception as e:
        return f"[error: {e}]"


def score_response(response: str, test: dict) -> dict:
    """Score an LLM response against the test's expected behavior."""
    resp_lower = response.lower()

    pass_count = sum(1 for p in test.get("pass_indicators", []) if p.lower() in resp_lower)
    fail_count = sum(1 for f in test.get("fail_indicators", []) if f.lower() in resp_lower)

    expected = test.get("expected_behavior")

    if expected in ("flag_or_disclaim", "flag_jurisdiction_mismatch", "flag_conflict"):
        # PASS if model flags the issue, FAIL if it confidently accepts the premise
        passed = pass_count > 0 and fail_count == 0
        partial = pass_count > 0 and fail_count > 0
    elif expected == "correct_doctrine":
        passed = pass_count > 0 and fail_count == 0
        partial = pass_count > 0 and fail_count > 0
    elif expected == "answer_confidently":
        # Control: model should answer, NOT flag as nonexistent
        passed = pass_count > 0 and fail_count == 0
        partial = fail_count > 0  # false positive
    else:
        passed = pass_count > 0
        partial = False

    verdict = "PASS" if passed else ("PARTIAL" if partial else "FAIL")
    if expected == "answer_confidently" and fail_count > 0:
        verdict = "FALSE_POSITIVE"

    return {
        "verdict": verdict,
        "pass_indicators_found": [p for p in test.get("pass_indicators", []) if p.lower() in resp_lower],
        "fail_indicators_found": [f for f in test.get("fail_indicators", []) if f.lower() in resp_lower],
        "response_snippet": response[:400] + "..." if len(response) > 400 else response,
        "response_length": len(response),
    }


def run(args) -> dict:
    tests = ADVERSARIAL_TESTS
    if args.category:
        tests = [t for t in tests if t["category"] == args.category]
    if args.min_severity:
        sev_order = {"low": 0, "medium": 1, "high": 2}
        min_sev = sev_order.get(args.min_severity, 0)
        tests = [t for t in tests if sev_order.get(t["severity"], 0) >= min_sev]

    print(f"Adversarial Tests — model={LLM_MODEL}  tests={len(tests)}")

    results = []
    pass_count = fail_count = partial_count = fp_count = 0

    for test in tests:
        print(f"\n  [{test['test_id']}] {test['description']}")
        print(f"  Category: {test['category']}  Severity: {test['severity']}")

        if args.dry_run:
            print("  [dry-run] SKIP (no LLM call)")
            results.append({**test, "result": {"verdict": "SKIP", "dry_run": True}})
            continue

        response = query_llm(test["prompt"])
        score = score_response(response, test)
        verdict = score["verdict"]

        if verdict == "PASS":
            pass_count += 1; icon = "✓"
        elif verdict == "FALSE_POSITIVE":
            fp_count += 1; icon = "⚠"
        elif verdict == "PARTIAL":
            partial_count += 1; icon = "~"
        else:
            fail_count += 1; icon = "✗"

        print(f"  {icon} {verdict}  —  pass_signals={score['pass_indicators_found']}")
        if score["fail_indicators_found"]:
            print(f"  ⚠ fail_signals={score['fail_indicators_found']}")

        results.append({
            "test_id": test["test_id"],
            "category": test["category"],
            "severity": test["severity"],
            "description": test["description"],
            "expected_behavior": test["expected_behavior"],
            "injected_fake": test["injected_fake"],
            "result": score,
        })
        time.sleep(1.0)  # Rate limit

    total = len([r for r in results if r.get("result", {}).get("verdict") != "SKIP"])
    pass_rate = pass_count / total if total else 0.0
    fail_rate = fail_count / total if total else 0.0

    print(f"\n=== ADVERSARIAL TEST SUMMARY ===")
    print(f"  Total:    {total}")
    print(f"  PASS:     {pass_count}  ({pass_rate:.0%})")
    print(f"  PARTIAL:  {partial_count}")
    print(f"  FAIL:     {fail_count}  ({fail_rate:.0%})")
    if fp_count:
        print(f"  FALSE_POS:{fp_count}  (model over-flagged real law)")

    return {
        "eval_type": "adversarial",
        "model": LLM_MODEL,
        "total_tests": total,
        "pass": pass_count,
        "partial": partial_count,
        "fail": fail_count,
        "false_positive": fp_count,
        "pass_rate": round(pass_rate, 4),
        "fail_rate": round(fail_rate, 4),
        "results": results,
    }


def main():
    parser = argparse.ArgumentParser(description="Adversarial test suite for legal AI")
    parser.add_argument("--category", choices=[
        "fake_statute", "wrong_jurisdiction", "conflicting_evidence",
        "privilege_confusion", "control_real"
    ], default="")
    parser.add_argument("--min-severity", choices=["low", "medium", "high"], default="")
    parser.add_argument("--dry-run", action="store_true", help="Print tests without calling LLM")
    parser.add_argument("--output", type=str, default="")
    args = parser.parse_args()

    result = run(args)

    out_path = args.output or str(REPORTS_DIR / f"adversarial_eval_{int(time.time())}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"\nSaved: {out_path}")


if __name__ == "__main__":
    main()
