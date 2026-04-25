#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 89: Indexed Codebase Summary Report
Generates comprehensive statistics for all indexed collections in Qdrant
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import json
from datetime import datetime
from qdrant_client import QdrantClient
from collections import defaultdict

def generate_report():
    """Generate comprehensive report of indexed codebase"""

    qdrant = QdrantClient(url="http://localhost:6333")

    print("="*80)
    print("📊 Phase 89: Indexed Codebase Summary Report")
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    print()

    # Get all collections
    collections = qdrant.get_collections()

    # Categorize collections
    code_collections = []
    error_collections = []
    ace_collections = []
    knowledge_collections = []
    other_collections = []

    for col in collections.collections:
        name = col.name
        if 'error' in name.lower():
            error_collections.append(name)
        elif 'ace' in name.lower():
            ace_collections.append(name)
        elif 'code' in name.lower() or 'ast' in name.lower() or 'route' in name.lower():
            code_collections.append(name)
        elif 'knowledge' in name.lower() or 'kb' in name.lower():
            knowledge_collections.append(name)
        else:
            other_collections.append(name)

    # Print summary by category
    total_points = 0
    total_size = 0

    def print_category(title, collection_names):
        nonlocal total_points, total_size

        if not collection_names:
            return

        print(f"\n{title}")
        print("-" * 80)
        print(f"{'Collection'.ljust(45)} {'Points'.rjust(10)} {'Status'.ljust(15)}")
        print("-" * 80)

        for name in sorted(collection_names):
            try:
                info = qdrant.get_collection(name)
                points = info.points_count
                vectors_count = info.vectors_count if hasattr(info, 'vectors_count') else points

                status = "✅ Active" if points > 0 else "⏸️  Empty"

                print(f"{name.ljust(45)} {str(points).rjust(10)} {status}")

                total_points += points

                # Sample one point to see structure
                if points > 0:
                    try:
                        sample = qdrant.scroll(name, limit=1, with_payload=True)[0]
                        if sample:
                            payload_keys = list(sample[0].payload.keys()) if sample else []
                            print(f"{''.ljust(45)} Fields: {', '.join(payload_keys[:5])}")
                    except:
                        pass

            except Exception as e:
                print(f"{name.ljust(45)} {'ERROR'.rjust(10)} ❌ {str(e)[:20]}")

    # Print each category
    print_category("🔧 CODE COLLECTIONS", code_collections)
    print_category("❌ ERROR COLLECTIONS", error_collections)
    print_category("🔄 ACE COLLECTIONS", ace_collections)
    print_category("📚 KNOWLEDGE COLLECTIONS", knowledge_collections)
    print_category("📦 OTHER COLLECTIONS", other_collections)

    # Overall statistics
    print(f"\n{'='*80}")
    print("📈 OVERALL STATISTICS")
    print(f"{'='*80}")
    print(f"Total collections: {len(collections.collections)}")
    print(f"  - Code: {len(code_collections)}")
    print(f"  - Error: {len(error_collections)}")
    print(f"  - ACE: {len(ace_collections)}")
    print(f"  - Knowledge: {len(knowledge_collections)}")
    print(f"  - Other: {len(other_collections)}")
    print()
    print(f"Total indexed points: {total_points:,}")
    print()

    # Top collections by size
    print("🏆 TOP 10 LARGEST COLLECTIONS")
    print("-" * 80)

    all_sizes = []
    for col in collections.collections:
        try:
            info = qdrant.get_collection(col.name)
            all_sizes.append((col.name, info.points_count))
        except:
            pass

    all_sizes.sort(key=lambda x: x[1], reverse=True)

    for i, (name, count) in enumerate(all_sizes[:10], 1):
        print(f"{str(i).rjust(3)}. {name.ljust(45)} {count:>10,} points")

    # Sample data structures
    print(f"\n{'='*80}")
    print("🔍 SAMPLE DATA STRUCTURES")
    print(f"{'='*80}\n")

    # Show structure of key collections
    key_collections = [
        'phase72_error_patterns',
        'phase89_code_units',
        'phase89_code_chunks',
        'phase89_error_chunks'
    ]

    for col_name in key_collections:
        try:
            info = qdrant.get_collection(col_name)
            if info.points_count > 0:
                sample = qdrant.scroll(col_name, limit=1, with_payload=True)[0]
                if sample and sample[0]:
                    print(f"Collection: {col_name}")
                    print(f"Points: {info.points_count:,}")
                    print(f"Sample payload:")
                    print(json.dumps(sample[0].payload, indent=2)[:500])
                    print("...\n")
        except:
            pass

    print(f"{'='*80}")
    print("✅ Report generation complete!")
    print(f"{'='*80}")


if __name__ == "__main__":
    generate_report()
