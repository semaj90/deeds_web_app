#!/usr/bin/env python3
"""
Legal Evaluation Harness — Master Runner
Coordinates all evaluation modules and produces a unified report.

Metrics covered:
  - Retrieval: precision@k, recall@k, MRR across Qdrant collections
  - Citation fidelity: % citations traceable to corpus, hallucination flags
  - Adversarial: fake statute detection, wrong jurisdiction, conflicting evidence
  - System health: Ollama connectivity, Qdrant collection inventory

Usage:
    python scripts/eval/legal_eval_harness.py --eval all
    python scripts/eval/legal_eval_harness.py --eval retrieval --k 10
    python scripts/eval/legal_eval_harness.py --eval adversarial --dry-run
    python scripts/eval/legal_eval_harness.py --eval citation --sample-from-ollama
    python scripts/eval/legal_eval_harness.py --eval health
    python scripts/eval/legal_eval_harness.py --eval all --output reports/full_eval.json
"""
import sys, json, argparse, time, os, urllib.request
from pathlib import Path
from datetime import datetime

SCRIPT_DIR = Path(__file__).parent
REPORTS_DIR = SCRIPT_DIR.parent / "analysis_reports"
REPORTS_DIR.mkdir(exist_ok=True)

QDRANT_URL = os.getenv("QDRANT_URL", "http://127.0.0.1:6333")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
EMBED_MODEL = os.getenv("EMBED_MODEL", "embeddinggemma:latest")
LLM_MODEL = os.getenv("LLM_MODEL", "gemma3-legal:latest")


# ── System Health Check ───────────────────────────────────────────────────────

def check_ollama() -> dict:
    """Verify Ollama is running and required models are available."""
    try:
        with urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=10) as r:
            data = json.loads(r.read())
            models = [m["name"] for m in data.get("models", [])]
            embed_ok = any(EMBED_MODEL.split(":")[0] in m for m in models)
            llm_ok = any(LLM_MODEL.split(":")[0] in m for m in models)
            return {
                "status": "ok",
                "url": OLLAMA_URL,
                "models_available": models,
                "embed_model_found": embed_ok,
                "llm_model_found": llm_ok,
            }
    except Exception as e:
        return {"status": "error", "url": OLLAMA_URL, "error": str(e)}


def check_qdrant() -> dict:
    """Verify Qdrant is running and list collections."""
    try:
        with urllib.request.urlopen(f"{QDRANT_URL}/collections", timeout=10) as r:
            data = json.loads(r.read())
            collections = []
            for c in data.get("result", {}).get("collections", []):
                name = c["name"]
                # Get point count
                try:
                    with urllib.request.urlopen(f"{QDRANT_URL}/collections/{name}", timeout=5) as r2:
                        info = json.loads(r2.read())
                        count = info.get("result", {}).get("points_count", "?")
                except Exception:
                    count = "?"
                collections.append({"name": name, "points": count})
            return {
                "status": "ok",
                "url": QDRANT_URL,
                "collections": collections,
                "collection_names": [c["name"] for c in collections],
            }
    except Exception as e:
        return {"status": "error", "url": QDRANT_URL, "error": str(e)}


def run_health_check() -> dict:
    print("\n=== SYSTEM HEALTH CHECK ===")
    ollama = check_ollama()
    qdrant = check_qdrant()

    print(f"  Ollama  [{OLLAMA_URL}]: {ollama['status']}")
    if ollama["status"] == "ok":
        print(f"    embed_model ({EMBED_MODEL}): {'✓' if ollama['embed_model_found'] else '✗ NOT FOUND'}")
        print(f"    llm_model   ({LLM_MODEL}):  {'✓' if ollama['llm_model_found'] else '✗ NOT FOUND'}")
        print(f"    models: {ollama['models_available'][:5]}")

    print(f"  Qdrant  [{QDRANT_URL}]: {qdrant['status']}")
    if qdrant["status"] == "ok":
        for c in qdrant.get("collections", []):
            print(f"    {c['name']}: {c['points']} points")

    overall = "ok" if ollama["status"] == "ok" and qdrant["status"] == "ok" else "degraded"
    return {
        "eval_type": "health",
        "overall_status": overall,
        "ollama": ollama,
        "qdrant": qdrant,
    }


# ── Retrieval Eval ────────────────────────────────────────────────────────────

