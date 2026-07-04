#!/usr/bin/env python3
"""
Phase 8 Step 3 — LangExtract Entity Enrichment

Reads atlas_packets summaries from Postgres, runs Google's langextract library
against each summary, writes extracted entities back to atlas_packets.metadata
and the derived_enrichment.langextract_entities table (if it exists).

Usage:
  python scripts/atlas/phase8-step3-langextract-entities.py [options]

Options:
  --dry-run          Print entities but do NOT write to Postgres (default)
  --apply            Write extracted entities to Postgres
  --limit N          Max packets to process (default: 50)
  --batch-size N     Packets per commit batch (default: 10)
  --passes N         LangExtract extraction passes per packet (default: 1)
  --model MODEL      Ollama model to use (default: gemma4-rotorquant:latest)
  --skip-empty       Skip packets with no summary (default: True)
  --verbose          Log each entity as it is extracted

Requirements:
  - Python 3.10+ in .venv (pip install langextract psycopg2-binary python-dotenv)
  - Postgres running on port 5434 (docker start legal-ai-postgres)
  - Ollama running on port 11434 with gemma4-rotorquant:latest

Postgres writes:
  - atlas_packets.metadata['langextract_entities'] = [{ class, text, attributes }, ...]
  - atlas_packets.metadata['langextract_ran_at'] = ISO timestamp
  - atlas_packets.updated_at = NOW()
"""

import os
import sys
import json
import time
import argparse
import hashlib
import textwrap
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ── Dotenv (optional) ──────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    _env_path = Path(__file__).resolve().parent.parent.parent / '.env.local'
    if _env_path.exists():
        load_dotenv(_env_path)
    else:
        _env_path2 = Path(__file__).resolve().parent.parent.parent / 'sveltekit-frontend' / '.env.local'
        if _env_path2.exists():
            load_dotenv(_env_path2)
except ImportError:
    pass

# ── Postgres ───────────────────────────────────────────────────────────────────
try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print('[step3] ERROR: psycopg2 not installed. Run: pip install psycopg2-binary')
    sys.exit(1)

# ── LangExtract ────────────────────────────────────────────────────────────────
try:
    import langextract
    from langextract import data as lx_data
    from langextract import extract as lx_extract
except ImportError:
    print('[step3] ERROR: langextract not installed. Run: pip install langextract')
    sys.exit(1)

# ── Config ─────────────────────────────────────────────────────────────────────
PG_HOST     = os.getenv('PGHOST',     '127.0.0.1')
PG_PORT     = int(os.getenv('PGPORT',     '5434'))
PG_DB       = os.getenv('PGDATABASE', 'legal_ai_db')
PG_USER     = os.getenv('PGUSER',     'legal_admin')
PG_PASS     = os.getenv('PGPASSWORD', os.getenv('DB_PASSWORD', '123456'))

# llama-server OpenAI-compatible endpoint.
# Default to the canonical 8090 summary lane.
# Override only with LANGEXTRACT_GEMMA4_URL so shared GEMMA4_URL envs do not
# accidentally redirect this step to the benchmark lane.
LLAMA_URL   = os.getenv('LANGEXTRACT_GEMMA4_URL', 'http://127.0.0.1:8090').rstrip('/')
DEFAULT_MODEL = os.getenv('LANGEXTRACT_MODEL', 'gemma4-legal-iq4xs-direct.gguf')

# ── Legal extraction prompt ────────────────────────────────────────────────────
LEGAL_PROMPT = textwrap.dedent("""\
    Extract legal and technical entities from this document in order of appearance.
    Use exact text — do not paraphrase or normalize.

    Entity types:
    - PARTY: Named parties, persons, corporations, organizations
    - DATE: All dates, deadlines, timestamps
    - CITATION: Legal case citations, statute references
    - MONEY: Dollar amounts, values, damages
    - STATUTE: Laws, codes, regulations, sections
    - CONCEPT: Key legal or technical concepts, defined terms
    - LOCATION: Courts, jurisdictions, addresses
    - FUNCTION: Code functions, API endpoints, module names
""")

LEGAL_EXAMPLES = [
    lx_data.ExampleData(
        text=(
            "On January 15, 2024, Plaintiff ACME Corp filed in the Superior Court of California, "
            "seeking $500,000 under Cal. Civ. Code § 3294. The validateSession() function "
            "is core to the authentication flow."
        ),
        extractions=[
            lx_data.Extraction(extraction_class="DATE",     extraction_text="January 15, 2024",            attributes={"type": "filing_date"}),
            lx_data.Extraction(extraction_class="PARTY",    extraction_text="ACME Corp",                   attributes={"role": "plaintiff"}),
            lx_data.Extraction(extraction_class="LOCATION", extraction_text="Superior Court of California", attributes={"type": "court"}),
            lx_data.Extraction(extraction_class="MONEY",    extraction_text="$500,000",                    attributes={"type": "damages"}),
            lx_data.Extraction(extraction_class="STATUTE",  extraction_text="Cal. Civ. Code § 3294",       attributes={"jurisdiction": "California"}),
            lx_data.Extraction(extraction_class="FUNCTION", extraction_text="validateSession()",            attributes={"type": "function"}),
        ]
    )
]


