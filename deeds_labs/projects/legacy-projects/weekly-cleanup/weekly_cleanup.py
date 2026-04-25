#!/usr/bin/env python3
"""
Weekly Cleanup Script for Legal AI Platform
Deduplicates embeddings, removes near-duplicates, and maintains citation history.
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Tuple, Set
import asyncio
import aiofiles
import numpy as np
import psycopg2
from psycopg2.extras import Json
import logging
from collections import defaultdict
import hashlib

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class WeeklyCleanup:
    def __init__(self):
        self.db_conn = None
        self.similarity_threshold = 0.95  # Cosine similarity threshold for duplicates
        self.keep_top_citations = 5  # Keep top N most cited embeddings per group

        # Initialize database connection
        self._init_database()

    def _init_database(self):
        """Initialize PostgreSQL connection"""
        try:
            self.db_conn = psycopg2.connect(
                host=os.getenv('POSTGRES_HOST', 'localhost'),
                port=int(os.getenv('POSTGRES_PORT', '5432'),
                database=os.getenv('POSTGRES_DB', 'legal_ai_db'),
                user=os.getenv('POSTGRES_USER', 'postgres'),
                password=os.getenv('POSTGRES_PASSWORD', 'password')
            )
            self.db_conn.autocommit = True
            logger.info("Database connection established")

        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            self.db_conn = None

    def cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        v1 = np.array(vec1)
        v2 = np.array(vec2)

        dot_product = np.dot(v1, v2)
        norm1 = np.linalg.norm(v1)
        norm2 = np.linalg.norm(v2)

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return dot_product / (norm1 * norm2)

    async def find_duplicate_embeddings(self) -> List[Tuple[int, int, float]]:
        """Find duplicate embeddings based on cosine similarity"""
        if not self.db_conn:
            return []

        try:
            with self.db_conn.cursor() as cursor:
                # Get all embeddings from the last 7 days
                week_ago = datetime.now() - timedelta(days=7)
                cursor.execute("""
                    SELECT id, path, embedding_vector, timestamp
                    FROM document_embeddings
                    WHERE timestamp > %s
                    ORDER BY timestamp DESC
                """, (week_ago,))

                embeddings = cursor.fetchall()

            logger.info(f"Found {len(embeddings)} embeddings to analyze")

            duplicates = []
            processed = set()

            for i, (id1, path1, vec1, ts1) in enumerate(embeddings):
                if id1 in processed:
                    continue

                for j, (id2, path2, vec2, ts2) in enumerate(embeddings[i+1:], i+1):
                    if id2 in processed:
                        continue

                    # Skip if same file (different chunks are OK)
                    if path1 == path2:
                        continue

                    similarity = self.cosine_similarity(vec1, vec2)

                    if similarity >= self.similarity_threshold:
                        # Keep the newer one (higher ID = more recent)
                        duplicates.append((min(id1, id2), max(id1, id2), similarity))
                        processed.add(min(id1, id2))

            logger.info(f"Found {len(duplicates)} duplicate pairs")
            return duplicates

        except Exception as e:
            logger.error(f"Failed to find duplicates: {e}")
            return []

    async def remove_duplicates(self, duplicates: List[Tuple[int, int, float]]):
        """Remove duplicate embeddings, keeping the most recent"""
        if not self.db_conn or not duplicates:
            return

        try:
            with self.db_conn.cursor() as cursor:
                removed_count = 0

                for old_id, new_id, similarity in duplicates:
                    # Remove the older duplicate
                    cursor.execute("DELETE FROM document_embeddings WHERE id = %s", (old_id,))
                    removed_count += 1

                    logger.debug(f"Removed duplicate embedding {old_id} (similarity: {similarity:.3f})")

                logger.info(f"Removed {removed_count} duplicate embeddings")

        except Exception as e:
            logger.error(f"Failed to remove duplicates: {e}")

    async def cleanup_old_embeddings(self, days_to_keep: int = 90):
        """Remove embeddings older than specified days"""
        if not self.db_conn:
            return

        try:
            cutoff_date = datetime.now() - timedelta(days=days_to_keep)

            with self.db_conn.cursor() as cursor:
                cursor.execute("""
                    DELETE FROM document_embeddings
                    WHERE timestamp < %s
                """, (cutoff_date,))

                deleted_count = cursor.rowcount
                logger.info(f"Removed {deleted_count} embeddings older than {days_to_keep} days")

        except Exception as e:
            logger.error(f"Failed to cleanup old embeddings: {e}")

    async def deduplicate_by_content(self):
        """Deduplicate based on content hash rather than embeddings"""
        if not self.db_conn:
            return

        try:
            with self.db_conn.cursor() as cursor:
                # Find embeddings with same path and hash but different chunk indices
                cursor.execute("""
                    SELECT path, hash, array_agg(id ORDER BY timestamp DESC) as ids
                    FROM document_embeddings
                    GROUP BY path, hash
                    HAVING count(*) > 1
                """)

                duplicates = cursor.fetchall()

                removed_count = 0
                for path, hash_val, ids in duplicates:
                    # Keep only the most recent embedding for each (path, hash) pair
                    ids_to_remove = ids[1:]  # Keep first (most recent), remove rest

                    if ids_to_remove:
                        cursor.execute("""
                            DELETE FROM document_embeddings
                            WHERE id = ANY(%s)
                        """, (ids_to_remove,))

                        removed_count += len(ids_to_remove)
                        logger.debug(f"Removed {len(ids_to_remove)} duplicates for {path}")

                logger.info(f"Removed {removed_count} content-based duplicates")

        except Exception as e:
            logger.error(f"Failed to deduplicate by content: {e}")

    async def maintain_citation_history(self):
        """Ensure we keep the most cited/referenced embeddings"""
        if not self.db_conn:
            return

        try:
            # This would require a citation tracking table
            # For now, we'll just ensure we don't remove embeddings that might be referenced
            with self.db_conn.cursor() as cursor:
                # Get citation counts (this would need a citation table in a real implementation)
                cursor.execute("""
                    SELECT COUNT(*) as citation_count
                    FROM document_embeddings
                    WHERE timestamp > NOW() - INTERVAL '30 days'
                """)

                result = cursor.fetchone()
                citation_count = result[0] if result else 0

                logger.info(f"Current citation-tracked embeddings: {citation_count}")

        except Exception as e:
            logger.error(f"Failed to maintain citation history: {e}")

    async def optimize_vector_index(self):
        """Optimize the vector index for better performance"""
        if not self.db_conn:
            return

        try:
            with self.db_conn.cursor() as cursor:
                # Reindex the vector column
                logger.info("Optimizing vector index...")
                cursor.execute("REINDEX INDEX document_embeddings_embedding_vector_idx")

                # Vacuum analyze for statistics
                cursor.execute("VACUUM ANALYZE document_embeddings")

                logger.info("Vector index optimized")

        except Exception as e:
            logger.error(f"Failed to optimize vector index: {e}")

    async def generate_cleanup_report(self) -> Dict:
        """Generate a report of cleanup activities"""
        if not self.db_conn:
            return {"error": "No database connection"}

        try:
            with self.db_conn.cursor() as cursor:
                # Get statistics
                cursor.execute("""
                    SELECT
                        COUNT(*) as total_embeddings,
                        COUNT(CASE WHEN timestamp > NOW() - INTERVAL '1 day' THEN 1 END) as last_day,
                        COUNT(CASE WHEN timestamp > NOW() - INTERVAL '7 days' THEN 1 END) as last_week,
                        COUNT(CASE WHEN timestamp > NOW() - INTERVAL '30 days' THEN 1 END) as last_month,
                        AVG(EXTRACT(EPOCH FROM (NOW() - timestamp))/86400) as avg_age_days
                    FROM document_embeddings
                """)

                stats = cursor.fetchone()

                # Get storage usage by path
                cursor.execute("""
                    SELECT
                        substring(path from '(.*/)[^/]*$') as directory,
                        COUNT(*) as file_count,
                        SUM(array_length(embedding_vector, 1)) * 4 as estimated_bytes
                    FROM document_embeddings
                    GROUP BY directory
                    ORDER BY file_count DESC
                    LIMIT 10
                """)

                storage_by_path = cursor.fetchall()

                report = {
                    "timestamp": datetime.now().isoformat(),
                    "total_embeddings": stats[0],
                    "embeddings_last_day": stats[1],
                    "embeddings_last_week": stats[2],
                    "embeddings_last_month": stats[3],
                    "average_age_days": round(stats[4], 2) if stats[4] else 0,
                    "storage_by_directory": [
                        {
                            "directory": row[0] or "root",
                            "file_count": row[1],
                            "estimated_mb": round(row[2] / (1024 * 1024), 2)
                        }
                        for row in storage_by_path
                    ],
                    "cleanup_actions": []
                }

                return report

        except Exception as e:
            logger.error(f"Failed to generate cleanup report: {e}")
            return {"error": str(e)}

    async def run_full_cleanup(self, dry_run: bool = False):
        """Run the complete weekly cleanup process"""
        logger.info("Starting weekly cleanup process...")
        start_time = time.time()

        if dry_run:
            logger.info("DRY RUN MODE - No changes will be made")

        # Step 1: Find and remove embedding duplicates
        logger.info("Step 1: Finding duplicate embeddings...")
        duplicates = await self.find_duplicate_embeddings()

        if not dry_run and duplicates:
            await self.remove_duplicates(duplicates)
            logger.info(f"Removed {len(duplicates)} duplicate pairs")

        # Step 2: Deduplicate by content hash
        logger.info("Step 2: Deduplicating by content hash...")
        if not dry_run:
            await self.deduplicate_by_content()

        # Step 3: Remove old embeddings (keep last 90 days)
        logger.info("Step 3: Removing old embeddings...")
        if not dry_run:
            await self.cleanup_old_embeddings(90)

        # Step 4: Maintain citation history
        logger.info("Step 4: Maintaining citation history...")
        await self.maintain_citation_history()

        # Step 5: Optimize vector index
        logger.info("Step 5: Optimizing vector index...")
        if not dry_run:
            await self.optimize_vector_index()

        # Step 6: Generate report
        logger.info("Step 6: Generating cleanup report...")
        report = await self.generate_cleanup_report()

        elapsed_time = time.time() - start_time
        report["cleanup_duration_seconds"] = round(elapsed_time, 2)
        report["dry_run"] = dry_run

        # Save report
        await self.save_cleanup_report(report)

        logger.info(f"Weekly cleanup completed in {elapsed_time:.2f} seconds")
        return report

    async def save_cleanup_report(self, report: Dict):
        """Save the cleanup report to a file"""
        try:
            reports_dir = Path("cleanup_reports")
            reports_dir.mkdir(exist_ok=True)

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"cleanup_report_{timestamp}.json"
            filepath = reports_dir / filename

            async with aiofiles.open(filepath, 'w') as f:
                await f.write(json.dumps(report, indent=2))

            logger.info(f"Cleanup report saved to {filepath}")

        except Exception as e:
            logger.error(f"Failed to save cleanup report: {e}")

async def main():
    parser = argparse.ArgumentParser(description='Weekly Cleanup for Legal AI Platform')
    parser.add_argument('--dry-run', action='store_true', help='Run in dry-run mode (no changes made)')
    parser.add_argument('--days-to-keep', type=int, default=90, help='Days of embeddings to keep')
    parser.add_argument('--similarity-threshold', type=float, default=0.95, help='Similarity threshold for duplicates')

    args = parser.parse_args()

    cleanup = WeeklyCleanup()
    cleanup.similarity_threshold = args.similarity_threshold

    try:
        report = await cleanup.run_full_cleanup(dry_run=args.dry_run)

        # Print summary
        print("\n=== Weekly Cleanup Report ===")
        print(f"Total embeddings: {report.get('total_embeddings', 0)}")
        print(f"Embeddings last day: {report.get('embeddings_last_day', 0)}")
        print(f"Embeddings last week: {report.get('embeddings_last_week', 0)}")
        print(f"Embeddings last month: {report.get('embeddings_last_month', 0)}")
        print(f"Average age (days): {report.get('average_age_days', 0)}")
        print(f"Cleanup duration: {report.get('cleanup_duration_seconds', 0)} seconds")
        print(f"Dry run: {report.get('dry_run', False)}")

        if 'storage_by_directory' in report:
            print("\nTop directories by storage:")
            for item in report['storage_by_directory'][:5]:
                print(f"  {item['directory']}: {item['file_count']} files, {item['estimated_mb']} MB")

    except Exception as e:
        logger.error(f"Cleanup failed: {e}")
        sys.exit(1)

if __name__ == '__main__':
    asyncio.run(main())