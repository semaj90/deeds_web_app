#!/usr/bin/env python3
"""
Query and display summaries stored in PostgreSQL
"""

import os
import sys
import json
from embedding_service import EmbeddingService

def main():
    # Disable MinIO for local testing
    os.environ['DISABLE_MINIO'] = 'true'

    service = EmbeddingService()

    print("🔍 PostgreSQL Summary Query Tool")
    print("=" * 50)

    # Show statistics
    print("\n📊 Summary Statistics:")
    stats = service.get_summary_stats()
    if stats:
        print(f"Total files: {stats['total_files']}")
        print(f"File types: {stats['file_types']}")
        print(f"Total words: {stats['total_words']}")
        print(".1f")
        print("\nFile type breakdown:")
        for file_type, count in stats['file_type_breakdown'].items():
            print(f"  {file_type}: {count}")
    else:
        print("No statistics available")

    # Search for specific summaries
    print("\n🔍 Recent summaries:")
    recent = service.search_summaries(limit=5)
    for summary in recent:
        print(f"\n📄 {os.path.basename(summary['path'])}")
        print(f"📝 {summary['summary']}")
        print(f"🏷️  Type: {summary['file_type']}")

    # Example search
    print("\n🔍 Searching for 'CUDA' summaries:")
    cuda_summaries = service.search_summaries("CUDA", limit=3)
    for summary in cuda_summaries:
        print(f"\n📄 {os.path.basename(summary['path'])}")
        print(f"📝 {summary['summary']}")

if __name__ == '__main__':
    main()