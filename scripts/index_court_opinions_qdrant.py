#!/usr/bin/env python3
"""
index_court_opinions_qdrant.py
------------------------------
Index PostgreSQL court_opinions into Qdrant for fast semantic search.

- Reads existing 768-dim embeddings from PostgreSQL (no re-embedding needed)
- Assigns rich concept tags via keyword matching against legal taxonomy
- Generates concise AI summaries via Ollama (--summarize flag)
- Creates / upserts Qdrant 'court_opinions' collection
- Payload filters: jurisdiction_level, practice_area, tags, source

Usage:
  python scripts/index_court_opinions_qdrant.py              # index all
  python scripts/index_court_opinions_qdrant.py --limit 500  # first 500
  python scripts/index_court_opinions_qdrant.py --recreate   # drop & recreate
  python scripts/index_court_opinions_qdrant.py --dry-run    # count only
  python scripts/index_court_opinions_qdrant.py --summarize  # gen AI summaries

Requirements:
  pip install psycopg2-binary qdrant-client pgvector requests
"""

import argparse
import hashlib
import json
import os
import sys
import time
from typing import Optional

# ── Config ─────────────────────────────────────────────────────────────────────
DB_CONFIG = {
    "host":     os.environ.get("PGHOST",     "127.0.0.1"),
    "port":     int(os.environ.get("PGPORT", "5432")),
    "database": os.environ.get("PGDATABASE", "legal_ai_db"),
    "user":     os.environ.get("PGUSER",     "legal_admin"),
    "password": os.environ.get("PGPASSWORD", "123456"),
}
QDRANT_URL  = os.environ.get("QDRANT_URL",  "http://127.0.0.1:6333")
OLLAMA_URL  = os.environ.get("OLLAMA_URL",  "http://127.0.0.1:11434")
LLM_MODEL   = os.environ.get("LLM_MODEL",   "gemma3-legal:latest")
COLLECTION  = "court_opinions"
VECTOR_SIZE = 768

