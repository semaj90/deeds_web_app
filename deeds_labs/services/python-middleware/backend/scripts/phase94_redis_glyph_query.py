#!/usr/bin/env python3
"""
Phase 94: Redis Glyph Query Tool
Query and visualize glyph tensor metadata from Redis cache
"""

import redis
import json
import sys
from typing import Dict, List, Optional
from pathlib import Path
import argparse

class RedisGlyphQuery:
    def __init__(self):
        self.redis = redis.Redis(host='localhost', port=6379, decode_responses=True)

    def get_all_glyph_keys(self) -> List[str]:
        """Get all glyph-related keys from Redis"""
        patterns = [
            "glyph:*",
            "cuda:*",
            "metrics:*",
            "agentic:*"
        ]

        all_keys = []
        for pattern in patterns:
            keys = self.redis.keys(pattern)
            all_keys.extend(keys)

        return all_keys

    def query_glyph_metadata(self, cluster_id: int) -> Optional[Dict]:
        """Query metadata for a specific cluster glyph"""
        key = f"glyph:phase90:cluster_{cluster_id}"
        data = self.redis.get(key)

        if not data:
            return None

        return json.loads(data)

    def query_similarity_matrix(self, cluster_id: int) -> Optional[bytes]:
        """Query CUDA similarity matrix for cluster"""
        key = f"cuda:similarity_matrix:cluster_{cluster_id}"
        return self.redis.get(key)

    def query_agentic_recommendation(self, language: str, error_type: str) -> Optional[Dict]:
        """Query cached agentic recommendation"""
        key = f"agentic:recommendation:{language}:{error_type}"
        data = self.redis.get(key)

        if not data:
            return None

        return json.loads(data)

    def get_metrics(self) -> Dict:
        """Get all system metrics from Redis"""
        metrics = {}

        for key in self.redis.keys("metrics:*"):
            value = self.redis.get(key)
            metrics[key] = value

        return metrics

    def cache_glyph_metadata(self, cluster_id: int, metadata: Dict):
        """Cache glyph metadata for a cluster"""
        key = f"glyph:phase90:cluster_{cluster_id}"
        self.redis.set(key, json.dumps(metadata))
        print(f"✅ Cached metadata for cluster {cluster_id}")

    def cache_agentic_recommendation(self, language: str, error_type: str, recommendation: Dict, ttl: int = 3600):
        """Cache agentic recommendation with TTL"""
        key = f"agentic:recommendation:{language}:{error_type}"
        self.redis.setex(key, ttl, json.dumps(recommendation))
        print(f"✅ Cached recommendation for {language}:{error_type} (TTL: {ttl}s)")

    def get_redis_stats(self) -> Dict:
        """Get Redis database statistics"""
        info = self.redis.info("stats")
        keyspace = self.redis.info("keyspace")

        return {
            "total_keys": keyspace.get('db0', {}).get('keys', 0),
            "total_commands": info.get('total_commands_processed', 0),
            "keyspace_hits": info.get('keyspace_hits', 0),
            "keyspace_misses": info.get('keyspace_misses', 0),
            "hit_rate": info.get('keyspace_hits', 0) / max(info.get('keyspace_hits', 0) + info.get('keyspace_misses', 0), 1)
        }

    def display_stats(self):
        """Display Redis statistics"""
        stats = self.get_redis_stats()

        print("=" * 80)
        print("📊 Redis Statistics")
        print("=" * 80)
        print(f"Total Keys: {stats['total_keys']:,}")
        print(f"Total Commands: {stats['total_commands']:,}")
        print(f"Cache Hits: {stats['keyspace_hits']:,}")
        print(f"Cache Misses: {stats['keyspace_misses']:,}")
        print(f"Hit Rate: {stats['hit_rate']*100:.2f}%")
        print()

    def display_glyph_keys(self):
        """Display all glyph-related keys"""
        keys = self.get_all_glyph_keys()

        print("=" * 80)
        print(f"🔑 Glyph-Related Keys ({len(keys)} total)")
        print("=" * 80)

        # Group by prefix
        by_prefix = {}
        for key in keys:
            prefix = key.split(':')[0]
            if prefix not in by_prefix:
                by_prefix[prefix] = []
            by_prefix[prefix].append(key)

        for prefix, prefix_keys in sorted(by_prefix.items()):
            print(f"\n{prefix.upper()}: {len(prefix_keys)} keys")
            for key in sorted(prefix_keys)[:10]:  # Show first 10
                print(f"  - {key}")
            if len(prefix_keys) > 10:
                print(f"  ... and {len(prefix_keys) - 10} more")

        print()

    def query_cluster_details(self, cluster_id: int):
        """Display detailed information for a cluster"""
        print("=" * 80)
        print(f"🔍 Cluster {cluster_id} Details")
        print("=" * 80)

        # Query glyph metadata
        metadata = self.query_glyph_metadata(cluster_id)
        if metadata:
            print("\n📊 Glyph Metadata:")
            print(json.dumps(metadata, indent=2))
        else:
            print(f"\n⚠️  No glyph metadata found for cluster {cluster_id}")

        # Check for similarity matrix
        matrix = self.query_similarity_matrix(cluster_id)
        if matrix:
            print(f"\n🧮 CUDA Similarity Matrix: {len(matrix)} bytes")
        else:
            print(f"\n⚠️  No similarity matrix found for cluster {cluster_id}")

        print()


def main():
    parser = argparse.ArgumentParser(description="Query Redis glyph metadata")
    parser.add_argument('--stats', action='store_true', help='Show Redis statistics')
    parser.add_argument('--list', action='store_true', help='List all glyph keys')
    parser.add_argument('--cluster', type=int, help='Query specific cluster ID')
    parser.add_argument('--cache-glyph', nargs=2, metavar=('CLUSTER_ID', 'JSON_FILE'), help='Cache glyph metadata')
    parser.add_argument('--query-rec', nargs=2, metavar=('LANGUAGE', 'ERROR_TYPE'), help='Query agentic recommendation')

    args = parser.parse_args()

    query = RedisGlyphQuery()

    if args.stats:
        query.display_stats()

    if args.list:
        query.display_glyph_keys()

    if args.cluster is not None:
        query.query_cluster_details(args.cluster)

    if args.cache_glyph:
        cluster_id = int(args.cache_glyph[0])
        json_file = Path(args.cache_glyph[1])

        if not json_file.exists():
            print(f"❌ File not found: {json_file}")
            sys.exit(1)

        with open(json_file) as f:
            metadata = json.load(f)

        query.cache_glyph_metadata(cluster_id, metadata)

    if args.query_rec:
        language, error_type = args.query_rec
        rec = query.query_agentic_recommendation(language, error_type)

        if rec:
            print("=" * 80)
            print(f"🤖 Agentic Recommendation: {language} / {error_type}")
            print("=" * 80)
            print(json.dumps(rec, indent=2))
        else:
            print(f"⚠️  No cached recommendation for {language}:{error_type}")

    # If no args, show help
    if not any(vars(args).values()):
        parser.print_help()
        print("\nExamples:")
        print("  python phase94_redis_glyph_query.py --stats")
        print("  python phase94_redis_glyph_query.py --list")
        print("  python phase94_redis_glyph_query.py --cluster 0")
        print("  python phase94_redis_glyph_query.py --query-rec typescript SYNTAX")


if __name__ == "__main__":
    main()