def connect_pg():
    return psycopg2.connect(
        host=PG_HOST, port=PG_PORT, dbname=PG_DB,
        user=PG_USER, password=PG_PASS,
        cursor_factory=psycopg2.extras.RealDictCursor,
        connect_timeout=10,
    )


def _parse_json_permissive(text: str) -> list:
    """Parse JSON that may be an array, a single object, or concatenated objects/arrays."""
    import re
    text = text.strip()
    # Try straight parse first
    try:
        result = json.loads(text)
        if isinstance(result, list):
            return result
        if isinstance(result, dict):
            return result.get('entities', result.get('extractions', result.get('items', [result])))
        return []
    except json.JSONDecodeError:
        pass

    # Try extracting all JSON objects/arrays via regex
    items = []
    for match in re.finditer(r'\{[^{}]*\}|\[[^\[\]]*\]', text):
        try:
            obj = json.loads(match.group())
            if isinstance(obj, dict):
                items.append(obj)
            elif isinstance(obj, list):
                items.extend(obj)
        except Exception:
            pass
    return items


def run_langextract(text: str, model: str, passes: int, verbose: bool) -> list[dict]:
    """
    Extract entities via llama-server OpenAI-compatible endpoint.
    Sends a structured JSON extraction prompt and parses the response.
    Returns list of {extraction_class, extraction_text, attributes} dicts.
    """
    import re
    import urllib.request

    system_prompt = (
        "You are a precise legal entity extractor. "
        "Extract entities from the text and return ONLY a JSON array. "
        "No explanation, no markdown fences, just the raw JSON array.\n\n"
        "Each item: {\"class\": \"TYPE\", \"text\": \"exact text\", \"attr\": {}}\n\n"
        "Types: PARTY, DATE, CITATION, MONEY, STATUTE, CONCEPT, LOCATION, FUNCTION\n\n"
        "Example input: 'On Jan 5 2024 ACME Corp filed under Cal. Civ. Code §3294'\n"
        "Example output: [{\"class\":\"DATE\",\"text\":\"Jan 5 2024\",\"attr\":{}},{\"class\":\"PARTY\",\"text\":\"ACME Corp\",\"attr\":{}},{\"class\":\"STATUTE\",\"text\":\"Cal. Civ. Code §3294\",\"attr\":{}}]"
    )

    user_prompt = f"Extract entities from this text:\n\n{text[:2000]}"

    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        "temperature": 0.1,
        "max_tokens":  512,
        "stream":      False,
    }).encode('utf-8')

    try:
        req = urllib.request.Request(
            f'{LLAMA_URL}/v1/chat/completions',
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())

        content = data['choices'][0]['message']['content'].strip()

        # Strip markdown fences if present
        content = re.sub(r'^```(?:json)?\s*', '', content)
        content = re.sub(r'\s*```$', '', content)
        content = content.strip()

        # Handle concatenated JSON objects or arrays from the model
        raw = _parse_json_permissive(content)

        entities = []
        for item in raw:
            cls  = item.get('class') or item.get('extraction_class', '')
            text_val = item.get('text') or item.get('extraction_text', '')
            attr = item.get('attr') or item.get('attributes', {})
            if cls and text_val:
                entities.append({'extraction_class': cls, 'extraction_text': text_val, 'attributes': attr})
                if verbose:
                    print(f'    [{cls}] {text_val!r}')
        return entities

    except Exception as e:
        print(f'  [step3] extraction error: {e}')
        return []