# ── Legal concept taxonomy for automated tagging ───────────────────────────────
# Format: tag_name -> list of keyword phrases (any match = tag applied)
CONCEPT_TAGS: dict[str, list[str]] = {
    # Causation
    "causation":              ["but-for", "but for", "proximate cause", "actual cause",
                               "concurrent cause", "superseding cause", "factual cause",
                               "causal link", "cause of action"],
    "proximate_cause":        ["proximate cause", "foreseeab", "intervening cause",
                               "chain of causation", "legal cause"],
    "concurrent_causation":   ["concurrent cause", "substantial factor", "joint tortfeasor",
                               "multiple defendants", "contributed to harm"],
    # Mens Rea
    "mens_rea":               ["mens rea", "criminal intent", "scienter", "guilty mind",
                               "malice aforethought", "intent to", "specific intent",
                               "general intent", "knowingly", "willfully"],
    "strict_liability":       ["strict liability", "without fault", "no intent required",
                               "absolute liability", "public welfare offense"],
    "recklessness":           ["reckless", "recklessly", "conscious disregard",
                               "wanton disregard", "unjustifiable risk"],
    "criminal_negligence":    ["criminal negligence", "gross negligence",
                               "negligent homicide", "failure to perceive"],
    "willful_blindness":      ["willful blindness", "deliberate ignorance",
                               "ostrich instruction", "conscious avoidance"],
    # Criminal Justice Theory
    "retributive_justice":    ["retribution", "retributive", "just deserts",
                               "proportional punishment", "deserved punishment"],
    "rehabilitative_justice": ["rehabilitation", "rehabilitative", "correctional program",
                               "reform", "recidivism reduction", "treatment program"],
    "restorative_justice":    ["restorative justice", "victim-offender", "restoration",
                               "reparation", "reconciliation"],
    "deterrence":             ["deterrence", "deterrent effect", "general deterrence",
                               "specific deterrence", "deter future crime"],
    "incapacitation":         ["incapacitation", "incapacitate", "protect society",
                               "public safety", "preventive detention"],
    # Verbal / Oral Contracts
    "oral_contract":          ["oral contract", "verbal contract", "not in writing",
                               "oral agreement", "verbal agreement", "handshake",
                               "parol evidence"],
    "statute_of_frauds":      ["statute of frauds", "writing requirement",
                               "required to be in writing", "real estate contract",
                               "exceed one year"],
    "promissory_estoppel":    ["promissory estoppel", "detrimental reliance",
                               "reasonable reliance", "injustice avoid"],
    "part_performance":       ["part performance", "substantial performance",
                               "unjust enrichment", "quantum meruit", "implied contract"],
    # Aggravating Enhancers
    "aggravating_factors":    ["aggravating", "aggravated", "sentencing enhancement",
                               "sentence enhancement", "upward departure", "upward variance",
                               "enhance the sentence"],
    "weapon_enhancement":     ["deadly weapon", "firearm enhancement", "armed with",
                               "use of a weapon", "use of a firearm", "gun enhancement",
                               "mandatory minimum"],
    "hate_crime":             ["hate crime", "bias-motivated", "racial animus",
                               "discriminatory motive", "bias crime", "religious bias"],
    "vulnerable_victim":      ["vulnerable victim", "elderly victim", "child victim",
                               "victim was a minor", "victim of trust", "exploitation"],
    "gang_enhancement":       ["gang enhancement", "street gang", "RICO",
                               "criminal enterprise", "racketeering", "gang activity"],
    "repeat_offender":        ["recidivist", "habitual offender", "three strikes",
                               "prior convictions", "career criminal", "prior felony"],
    # Constitutional
    "fourth_amendment":       ["fourth amendment", "4th amendment", "search and seizure",
                               "unreasonable search", "probable cause", "search warrant",
                               "exclusionary rule"],
    "fifth_amendment":        ["fifth amendment", "5th amendment", "self-incrimination",
                               "double jeopardy", "grand jury", "just compensation",
                               "due process clause"],
    "sixth_amendment":        ["sixth amendment", "right to counsel", "speedy trial",
                               "confrontation clause", "jury trial", "effective assistance"],
    "eighth_amendment":       ["eighth amendment", "cruel and unusual", "excessive bail",
                               "disproportionate sentence", "death penalty", "capital punishment"],
    "first_amendment":        ["first amendment", "free speech", "freedom of speech",
                               "establishment clause", "free exercise", "press freedom"],
    "due_process":            ["due process", "procedural due process",
                               "substantive due process", "liberty interest",
                               "notice and opportunity to be heard"],
    "equal_protection":       ["equal protection", "suspect classification",
                               "disparate impact", "discriminatory purpose",
                               "race-based", "gender-based"],
    "commerce_clause":        ["commerce clause", "interstate commerce",
                               "regulate commerce", "dormant commerce clause"],
    # Criminal Law
    "felony_murder":          ["felony murder", "felony-murder", "underlying felony",
                               "in furtherance of", "murder during commission"],
    "self_defense":           ["self-defense", "self defense", "stand your ground",
                               "castle doctrine", "defense of others", "reasonable force",
                               "imperfect self-defense"],
    "conspiracy":             ["conspiracy", "aiding and abetting", "accomplice liability",
                               "in furtherance of", "co-conspirator"],
    "double_jeopardy":        ["double jeopardy", "same offense", "collateral estoppel",
                               "Blockburger", "acquittal bar"],
    # Evidence
    "hearsay":                ["hearsay", "out-of-court statement", "declarant",
                               "hearsay exception", "excited utterance", "dying declaration"],
    "miranda":                ["miranda", "right to remain silent", "custodial interrogation",
                               "miranda warning", "you have the right"],
    # Civil Rights / § 1983
    "section_1983":           ["section 1983", "§ 1983", "42 u.s.c. 1983",
                               "color of law", "deprivation of rights"],
    "qualified_immunity":     ["qualified immunity", "clearly established law",
                               "objectively reasonable", "reasonable officer"],
    # Sentencing
    "sentencing_guidelines":  ["sentencing guidelines", "guideline range",
                               "federal sentencing", "upward variance",
                               "downward departure", "advisory guidelines"],
}


def classify_tags(text: str) -> list[str]:
    """Match keyword phrases from all concept categories against opinion text."""
    t = text.lower()
    return [tag for tag, kws in CONCEPT_TAGS.items() if any(kw.lower() in t for kw in kws)]


def summarize_via_ollama(text: str, practice_area: str) -> str:
    """Generate a 2-sentence focused summary via Ollama."""
    import requests
    prompt = (
        f"In 2 sentences describe this {practice_area} US court opinion: "
        f"(1) the legal issue, (2) the key ruling. Legal terminology only.\n\n"
        f"{text[:1200]}"
    )
    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": LLM_MODEL, "prompt": prompt, "stream": False,
                  "options": {"num_predict": 100, "temperature": 0.1}},
            timeout=25,
        )
        resp.raise_for_status()
        return resp.json().get("response", "").strip()
    except Exception:
        return ""


def ensure_collection(client, recreate: bool = False):
    from qdrant_client.models import Distance, VectorParams, PayloadSchemaType
    from qdrant_client.models import CreateFieldIndex

    existing = {c.name for c in client.get_collections().collections}
    if COLLECTION in existing:
        if recreate:
            client.delete_collection(COLLECTION)
            print(f"  Dropped existing '{COLLECTION}'.")
        else:
            print(f"  '{COLLECTION}' exists — upserting into it.")
            return

    client.create_collection(
        collection_name=COLLECTION,
        vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
    )
    # Payload indexes for fast filtering
    for field, ftype in [
        ("jurisdiction_level", "keyword"),
        ("practice_area",      "keyword"),
        ("source",             "keyword"),
        ("tags",               "keyword"),
        ("jurisdiction_state", "keyword"),
    ]:
        client.create_payload_index(COLLECTION, field, field_schema=ftype)

    print(f"  Created '{COLLECTION}' collection (768-dim cosine) + payload indexes.")


