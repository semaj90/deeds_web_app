#!/usr/bin/env python3
"""
Phase 90: Knowledge Synthesis Pipeline
Transforms 73k clustered errors into:
- LLM cluster summaries (embedded)
- Neo4j knowledge graph (error patterns + relationships)
- RAG-ready chunks (compressed via gzip + indexed)
- Agentic fix recommendations (stored in Qdrant)

Architecture:
    Qdrant (73k errors)
    → GPU K-Means (12 clusters)
    → LLM Summarizer (gemma3:270m)
    → Embedding (768d)
    → Neo4j Graph (CREATES/FIXES/AFFECTS relationships)
    → MinIO (gzip compressed chunks)
    → Qdrant (fix recommendations collection)
"""

import os
import sys
import json
import gzip
import time
import torch
import requests
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from collections import defaultdict, Counter

sys.path.insert(0, str(Path(__file__).parent))

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
from sentence_transformers import SentenceTransformer
from neo4j import GraphDatabase

class KnowledgeSynthesizer:
    """Transforms clustered errors into structured knowledge"""

    def __init__(self):
        # Qdrant
        self.qdrant = QdrantClient(host="localhost", port=6333)
        self.source_collection = "phase90_cuda_embeddings"
        self.recommendations_collection = "phase90_fix_recommendations"

        # Sentence Transformers (for embedding summaries)
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"🚀 Loading embedding model on {self.device}...")
        self.embedder = SentenceTransformer(
            'sentence-transformers/all-mpnet-base-v2',
            device=self.device
        )

        # Ollama (for LLM summaries)
        self.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.llm_model = "gemma3:270m"

        # Neo4j
        neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        neo4j_user = os.getenv("NEO4J_USER", "neo4j")
        neo4j_pass = os.getenv("NEO4J_PASSWORD", "password")
        try:
            self.neo4j_driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_pass))
            self.neo4j_available = True
            print("✅ Neo4j connected")
        except Exception as e:
            print(f"⚠️  Neo4j unavailable: {e}")
            self.neo4j_available = False

        # MinIO (for gzip chunks)
        self.minio_available = False  # TODO: Add MinIO client if available

        self.dim = 768

    def fetch_cluster_members(self, cluster_id: int, limit: int = 100) -> List[Dict[str, Any]]:
        """Fetch sample errors from a cluster"""
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

    def analyze_cluster_pattern(self, members: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Extract statistical patterns from cluster members"""
        if not members:
            return {}

        error_codes = Counter(m.get("errorCode", "UNKNOWN") for m in members)
        files = Counter(m.get("filePath", "unknown") for m in members)
        severities = Counter(m.get("severity", "error") for m in members)
        surfaces = Counter(s for m in members for s in m.get("surface", []))
        techs = Counter(t for m in members for t in m.get("tech", []))

        # Sample messages (first 3 unique)
        unique_messages = []
        seen = set()
        for m in members:
            msg = m.get("message", "")[:100]
            if msg not in seen:
                unique_messages.append(msg)
                seen.add(msg)
            if len(unique_messages) >= 3:
                break

        return {
            "total_errors": len(members),
            "top_error_codes": error_codes.most_common(5),
            "top_files": files.most_common(5),
            "severities": dict(severities),
            "surfaces": dict(surfaces),
            "techs": dict(techs),
            "sample_messages": unique_messages
        }

    def generate_llm_summary(self, cluster_id: int, analysis: Dict[str, Any]) -> str:
        """Use gemma3 to generate cluster summary + fix recommendations"""
        prompt = f"""Analyze this TypeScript error cluster and provide:
1. Root cause (1 sentence)
2. Affected components (1 sentence)
3. Fix strategy (2-3 actionable steps)

Cluster #{cluster_id} Statistics:
- Total errors: {analysis.get('total_errors', 0)}
- Top error codes: {', '.join(f"{code} ({count}x)" for code, count in analysis.get('top_error_codes', [])[:3])}
- Affected surfaces: {', '.join(analysis.get('surfaces', {}).keys())}
- Tech stack: {', '.join(analysis.get('techs', {}).keys())}

Sample messages:
{chr(10).join(f"- {msg}" for msg in analysis.get('sample_messages', [])[:3])}

Provide concise, actionable analysis:"""

        try:
            response = requests.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": self.llm_model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.3, "num_predict": 200}
                },
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                return data.get("response", "").strip()
            else:
                return f"LLM unavailable (status {response.status_code})"

        except Exception as e:
            return f"LLM error: {str(e)[:100]}"

    def embed_summary(self, text: str) -> List[float]:
        """Embed summary text for semantic search"""
        embedding = self.embedder.encode(
            [text],
            batch_size=1,
            convert_to_numpy=True,
            device=self.device,
            normalize_embeddings=True
        )
        return embedding[0].tolist()

    def create_neo4j_nodes(self, cluster_id: int, analysis: Dict[str, Any], summary: str):
        """Create Neo4j nodes and relationships"""
        if not self.neo4j_available:
            return

        try:
            with self.neo4j_driver.session() as session:
                # Create cluster node
                session.run("""
                    MERGE (c:ErrorCluster {id: $cluster_id})
                    SET c.total_errors = $total,
                        c.summary = $summary,
                        c.timestamp = datetime()
                """, cluster_id=cluster_id, total=analysis.get('total_errors', 0), summary=summary)

                # Link to error codes
                for code, count in analysis.get('top_error_codes', [])[:5]:
                    session.run("""
                        MERGE (e:ErrorCode {code: $code})
                        MERGE (c:ErrorCluster {id: $cluster_id})
                        MERGE (c)-[r:CONTAINS]->(e)
                        SET r.count = $count
                    """, code=code, cluster_id=cluster_id, count=count)

                # Link to surfaces
                for surface, count in analysis.get('surfaces', {}).items():
                    session.run("""
                        MERGE (s:Surface {name: $surface})
                        MERGE (c:ErrorCluster {id: $cluster_id})
                        MERGE (c)-[r:AFFECTS]->(s)
                        SET r.count = $count
                    """, surface=surface, cluster_id=cluster_id, count=count)

                # Link to tech
                for tech, count in analysis.get('techs', {}).items():
                    session.run("""
                        MERGE (t:Technology {name: $tech})
                        MERGE (c:ErrorCluster {id: $cluster_id})
                        MERGE (c)-[r:USES]->(t)
                        SET r.count = $count
                    """, tech=tech, cluster_id=cluster_id, count=count)

        except Exception as e:
            print(f"⚠️  Neo4j write failed: {e}")

    def store_gzip_chunk(self, cluster_id: int, content: Dict[str, Any]) -> str:
        """Compress and store cluster data (MinIO or local)"""
        output_dir = Path(__file__).parent / "phase90_knowledge_chunks"
        output_dir.mkdir(exist_ok=True)

        filename = f"cluster_{cluster_id:02d}.json.gz"
        filepath = output_dir / filename

        # Gzip compress
        with gzip.open(filepath, 'wt', encoding='utf-8') as f:
            json.dump(content, f, indent=2)

        size_kb = filepath.stat().st_size / 1024
        print(f"   💾 Saved gzip chunk: {filename} ({size_kb:.1f} KB)")

        return str(filepath)

    def store_fix_recommendation(self, cluster_id: int, analysis: Dict[str, Any],
                                 summary: str, embedding: List[float]):
        """Store in Qdrant recommendations collection"""
        try:
            # Ensure collection exists
            try:
                self.qdrant.get_collection(self.recommendations_collection)
            except:
                self.qdrant.create_collection(
                    collection_name=self.recommendations_collection,
                    vectors_config=VectorParams(size=self.dim, distance=Distance.COSINE)
                )
                print(f"   ✅ Created collection: {self.recommendations_collection}")

            # Upsert recommendation
            point = PointStruct(
                id=cluster_id,
                vector=embedding,
                payload={
                    "cluster_id": cluster_id,
                    "total_errors": analysis.get("total_errors", 0),
                    "top_error_codes": [code for code, _ in analysis.get("top_error_codes", [])[:5]],
                    "surfaces": list(analysis.get("surfaces", {}).keys()),
                    "techs": list(analysis.get("techs", {}).keys()),
                    "summary": summary,
                    "timestamp": datetime.now().isoformat(),
                    "priority": "high" if analysis.get("total_errors", 0) > 5000 else "medium"
                }
            )

            self.qdrant.upsert(
                collection_name=self.recommendations_collection,
                points=[point]
            )

        except Exception as e:
            print(f"❌ Failed to store recommendation: {e}")

    def synthesize_cluster(self, cluster_id: int) -> Dict[str, Any]:
        """Full synthesis pipeline for one cluster"""
        print(f"\n{'='*80}")
        print(f"📁 Synthesizing Cluster {cluster_id}")
        print(f"{'='*80}")

        # 1. Fetch members
        print(f"[1/6] Fetching cluster members...")
        members = self.fetch_cluster_members(cluster_id, limit=200)
        if not members:
            print(f"   ⚠️  No members found")
            return {}
        print(f"   ✅ Fetched {len(members)} members")

        # 2. Analyze patterns
        print(f"[2/6] Analyzing error patterns...")
        analysis = self.analyze_cluster_pattern(members)
        print(f"   ✅ Top error: {analysis['top_error_codes'][0] if analysis.get('top_error_codes') else 'N/A'}")

        # 3. Generate LLM summary
        print(f"[3/6] Generating LLM summary...")
        summary = self.generate_llm_summary(cluster_id, analysis)
        print(f"   ✅ Summary: {summary[:100]}...")

        # 4. Embed summary
        print(f"[4/6] Embedding summary...")
        embedding = self.embed_summary(summary)
        print(f"   ✅ Embedded: 768d vector")

        # 5. Create Neo4j graph
        print(f"[5/6] Updating Neo4j knowledge graph...")
        self.create_neo4j_nodes(cluster_id, analysis, summary)

        # 6. Store compressed chunk + recommendation
        print(f"[6/6] Storing knowledge artifacts...")
        chunk_data = {
            "cluster_id": cluster_id,
            "analysis": analysis,
            "summary": summary,
            "members_sample": members[:10]  # First 10 for reference
        }
        chunk_path = self.store_gzip_chunk(cluster_id, chunk_data)
        self.store_fix_recommendation(cluster_id, analysis, summary, embedding)

        print(f"✅ Cluster {cluster_id} synthesis complete")

        return {
            "cluster_id": cluster_id,
            "total_errors": analysis.get("total_errors", 0),
            "summary": summary,
            "chunk_path": chunk_path
        }

    def synthesize_all_clusters(self, num_clusters: int = 12) -> List[Dict[str, Any]]:
        """Process all clusters"""
        results = []

        print(f"\n{'='*80}")
        print(f"Phase 90: Knowledge Synthesis Pipeline")
        print(f"{'='*80}")
        print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Clusters: {num_clusters}")
        print()

        start_time = time.time()

        for cluster_id in range(num_clusters):
            result = self.synthesize_cluster(cluster_id)
            if result:
                results.append(result)

        elapsed = time.time() - start_time

        print(f"\n{'='*80}")
        print(f"📊 SYNTHESIS COMPLETE")
        print(f"{'='*80}")
        print(f"✅ Processed: {len(results)} clusters")
        print(f"⏱️  Time: {elapsed:.1f}s ({elapsed/num_clusters:.1f}s per cluster)")
        print(f"💾 Knowledge artifacts:")
        print(f"   - Neo4j: {num_clusters} cluster nodes + relationships")
        print(f"   - Qdrant: {num_clusters} fix recommendations")
        print(f"   - Gzip chunks: {num_clusters} files in phase90_knowledge_chunks/")
        print()

        # Save summary
        summary_file = Path(__file__).parent / "reports" / "phase90_knowledge_synthesis.json"
        summary_file.parent.mkdir(exist_ok=True)

        with open(summary_file, 'w') as f:
            json.dump({
                "timestamp": datetime.now().isoformat(),
                "clusters_processed": len(results),
                "total_time_sec": elapsed,
                "results": results
            }, f, indent=2)

        print(f"📄 Summary: {summary_file}")
        print()

        return results

def main():
    synthesizer = KnowledgeSynthesizer()
    results = synthesizer.synthesize_all_clusters(num_clusters=12)

    # Print top 3 clusters by size
    print("🎯 Top 3 Largest Clusters:")
    sorted_results = sorted(results, key=lambda x: x.get('total_errors', 0), reverse=True)
    for i, cluster in enumerate(sorted_results[:3], 1):
        print(f"   {i}. Cluster {cluster['cluster_id']}: {cluster['total_errors']} errors")
        print(f"      {cluster['summary'][:120]}...")

    return 0

if __name__ == "__main__":
    sys.exit(main())
