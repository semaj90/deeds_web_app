#!/usr/bin/env python3
"""
Stage 2: Lexical Layer Extraction (BM25)

Purpose: Extract deterministic lexical features from source files using BM25.

Output: lexical_terms (JSONB array of key terms with scores)
  Format: [
    { "term": "functionName", "freq": 5, "score": 0.82, "type": "identifier" },
    { "term": "path/to/file", "freq": 2, "score": 0.45, "type": "path" },
    ...
  ]

Features extracted:
  - Identifiers (function/variable/class names)
  - File paths and directories
  - Error codes and API names
  - Symbol names (exports, imports)
  - Comments (non-obvious terms)

Coverage Target: ~85% of packets (deterministic, CPU-bound)
Estimated Time: 15-30 minutes

Dependencies:
  - rank_bm25 (pip install rank_bm25)
  - psycopg3 (for Postgres writes)
  - nltk or spacy (optional, for better tokenization)
"""

import json
import os
import sys
import re
import hashlib
import asyncio
from pathlib import Path
from typing import Optional, Dict, List, Any, Tuple
import logging
from collections import Counter

# Database
import psycopg

# BM25 scoring
from rank_bm25 import BM25Okapi

# ============================================================================
# Setup
# ============================================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)

# Config
DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = int(os.getenv('DB_PORT', '5434'))
DB_USER = os.getenv('DB_USER', 'legal_admin')
DB_PASSWORD = os.getenv('DB_PASSWORD', 'postgres')
DB_NAME = os.getenv('DB_NAME', 'legal_ai_db')

REPO_ROOT = Path(__file__).parent.parent.parent.parent

# Stopwords (common terms to exclude)
STOPWORDS = {
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'are', 'be', 'was', 'were',
    'function', 'class', 'interface', 'const', 'let', 'var', 'import', 'export',
    'default', 'async', 'await', 'return', 'if', 'else', 'while', 'for',
    'try', 'catch', 'throw', 'new', 'this', 'super', 'static', 'public',
    'private', 'protected', 'readonly', 'extends', 'implements', 'null',
    'undefined', 'true', 'false', 'get', 'set', 'constructor', 'require'
}

# ============================================================================
# Tokenization
# ============================================================================

def tokenize_content(content: str) -> List[str]:
    """
    Tokenize source code content into meaningful terms.

    Strategies:
      1. Identifier extraction (camelCase, snake_case, PascalCase)
      2. File path components (split by / and .)
      3. Error codes and constants (UPPERCASE_PATTERN)
      4. API names and route segments
      5. Remove stopwords and short terms (<3 chars)
    """
    tokens = []

    # Extract identifiers (camelCase, snake_case, PascalCase)
    identifier_pattern = r'\b[a-zA-Z_$][a-zA-Z0-9_$]*\b'
    identifiers = re.findall(identifier_pattern, content)
    tokens.extend(identifiers)

    # Extract file paths
    path_pattern = r'[\'"]([a-zA-Z0-9_\-./]+)[\'"]'
    paths = re.findall(path_pattern, content)
    for path in paths:
        path_parts = re.split(r'[/\-._]', path)
        tokens.extend([p for p in path_parts if len(p) >= 2])

    # Extract uppercase constants (ERROR_CODES, CONSTANTS)
    const_pattern = r'\b[A-Z][A-Z0-9_]*\b'
    constants = re.findall(const_pattern, content)
    tokens.extend([c for c in constants if len(c) >= 3])

    # Extract from comments (non-obvious terms)
    comment_pattern = r'//.*?$|/\*.*?\*/'
    comments = re.findall(comment_pattern, content, re.MULTILINE | re.DOTALL)
    for comment in comments:
        comment_tokens = re.findall(identifier_pattern, comment)
        tokens.extend(comment_tokens)

    # Filter: remove stopwords, short terms, duplicates
    tokens = [
        t.lower() for t in tokens
        if len(t) >= 3 and t.lower() not in STOPWORDS
    ]

    # Remove duplicates while preserving order
    seen = set()
    unique_tokens = []
    for t in tokens:
        if t not in seen:
            seen.add(t)
            unique_tokens.append(t)

    return unique_tokens


