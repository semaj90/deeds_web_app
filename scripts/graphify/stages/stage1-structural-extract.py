#!/usr/bin/env python3
"""
Stage 1: Structural Extraction (AST Symbols)

Purpose: Extract canonical AST symbols from source files using:
  - ast-grep (Rust, for code patterns)
  - TypeScript Compiler API (for TS/JS files)
  - Tree-sitter (fallback, if available)

Output: tree_node_ids JSONB for each packet
  Format: [
    {
      "kind": "function" | "class" | "interface" | "import" | "export" | "route" | "schema" | "test",
      "name": "functionName",
      "start_line": 42,
      "end_line": 99,
      "hash": "sha256..."
    }
  ]

Coverage Target: ~80% of eligible packets (deterministic, no GPU)
Estimated Time: 20-40 minutes

Dependencies:
  - ast-grep (must be installed: cargo install ast-grep)
  - Node.js (for TypeScript Compiler API)
  - psycopg3 (for Postgres writes)
  - rank_bm25 (for tokenization reference)
"""

import json
import subprocess
import hashlib
import os
import sys
from pathlib import Path
from typing import Optional, Dict, List, Any
import logging
import asyncio
from datetime import datetime

# Database
import psycopg

# Tokenization reference (for validation)
from rank_bm25 import BM25Okapi

# ============================================================================
# Setup
# ============================================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)

# Config from environment
DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = int(os.getenv('DB_PORT', '5434'))
DB_USER = os.getenv('DB_USER', 'legal_admin')
DB_PASSWORD = os.getenv('DB_PASSWORD', 'postgres')
DB_NAME = os.getenv('DB_NAME', 'legal_ai_db')

REPO_ROOT = Path(__file__).parent.parent.parent.parent

# ============================================================================
# AST Extraction via ast-grep
# ============================================================================

async def extract_ast_grep(file_path: str, content: str) -> Optional[List[Dict[str, Any]]]:
    """
    Extract AST symbols using ast-grep.

    Queries:
      - Functions: `function $NAME(...) { ... }`
      - Classes: `class $NAME { ... }`
      - Interfaces: `interface $NAME { ... }`
      - Imports: `import { ... } from ...`
      - Exports: `export ...`
    """
    if not Path(file_path).exists():
        return None

    try:
        # ast-grep pattern for function definitions
        result = subprocess.run(
            ['ast-grep', 'scan', '--pattern', 'function $_($$$)', file_path],
            capture_output=True,
            text=True,
            timeout=5
        )

        if result.returncode != 0:
            logger.debug(f"ast-grep returned {result.returncode} for {file_path}")
            return None

        symbols = []
        lines = result.stdout.strip().split('\n')

        for line in lines:
            if not line:
                continue

            try:
                match = json.loads(line)
                if 'text' in match and 'line' in match:
                    # Extract function name from text
                    text = match['text']
                    if 'function' in text:
                        # Simple regex: function <name>
                        parts = text.split('(')[0].replace('function', '').strip()
                        name = parts.split()[-1] if parts else '?'

                        symbols.append({
                            'kind': 'function',
                            'name': name,
                            'start_line': match['line'],
                            'end_line': match.get('end_line', match['line']),
                            'hash': hashlib.sha256(text.encode()).hexdigest()[:12]
                        })
            except (json.JSONDecodeError, KeyError):
                pass

        return symbols if symbols else None

    except FileNotFoundError:
        logger.debug("ast-grep not found, skipping")
        return None
    except subprocess.TimeoutExpired:
        logger.warning(f"ast-grep timeout on {file_path}")
        return None
    except Exception as e:
        logger.warning(f"ast-grep error on {file_path}: {e}")
        return None


async def extract_typescript_compiler(file_path: str, content: str) -> Optional[List[Dict[str, Any]]]:
    """
    Extract AST symbols using TypeScript Compiler API (via Node subprocess).

    Queries:
      - Functions, classes, interfaces, imports, exports
      - Type definitions, interfaces, enums
    """
    if not file_path.endswith(('.ts', '.tsx', '.js', '.jsx')):
        return None

    try:
        # Create a Node.js script to run TypeScript Compiler API
        ts_extractor = REPO_ROOT / 'scripts' / 'graphify' / 'lib' / 'ts-ast-extractor.mjs'

        if not ts_extractor.exists():
            logger.debug("TypeScript extractor not found, skipping")
            return None

        result = subprocess.run(
            ['node', str(ts_extractor), file_path],
            capture_output=True,
            text=True,
            timeout=10,
            cwd=str(REPO_ROOT / 'sveltekit-frontend')
        )

        if result.returncode != 0:
            logger.debug(f"TypeScript extractor returned {result.returncode} for {file_path}")
            return None

        try:
            symbols = json.loads(result.stdout)
            return symbols if symbols else None
        except json.JSONDecodeError:
            logger.debug(f"Failed to parse TypeScript extractor output for {file_path}")
            return None

    except FileNotFoundError:
        logger.debug("Node.js not found")
        return None
    except subprocess.TimeoutExpired:
        logger.warning(f"TypeScript extractor timeout on {file_path}")
        return None
    except Exception as e:
        logger.warning(f"TypeScript extractor error on {file_path}: {e}")
        return None


