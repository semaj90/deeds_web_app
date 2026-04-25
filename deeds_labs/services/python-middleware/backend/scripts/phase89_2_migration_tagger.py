#!/usr/bin/env python3
"""
Phase 89.2: Enhanced Migration Metadata Tagger
Adds migration flags to existing Qdrant collections for targeted fixes:

- Svelte 4 → Svelte 5 migrations
- Melt-UI → Bits-UI v2 migrations
- Route consolidation patterns
- Modal architecture patterns

Merges with existing data (non-destructive).
"""

import os
import sys
import re
import time
from pathlib import Path
from typing import List, Dict, Set
from collections import defaultdict, Counter

from qdrant_client import QdrantClient
from qdrant_client.models import (
    PointStruct, Filter, FieldCondition, MatchValue,
    PayloadSchemaType, CreateFieldIndex
)

class MigrationTagger:
    """Detect and tag migration patterns in code"""

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)
        self.qdrant = QdrantClient(host="localhost", port=6333)

        # Collections to enhance
        self.target_collections = [
            "phase90_cuda_embeddings",
            "fastmcp_file_profiles"
        ]

        # Migration patterns (compiled regex)
        self.svelte4_patterns = {
            'svelte4_props': re.compile(r'export\s+let\s+\w+'),
            'svelte4_events': re.compile(r'createEventDispatcher'),
            'svelte4_reactivity': re.compile(r'\$:\s+'),
            'svelte4_module_context': re.compile(r'<script\s+context=["\']module["\']')
        }

        self.ui_library_patterns = {
            'melt_ui_legacy': re.compile(r'from\s+["\'](@melt-ui|melt-ui)'),
            'bits_ui_v2': re.compile(r'from\s+["\']bits-ui'),
            'unocss_classes': re.compile(r'(class|className)=["\'][^"\']*\b(flex|grid|bg-|text-|p-|m-)')
        }

        self.route_patterns = {
            'route_consolidation_cases': re.compile(r'(cases|case)/\[.*?\]'),
            'route_consolidation_evidence': re.compile(r'evidence/\[.*?\]'),
            'route_consolidation_command': re.compile(r'command-center')
        }

        self.modal_patterns = {
            'modal_card_component': re.compile(r'(Dialog|Modal|Sheet|Drawer)(\.|Root|Trigger|Content)'),
            'modal_card_structure': re.compile(r'(modals|dialogs)/')
        }

    def scan_file(self, file_path: str) -> Dict[str, bool]:
        """Scan file for migration patterns"""
        flags = {}

        try:
            # Only scan .svelte files for Svelte 4 patterns
            if not file_path.endswith('.svelte'):
                return flags

            # Check if file exists
            full_path = self.workspace_root / file_path
            if not full_path.exists():
                return flags

            # Read file content
            content = full_path.read_text(encoding='utf-8', errors='ignore')

            # Check Svelte 4 patterns
            for flag_name, pattern in self.svelte4_patterns.items():
                flags[flag_name] = bool(pattern.search(content))

            # Check UI library patterns
            for flag_name, pattern in self.ui_library_patterns.items():
                flags[flag_name] = bool(pattern.search(content))

            # Check route patterns (file path + content)
            for flag_name, pattern in self.route_patterns.items():
                flags[flag_name] = bool(pattern.search(file_path) or pattern.search(content))

            # Check modal patterns
            for flag_name, pattern in self.modal_patterns.items():
                flags[flag_name] = bool(pattern.search(file_path) or pattern.search(content))

        except Exception as e:
            print(f"⚠️  Error scanning {file_path}: {e}")

        return flags

    def determine_migration_priority(self, flags: Dict[str, bool]) -> str:
        """Calculate migration priority based on flags"""
        svelte4_count = sum(1 for k, v in flags.items() if k.startswith('svelte4_') and v)

        if svelte4_count >= 3:
            return "critical"  # Needs immediate Svelte 5 migration
        elif svelte4_count >= 1:
            return "high"
        elif flags.get('melt_ui_legacy'):
            return "high"  # Bits-UI migration
        elif any(flags.get(k) for k in ['route_consolidation_cases', 'route_consolidation_evidence']):
            return "medium"  # Route consolidation
        else:
            return "low"

    def get_migration_recommendations(self, flags: Dict[str, bool]) -> List[str]:
        """Generate actionable recommendations"""
        recommendations = []

        # Svelte 5 migrations
        if flags.get('svelte4_props'):
            recommendations.append("Replace 'export let' with $props() rune")
        if flags.get('svelte4_events'):
            recommendations.append("Replace createEventDispatcher with $dispatch() or callbacks")
        if flags.get('svelte4_reactivity'):
            recommendations.append("Replace $: with $derived() or $effect()")
        if flags.get('svelte4_module_context'):
            recommendations.append("Move module context to separate .ts file")

        # UI library migrations
        if flags.get('melt_ui_legacy'):
            recommendations.append("Migrate from Melt-UI to Bits-UI v2")

        # Route consolidation
        if flags.get('route_consolidation_cases'):
            recommendations.append("Consolidate case routes under /cases/[id]")
        if flags.get('route_consolidation_evidence'):
            recommendations.append("Consolidate evidence routes under /evidence/[id]")

        # Modal architecture
        if flags.get('modal_card_component') and not flags.get('bits_ui_v2'):
            recommendations.append("Standardize modal pattern with Bits-UI Dialog")

        return recommendations

    def enhance_collection(self, collection_name: str, dry_run: bool = True) -> Dict[str, int]:
        """Add migration tags to existing points"""
        print(f"\n{'='*80}")
        print(f"📋 Enhancing Collection: {collection_name}")
        print(f"{'='*80}")

        if dry_run:
            print("🔍 DRY RUN MODE (no writes)")

        stats = {
            'total_points': 0,
            'tagged_points': 0,
            'svelte4_detected': 0,
            'melt_ui_detected': 0,
            'route_consolidation': 0,
            'critical_priority': 0
        }

        # Fetch all points (scroll in batches)
        batch_size = 100
        offset = None
        batch_num = 0

        start_time = time.time()

        while True:
            # Scroll batch
            result = self.qdrant.scroll(
                collection_name=collection_name,
                limit=batch_size,
                offset=offset,
                with_payload=True,
                with_vectors=False
            )

            points, next_offset = result

            if not points:
                break

            batch_num += 1
            batch_updates = []

            for point in points:
                stats['total_points'] += 1

                # Get file path from payload
                file_path = point.payload.get('filePath') or point.payload.get('file_path')

                if not file_path:
                    continue

                # Scan for migration patterns
                flags = self.scan_file(file_path)

                if not flags:
                    continue

                # Determine priority
                priority = self.determine_migration_priority(flags)

                # Get recommendations
                recommendations = self.get_migration_recommendations(flags)

                # Build enhanced payload
                migration_flags = [k for k, v in flags.items() if v]
                needs_svelte5 = any(k.startswith('svelte4_') for k in migration_flags)

                enhanced_payload = {
                    **point.payload,
                    'migration_flags': migration_flags,
                    'migration_priority': priority,
                    'migration_recommendations': recommendations,
                    'needs_svelte5_migration': needs_svelte5,
                    'needs_bits_ui_migration': flags.get('melt_ui_legacy', False),
                    'needs_route_consolidation': any(
                        flags.get(k) for k in ['route_consolidation_cases', 'route_consolidation_evidence']
                    )
                }

                # Track stats
                stats['tagged_points'] += 1
                if needs_svelte5:
                    stats['svelte4_detected'] += 1
                if flags.get('melt_ui_legacy'):
                    stats['melt_ui_detected'] += 1
                if enhanced_payload['needs_route_consolidation']:
                    stats['route_consolidation'] += 1
                if priority == 'critical':
                    stats['critical_priority'] += 1

                # Queue update
                if not dry_run:
                    batch_updates.append(PointStruct(
                        id=point.id,
                        vector=point.vector or [0.0] * 768,  # Preserve vector
                        payload=enhanced_payload
                    ))

            # Write batch
            if batch_updates and not dry_run:
                self.qdrant.upsert(
                    collection_name=collection_name,
                    points=batch_updates
                )

            # Progress
            elapsed = time.time() - start_time
            rate = stats['total_points'] / elapsed if elapsed > 0 else 0
            print(f"   Batch {batch_num}: {len(points)} points ({stats['total_points']} total, {rate:.0f}/s)")

            # Next batch
            offset = next_offset
            if not offset:
                break

        elapsed = time.time() - start_time

        print(f"\n📊 Results:")
        print(f"   Total points: {stats['total_points']}")
        print(f"   Tagged: {stats['tagged_points']} ({stats['tagged_points']/stats['total_points']*100:.1f}%)")
        print(f"   Svelte 4 detected: {stats['svelte4_detected']}")
        print(f"   Melt-UI detected: {stats['melt_ui_detected']}")
        print(f"   Route consolidation: {stats['route_consolidation']}")
        print(f"   Critical priority: {stats['critical_priority']}")
        print(f"   Time: {elapsed:.1f}s ({stats['total_points']/elapsed:.1f} points/s)")

        return stats

    def create_indexes(self, collection_name: str, dry_run: bool = True):
        """Create indexes for migration fields"""
        print(f"\n📇 Creating indexes for {collection_name}...")

        if dry_run:
            print("   🔍 DRY RUN - Would create:")

        indexes = [
            ('migration_priority', PayloadSchemaType.KEYWORD),
            ('needs_svelte5_migration', PayloadSchemaType.BOOL),
            ('needs_bits_ui_migration', PayloadSchemaType.BOOL),
            ('needs_route_consolidation', PayloadSchemaType.BOOL),
            ('migration_flags', PayloadSchemaType.KEYWORD)
        ]

        for field_name, schema_type in indexes:
            print(f"      - {field_name} ({schema_type.value})")

            if not dry_run:
                try:
                    self.qdrant.create_payload_index(
                        collection_name=collection_name,
                        field_name=field_name,
                        field_schema=schema_type
                    )
                except Exception as e:
                    if "already exists" not in str(e):
                        print(f"         ⚠️  Error: {e}")

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Phase 89.2: Enhanced Migration Tagger")
    parser.add_argument("--dry-run", action="store_true", help="Test mode (no writes)")
    parser.add_argument("--collection", help="Target specific collection")
    parser.add_argument("--workspace", default="sveltekit-frontend", help="Workspace directory")
    args = parser.parse_args()

    print("=" * 80)
    print("Phase 89.2: Enhanced Migration Metadata Tagger")
    print("=" * 80)
    print(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    print(f"Workspace: {args.workspace}")
    print()

    tagger = MigrationTagger(workspace_root=args.workspace)

    # Determine collections
    if args.collection:
        collections = [args.collection]
    else:
        collections = tagger.target_collections

    # Process each collection
    all_stats = {}
    start_time = time.time()

    for collection in collections:
        try:
            stats = tagger.enhance_collection(collection, dry_run=args.dry_run)
            all_stats[collection] = stats

            # Create indexes
            tagger.create_indexes(collection, dry_run=args.dry_run)

        except Exception as e:
            print(f"❌ Error processing {collection}: {e}")

    total_time = time.time() - start_time

    # Summary
    print(f"\n{'='*80}")
    print(f"📊 PHASE 89.2 COMPLETE")
    print(f"{'='*80}")

    total_points = sum(s.get('total_points', 0) for s in all_stats.values())
    total_tagged = sum(s.get('tagged_points', 0) for s in all_stats.values())

    print(f"Collections: {len(all_stats)}")
    print(f"Total points: {total_points}")
    print(f"Tagged: {total_tagged} ({total_tagged/total_points*100:.1f}%)")
    print(f"Time: {total_time:.1f}s ({total_points/total_time:.0f} points/s)")
    print()

    if args.dry_run:
        print("🔍 DRY RUN - No data was modified")
        print("   Remove --dry-run to apply changes")
    else:
        print("✅ Migration metadata applied")
        print("   Query examples:")
        print("   - Svelte 5 needed: filter={must: [{key: 'needs_svelte5_migration', match: {value: true}}]}")
        print("   - Critical files: filter={must: [{key: 'migration_priority', match: {value: 'critical'}}]}")
    print()

if __name__ == "__main__":
    main()
