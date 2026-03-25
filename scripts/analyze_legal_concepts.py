#!/usr/bin/env python3
"""
analyze_legal_concepts.py
--------------------------
Semantic similarity search across court_opinions for key legal concepts.

Embeds each concept query via Ollama → pgvector cosine search → top matches.

Concept groups covered:
  - Causation (but-for, proximate, concurrent, superseding, criminal)
  - Mens rea (specific intent, knowledge, recklessness, neg., strict liability)
  - Types of criminal justice (retributive, rehabilitative, restorative, deterrence, incapacitation)
  - Verbal/oral contracts (oral agreement, statute of frauds, promissory estoppel)
  - Aggravating crime enhancers (weapon, hate crime, vulnerable victim, gang, recidivist)

Usage:
  python scripts/analyze_legal_concepts.py                         # all 28 concepts
  python scripts/analyze_legal_concepts.py --group mens_rea        # single group
  python scripts/analyze_legal_concepts.py --concept specific_intent --top 10
  python scripts/analyze_legal_concepts.py --similarities          # cross-area pairs
  python scripts/analyze_legal_concepts.py --export                # save JSON + CSV
  python scripts/analyze_legal_concepts.py --list                  # show all concept keys
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

# ── Config ─────────────────────────────────────────────────────────────────────
DB_CONFIG = {
    "host":     os.environ.get("PGHOST",     "127.0.0.1"),
    "port":     int(os.environ.get("PGPORT", "5432")),
    "database": os.environ.get("PGDATABASE", "legal_ai_db"),
    "user":     os.environ.get("PGUSER",     "legal_admin"),
    "password": os.environ.get("PGPASSWORD", "123456"),
}
OLLAMA_URL  = os.environ.get("OLLAMA_URL",  "http://127.0.0.1:11434")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "embeddinggemma:latest")

# ── Concept registry ────────────────────────────────────────────────────────────
# Format: concept_key → (group, display_name, query_text, description)
# query_text is what gets embedded — rich legal language for best retrieval

CONCEPTS: dict[str, tuple[str, str, str, str]] = {

    # ════════════════════════════════════════════════════════
    # GROUP: causation
    # ════════════════════════════════════════════════════════
    "but_for_causation": (
        "causation",
        "But-For Causation",
        "but-for the defendant's negligent or criminal act the plaintiff's injury would not have occurred "
        "counterfactual causal link actual causation sine qua non test",
        "Foundational causation test: the harm would not have occurred but for the defendant's conduct.",
    ),
    "proximate_cause": (
        "causation",
        "Proximate / Legal Cause",
        "proximate cause foreseeable harm legal cause limits liability "
        "intervening superseding cause breaks chain of causation Palsgraf remoteness",
        "Limits liability to harms that were a foreseeable result of defendant's actions.",
    ),
    "concurrent_causation": (
        "causation",
        "Concurrent / Multiple Causation",
        "concurrent causes multiple defendants each sufficient to cause harm substantial factor test "
        "joint tortfeasors contribution apportionment of fault",
        "Multiple independent acts each capable of causing the harm independently.",
    ),
    "superseding_cause": (
        "causation",
        "Superseding / Intervening Cause",
        "superseding cause intervening act third party unforeseeable act breaks causal chain "
        "defendant no longer liable original negligence",
        "A later act so unforeseeable it cuts off the defendant's legal liability.",
    ),
    "criminal_causation": (
        "causation",
        "Criminal Causation (Actual + Proximate)",
        "but-for cause in criminal law year-and-a-day rule felony murder causation death resulting "
        "concurrent cause criminal homicide acceleration death proximate cause criminal",
        "Causation doctrine applied in criminal homicide and assault charges.",
    ),

    # ════════════════════════════════════════════════════════
    # GROUP: mens_rea
    # ════════════════════════════════════════════════════════
    "specific_intent": (
        "mens_rea",
        "Specific Intent",
        "specific intent purposely intentionally desire to achieve particular prohibited result "
        "first degree premeditated deliberate murder assault with intent",
        "Highest culpability — actor must consciously desire the result.",
    ),
    "general_intent_knowledge": (
        "mens_rea",
        "General Intent / Knowledge",
        "general intent knowingly aware that conduct is of prohibited nature knowledge "
        "conscious awareness criminal act second degree felony",
        "Actor need only know their conduct is of the prohibited nature.",
    ),
    "recklessness": (
        "mens_rea",
        "Recklessness",
        "reckless disregard substantial and unjustifiable risk gross deviation from reasonable care "
        "conscious disregard wanton reckless manslaughter",
        "Actor consciously disregards a known, substantial risk of harm.",
    ),
    "criminal_negligence": (
        "mens_rea",
        "Criminal Negligence",
        "criminal negligence gross negligence failure to perceive obvious risk "
        "below reasonable person standard negligent homicide involuntary manslaughter",
        "Actor should have perceived a risk but failed to do so — below reasonable person standard.",
    ),
    "strict_liability": (
        "mens_rea",
        "Strict Liability (No Mens Rea)",
        "strict liability no intent required regulatory offense public welfare offense "
        "absolute liability vicarious liability traffic violation environmental",
        "Liability without fault or criminal intent — conduct alone is sufficient.",
    ),
    "malice_aforethought": (
        "mens_rea",
        "Malice Aforethought",
        "malice aforethought premeditated murder intent to kill or cause grievous bodily harm "
        "extreme recklessness depraved heart murder first degree",
        "Common law mental state for murder — premeditated or depraved indifference.",
    ),
    "willful_blindness": (
        "mens_rea",
        "Willful Blindness / Deliberate Ignorance",
        "willful blindness deliberate ignorance ostrich instruction conscious avoidance "
        "knowledge of criminal scheme drug trafficking financial fraud",
        "Actor deliberately avoids learning facts that would reveal criminal activity.",
    ),

    # ════════════════════════════════════════════════════════
    # GROUP: criminal_justice
    # ════════════════════════════════════════════════════════
    "retributive_justice": (
        "criminal_justice",
        "Retributive Justice",
        "retribution punishment proportional to crime just deserts moral desert "
        "wrongdoer deserves to suffer eye for an eye Kant proportionality principle",
        "Punishment as moral repayment — the offender deserves to suffer proportionally.",
    ),
    "rehabilitative_justice": (
        "criminal_justice",
        "Rehabilitative Justice",
        "rehabilitation reform correctional program drug treatment recidivism reduction "
        "reintegrate into society diversion program therapeutic community",
        "Punishment aimed at reforming the offender and preventing future crime.",
    ),
    "restorative_justice": (
        "criminal_justice",
        "Restorative Justice",
        "restorative justice victim-offender mediation reparation community harm "
        "truth and reconciliation apology community service repair harm",
        "Focus on repairing harm and restoring relationships rather than punishing.",
    ),
    "deterrence": (
        "criminal_justice",
        "Deterrence Theory",
        "deterrence deterrent effect preventing future crime general deterrence population "
        "specific deterrence individual certainty severity punishment Beccaria Bentham",
        "Punishment to discourage future criminal conduct by individuals or the public.",
    ),
    "incapacitation": (
        "criminal_justice",
        "Incapacitation / Public Safety",
        "incapacitation protect public from dangerous offender preventive detention "
        "habitual offender not amenable to rehabilitation public safety imprisonment",
        "Physically restraining the offender to prevent future crimes.",
    ),

    # ════════════════════════════════════════════════════════
    # GROUP: verbal_contracts
    # ════════════════════════════════════════════════════════
    "oral_contract": (
        "verbal_contracts",
        "Oral / Verbal Contract Enforceability",
        "oral contract verbal agreement enforceable not in writing parol evidence rule "
        "handshake deal promise agreement meeting of the minds spoken words",
        "Contract formed through spoken words — enforceability and parol evidence issues.",
    ),
    "statute_of_frauds": (
        "verbal_contracts",
        "Statute of Frauds",
        "statute of frauds writing requirement real estate contract exceeding one year "
        "marriage surety UCC goods over $500 unenforceable without writing signed",
        "Certain categories of contracts must be in writing to be enforceable.",
    ),
    "promissory_estoppel": (
        "verbal_contracts",
        "Promissory Estoppel",
        "promissory estoppel detrimental reliance reasonable reliance enforce promise "
        "injustice avoid no consideration necessary substitute for consideration",
        "Enforcing an oral promise where a party has reasonably and detrimentally relied.",
    ),
    "part_performance": (
        "verbal_contracts",
        "Part Performance & Implied Contract",
        "part performance substantial performance unjust enrichment quantum meruit "
        "implied-in-fact contract implied-in-law contract parties acted as if binding",
        "Acts taken in reliance on an oral contract can make it enforceable.",
    ),

    # ════════════════════════════════════════════════════════
    # GROUP: aggravating_enhancers
    # ════════════════════════════════════════════════════════
    "weapon_enhancement": (
        "aggravating_enhancers",
        "Weapon / Firearm Sentencing Enhancement",
        "firearm enhancement deadly weapon armed with weapon use of a gun sentencing enhancement "
        "mandatory minimum 18 U.S.C. 924(c) dangerous weapon possession",
        "Additional mandatory sentence for crimes committed using a firearm or deadly weapon.",
    ),
    "hate_crime_enhancement": (
        "aggravating_enhancers",
        "Hate Crime Enhancement",
        "hate crime bias-motivated racial animus religious bias sexual orientation gender "
        "ethnicity penalty enhancement discriminatory motivation targeted victim bias",
        "Enhanced sentence for crimes motivated by bias or hatred toward a protected class.",
    ),
    "vulnerable_victim": (
        "aggravating_enhancers",
        "Vulnerable Victim Enhancement",
        "vulnerable victim elderly victim child victim minor disability exploitation "
        "position of trust fiduciary abuse caretaker exploitation USSG §3A1.1",
        "Enhanced punishment when the victim is particularly vulnerable or was exploited.",
    ),
    "gang_enhancement": (
        "aggravating_enhancers",
        "Gang / Organized Crime Enhancement",
        "gang enhancement street gang organized crime RICO criminal enterprise "
        "racketeering sentencing enhancement gang member benefit association",
        "Enhanced sentence for conducting crime in association with a gang or enterprise.",
    ),
    "recidivist_enhancement": (
        "aggravating_enhancers",
        "Recidivist / Habitual Offender Enhancement",
        "recidivist habitual offender three strikes prior felony convictions career criminal "
        "ACCA Armed Career Criminal Act enhanced mandatory minimum prior record",
        "Escalating mandatory penalties for defendants with prior criminal history.",
    ),
    "aggravated_assault_factors": (
        "aggravating_enhancers",
        "Aggravated Assault / Bodily Injury Enhancement",
        "aggravated assault serious bodily injury great bodily harm deadly weapon "
        "permanent disfigurement strangulation child abuse special circumstances",
        "Factors elevating simple assault/battery to an aggravated felony charge.",
    ),
}

# Group membership index
GROUPS: dict[str, list[str]] = {}
for k, v in CONCEPTS.items():
    GROUPS.setdefault(v[0], []).append(k)


def get_embedding(text: str) -> Optional[list[float]]:
    import requests
    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/embed",
            json={"model": EMBED_MODEL, "input": [text[:2048]]},
            timeout=60,
        )
        resp.raise_for_status()
        embs = resp.json().get("embeddings", [])
        return embs[0] if embs else None
    except Exception as e:
        print(f"  [embed] {e}", flush=True)
        return None


def search_concept(cur, key: str, entry: tuple, top_n: int) -> list[dict]:
    """pgvector cosine search against court_opinions."""
    group, display, query_text, description = entry
    vec = get_embedding(query_text)
    if vec is None:
        return []

    cur.execute("""
        SELECT
            id, title, citation, court,
            jurisdiction_level, practice_area,
            LEFT(opinion_text, 500) AS excerpt,
            1 - (embedding <=> %s::vector) AS similarity
        FROM court_opinions
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> %s::vector
        LIMIT %s
    """, (vec, vec, top_n))

    return [
        {
            "concept_key":   key,
            "id":            str(r[0]),
            "title":         r[1] or "",
            "citation":      r[2] or "",
            "court":         r[3] or "",
            "jurisdiction":  r[4] or "",
            "practice_area": r[5] or "",
            "excerpt":       (r[6] or "").strip()[:400],
            "similarity":    round(float(r[7]), 4),
        }
        for r in cur.fetchall()
    ]


def find_cross_area_similarities(cur, limit: int = 20) -> list[dict]:
    """Find opinion pairs with high similarity but different practice areas."""
    cur.execute("""
        SELECT
            a.id, a.practice_area, LEFT(a.opinion_text, 250) AS text_a,
            b.id AS id_b, b.practice_area AS pa_b,
            LEFT(b.opinion_text, 250) AS text_b,
            1 - (a.embedding <=> b.embedding) AS sim
        FROM court_opinions a
        JOIN court_opinions b ON a.id < b.id
        WHERE a.practice_area != b.practice_area
          AND a.embedding IS NOT NULL
          AND b.embedding IS NOT NULL
          AND 1 - (a.embedding <=> b.embedding) > 0.88
        ORDER BY sim DESC
        LIMIT %s
    """, (limit,))
    return [
        {
            "opinion_a":      str(r[0]),
            "practice_area_a": r[1],
            "excerpt_a":      (r[2] or "").strip()[:200],
            "opinion_b":      str(r[3]),
            "practice_area_b": r[4],
            "excerpt_b":      (r[5] or "").strip()[:200],
            "similarity":     round(float(r[6]), 4),
        }
        for r in cur.fetchall()
    ]


def print_group_header(group: str):
    labels = {
        "causation":          "CAUSATION DOCTRINE",
        "mens_rea":           "MENS REA — CRIMINAL INTENT",
        "criminal_justice":   "THEORIES OF CRIMINAL JUSTICE",
        "verbal_contracts":   "VERBAL / ORAL CONTRACTS",
        "aggravating_enhancers": "AGGRAVATING CRIME ENHANCERS",
    }
    print(f"\n{'━'*72}")
    print(f"  ▶  {labels.get(group, group.upper())}")
    print(f"{'━'*72}")


def print_results(key: str, entry: tuple, results: list[dict]):
    group, display, query_text, description = entry
    print(f"\n  ◆ {display}")
    print(f"    {description}")
    if not results:
        print("    → No results found (embedding may have failed).")
        return
    for i, r in enumerate(results, 1):
        bar = "▓" * int(r["similarity"] * 25)
        print(f"    [{i}] {r['similarity']:.3f} {bar}")
        print(f"         {r['court']}  |  {r['practice_area']}  |  {r['citation']}")
        print(f"         {r['excerpt'][:240].strip()}")
    print()


def main():
    ap = argparse.ArgumentParser(description="Semantic analysis of legal concepts in court opinions corpus")
    ap.add_argument("--group",       help=f"Run one concept group: {list(GROUPS.keys())}")
    ap.add_argument("--concept",     help="Run single concept key (--list to see all)")
    ap.add_argument("--top",         type=int, default=5, help="Top N results per concept")
    ap.add_argument("--export",      action="store_true", help="Save JSON + CSV report")
    ap.add_argument("--similarities",action="store_true", help="Find cross-practice-area similar pairs")
    ap.add_argument("--list",        action="store_true", help="Print all concept keys and exit")
    args = ap.parse_args()

    if args.list:
        for g, keys in GROUPS.items():
            print(f"\n{g.upper()}:")
            for k in keys:
                print(f"  {k:35s}  {CONCEPTS[k][1]}")
        return

    # Select concepts
    if args.concept:
        if args.concept not in CONCEPTS:
            print(f"ERROR: unknown concept '{args.concept}'")
            print("Run with --list to see all valid keys.")
            sys.exit(1)
        run_map = {args.concept: CONCEPTS[args.concept]}
    elif args.group:
        if args.group not in GROUPS:
            print(f"ERROR: unknown group '{args.group}'. Valid: {list(GROUPS.keys())}")
            sys.exit(1)
        run_map = {k: CONCEPTS[k] for k in GROUPS[args.group]}
    else:
        run_map = CONCEPTS

    import psycopg2
    from pgvector.psycopg2 import register_vector

    conn = psycopg2.connect(**DB_CONFIG)
    register_vector(conn)
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM court_opinions WHERE embedding IS NOT NULL")
    corpus_size = cur.fetchone()[0]

    print(f"\n{'═'*72}")
    print(f"  LEGAL CORPUS CONCEPT ANALYSIS  —  {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"  Corpus: {corpus_size:,} court opinions with 768-dim pgvector embeddings")
    print(f"  Running: {len(run_map)} concept(s)   Top-N: {args.top}")
    print(f"{'═'*72}")

    all_results: dict[str, dict] = {}
    prev_group = None

    for key, entry in run_map.items():
        group = entry[0]
        if group != prev_group:
            print_group_header(group)
            prev_group = group

        results = search_concept(cur, key, entry, top_n=args.top)
        all_results[key] = {
            "group":        group,
            "display_name": entry[1],
            "description":  entry[3],
            "query_text":   entry[2],
            "results":      results,
        }
        print_results(key, entry, results)
        time.sleep(0.2)  # rate-limit Ollama

    # Cross-area similarity pairs
    if args.similarities:
        print(f"\n{'═'*72}")
        print("  CROSS-PRACTICE-AREA SIMILARITY PAIRS  (cosine > 0.88)")
        print(f"{'─'*72}")
        pairs = find_cross_area_similarities(cur)
        if not pairs:
            print("  No pairs above threshold found in current corpus.")
        for p in pairs:
            print(f"  {p['practice_area_a']:20s} ↔  {p['practice_area_b']:20s}  sim={p['similarity']}")
            print(f"    A: {p['excerpt_a'][:180].strip()}")
            print(f"    B: {p['excerpt_b'][:180].strip()}")
            print()

    conn.close()

    # Export
    if args.export:
        out_dir = Path(__file__).parent / "analysis_reports"
        out_dir.mkdir(exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # JSON
        json_path = out_dir / f"legal_concepts_{stamp}.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(all_results, f, indent=2, default=str)
        print(f"\n[export] JSON  → {json_path}")

        # CSV (flat)
        csv_path = out_dir / f"legal_concepts_{stamp}.csv"
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write("group,concept,display,rank,similarity,court,practice_area,citation,excerpt\n")
            for key, data in all_results.items():
                for i, r in enumerate(data["results"], 1):
                    def esc(s): return '"' + str(s).replace('"', '""').replace("\n", " ") + '"'
                    f.write(",".join([
                        data["group"], key, esc(data["display_name"]),
                        str(i), str(r["similarity"]),
                        esc(r["court"]), esc(r["practice_area"]),
                        esc(r["citation"]), esc(r["excerpt"][:200]),
                    ]) + "\n")
        print(f"[export] CSV   → {csv_path}")


if __name__ == "__main__":
    main()
