#!/usr/bin/env python3
"""
Phase 90: RAG Query Tool for Knowledge Synthesis
=================================================
Query the embedded knowledge base for:
- Error cluster patterns
- Fix recommendations
- Discovery context (how answers were found)

This enables future LLM prompts to retrieve contextual knowledge
without repeating the discovery process.
"""

import argparse
import json
from typing import List, Dict, Optional
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue, MatchAny
from sentence_transformers import SentenceTransformer
import torch

# Configuration
QDRANT_URL = "http://localhost:6333"
FIX_RECOMMENDATIONS = "phase90_fix_recommendations"
CUDA_EMBEDDINGS = "phase90_cuda_embeddings"
ERROR_CLUSTERS = "phase90_error_clusters"

class Phase90RAGQuery:
    """Query interface for Phase 90 knowledge base"""

    def __init__(self):
        self.client = QdrantClient(url=QDRANT_URL)
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"📡 Connected to Qdrant ({QDRANT_URL})")
        print(f"🚀 Using {self.device} for embeddings")

        # Load embedding model for semantic search
        self.embedder = SentenceTransformer(
            'sentence-transformers/all-mpnet-base-v2',
            device=self.device
        )

    def embed_query(self, query: str) -> List[float]:
        """Embed a query for semantic search"""
        return self.embedder.encode([query], normalize_embeddings=True)[0].tolist()

    def query_by_cluster(self, cluster_id: int) -> Dict:
        """Get all info about a specific cluster"""
        # Get from fix recommendations
        result = self.client.scroll(
            collection_name=FIX_RECOMMENDATIONS,
            scroll_filter=Filter(
                must=[FieldCondition(key="cluster_id", match=MatchValue(value=cluster_id))]
            ),
            limit=1,
            with_payload=True
        )

        if result[0]:
            return result[0][0].payload
        return {}

    def query_by_error_code(self, error_code: str, limit: int = 10) -> List[Dict]:
        """Find errors by TypeScript error code"""
        result = self.client.scroll(
            collection_name=CUDA_EMBEDDINGS,
            scroll_filter=Filter(
                must=[FieldCondition(key="errorCode", match=MatchValue(value=error_code))]
            ),
            limit=limit,
            with_payload=True
        )
        return [p.payload for p in result[0]]

    def semantic_search(self, query: str, top_k: int = 5) -> List[Dict]:
        """Semantic search across fix recommendations"""
        query_vector = self.embed_query(query)

        results = self.client.search(
            collection_name=FIX_RECOMMENDATIONS,
            query_vector=query_vector,
            limit=top_k,
            with_payload=True
        )

        return [
            {
                "score": r.score,
                "cluster_id": r.payload.get("cluster_id"),
                "summary": r.payload.get("summary", "")[:200],
                "surfaces": r.payload.get("surfaces", []),
                "techs": r.payload.get("techs", []),
                "total_errors": r.payload.get("total_errors", 0)
            }
            for r in results
        ]

    def get_high_priority_clusters(self) -> List[Dict]:
        """Get clusters marked as high priority"""
        result = self.client.scroll(
            collection_name=FIX_RECOMMENDATIONS,
            scroll_filter=Filter(
                must=[FieldCondition(key="priority", match=MatchValue(value="high"))]
            ),
            limit=20,
            with_payload=True
        )
        return [p.payload for p in result[0]]

    def get_cluster_summary_for_llm(self, cluster_id: int) -> str:
        """Generate LLM-ready context for a cluster"""
        cluster = self.query_by_cluster(cluster_id)
        if not cluster:
            return f"No data found for cluster {cluster_id}"

        return f"""
## Error Cluster {cluster_id}: {cluster.get('total_errors', 0)} errors

### Top Error Codes
{', '.join(cluster.get('top_error_codes', [])[:5])}

### Affected Areas
- Surfaces: {', '.join(cluster.get('surfaces', []))}
- Technologies: {', '.join(cluster.get('techs', []))}

### LLM Analysis
{cluster.get('summary', 'No summary available')}

### Priority
{cluster.get('priority', 'medium')}
"""

    def generate_agentic_fix_context(self, cluster_ids: List[int] = None) -> str:
        """Generate context for agentic error fixing"""
        if cluster_ids is None:
            # Get high priority clusters
            high_priority = self.get_high_priority_clusters()
            cluster_ids = [c.get('cluster_id') for c in high_priority[:3]]

        context_parts = [
            "# ACE Contextual Engineering: Error Fixing Context\n",
            f"Generated: {__import__('datetime').datetime.now().isoformat()}\n",
            f"Clusters to fix: {len(cluster_ids)}\n\n"
        ]

        for cid in cluster_ids:
            context_parts.append(self.get_cluster_summary_for_llm(cid))
            context_parts.append("\n---\n")

        context_parts.append("""
## Fix Strategy

1. Address high-priority clusters first (>5000 errors)
2. Look for common patterns across clusters
3. Generate unified fixes that address root causes
4. Validate fixes don't introduce new errors
5. Update knowledge base with successful fixes
""")

        return "\n".join(context_parts)