def extract_lexical_terms(packet: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
    """
    Extract lexical terms from a packet using BM25 scoring.

    Returns: [
      { "term": "functionName", "freq": 5, "score": 0.82, "type": "identifier" }
    ]
    """
    source_ref = packet.get('source_ref')
    if not source_ref:
        return None

    # Read file content
    file_path = REPO_ROOT / source_ref
    if not file_path.exists():
        return None

    try:
        content = file_path.read_text(encoding='utf-8', errors='ignore')
    except Exception as e:
        logger.warning(f"Failed to read {source_ref}: {e}")
        return None

    # Tokenize
    tokens = tokenize_content(content)
    if not tokens:
        return None

    # Count frequency
    freq_counter = Counter(tokens)

    # BM25 scoring (corpus is just this document, for now)
    # In production, you'd use a larger corpus for better IDF weighting
    bm25 = BM25Okapi([tokens])
    scores = {}
    for token in set(tokens):
        score = bm25.get_scores([token])[0]
        scores[token] = score

    # Build output
    lexical_terms = []
    for term, freq in freq_counter.most_common(50):  # Top 50 terms
        lexical_terms.append({
            'term': term,
            'freq': freq,
            'score': round(scores.get(term, 0.0), 4),
            'type': 'identifier'  # Could be refined: path, constant, etc.
        })

    return lexical_terms if lexical_terms else None


# ============================================================================
# Database Operations
# ============================================================================

async def write_lexical_terms(conn, packet_id: str, terms: List[Dict[str, Any]]) -> bool:
    """
    Write lexical_terms to Postgres.

    Updates: atlas_packets.metadata['lexical_features'] = terms JSONB
    """
    try:
        await conn.execute("""
            UPDATE atlas_packets
            SET metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{lexical_features}',
              $2::jsonb
            ),
            updated_at = NOW()
            WHERE packet_id = $1
        """, packet_id, json.dumps(terms))
        return True
    except Exception as e:
        logger.error(f"Failed to write lexical terms for {packet_id}: {e}")
        return False


async def get_eligible_packets(conn, limit: int = 1000) -> List[Dict[str, Any]]:
    """
    Get packets eligible for lexical extraction.

    Criteria:
      - source_ref is not null
      - metadata['lexical_features'] is null or empty
      - Prefer code files
    """
    rows = await conn.fetch("""
        SELECT packet_id, packet_key, source_ref
        FROM atlas_packets
        WHERE
          source_ref IS NOT NULL
          AND (metadata->'lexical_features' IS NULL OR jsonb_array_length(metadata->'lexical_features') = 0)
          AND (source_ref LIKE '%.ts' OR source_ref LIKE '%.tsx'
               OR source_ref LIKE '%.js' OR source_ref LIKE '%.jsx'
               OR source_ref LIKE '%.py' OR source_ref LIKE '%.go'
               OR source_ref LIKE '%.rs' OR source_ref LIKE '%.md')
        LIMIT $1
    """, limit)

    return [dict(row) for row in rows]


# ============================================================================
# Main Worker
# ============================================================================

async def process_batch(conn, batch_size: int = 100, dry_run: bool = False):
    """
    Process one batch of packets.

    Returns: (success_count, skip_count, error_count)
    """
    packets = await get_eligible_packets(conn, limit=batch_size)

    if not packets:
        logger.info("No eligible packets found")
        return 0, 0, 0

    logger.info(f"Processing {len(packets)} packets")

    success_count = 0
    skip_count = 0
    error_count = 0

    for i, packet in enumerate(packets, 1):
        packet_id = packet['packet_id']
        source_ref = packet['source_ref']

        try:
            # Extract lexical terms
            terms = extract_lexical_terms(packet)

            if terms is None:
                logger.debug(f"[{i}/{len(packets)}] {source_ref}: no terms extracted")
                skip_count += 1
                continue

            logger.info(f"[{i}/{len(packets)}] {source_ref}: {len(terms)} terms")

            # Write to Postgres
            if not dry_run:
                success = await write_lexical_terms(conn, packet_id, terms)
                if success:
                    success_count += 1
                else:
                    error_count += 1
            else:
                success_count += 1
                logger.debug(f"  [DRY-RUN] Would write {len(terms)} terms")

        except Exception as e:
            logger.error(f"[{i}/{len(packets)}] {source_ref}: {e}")
            error_count += 1

    return success_count, skip_count, error_count


async def main():
    """
    Main entry point.

    Usage:
      python stage2-lexical-extract.py [--dry-run] [--batch=100] [--limit=1000]
    """
    import argparse

    parser = argparse.ArgumentParser(description="Stage 2: Lexical Extraction (BM25)")
    parser.add_argument('--dry-run', action='store_true', help='Dry-run mode (no writes)')
    parser.add_argument('--batch', type=int, default=100, help='Batch size')
    parser.add_argument('--limit', type=int, default=1000, help='Max packets to process')
    parser.add_argument('--verbose', action='store_true', help='Verbose logging')

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    logger.info(f"Stage 2: Lexical Extraction {'(DRY-RUN)' if args.dry_run else ''}")
    logger.info(f"Batch size: {args.batch}, Limit: {args.limit}\n")

    # Connect to database
    try:
        conn = await psycopg.AsyncConnection.connect(
            f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
        )
        logger.info("✓ Connected to Postgres\n")
    except Exception as e:
        logger.error(f"Failed to connect to Postgres: {e}")
        sys.exit(2)

    try:
        # Process batches
        total_success = 0
        total_skip = 0
        total_error = 0
        batches = 0

        while total_success + total_skip < args.limit:
            success, skip, error = await process_batch(
                conn,
                batch_size=args.batch,
                dry_run=args.dry_run
            )

            total_success += success
            total_skip += skip
            total_error += error
            batches += 1

            if success + skip + error < args.batch:
                break  # No more packets available

        # Summary
        logger.info('\n' + '='*60)
        logger.info('STAGE 2 SUMMARY\n')
        logger.info(f'  Batches processed:  {batches}')
        logger.info(f'  Success:            {total_success}')
        logger.info(f'  Skipped:            {total_skip}')
        logger.info(f'  Errors:             {total_error}')
        if total_success + total_skip > 0:
            logger.info(f'  Coverage:           {((total_success / (total_success + total_skip)) * 100):.1f}%')
        logger.info('='*60 + '\n')

        sys.exit(0 if total_error == 0 else 1)

    finally:
        await conn.close()


if __name__ == '__main__':
    asyncio.run(main())
