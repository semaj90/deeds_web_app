#!/usr/bin/env python3
"""
ingest_court_opinions.py
------------------------
Ingest downloaded JSONL files of court opinions into the PostgreSQL
court_opinions table, generating 768-dim embeddings via Ollama.

Supports files downloaded by fetch_court_datasets.py as well as
raw HuggingFace dataset exports (casehold, pile-of-law subsets, etc.)

Usage:
  python scripts/ingest_court_opinions.py court_data/courtlistener__ca9.jsonl
  python scripts/ingest_court_opinions.py court_data/casehold__casehold__train.jsonl --source casehold
  python scripts/ingest_court_opinions.py court_data/doj_press_releases.jsonl --batch 20
  python scripts/ingest_court_opinions.py court_data/*.jsonl --dry-run

Options:
  --source     Override source field (default: inferred from filename)
  --batch      Embedding batch size (default: 10)
  --dry-run    Parse and count rows without inserting
  --limit      Max rows to ingest per file
  --no-embed   Skip embedding generation (insert text only)
  --clear      DELETE all rows from court_opinions before ingesting (use with care)

Requirements:
  pip install psycopg2-binary requests tqdm
  Ollama running at http://127.0.0.1:11434 with embeddinggemma:latest
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Optional

# ── DB connection ─────────────────────────────────────────────────────────────
DB_CONFIG = {
    "host":     os.environ.get("PGHOST",     "127.0.0.1"),
    "port":     int(os.environ.get("PGPORT", "5432")),
    "database": os.environ.get("PGDATABASE", "legal_ai_db"),
    "user":     os.environ.get("PGUSER",     "legal_admin"),
    "password": os.environ.get("PGPASSWORD", "123456"),
}

OLLAMA_URL    = os.environ.get("OLLAMA_URL",    "http://127.0.0.1:11434")
EMBED_MODEL   = os.environ.get("EMBED_MODEL",   "embeddinggemma:latest")
EMBED_FALLBACK = os.environ.get("EMBED_FALLBACK", "nomic-embed-text")
EMBED_DIMS    = 768

# ── Embedding helper ──────────────────────────────────────────────────────────

def get_embedding(texts: list[str], model: str = EMBED_MODEL) -> list[Optional[list[float]]]:
    """
    Call Ollama /api/embed for a batch of texts.
    Returns list of embedding vectors (or None on failure).
    """
    import requests
    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/embed",
            json={"model": model, "input": texts},
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("embeddings", [None] * len(texts))
    except Exception as e:
        print(f"\n  [embed] {model} failed: {e}", flush=True)
        if model != EMBED_FALLBACK:
            print(f"  [embed] Retrying with {EMBED_FALLBACK}...", flush=True)
            return get_embedding(texts, model=EMBED_FALLBACK)
        return [None] * len(texts)


def embed_text(text: str) -> Optional[list[float]]:
    """Generate a single embedding for up to 1024 chars of text."""
    if not text:
        return None
    truncated = text[:4096]   # ~1024 tokens
    results = get_embedding([truncated])
    return results[0] if results else None


# ── Row normalizers per source ─────────────────────────────────────────────────

def normalize_row(raw: dict, source_override: str = None) -> dict:
    """
    Normalize a raw JSONL row into the court_opinions insert dict.
    Handles the various shapes from different dataset sources.
    """
    source = source_override or raw.get("source", "unknown")

    # ── CaseHOLD ──────────────────────────────────────────────────────────────
    if source == "casehold" or "citing_context" in raw:
        return {
            "title":              raw.get("case_name", raw.get("title", "")),
            "citation":           raw.get("citation", ""),
            "docket_number":      raw.get("docket_number", ""),
            "court":              raw.get("court", ""),
            "jurisdiction_level": _infer_jurisdiction_level(raw.get("court", "")),
            "jurisdiction_state": _infer_state(raw.get("court", "")),
            "circuit":            _infer_circuit(raw.get("court", "")),
            "case_date":          raw.get("decision_date", raw.get("case_date")),
            "judges":             "",
            "opinion_text":       raw.get("citing_context", ""),
            "summary":            raw.get("citing_context", "")[:500],
            "holding":            raw.get("holdings", {}).get(str(raw.get("label", 0)), "") if isinstance(raw.get("holdings"), dict) else "",
            "practice_area":      None,
            "outcome":            None,
            "source":             "casehold",
            "source_url":         "",
            "source_id":          str(raw.get("example_id", raw.get("id", ""))),
        }

    # ── Pile of Law ────────────────────────────────────────────────────────────
    if source in ("pile-of-law", "pile_of_law") or "created_timestamp" in raw:
        raw_source = raw.get("meta", {}).get("title", "") if isinstance(raw.get("meta"), dict) else ""
        return {
            "title":              raw.get("title", raw_source),
            "citation":           "",
            "docket_number":      "",
            "court":              raw.get("meta", {}).get("court", "") if isinstance(raw.get("meta"), dict) else "",
            "jurisdiction_level": "federal",
            "jurisdiction_state": None,
            "circuit":            None,
            "case_date":          raw.get("created_timestamp", "")[:10] if raw.get("created_timestamp") else None,
            "judges":             "",
            "opinion_text":       raw.get("text", ""),
            "summary":            (raw.get("text") or "")[:500],
            "holding":            "",
            "practice_area":      None,
            "outcome":            None,
            "source":             "pile-of-law",
            "source_url":         "",
            "source_id":          "",
        }

    # ── LexGLUE SCOTUS ────────────────────────────────────────────────────────
    # Fields: text (full opinion), label (0-13 issue area int)
    _SCOTUS_ISSUE_AREAS = {
        0: "Criminal Procedure", 1: "Civil Rights", 2: "First Amendment",
        3: "Due Process", 4: "Privacy", 5: "Attorneys", 6: "Unions",
        7: "Economic Activity", 8: "Judicial Power", 9: "Federalism",
        10: "Interstate Relations", 11: "Federal Taxation",
        12: "Miscellaneous", 13: "Private Action",
    }
    if source in ("lex_glue", "lex_glue_scotus") or ("scotus" in source_override if source_override else False) or ("lex_glue" in str(raw.get("_file", ""))):
        label_int = raw.get("label", 12)
        practice = _SCOTUS_ISSUE_AREAS.get(int(label_int) if label_int is not None else 12, "Miscellaneous")
        text = raw.get("text", "")
        return {
            "title":              f"SCOTUS Opinion ({practice})",
            "citation":           "",
            "docket_number":      "",
            "court":              "US Supreme Court",
            "jurisdiction_level": "supreme",
            "jurisdiction_state": None,
            "circuit":            None,
            "case_date":          None,
            "judges":             "",
            "opinion_text":       text,
            "summary":            text[:600] if text else "",
            "holding":            "",
            "practice_area":      practice,
            "outcome":            None,
            "source":             "lex_glue_scotus",
            "source_url":         "",
            "source_id":          str(raw.get("_row_idx", "")),
        }

    # ── CourtListener / CAP / DOJ (already normalized by fetch script) ────────
    return {
        "title":              raw.get("title", ""),
        "citation":           raw.get("citation", ""),
        "docket_number":      raw.get("docket_number", ""),
        "court":              raw.get("court", ""),
        "jurisdiction_level": raw.get("jurisdiction_level", "federal"),
        "jurisdiction_state": raw.get("jurisdiction_state"),
        "circuit":            raw.get("circuit"),
        "case_date":          raw.get("case_date"),
        "judges":             raw.get("judges", ""),
        "opinion_text":       raw.get("opinion_text", ""),
        "summary":            raw.get("summary", ""),
        "holding":            raw.get("holding", ""),
        "practice_area":      raw.get("practice_area"),
        "outcome":            raw.get("outcome"),
        "source":             source,
        "source_url":         raw.get("source_url", ""),
        "source_id":          raw.get("source_id", ""),
    }


def _infer_jurisdiction_level(court: str) -> str:
    c = court.lower()
    if any(x in c for x in ["supreme court of the united states", "scotus", "u.s. supreme"]):
        return "supreme"
    if any(x in c for x in ["circuit", "district", "bankruptcy", "federal", "u.s. court"]):
        return "federal"
    if any(x in c for x in ["state", "superior", "appellate", "court of appeal", "county"]):
        return "state"
    return "federal"


_STATE_NAMES = [
    "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
    "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
    "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
    "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
    "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio",
    "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
    "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
    "Wisconsin","Wyoming",
]

def _infer_state(court: str) -> Optional[str]:
    for state in _STATE_NAMES:
        if state.lower() in court.lower():
            return state
    return None


def _infer_circuit(court: str) -> Optional[str]:
    m = re.search(r'(\d+(?:st|nd|rd|th)?\s+circuit|\bD\.?C\.?\s+Circuit\b|\bFederal\s+Circuit\b)', court, re.I)
    return m.group(0) if m else None


# ── Main ingestion loop ────────────────────────────────────────────────────────

INSERT_SQL = """
INSERT INTO court_opinions (
    title, citation, docket_number, court,
    jurisdiction_level, jurisdiction_state, circuit,
    case_date, judges, opinion_text, summary, holding,
    practice_area, outcome, source, source_url, source_id,
    embedding, metadata
) VALUES (
    %(title)s, %(citation)s, %(docket_number)s, %(court)s,
    %(jurisdiction_level)s, %(jurisdiction_state)s, %(circuit)s,
    %(case_date)s, %(judges)s, %(opinion_text)s, %(summary)s, %(holding)s,
    %(practice_area)s, %(outcome)s, %(source)s, %(source_url)s, %(source_id)s,
    %(embedding)s::vector, %(metadata)s::jsonb
)
ON CONFLICT DO NOTHING
"""


def ingest_file(filepath: str, source_override: str = None,
                batch_size: int = 10, limit: int = None,
                dry_run: bool = False, no_embed: bool = False,
                pg_conn=None) -> dict:

    from pgvector.psycopg2 import register_vector

    path = Path(filepath)
    if not path.exists():
        print(f"ERROR: File not found: {filepath}")
        return {"file": filepath, "inserted": 0, "errors": 0}

    # Auto-detect source from filename
    fname = path.stem.lower()
    if source_override:
        source = source_override
    elif "casehold" in fname:
        source = "casehold"
    elif "lex_glue" in fname or "lexglue" in fname:
        source = "lex_glue_scotus"
    elif "pile" in fname:
        source = "pile-of-law"
    elif "courtlistener" in fname:
        source = "courtlistener"
    elif "cap__" in fname:
        source = "cap"
    elif "doj" in fname:
        source = "doj"
    else:
        source = "unknown"

    print(f"\n[ingest] {path.name}  source={source}", flush=True)

    rows_buffer = []
    inserted = errors = skipped = 0
    count = 0

    cur = pg_conn.cursor() if pg_conn else None

    def flush_batch(batch):
        nonlocal inserted, errors
        if dry_run or no_embed:
            if not no_embed:
                return
        # Generate embeddings for the batch
        embed_inputs = []
        for row in batch:
            text = " ".join(filter(None, [row["title"], row["summary"] or row["opinion_text"][:300]]))
            embed_inputs.append(text)

        if no_embed or dry_run:
            embeddings = [None] * len(batch)
        else:
            embeddings = get_embedding(embed_inputs)

        for row, emb in zip(batch, embeddings):
            row["embedding"] = emb
            row["metadata"] = json.dumps({})
            # Coerce case_date to ISO format or None
            cd = row.get("case_date")
            if cd:
                try:
                    import re as _re
                    m = _re.search(r'\d{4}-\d{2}-\d{2}', str(cd))
                    row["case_date"] = m.group(0) if m else None
                except Exception:
                    row["case_date"] = None
            else:
                row["case_date"] = None
            try:
                if cur and not dry_run:
                    cur.execute(INSERT_SQL, row)
                    inserted += 1
            except Exception as e:
                errors += 1
                if errors <= 3:
                    print(f"\n  [error] {e}", flush=True)

        if cur and not dry_run:
            pg_conn.commit()

    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                raw = json.loads(line)
            except json.JSONDecodeError:
                skipped += 1
                continue

            raw["_row_idx"] = count  # provide stable per-file index for source_id
            row = normalize_row(raw, source_override=source)
            rows_buffer.append(row)
            count += 1

            if len(rows_buffer) >= batch_size:
                if dry_run:
                    pass  # count only
                else:
                    flush_batch(rows_buffer)
                rows_buffer = []

            if count % 100 == 0:
                print(f"  {count} rows processed, {inserted} inserted...", end="\r", flush=True)

            if limit and count >= limit:
                break

    if rows_buffer:
        if not dry_run:
            flush_batch(rows_buffer)

    print(f"\n[ingest] {path.name}: processed={count} inserted={inserted} errors={errors} skipped={skipped}")
    return {"file": filepath, "inserted": inserted, "errors": errors, "skipped": skipped}


def main():
    parser = argparse.ArgumentParser(description="Ingest downloaded court opinion JSONL files into PostgreSQL")
    parser.add_argument("files", nargs="+", help="JSONL files to ingest (supports glob with shell expansion)")
    parser.add_argument("--source", help="Override source field for all rows")
    parser.add_argument("--batch", type=int, default=10, help="Embedding batch size (default: 10)")
    parser.add_argument("--limit", type=int, help="Max rows per file")
    parser.add_argument("--dry-run", action="store_true", help="Parse and count without inserting")
    parser.add_argument("--no-embed", action="store_true", help="Insert without generating embeddings")
    parser.add_argument("--clear", action="store_true",
                        help="DANGER: DELETE all rows from court_opinions before ingesting")
    args = parser.parse_args()

    if args.dry_run:
        print("[dry-run mode] No data will be inserted.")
        for f in args.files:
            ingest_file(f, source_override=args.source, batch_size=args.batch,
                        limit=args.limit, dry_run=True, no_embed=True)
        return

    try:
        import psycopg2
        try:
            from pgvector.psycopg2 import register_vector
        except ImportError:
            print("WARNING: pgvector package not installed. Embeddings will be stored as text.")
            print("  pip install pgvector")
            register_vector = None
    except ImportError:
        print("ERROR: Install psycopg2-binary:\n  pip install psycopg2-binary")
        sys.exit(1)

    conn = psycopg2.connect(**DB_CONFIG)
    if register_vector:
        register_vector(conn)

    if args.clear:
        confirm = input("DANGER: Delete ALL rows from court_opinions? Type YES to confirm: ")
        if confirm.strip() == "YES":
            with conn.cursor() as c:
                c.execute("DELETE FROM court_opinions")
            conn.commit()
            print("court_opinions table cleared.")
        else:
            print("Aborted.")
            conn.close()
            return

    totals = {"inserted": 0, "errors": 0}
    for filepath in args.files:
        result = ingest_file(
            filepath,
            source_override=args.source,
            batch_size=args.batch,
            limit=args.limit,
            dry_run=args.dry_run,
            no_embed=args.no_embed,
            pg_conn=conn,
        )
        totals["inserted"] += result["inserted"]
        totals["errors"]   += result["errors"]

    conn.close()
    print(f"\n=== INGEST COMPLETE ===  total inserted: {totals['inserted']}  errors: {totals['errors']}")


if __name__ == "__main__":
    main()