async def extract_ast_symbols(packet: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
    """
    Extract AST symbols from a packet.

    Priority:
      1. TypeScript Compiler API (most accurate for TS/JS)
      2. ast-grep (fast, pattern-based)
      3. Return None if no content or file not available
    """
    source_ref = packet.get('source_ref')
    if not source_ref:
        return None

    # Construct file path
    file_path = REPO_ROOT / source_ref
    if not file_path.exists():
        logger.debug(f"File not found: {source_ref}")
        return None

    try:
        content = file_path.read_text(encoding='utf-8')
    except Exception as e:
        logger.warning(f"Failed to read {source_ref}: {e}")
        return None

    # Try TypeScript Compiler first (most accurate)
    symbols = await extract_typescript_compiler(str(file_path), content)
    if symbols:
        return symbols

    # Fallback to ast-grep
    symbols = await extract_ast_grep(str(file_path), content)
    if symbols:
        return symbols

    return None


# ============================================================================
# Database Operations
# ============================================================================

async def write_ast_symbols(conn, packet_id: str, symbols: List[Dict[str, Any]]) -> bool:
    """
    Write tree_node_ids (AST symbols) to Postgres.

    Updates: atlas_packets.payload['tree_node_ids'] = symbols JSONB
    """
    try:
        await conn.execute("""
            UPDATE atlas_packets
            SET payload = jsonb_set(
              COALESCE(payload, '{}'::jsonb),
              '{tree_node_ids}',
              $2::jsonb
            ),
            updated_at = NOW()
            WHERE packet_id = $1
        """, packet_id, json.dumps(symbols))
        return True
    except Exception as e:
        logger.error(f"Failed to write AST symbols for {packet_id}: {e}")
        return False


async def get_eligible_packets(conn, limit: int = 1000) -> List[Dict[str, Any]]:
    """
    Get packets eligible for structural extraction.

    Criteria:
      - source_ref is not null (must be a file)
      - tree_node_ids is null or empty (not yet extracted)
      - Prefer code files (.ts, .tsx, .js, .jsx, .py, .go, .rs)
    """
    rows = await conn.fetch("""
        SELECT packet_id, packet_key, source_ref, sha256
        FROM atlas_packets
        WHERE
          source_ref IS NOT NULL
          AND (payload->'tree_node_ids' IS NULL OR jsonb_array_length(payload->'tree_node_ids') = 0)
          AND (source_ref LIKE '%.ts' OR source_ref LIKE '%.tsx'
               OR source_ref LIKE '%.js' OR source_ref LIKE '%.jsx'
               OR source_ref LIKE '%.py' OR source_ref LIKE '%.go'
               OR source_ref LIKE '%.rs')
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
            # Extract AST symbols
            symbols = await extract_ast_symbols(packet)

            if symbols is None:
                logger.debug(f"[{i}/{len(packets)}] {source_ref}: no symbols extracted")
                skip_count += 1
                continue

            logger.info(f"[{i}/{len(packets)}] {source_ref}: {len(symbols)} symbols")

            # Write to Postgres
            if not dry_run:
                success = await write_ast_symbols(conn, packet_id, symbols)
                if success:
                    success_count += 1
                else:
                    error_count += 1
            else:
                success_count += 1
                logger.debug(f"  [DRY-RUN] Would write {len(symbols)} symbols")

        except Exception as e:
            logger.error(f"[{i}/{len(packets)}] {source_ref}: {e}")
            error_count += 1

    return success_count, skip_count, error_count


async def main():
    """
    Main entry point.

    Usage:
      python stage1-structural-extract.py [--dry-run] [--batch=100] [--limit=1000]
    """
    import argparse

    parser = argparse.ArgumentParser(description="Stage 1: Structural Extraction (AST)")
    parser.add_argument('--dry-run', action='store_true', help='Dry-run mode (no writes)')
    parser.add_argument('--batch', type=int, default=100, help='Batch size')
    parser.add_argument('--limit', type=int, default=1000, help='Max packets to process')
    parser.add_argument('--verbose', action='store_true', help='Verbose logging')

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    logger.info(f"Stage 1: Structural Extraction {'(DRY-RUN)' if args.dry_run else ''}")
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
        logger.info('STAGE 1 SUMMARY\n')
        logger.info(f'  Batches processed:  {batches}')
        logger.info(f'  Success:            {total_success}')
        logger.info(f'  Skipped:            {total_skip}')
        logger.info(f'  Errors:             {total_error}')
        logger.info(f'  Coverage:           {((total_success / (total_success + total_skip)) * 100):.1f}%')
        logger.info('='*60 + '\n')

        sys.exit(0 if total_error == 0 else 1)

    finally:
        await conn.close()


if __name__ == '__main__':
    asyncio.run(main())
