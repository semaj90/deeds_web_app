#!/usr/bin/env python3
"""
FastMCP Batch Indexer with Enhanced Progress Bars
Indexes TypeScript/Svelte/JavaScript files with detailed progress tracking
"""

import asyncio
import argparse
import os
from pathlib import Path
from typing import List, Optional
from datetime import datetime
from tqdm import tqdm
from tqdm.asyncio import tqdm as async_tqdm
import time

# Import the indexer
import sys
sys.path.append(str(Path(__file__).parent))
from fastmcp_ripgrep_indexer import FastMCPCodebaseIndexer


async def find_files_with_progress(
    root_dir: str,
    patterns: List[str]
) -> List[str]:
    """
    Find all files matching patterns with detailed progress
    """
    print(f"\n🔍 Scanning {root_dir} for files...")
    root = Path(root_dir)

    # Exclude patterns
    excludes = [
        "node_modules", ".svelte-kit", "build", "dist",
        ".git", "__pycache__", "coverage", ".venv"
    ]

    # Scan with pattern progress
    all_files = []
    with tqdm(total=len(patterns), desc="Pattern matching", unit=" pattern") as pattern_pbar:
        for pattern in patterns:
            files = list(root.rglob(pattern))
            all_files.extend([str(f) for f in files if f.is_file()])
            pattern_pbar.update(1)

    print(f"   Found {len(all_files)} files before filtering")

    # Filter with progress
    filtered = []
    with tqdm(total=len(all_files), desc="Filtering excludes", unit=" file") as filter_pbar:
        for f in all_files:
            if not any(exc in f for exc in excludes):
                filtered.append(f)
            filter_pbar.update(1)

    print(f"   ✅ {len(filtered)} files after filtering\n")
    return filtered


async def index_with_detailed_progress(
    file_path: str,
    indexer: FastMCPCodebaseIndexer,
    file_pbar: tqdm,
    phase_pbar: tqdm,
    stats: dict
) -> Optional[dict]:
    """
    Index a single file with phase-level progress tracking

    Phases:
    1. Extract comments (ripgrep)
    2. Generate summary (LLM)
    3. Auto-tag (keyword matching)
    4. Create embedding (or use cache)
    5. Store in Qdrant
    6. Cache in Redis
    """
    start = time.time()
    file_name = Path(file_path).name

    try:
        # Update main progress bar
        file_pbar.set_description(f"📄 {file_name[:40]:<40}")

        # Phase 1: Extract comments
        phase_pbar.set_description("  📝 Extracting comments")
        # (indexer handles this internally)

        # Phase 2: Generate summary
        phase_pbar.set_description("  🤖 Generating summary (LLM)")

        # Phase 3: Auto-tag
        phase_pbar.set_description("  🏷️  Auto-tagging")

        # Phase 4: Create embedding
        phase_pbar.set_description("  🔢 Creating embedding")

        # Phase 5: Store in Qdrant
        phase_pbar.set_description("  💾 Storing in Qdrant")

        # Full pipeline
        result = await indexer.index_file(file_path)

        # Phase 6: Cache in Redis
        phase_pbar.set_description("  ⚡ Caching in Redis")

        # Update stats
        elapsed = time.time() - start
        stats["success"] += 1
        stats["total_time"] += elapsed

        if result.get("cached"):
            stats["cache_hits"] += 1

        file_pbar.update(1)
        return result

    except Exception as e:
        stats["failed"] += 1
        file_pbar.set_description(f"❌ {file_name[:40]:<40}")
        file_pbar.update(1)
        return {"error": str(e), "file": file_path}