def main():
    parser = argparse.ArgumentParser(description='Phase 8 Step 3 — LangExtract Entity Enrichment')
    parser.add_argument('--dry-run',    action='store_true', default=True, help='Do not write (default)')
    parser.add_argument('--apply',      action='store_true',               help='Write to Postgres')
    parser.add_argument('--limit',      type=int,  default=50,             help='Max packets (default 50)')
    parser.add_argument('--batch-size', type=int,  default=10,             help='Commit batch size (default 10)')
    parser.add_argument('--passes',     type=int,  default=1,              help='LangExtract passes (default 1)')
    parser.add_argument('--model',      type=str,  default=DEFAULT_MODEL,  help='Ollama model')
    parser.add_argument('--verbose',    action='store_true',               help='Log each entity')
    args = parser.parse_args()

    dry_run = not args.apply
    if args.apply:
        dry_run = False

    print(f'[step3] Phase 8 Step 3 — LangExtract Entity Enrichment')
    print(f'[step3] dry_run={dry_run}  limit={args.limit}  passes={args.passes}  model={args.model}')
    print(f'[step3] Postgres:     {PG_USER}@{PG_HOST}:{PG_PORT}/{PG_DB}')
    print(f'[step3] llama-server: {LLAMA_URL}')

    # ── Connect ────────────────────────────────────────────────────────────────
    try:
        conn = connect_pg()
        cur = conn.cursor()
        print('[step3] Postgres connected')
    except Exception as e:
        print(f'[step3] FATAL: Cannot connect to Postgres: {e}')
        sys.exit(1)

    # ── Load packets that have summaries but no langextract entities yet ───────
    # atlas_summary_layers has no is_canonical column — use DISTINCT ON + latest
    cur.execute("""
        SELECT
            ap.packet_id,
            ap.packet_key,
            ap.source_ref,
            ap.feature_id,
            COALESCE(asl.summary, asl.summary_text, ap.summary) AS summary,
            ap.metadata
        FROM atlas_packets ap
        LEFT JOIN LATERAL (
            SELECT summary, summary_text
            FROM atlas_summary_layers
            WHERE packet_key = ap.packet_key
              AND layer_type = 'gemma4_summary'
              AND (summary IS NOT NULL OR summary_text IS NOT NULL)
            ORDER BY created_at DESC NULLS LAST
            LIMIT 1
        ) asl ON true
        WHERE ap.packet_key IS NOT NULL
          AND ap.feature_id  IS NOT NULL
          AND (
              COALESCE(asl.summary, asl.summary_text, ap.summary) IS NOT NULL
              AND LENGTH(COALESCE(asl.summary, asl.summary_text, ap.summary)) > 30
          )
          AND (
              ap.metadata IS NULL
              OR ap.metadata->>'langextract_ran_at' IS NULL
          )
        ORDER BY
            CASE WHEN ap.page_rank_score IS NOT NULL THEN 0 ELSE 1 END,
            ap.packet_id
        LIMIT %s
    """, (args.limit,))

    rows = cur.fetchall()
    print(f'[step3] Loaded {len(rows)} packets with summaries (no langextract yet)')

    if not rows:
        print('[step3] Nothing to do. All summaries already have langextract entities.')
        cur.close()
        conn.close()
        return

    # ── Process ────────────────────────────────────────────────────────────────
    processed = 0
    skipped   = 0
    total_entities = 0
    errors    = []
    batch     = []

    for row in rows:
        packet_key  = row['packet_key']
        summary     = (row['summary'] or '').strip()
        metadata    = row['metadata'] or {}

        if not summary:
            skipped += 1
            continue

        if args.verbose:
            print(f'\n[step3] {packet_key} ({len(summary)} chars)')

        t0 = time.time()
        entities = run_langextract(
            text=summary,
            model=args.model,
            passes=args.passes,
            verbose=args.verbose,
        )
        elapsed = time.time() - t0

        if not args.verbose:
            print(f'  {packet_key}: {len(entities)} entities in {elapsed:.1f}s')

        total_entities += len(entities)
        processed += 1

        if dry_run:
            continue

        # Merge into existing metadata
        metadata['langextract_entities'] = entities
        metadata['langextract_ran_at']   = datetime.now(timezone.utc).isoformat()
        metadata['langextract_model']    = args.model
        metadata['langextract_passes']   = args.passes

        batch.append((json.dumps(metadata), packet_key))

        if len(batch) >= args.batch_size:
            _flush_batch(cur, conn, batch, errors)
            batch = []

    # flush remainder
    if batch and not dry_run:
        _flush_batch(cur, conn, batch, errors)

    # ── Summary ────────────────────────────────────────────────────────────────
    print(f'\n[step3] Done.')
    print(f'[step3] Processed: {processed}  Skipped: {skipped}  Total entities: {total_entities}')
    if not dry_run:
        print(f'[step3] Postgres updated: {processed - len(errors)}')
    if errors:
        print(f'[step3] Errors ({len(errors)}):')
        for e in errors[:5]:
            print(f'  {e}')

    cur.close()
    conn.close()


def _flush_batch(cur, conn, batch: list[tuple], errors: list):
    """Batch-update atlas_packets.metadata for a list of (metadata_json, packet_key)."""
    for metadata_json, packet_key in batch:
        try:
            cur.execute("""
                UPDATE atlas_packets
                SET metadata   = %s::jsonb,
                    updated_at = NOW()
                WHERE packet_key = %s
            """, (metadata_json, packet_key))
        except Exception as e:
            errors.append(f'{packet_key}: {e}')
            conn.rollback()
            continue
    try:
        conn.commit()
    except Exception as e:
        errors.append(f'commit error: {e}')
        conn.rollback()


if __name__ == '__main__':
    main()
