#!/usr/bin/env python3
"""
Phase 90: Fast Knowledge Indexer (No LLM)
Creates searchable knowledge base from 12 clusters using:
- Statistical summaries (no LLM - instant)
- Embedded error codes (for semantic search)
- Qdrant recommendations collection
- JSON knowledge chunks (gzip compressed)

Run time: ~30 seconds for 12 clusters
"""

import os
import sys
import json
import gzip
import time
import torch
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime
from collections import Counter

sys.path.insert(0, str(Path(__file__).parent))

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
from sentence_transformers import SentenceTransformer

class FastKnowledgeIndexer:
    """Fast statistical knowledge extraction (no LLM)"""

    def __init__(self):
        self.qdrant = QdrantClient(host="localhost", port=6333)
        self.source_collection = "phase90_cuda_embeddings"
        self.recommendations_collection = "phase90_fix_recommendations"

        # Sentence Transformers
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"🚀 Loading embedding model on {self.device}...")
        self.embedder = SentenceTransformer(
            'sentence-transformers/all-mpnet-base-v2',
            device=self.device
        )
        self.dim = 768

    def fetch_cluster_members(self, cluster_id: int, limit: int = 500) -> List[Dict[str, Any]]:
        """Fetch errors from cluster"""
        try:
            result = self.qdrant.scroll(
                collection_name=self.source_collection,
                scroll_filter=Filter(
                    must=[FieldCondition(key="cluster_id", match=MatchValue(value=cluster_id))]
                ),
                limit=limit,
                with_payload=True,
                with_vectors=False
            )
            return [point.payload for point in result[0]]
        except Exception as e:
            print(f"❌ Error fetching cluster {cluster_id}: {e}")
            return []

    def analyze_cluster(self, members: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Statistical analysis"""
        if not members:
            return {}

        error_codes = Counter(m.get("errorCode", "UNKNOWN") for m in members)
        files = Counter(m.get("filePath", "unknown") for m in members)
        severities = Counter(m.get("severity", "error") for m in members)
        surfaces = Counter(s for m in members for s in m.get("surface", []))
        techs = Counter(t for m in members for t in m.get("tech", []))

        # Sample messages
        unique_messages = []
        seen = set()
        for m in members:
            msg = m.get("message", "")[:150]
            if msg not in seen:
                unique_messages.append(msg)
                seen.add(msg)
            if len(unique_messages) >= 5:
                break

        return {
            "total_errors": len(members),
            "top_error_codes": error_codes.most_common(10),
            "top_files": files.most_common(10),
            "severities": dict(severities),
            "surfaces": dict(surfaces),
            "techs": dict(techs),
            "sample_messages": unique_messages
        }

    def generate_template_summary(self, cluster_id: int, analysis: Dict[str, Any]) -> str:
        """Fast template-based summary"""
        total = analysis.get("total_errors", 0)
        top_code = analysis.get("top_error_codes", [("UNKNOWN", 0)])[0]
        surfaces = list(analysis.get("surfaces", {}).keys())[:3]
        techs = list(analysis.get("techs", {}).keys())[:3]

        summary = f"Cluster {cluster_id}: {total} errors. "
        summary += f"Primary error: {top_code[0]} ({top_code[1]} occurrences). "

        if surfaces:
            summary += f"Affects: {', '.join(surfaces)}. "
        if techs:
            summary += f"Technologies: {', '.join(techs)}. "

        # Add fix suggestions based on error patterns
        if top_code[0] in ["TS2307", "TS2305"]:
            summary += "Fix: Check import paths and type declarations."
        elif top_code[0] in ["TS2322", "TS2339"]:
            summary += "Fix: Review type definitions and property access."
        elif top_code[0] == "TS1005":
            summary += "Fix: Check syntax errors and missing braces."
        else:
            summary += "Fix: Review error messages and affected files."

        return summary

    def embed_summary(self, text: str) -> List[float]:
        """Embed summary for semantic search"""
        embedding = self.embedder.encode(
            [text],
            batch_size=1,
            convert_to_numpy=True,
            device=self.device,
            normalize_embeddings=True
        )
        return embedding[0].tolist()

    def save_gzip_chunk(self, cluster_id: int, data: Dict[str, Any]) -> str:
        """Save compressed knowledge chunk"""
        output_dir = Path(__file__).parent / "phase90_knowledge_chunks"
        output_dir.mkdir(exist_ok=True)

        filename = f"cluster_{cluster_id:02d}.json.gz"
        filepath = output_dir / filename

        with gzip.open(filepath, 'wt', encoding='utf-8') as f:
            json.dump(data, f, indent=2)

        return str(filepath)

    def store_recommendation(self, cluster_id: int, analysis: Dict[str, Any],
                            summary: str, embedding: List[float]):
        """Store in Qdrant recommendations"""
        try:
            # Create collection if needed
            try:
                self.qdrant.get_collection(self.recommendations_collection)
            except:
                self.qdrant.create_collection(
                    collection_name=self.recommendations_collection,
                    vectors_config=VectorParams(size=self.dim, distance=Distance.COSINE)
                )

            # Calculate priority
            total = analysis.get("total_errors", 0)
            if total > 10000:
                priority = "critical"
            elif total > 5000:
                priority = "high"
            elif total > 2000:
                priority = "medium"
            else:
                priority = "low"

            point = PointStruct(
                id=cluster_id,
                vector=embedding,
                payload={
                    "cluster_id": cluster_id,
                    "total_errors": total,
                    "priority": priority,
                    "top_error_codes": [code for code, _ in analysis.get("top_error_codes", [])[:5]],
                    "top_files": [file for file, _ in analysis.get("top_files", [])[:5]],
                    "surfaces": list(analysis.get("surfaces", {}).keys()),
                    "techs": list(analysis.get("techs", {}).keys()),
                    "summary": summary,
                    "timestamp": datetime.now().isoformat()
                }
            )

            self.qdrant.upsert(
                collection_name=self.recommendations_collection,
                points=[point]
            )

            return True

        except Exception as e:
            print(f"❌ Qdrant error: {e}")
            return False

    def process_cluster(self, cluster_id: int) -> Dict[str, Any]:
        """Fast processing for one cluster"""
        # Fetch members
        members = self.fetch_cluster_members(cluster_id, limit=500)
        if not members:
            return {}

        # Analyze
        analysis = self.analyze_cluster(members)

        # Generate summary
        summary = self.generate_template_summary(cluster_id, analysis)

        # Embed
        embedding = self.embed_summary(summary)

        # Save artifacts
        chunk_data = {
            "cluster_id": cluster_id,
            "analysis": analysis,
            "summary": summary,
            "timestamp": datetime.now().isoformat()
        }
        chunk_path = self.save_gzip_chunk(cluster_id, chunk_data)

        # Store recommendation
        success = self.store_recommendation(cluster_id, analysis, summary, embedding)

        return {
            "cluster_id": cluster_id,
            "total_errors": analysis.get("total_errors", 0),
            "top_code": analysis.get("top_error_codes", [("UNKNOWN", 0)])[0][0],
            "summary": summary,
            "success": success
        }

    def process_all(self, num_clusters: int = 12):
        """Process all clusters"""
        print(f"\n{'='*80}")
        print(f"Phase 90: Fast Knowledge Indexing (No LLM)")
        print(f"{'='*80}")
        print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

        results = []
        start_time = time.time()

        for cluster_id in range(num_clusters):
            print(f"[{cluster_id+1}/{num_clusters}] Processing cluster {cluster_id}...", end=" ")
            result = self.process_cluster(cluster_id)
            if result:
                results.append(result)
                print(f"✅ {result['total_errors']} errors ({result['top_code']})")
            else:
                print(f"⚠️  No data")

        elapsed = time.time() - start_time

        print(f"\n{'='*80}")
        print(f"📊 INDEXING COMPLETE")
        print(f"{'='*80}")
        print(f"✅ Processed: {len(results)}/{num_clusters} clusters")
        print(f"⏱️  Time: {elapsed:.1f}s ({elapsed/num_clusters:.1f}s per cluster)")
        print(f"💾 Artifacts:")
        print(f"   - Qdrant recommendations: {len(results)} points")
        print(f"   - Gzip chunks: phase90_knowledge_chunks/")
        print()

        # Sort by priority
        critical = [r for r in results if r['total_errors'] > 10000]
        high = [r for r in results if 5000 < r['total_errors'] <= 10000]

        print(f"🎯 Priority Clusters:")
        if critical:
            print(f"   Critical ({len(critical)}): {', '.join(str(r['cluster_id']) for r in critical)}")
        if high:
            print(f"   High ({len(high)}): {', '.join(str(r['cluster_id']) for r in high)}")
        print()

        # Save summary
        summary_file = Path(__file__).parent / "reports" / "phase90_fast_knowledge_index.json"
        summary_file.parent.mkdir(exist_ok=True)

        with open(summary_file, 'w') as f:
            json.dump({
                "timestamp": datetime.now().isoformat(),
                "clusters": len(results),
                "time_sec": elapsed,
                "results": results
            }, f, indent=2)

        print(f"📄 Summary: {summary_file}")
        print()

        return results

def main():
    indexer = FastKnowledgeIndexer()
    results = indexer.process_all(num_clusters=12)

    # Show top 3
    sorted_results = sorted(results, key=lambda x: x['total_errors'], reverse=True)
    print(f"📋 Top 3 Largest Clusters:")
    for i, r in enumerate(sorted_results[:3], 1):
        print(f"   {i}. Cluster {r['cluster_id']}: {r['total_errors']} errors")
        print(f"      {r['summary'][:100]}...")
    print()

    return 0

if __name__ == "__main__":
    sys.exit(main())