def run_retrieval_eval(k: int = 5, collection: str = "", **kwargs) -> dict:
    print(f"\n=== RETRIEVAL EVAL (k={k}) ===")
    try:
        import importlib.util, sys as _sys
        spec = importlib.util.spec_from_file_location("retrieval_eval", SCRIPT_DIR / "retrieval_eval.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        # Build fake args
        class Args:
            pass
        a = Args()
        a.k = k
        a.collection = collection
        a.difficulty = kwargs.get("difficulty", "")
        a.category = kwargs.get("category", "")
        return mod.run(a)
    except Exception as e:
        return {"eval_type": "retrieval", "error": str(e)}


# ── Citation Fidelity ─────────────────────────────────────────────────────────

def run_citation_eval(sample_from_ollama: bool = False, text: str = "", **kwargs) -> dict:
    print(f"\n=== CITATION FIDELITY EVAL ===")
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("citation_fidelity", SCRIPT_DIR / "citation_fidelity.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        if sample_from_ollama or not text:
            print(f"  Generating sample from {LLM_MODEL}...")
            text = mod.sample_from_ollama("")
            print(f"  Generated {len(text)} chars")

        result = mod.evaluate_text(text, check_corpus=kwargs.get("check_corpus", True))
        result["eval_type"] = "citation_fidelity"
        result["source"] = "ollama_sample" if sample_from_ollama else "provided_text"
        return result
    except Exception as e:
        return {"eval_type": "citation_fidelity", "error": str(e)}


# ── Adversarial Tests ─────────────────────────────────────────────────────────

def run_adversarial_eval(category: str = "", dry_run: bool = False, **kwargs) -> dict:
    print(f"\n=== ADVERSARIAL TEST SUITE ===")
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("adversarial_tests", SCRIPT_DIR / "adversarial_tests.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        class Args:
            pass
        a = Args()
        a.category = category
        a.min_severity = kwargs.get("min_severity", "")
        a.dry_run = dry_run
        return mod.run(a)
    except Exception as e:
        return {"eval_type": "adversarial", "error": str(e)}


# ── Hallucination Rate ────────────────────────────────────────────────────────

def run_hallucination_eval(n_samples: int = 5, **kwargs) -> dict:
    """
    Simple hallucination rate estimator.
    Generates N legal answers then checks citation fidelity as a proxy for hallucination.
    Hallucination rate = 1 - (weighted fidelity score).
    """
    print(f"\n=== HALLUCINATION RATE EVAL ({n_samples} samples) ===")

    PROMPTS = [
        "Explain the elements of mail fraud under 18 U.S.C. § 1341 with two case examples.",
        "What is the standard for granting summary judgment under Federal Rule of Civil Procedure 56?",
        "Describe the plain view doctrine exception to the warrant requirement with case law.",
        "What are the sentencing guidelines for drug trafficking under the USSG § 2D1.1?",
        "Explain the Eighth Amendment proportionality requirement in criminal sentencing, citing precedent.",
        "What distinguishes robbery from larceny in federal law?",
        "Explain Brady v. Maryland and its impact on prosecutorial disclosure obligations.",
        "When does double jeopardy attach in a jury trial versus a bench trial?",
        "What is required to establish a conspiracy under 18 U.S.C. § 371?",
        "Under the Federal Rules of Evidence, when is hearsay admissible as a present sense impression?",
    ][:n_samples]

    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("citation_fidelity", SCRIPT_DIR / "citation_fidelity.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        sample_scores = []
        for i, prompt in enumerate(PROMPTS):
            print(f"  Sample {i+1}/{n_samples}: {prompt[:60]}...")
            text = mod.sample_from_ollama(prompt)
            if text.startswith("[error"):
                print(f"    skip (llm error)")
                continue
            result = mod.evaluate_text(text, check_corpus=False)
            score = result.get("overall_fidelity_score", 0.0)
            flags = len(result.get("hallucination_flags", []))
            print(f"    fidelity={score:.2f}  flags={flags}")
            sample_scores.append({
                "prompt": prompt,
                "fidelity_score": score,
                "hallucination_flags": flags,
                "stat_cites": result.get("statute_citations", 0),
                "case_cites": result.get("case_citations", 0),
            })
            time.sleep(1.0)

        if not sample_scores:
            return {"eval_type": "hallucination", "error": "no samples"}

        avg_fidelity = sum(s["fidelity_score"] for s in sample_scores) / len(sample_scores)
        avg_flags = sum(s["hallucination_flags"] for s in sample_scores) / len(sample_scores)
        hallucination_rate = 1.0 - avg_fidelity

        print(f"\n  Avg fidelity:          {avg_fidelity:.3f}")
        print(f"  Avg hallucination flags: {avg_flags:.1f}")
        print(f"  Estimated hallucination rate: {hallucination_rate:.1%}")

        return {
            "eval_type": "hallucination",
            "model": LLM_MODEL,
            "n_samples": len(sample_scores),
            "avg_fidelity_score": round(avg_fidelity, 4),
            "avg_hallucination_flags_per_answer": round(avg_flags, 2),
            "estimated_hallucination_rate": round(hallucination_rate, 4),
            "samples": sample_scores,
        }
    except Exception as e:
        return {"eval_type": "hallucination", "error": str(e)}


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Legal AI Evaluation Harness")
    parser.add_argument(
        "--eval", required=True,
        choices=["all", "health", "retrieval", "citation", "adversarial", "hallucination"],
        help="Which evaluation(s) to run"
    )
    parser.add_argument("--k", type=int, default=5, help="Top-k for retrieval eval")
    parser.add_argument("--collection", type=str, default="", help="Specific Qdrant collection")
    parser.add_argument("--dry-run", action="store_true", dest="dry_run",
                        help="Skip LLM calls (adversarial/hallucination)")
    parser.add_argument("--sample-from-ollama", action="store_true", dest="sample_ollama",
                        help="Generate citation eval sample from LLM")
    parser.add_argument("--n-samples", type=int, default=5, dest="n_samples",
                        help="Number of LLM samples for hallucination eval")
    parser.add_argument("--category", type=str, default="",
                        help="Filter adversarial tests by category")
    parser.add_argument("--output", type=str, default="")
    args = parser.parse_args()

    run_all = (args.eval == "all")
    timestamp = datetime.now().isoformat()

    report = {
        "harness_version": "1.0",
        "timestamp": timestamp,
        "eval_scope": args.eval,
        "config": {
            "ollama_url": OLLAMA_URL,
            "qdrant_url": QDRANT_URL,
            "embed_model": EMBED_MODEL,
            "llm_model": LLM_MODEL,
        },
        "results": {}
    }

    if run_all or args.eval == "health":
        report["results"]["health"] = run_health_check()

    if run_all or args.eval == "retrieval":
        report["results"]["retrieval"] = run_retrieval_eval(
            k=args.k, collection=args.collection
        )

    if run_all or args.eval == "citation":
        report["results"]["citation_fidelity"] = run_citation_eval(
            sample_from_ollama=args.sample_ollama or run_all
        )

    if run_all or args.eval == "hallucination":
        report["results"]["hallucination"] = run_hallucination_eval(
            n_samples=args.n_samples if not args.dry_run else 2
        )

    if run_all or args.eval == "adversarial":
        report["results"]["adversarial"] = run_adversarial_eval(
            category=args.category, dry_run=args.dry_run
        )

    # ── Print executive summary ──────────────────────────────────────────────
    print("\n" + "═" * 60)
    print("LEGAL AI EVALUATION HARNESS — EXECUTIVE SUMMARY")
    print(f"Timestamp: {timestamp}")
    print("═" * 60)

    r = report["results"]

    if "health" in r:
        h = r["health"]
        print(f"  System health:  {h.get('overall_status', '?').upper()}")

    if "retrieval" in r:
        ret = r["retrieval"]
        if "error" not in ret:
            for coll, m in ret.get("results", {}).items():
                if "error" not in m:
                    print(f"  Retrieval [{coll}]: MAP={m.get('mean_average_precision',0):.3f} "
                          f"MRR={m.get('mean_reciprocal_rank',0):.3f}")

    if "citation_fidelity" in r:
        cf = r["citation_fidelity"]
        if "error" not in cf:
            print(f"  Citation fidelity: {cf.get('overall_fidelity_score',0):.1%}  "
                  f"({cf.get('hallucination_flags',[]) and len(cf['hallucination_flags'])} flags)")

    if "hallucination" in r:
        hl = r["hallucination"]
        if "error" not in hl:
            print(f"  Hallucination rate: {hl.get('estimated_hallucination_rate',0):.1%}")

    if "adversarial" in r:
        adv = r["adversarial"]
        if "error" not in adv:
            print(f"  Adversarial pass rate: {adv.get('pass_rate',0):.0%} "
                  f"({adv.get('pass',0)}/{adv.get('total_tests',0)})")

    print("═" * 60)

    # ── Save report ──────────────────────────────────────────────────────────
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = args.output or str(REPORTS_DIR / f"legal_eval_{ts}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"\nFull report saved: {out_path}")


if __name__ == "__main__":
    main()