def main():
    parser = argparse.ArgumentParser(description="Phase 90 RAG Query Tool")
    parser.add_argument("--cluster", type=int, help="Query specific cluster ID")
    parser.add_argument("--error-code", type=str, help="Query by TypeScript error code")
    parser.add_argument("--search", type=str, help="Semantic search query")
    parser.add_argument("--high-priority", action="store_true", help="Show high priority clusters")
    parser.add_argument("--agentic-context", action="store_true", help="Generate agentic fix context")
    parser.add_argument("--limit", type=int, default=5, help="Number of results")

    args = parser.parse_args()

    rag = Phase90RAGQuery()

    if args.cluster is not None:
        print(f"\n📁 Cluster {args.cluster} Details:")
        print("=" * 60)
        result = rag.query_by_cluster(args.cluster)
        print(json.dumps(result, indent=2))

    elif args.error_code:
        print(f"\n🔍 Errors with code {args.error_code}:")
        print("=" * 60)
        results = rag.query_by_error_code(args.error_code, args.limit)
        for i, r in enumerate(results, 1):
            print(f"{i}. {r.get('filePath', 'unknown')[:60]}")
            print(f"   {r.get('message', '')[:100]}...")
            print()

    elif args.search:
        print(f"\n🔎 Semantic search: '{args.search}'")
        print("=" * 60)
        results = rag.semantic_search(args.search, args.limit)
        for r in results:
            print(f"Cluster {r['cluster_id']} (score: {r['score']:.3f})")
            print(f"   Errors: {r['total_errors']}")
            print(f"   {r['summary'][:150]}...")
            print()

    elif args.high_priority:
        print("\n🔴 High Priority Clusters:")
        print("=" * 60)
        results = rag.get_high_priority_clusters()
        for r in results:
            print(f"Cluster {r.get('cluster_id')}: {r.get('total_errors', 0)} errors")
            print(f"   Codes: {', '.join(r.get('top_error_codes', [])[:3])}")
            print()

    elif args.agentic_context:
        print("\n🤖 Generating Agentic Fix Context...")
        print("=" * 60)
        context = rag.generate_agentic_fix_context()
        print(context)

        # Save to file
        with open("reports/phase90_agentic_context.md", "w") as f:
            f.write(context)
        print("\n✅ Saved to reports/phase90_agentic_context.md")

    else:
        # Default: show overview
        print("\n📊 Phase 90 Knowledge Base Overview:")
        print("=" * 60)

        # Collection stats
        for col in [CUDA_EMBEDDINGS, ERROR_CLUSTERS, FIX_RECOMMENDATIONS]:
            try:
                info = rag.client.get_collection(col)
                print(f"✅ {col}: {info.points_count} points")
            except:
                print(f"❌ {col}: not found")

        print("\n💡 Usage Examples:")
        print("   python phase90_rag_query.py --cluster 11")
        print("   python phase90_rag_query.py --error-code TS2304")
        print("   python phase90_rag_query.py --search 'module not found'")
        print("   python phase90_rag_query.py --high-priority")
        print("   python phase90_rag_query.py --agentic-context")


if __name__ == "__main__":
    main()