async def batch_index_enhanced(
    files: List[str],
    workers: int = 4,
    dry_run: bool = False
):
    """
    Index files in parallel batches with comprehensive progress tracking

    Progress bars:
    1. Main file progress (overall completion)
    2. Batch progress (number of batches completed)
    3. Phase progress (current indexing phase)
    4. Metrics display (success/fail/speed/cache)
    """

    if dry_run:
        print(f"🏃 DRY RUN: Would index {len(files)} files with {workers} workers")
        for i, f in enumerate(files[:10], 1):
            print(f"   {i}. {f}")
        if len(files) > 10:
            print(f"   ... and {len(files) - 10} more")
        return

    indexer = FastMCPCodebaseIndexer()

    # Stats tracking
    stats = {
        "success": 0,
        "failed": 0,
        "cache_hits": 0,
        "total_time": 0.0
    }

    batch_size = workers
    total_batches = (len(files) + batch_size - 1) // batch_size

    print(f"\n🚀 Starting batch indexing")
    print(f"   Files: {len(files)}")
    print(f"   Workers: {workers}")
    print(f"   Batches: {total_batches}")
    print(f"   Batch size: {batch_size}\n")

    # Create progress bars
    file_pbar = tqdm(
        total=len(files),
        desc="Overall Progress",
        position=0,
        unit=" file",
        colour="green"
    )

    batch_pbar = tqdm(
        total=total_batches,
        desc="Batch Progress",
        position=1,
        unit=" batch",
        colour="blue"
    )

    phase_pbar = tqdm(
        total=0,
        desc="Current Phase",
        position=2,
        bar_format='{desc}',
        colour="yellow"
    )

    metrics_pbar = tqdm(
        total=0,
        desc="Metrics",
        position=3,
        bar_format='{desc}',
        colour="cyan"
    )

    start_time = time.time()

    try:
        # Process in batches
        for batch_num in range(total_batches):
            batch_start = batch_num * batch_size
            batch_end = min(batch_start + batch_size, len(files))
            batch = files[batch_start:batch_end]

            # Process batch in parallel
            tasks = [
                index_with_detailed_progress(
                    f, indexer, file_pbar, phase_pbar, stats
                )
                for f in batch
            ]

            await asyncio.gather(*tasks, return_exceptions=True)

            # Update batch progress
            batch_pbar.update(1)

            # Update metrics
            elapsed = time.time() - start_time
            speed = stats["success"] / elapsed if elapsed > 0 else 0
            cache_rate = (stats["cache_hits"] / stats["success"] * 100) if stats["success"] > 0 else 0

            metrics_pbar.set_description_str(
                f"✅ {stats['success']} | "
                f"❌ {stats['failed']} | "
                f"⚡ {speed:.2f} files/sec | "
                f"💾 {stats['cache_hits']} cache hits ({cache_rate:.1f}%) | "
                f"⏱️  {elapsed:.1f}s"
            )

        # Final summary
        elapsed = time.time() - start_time
        print("\n" + "="*80)
        print("📊 INDEXING COMPLETE")
        print("="*80)
        print(f"✅ Success:     {stats['success']}/{len(files)} ({stats['success']/len(files)*100:.1f}%)")
        print(f"❌ Failed:      {stats['failed']}/{len(files)}")
        cache_rate = (stats['cache_hits']/stats['success']*100) if stats['success'] > 0 else 0
        print(f"💾 Cache hits:  {stats['cache_hits']} ({cache_rate:.1f}%)")
        print(f"⚡ Speed:       {stats['success']/elapsed:.2f} files/sec")
        print(f"⏱️  Total time:  {elapsed:.2f}s")
        print(f"⏱️  Avg/file:    {stats['total_time']/stats['success']:.2f}s" if stats['success'] > 0 else "")
        print("="*80)

    finally:
        # Close all progress bars
        file_pbar.close()
        batch_pbar.close()
        phase_pbar.close()
        metrics_pbar.close()


async def main():
    parser = argparse.ArgumentParser(
        description="FastMCP Batch Indexer with Enhanced Progress",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Index all TypeScript/Svelte files
  python fastmcp_batch_indexer_v2.py

  # Index with 16 workers
  python fastmcp_batch_indexer_v2.py --workers 16

  # Index first 50 files (testing)
  python fastmcp_batch_indexer_v2.py --limit 50

  # Dry run (see what would be indexed)
  python fastmcp_batch_indexer_v2.py --dry-run --limit 20
        """
    )

    parser.add_argument(
        "--root",
        default="sveltekit-frontend",
        help="Root directory to scan (default: sveltekit-frontend)"
    )

    parser.add_argument(
        "--patterns",
        nargs="+",
        default=["*.ts", "*.svelte", "*.js"],
        help="File patterns to match (default: *.ts *.svelte *.js)"
    )

    parser.add_argument(
        "--workers",
        type=int,
        default=8,
        help="Number of parallel workers (default: 8)"
    )

    parser.add_argument(
        "--limit",
        type=int,
        help="Limit number of files to index (for testing)"
    )

    parser.add_argument(
        "--start",
        type=int,
        default=0,
        help="Start index (skip first N files)"
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be indexed without actually indexing"
    )

    args = parser.parse_args()

    # Find files
    files = await find_files_with_progress(args.root, args.patterns)

    # Apply start/limit
    if args.start > 0:
        files = files[args.start:]
        print(f"⏭️  Skipped first {args.start} files")

    if args.limit:
        files = files[:args.limit]
        print(f"🔢 Limited to first {args.limit} files\n")

    if not files:
        print("⚠️  No files found to index")
        return

    # Index
    await batch_index_enhanced(files, workers=args.workers, dry_run=args.dry_run)


if __name__ == "__main__":
    asyncio.run(main())