def main():
    parser = argparse.ArgumentParser(description="Index court_opinions into Qdrant")
    parser.add_argument("--limit",    type=int, help="Max opinions to index")
    parser.add_argument("--offset",   type=int, default=0)
    parser.add_argument("--recreate", action="store_true", help="Drop & recreate collection")
    parser.add_argument("--dry-run",  action="store_true")
    parser.add_argument("--summarize",action="store_true", help="Generate AI summaries (slow)")
    parser.add_argument("--batch",    type=int, default=100)
    args = parser.parse_args()

    import psycopg2
    from pgvector.psycopg2 import register_vector
    from qdrant_client import QdrantClient
    from qdrant_client.models import PointStruct

    conn = psycopg2.connect(**DB_CONFIG)
    register_vector(conn)
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM court_opinions WHERE embedding IS NOT NULL")
    total = cur.fetchone()[0]
    target = min(args.limit or total, total - args.offset)
    print(f"\n[index] PostgreSQL court_opinions with embeddings: {total}")
    print(f"[index] Indexing: {target}  (offset={args.offset})")

    if args.dry_run:
        print("[dry-run] Aborted before write.")
        conn.close()
        return

    qclient = QdrantClient(url=QDRANT_URL)
    ensure_collection(qclient, recreate=args.recreate)

    QUERY = """
        SELECT id, title, citation, court,
               jurisdiction_level, jurisdiction_state, circuit,
               case_date, practice_area, source, source_url, source_id,
               LEFT(opinion_text, 3000)  AS text_excerpt,
               summary, holding, embedding
        FROM court_opinions
        WHERE embedding IS NOT NULL
        ORDER BY id
        OFFSET %s LIMIT %s
    """

    fetched = indexed = 0
    offset = args.offset

    while fetched < target:
        batch_size = min(args.batch, target - fetched)
        cur.execute(QUERY, (offset + fetched, batch_size))
        rows = cur.fetchall()
        if not rows:
            break

        points = []
        for row in rows:
            (rid, title, citation, court, jlevel, jstate, circuit, case_date,
             practice_area, source, source_url, source_id,
             text_excerpt, summary, holding, embedding) = row

            tags = classify_tags(text_excerpt or "")
            # Add practice area as additional filterable tag
            if practice_area:
                pa_tag = practice_area.lower().replace(" ", "_")
                if pa_tag not in tags:
                    tags.append(pa_tag)

            # Optionally generate summary if missing
            if args.summarize and text_excerpt and len(text_excerpt) > 200 and not summary:
                summary = summarize_via_ollama(text_excerpt, practice_area or "legal")

            payload = {
                "pg_id":              str(rid),
                "title":              title or "",
                "citation":           citation or "",
                "court":              court or "US Supreme Court",
                "jurisdiction_level": jlevel or "supreme",
                "jurisdiction_state": jstate or "",
                "circuit":            circuit or "",
                "case_date":          str(case_date) if case_date else "",
                "practice_area":      practice_area or "",
                "source":             source or "",
                "source_url":         source_url or "",
                "source_id":          source_id or "",
                "summary":            summary or (text_excerpt or "")[:300],
                "holding":            holding or "",
                "tags":               tags,
                "concept_count":      len(tags),
                "text_excerpt":       (text_excerpt or "")[:500],
            }

            # Convert UUID → stable numeric Qdrant ID (MD5 → int)
            uid = int(hashlib.md5(str(rid).encode()).hexdigest()[:15], 16)
            vec = list(embedding) if embedding is not None else None
            if vec is None:
                continue
            points.append(PointStruct(id=uid, vector=vec, payload=payload))

        if points:
            qclient.upsert(collection_name=COLLECTION, points=points)
            indexed += len(points)

        fetched += len(rows)
        pct = 100 * indexed // target
        print(f"  {indexed}/{target} ({pct}%) indexed...", end="\r", flush=True)
        time.sleep(0.02)

    conn.close()
    print(f"\n[index] Done — {indexed} opinions in Qdrant '{COLLECTION}'")

    # ── Tag distribution summary ────────────────────────────────────────────────
    info = qclient.get_collection(COLLECTION)
    print(f"[index] Total points in collection: {info.points_count}")

    # Quick count by jurisdiction
    from qdrant_client.models import Filter, FieldCondition, MatchValue
    for level in ["supreme", "federal", "state"]:
        f = Filter(must=[FieldCondition(key="jurisdiction_level", match=MatchValue(value=level))])
        cnt = qclient.count(COLLECTION, count_filter=f).count
        if cnt:
            print(f"  jurisdiction={level}: {cnt}")

    print(f"\n[index] Qdrant collection searchable at {QDRANT_URL}/collections/{COLLECTION}")
    print("[index] Example: POST /collections/court_opinions/points/search")
    print("         { \"vector\": [...768 floats...], \"filter\": {\"must\":[{\"key\":\"tags\",\"match\":{\"value\":\"mens_rea\"}}]}, \"limit\": 10 }")


if __name__ == "__main__":
    main()
