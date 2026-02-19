#!/usr/bin/env python3
"""
Batch Index Entire Codebase with FastMCP Enhanced Indexer
Parallel processing with worker pool for maximum speed
"""

import os
import sys
import asyncio
import argparse
from pathlib import Path
from typing import List
import concurrent.futures
from datetime import datetime
from tqdm import tqdm

# Add to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import the indexer
sys.path.insert(0, str(Path(__file__).parent))
from fastmcp_ripgrep_indexer import FastMCPCodebaseIndexer

async def find_files(root_dir: str, patterns: List[str]) -> List[str]:
    """Find all files matching patterns"""
    root = Path(root_dir)
    all_files = []

    for pattern in patterns:
        files = list(root.rglob(pattern))
        all_files.extend([str(f) for f in files])

    # Filter out common excludes
    excludes = [
        'node_modules', '.svelte-kit', 'build', 'dist', '.git',
        '__pycache__', '.venv', 'venv', '.next', 'coverage'
    ]

    filtered = []
    for f in all_files:
        if not any(exc in f for exc in excludes):
            filtered.append(f)

    return filtered

async def batch_index(
    files: List[str],
    workers: int = 4,
    start_idx: int = 0,
    limit: int = None
):
    """Index files in parallel batches"""

    indexer = FastMCPCodebaseIndexer()
    await indexer.ensure_collection()

    # Limit files if specified
    if limit:
        files = files[start_idx:start_idx + limit]
    else:
        files = files[start_idx:]

    total = len(files)
    print(f"\n📊 Batch Processing:")
    print(f"   Total files: {total}")
    print(f"   Workers: {workers}")
    print(f"   Estimated time: {(total * 3) // workers // 60} minutes")
    print()

    # Process in batches
    batch_size = workers
    success = 0
    failed = 0

    with tqdm(total=total, desc="Indexing Codebase", unit="file") as pbar:
        for i in range(0, total, batch_size):
            batch = files[i:i + batch_size]

            # Process batch in parallel
            tasks = [indexer.index_file(f) for f in batch]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # Count results
            for result in results:
                if isinstance(result, Exception):
                    failed += 1
                elif result is not None:
                    success += 1
                else:
                    failed += 1

            pbar.update(len(batch))
            pbar.set_postfix(success=success, failed=failed)

    return success, failed

async def main():
    parser = argparse.ArgumentParser(description="Batch index codebase")
    parser.add_argument("--root", default="sveltekit-frontend", help="Root directory")
    parser.add_argument("--patterns", nargs="+", default=["*.ts", "*.svelte", "*.js"], help="File patterns")
    parser.add_argument("--workers", type=int, default=8, help="Parallel workers")
    parser.add_argument("--limit", type=int, help="Limit number of files")
    parser.add_argument("--start", type=int, default=0, help="Start index")
    parser.add_argument("--dry-run", action="store_true", help="List files only")

    args = parser.parse_args()

    print("=" * 70)
    print("🚀 FastMCP Batch Codebase Indexer")
    print("=" * 70)
    print()
    print(f"📂 Root: {args.root}")
    print(f"🔍 Patterns: {', '.join(args.patterns)}")
    print(f"⚙️  Workers: {args.workers}")
    print()

    # Find files
    print("🔎 Scanning for files...")
    files = await find_files(args.root, args.patterns)
    print(f"   Found: {len(files)} files")

    if args.dry_run:
        print("\n📋 Files to index:")
        for i, f in enumerate(files[:20], 1):
            print(f"   {i}. {f}")
        if len(files) > 20:
            print(f"   ... and {len(files) - 20} more")
        return

    # Batch process
    start_time = datetime.now()
    success, failed = await batch_index(
        files,
        workers=args.workers,
        start_idx=args.start,
        limit=args.limit
    )
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()

    print()
    print("=" * 70)
    print("✅ Batch Indexing Complete!")
    print("=" * 70)
    print()
    print(f"📊 Statistics:")
    print(f"   ✅ Success: {success}")
    print(f"   ❌ Failed: {failed}")
    print(f"   ⏱️  Duration: {duration:.1f}s ({duration/60:.1f} min)")
    print(f"   ⚡ Speed: {success/duration:.1f} files/sec")
    print()
    print(f"🔍 Query your index:")
    print(f"   Redis: GET file_profile:<hash>")
    print(f"   Qdrant: http://localhost:6333/collections/fastmcp_file_profiles")
    print()
    print(f"📈 Collection Stats:")
    print(f"   Total indexed: {success} files")
    print(f"   Vector dimension: 768d")
    print(f"   Storage: Qdrant + Redis")
    print()

if __name__ == "__main__":
    # UTF-8 encoding for Windows
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    asyncio.run(main())
