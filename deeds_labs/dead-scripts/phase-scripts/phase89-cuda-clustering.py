#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 89: CUDA-Accelerated Error Clustering
Uses GPU to cluster topological errors for batch summarization and recommendations
"""

import torch
import numpy as np
from sklearn.cluster import DBSCAN
from sentence_transformers import SentenceTransformer
import psycopg2
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import json
import sys
from datetime import datetime

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

class CUDAErrorClusterer:
    def __init__(self):
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        print(f"🔥 Using device: {self.device}")

        # Load embedding model on GPU
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        if self.device == 'cuda':
            self.model = self.model.to(self.device)

        # Connect to Qdrant
        self.qdrant = QdrantClient(host="localhost", port=6333)

        # Connect to PostgreSQL
        self.conn = psycopg2.connect(
            dbname="legal_ai_db",
            user="legal_admin",
            password="123456",
            host="localhost",
            port="5434"
        )

    def fetch_errors(self):
        """Fetch all errors from PostgreSQL"""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT id, source, line_number, raw_text, tags, embedding
            FROM raw_error_embeddings
            ORDER BY source, line_number
        """)

        errors = []
        for row in cursor.fetchall():
            error_id, source, line_number, raw_text, tags, embedding = row
            errors.append({
                'id': error_id,
                'source': source,
                'line_number': line_number,
                'raw_text': raw_text,
                'tags': tags or [],
                'embedding': embedding  # Already a vector from pgvector
            })

        cursor.close()
        return errors

    def cluster_errors_cuda(self, errors):
        """Cluster errors using GPU-accelerated cosine similarity"""
        print(f"🔍 Clustering {len(errors)} errors on {self.device}...")

        # Extract embeddings and convert to proper format
        valid_errors = []
        embeddings = []

        for e in errors:
            emb = e.get('embedding')

            # Skip if no embedding
            if emb is None:
                continue

            try:
                # Handle different formats from pgvector/JSON
                if isinstance(emb, str):
                    # Parse string representation: "[0.1, 0.2, ...]" or "{0.1, 0.2, ...}"
                    emb_str = emb.strip()
                    if emb_str.startswith('[') or emb_str.startswith('{'):
                        emb_str = emb_str.replace('{', '[').replace('}', ']')
                        emb = json.loads(emb_str)
                    else:
                        continue  # Skip malformed strings
                elif isinstance(emb, (list, tuple)):
                    emb = list(emb)
                elif isinstance(emb, np.ndarray):
                    if emb.dtype == np.object_:
                        # Handle object arrays by converting each element
                        emb = [float(x) for x in emb.tolist() if x is not None]
                    else:
                        emb = emb.tolist()
                elif hasattr(emb, '__iter__'):
                    emb = [float(x) for x in emb]
                else:
                    continue  # Skip unknown types

                # Validate embedding dimension and values
                if len(emb) == 0:
                    continue

                # Convert to floats
                emb = [float(x) for x in emb]

                # Check for valid dimensions (must match first valid embedding)
                if len(embeddings) == 0:
                    embeddings.append(emb)
                    valid_errors.append(e)
                elif len(emb) == len(embeddings[0]):
                    embeddings.append(emb)
                    valid_errors.append(e)
                # else: skip mismatched dimensions

            except (ValueError, TypeError, json.JSONDecodeError) as ex:
                # Skip malformed embeddings
                continue

        if len(embeddings) == 0:
            print("❌ ERROR: No valid embeddings found!")
            return {}

        print(f"   ✅ {len(embeddings)} valid embeddings (dim={len(embeddings[0])})")

        # Extract embeddings and convert to proper format (Robust Patch)
        embedding_dim = len(embeddings[0]) if embeddings else 768

        def to_vec(x):
            if x is None:
                return None
            # If it's a JSON string, parse it
            if isinstance(x, str):
                try:
                    x = json.loads(x)
                except:
                    return None
            # If it's a pgvector-like object, force list
            if hasattr(x, "tolist"):
                x = x.tolist()
            try:
                v = np.asarray(x, dtype=np.float32)
                # Validate dimension
                if len(v) != embedding_dim:
                    return None
                return v
            except:
                return None

        vecs = [to_vec(e) for e in embeddings]
        vecs = [v for v in vecs if v is not None]

        if not vecs:
            print("❌ ERROR: No valid float32 vectors after conversion!")
            return {}

        # Ensure fixed shape
        mat = np.stack(vecs, axis=0).astype(np.float32, copy=False)
        embeddings_tensor = torch.from_numpy(mat).to(self.device, non_blocking=True)

        # Normalize for cosine similarity
        embeddings_norm = torch.nn.functional.normalize(embeddings_tensor, p=2, dim=1)

        # Compute cosine similarity matrix on GPU
        similarity_matrix = torch.mm(embeddings_norm, embeddings_norm.t())

        # Clamp similarity to [-1, 1] to handle floating point precision
        similarity_matrix = torch.clamp(similarity_matrix, -1.0, 1.0)

        # Convert to distance matrix (1 - similarity), ensure non-negative
        distance_matrix = torch.clamp(1.0 - similarity_matrix, 0.0, 2.0).cpu().numpy()

        # DBSCAN clustering (runs on CPU with precomputed distances)
        clustering = DBSCAN(eps=0.3, min_samples=2, metric='precomputed')
        labels = clustering.fit_predict(distance_matrix)

        # Group errors by cluster
        clusters = {}
        for idx, label in enumerate(labels):
            if label == -1:
                continue  # Noise point

            if label not in clusters:
                clusters[label] = []

            if idx < len(errors):
                clusters[label].append(errors[idx])

        print(f"Found {len(clusters)} clusters (noise excluded)")
        return clusters

    def summarize_cluster(self, cluster):
        """Generate comprehensive summary for a cluster"""
        # Extract common patterns
        sources = [e['source'] for e in cluster]
        raw_texts = [e['raw_text'] for e in cluster]
        tags = [tag for e in cluster for tag in (e['tags'] or [])]

        # Get most common source
        from collections import Counter
        source_counts = Counter(sources)
        primary_source = source_counts.most_common(1)[0][0]

        # Get most common tags
        tag_counts = Counter(tags)
        top_tags = [tag for tag, _ in tag_counts.most_common(3)]

        # Extract error type from raw text
        error_types = []
        for text in raw_texts:
            if 'Type' in text:
                error_types.append('type_error')
            elif 'import' in text.lower():
                error_types.append('import_error')
            elif 'syntax' in text.lower():
                error_types.append('syntax_error')
            else:
                error_types.append('other')

        error_type = Counter(error_types).most_common(1)[0][0]

        return {
            'cluster_size': len(cluster),
            'primary_source': primary_source,
            'affected_files': len(set(sources)),
            'error_type': error_type,
            'top_tags': top_tags,
            'sample_errors': raw_texts[:3],  # First 3 examples
            'line_numbers': [e['line_number'] for e in cluster]
        }

    def rank_by_cosine_similarity(self, query_embedding, candidates):
        """Rank candidates by cosine similarity to query"""
        query_tensor = torch.tensor(query_embedding, device=self.device).unsqueeze(0)
        query_norm = torch.nn.functional.normalize(query_tensor, p=2, dim=1)

        candidate_embeddings = np.array([c['embedding'] for c in candidates])
        candidate_tensor = torch.tensor(candidate_embeddings, device=self.device)
        candidate_norm = torch.nn.functional.normalize(candidate_tensor, p=2, dim=1)

        # Cosine similarity
        similarities = torch.mm(query_norm, candidate_norm.t()).squeeze()

        # Clamp similarity to [-1, 1] to handle floating point precision
        similarities = torch.clamp(similarities, -1.0, 1.0).cpu().numpy()

        # Sort by similarity (descending)
        ranked_indices = np.argsort(-similarities)

        return [(candidates[idx], similarities[idx]) for idx in ranked_indices]

    def generate_recommendations(self, clusters):
        """Generate actionable recommendations from clusters"""
        recommendations = []

        for cluster_id, errors in clusters.items():
            summary = self.summarize_cluster(errors)

            # Determine priority based on cluster size and error type
            priority = 'high' if summary['cluster_size'] > 5 else 'medium'
            if summary['error_type'] == 'syntax_error':
                priority = 'critical'

            # Generate recommendation
            recommendation = {
                'cluster_id': int(cluster_id),  # Ensure native int for JSON serialization
                'priority': priority,
                'action': self._get_action(summary),
                'summary': summary,
                'timestamp': datetime.now().isoformat()
            }

            recommendations.append(recommendation)

        # Sort by priority
        priority_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
        recommendations.sort(key=lambda r: priority_order[r['priority']])

        return recommendations

    def _get_action(self, summary):
        """Determine recommended action based on summary"""
        error_type = summary['error_type']
        cluster_size = summary['cluster_size']

        if error_type == 'type_error' and cluster_size > 3:
            return f"Add type annotations to {summary['primary_source']} (affects {summary['affected_files']} files)"
        elif error_type == 'import_error':
            return f"Fix import paths in {summary['primary_source']}"
        elif error_type == 'syntax_error':
            return f"Fix syntax errors in {summary['primary_source']} (CRITICAL)"
        else:
            return f"Review {summary['cluster_size']} related errors in {summary['primary_source']}"

    def update_qdrant_tags(self, clusters, recommendations):
        """Update Qdrant collection with cluster tags and recommendations"""
        print("📊 Updating Qdrant with tags and recommendations...")

        collection_name = "phase89_error_clusters"

        # Detect dimension from first valid embedding
        embedding_dim = 768
        found_dim = False
        for errors in clusters.values():
            for e in errors:
                emb = e.get('embedding')
                if emb:
                    try:
                        if isinstance(emb, str): emb = json.loads(emb)
                        if hasattr(emb, "tolist"): emb = emb.tolist()
                        if isinstance(emb, (list, tuple, np.ndarray)):
                            embedding_dim = len(emb)
                            found_dim = True
                            break
                    except:
                        continue
            if found_dim: break

        print(f"   ℹ️  Detected embedding dimension: {embedding_dim}")

        # Delete old collection if dimensions changed, then recreate
        try:
            info = self.qdrant.get_collection(collection_name)
            # If collection exists with wrong dimensions, delete it
            if info.config.params.vectors.size != embedding_dim:
                self.qdrant.delete_collection(collection_name)
                raise Exception("Recreate with correct dimensions")
        except:
            self.qdrant.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=embedding_dim, distance=Distance.COSINE)
            )

        # Upload cluster centroids and recommendations
        points = []
        for cluster_id, errors in clusters.items():
            # Compute cluster centroid (mean embedding) - use cleaned embeddings
            valid_embeddings = []
            expected_dim = embedding_dim  # Default embedding dimension

            for e in errors:
                emb = e.get('embedding')
                if emb is None:
                    continue

                # Convert to proper format
                try:
                    if isinstance(emb, str):
                        emb = json.loads(emb)
                    if hasattr(emb, "tolist"):
                        emb = emb.tolist()

                    vec = np.asarray(emb, dtype=np.float32)

                    # Ensure consistent dimension
                    if len(valid_embeddings) == 0:
                        expected_dim = len(vec)
                        valid_embeddings.append(vec)
                    elif len(vec) == expected_dim:
                        valid_embeddings.append(vec)
                    # Skip vectors with wrong dimensions
                except Exception:
                    continue

            if len(valid_embeddings) == 0:
                continue  # Skip clusters with no valid embeddings

            # Stack and compute mean
            stacked = np.stack(valid_embeddings, axis=0)
            centroid = np.mean(stacked, axis=0)

            # Find matching recommendation
            recommendation = next((r for r in recommendations if r['cluster_id'] == cluster_id), None)

            # Safe access to error properties
            primary_source = errors[0].get('source', 'unknown') if errors else 'unknown'
            if primary_source is None:
                primary_source = 'unknown'

            # Convert cluster_id to native Python int
            point_id = int(cluster_id)

            point = PointStruct(
                id=point_id,
                vector=centroid.tolist(),
                payload={
                    'cluster_id': point_id,
                    'cluster_size': len(errors),
                    'primary_source': primary_source,
                    'error_type': recommendation['summary']['error_type'] if recommendation and recommendation.get('summary') else 'unknown',
                    'priority': recommendation['priority'] if recommendation else 'low',
                    'action': recommendation['action'] if recommendation else 'review',
                    'top_tags': recommendation['summary']['top_tags'] if recommendation and recommendation.get('summary') else [],
                    'timestamp': datetime.now().isoformat()
                }
            )
            points.append(point)

        if points:
            self.qdrant.upsert(collection_name=collection_name, points=points)
            print(f"✅ Uploaded {len(points)} cluster centroids to Qdrant")
        else:
            print("⚠️  No valid clusters to upload")

    def update_knowledge_base(self, recommendations):
        """Update PostgreSQL knowledge base with recommendations"""
        cursor = self.conn.cursor()

        # Drop table to ensure schema matches
        cursor.execute("DROP TABLE IF EXISTS error_cluster_recommendations")

        # Create recommendations table if it doesn't exist
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS error_cluster_recommendations (
                id SERIAL PRIMARY KEY,
                cluster_id INTEGER,
                priority TEXT,
                action TEXT,
                summary JSONB,
                created_at TIMESTAMP DEFAULT NOW(),
                applied BOOLEAN DEFAULT FALSE
            )
        """)

        # Insert recommendations
        for rec in recommendations:
            cursor.execute("""
                INSERT INTO error_cluster_recommendations (cluster_id, priority, action, summary)
                VALUES (%s, %s, %s, %s)
            """, (int(rec['cluster_id']), rec['priority'], rec['action'], json.dumps(rec['summary'])))

        self.conn.commit()
        cursor.close()
        print(f"✅ Saved {len(recommendations)} recommendations to PostgreSQL")

    def run(self):
        """Main pipeline"""
        print("🚀 Phase 89: CUDA-Accelerated Error Clustering\n")

        # 1. Fetch errors
        errors = self.fetch_errors()
        print(f"📊 Loaded {len(errors)} errors from PostgreSQL")

        if len(errors) == 0:
            print("⚠️  No errors found. Run svelte-check first.")
            return

        # 2. Cluster errors using GPU
        clusters = self.cluster_errors_cuda(errors)

        # 3. Generate recommendations
        recommendations = self.generate_recommendations(clusters)
        print(f"\n📋 Generated {len(recommendations)} recommendations:")
        for rec in recommendations[:5]:  # Show top 5
            print(f"   {rec['priority'].upper()}: {rec['action']}")

        # 4. Update Qdrant with tags
        self.update_qdrant_tags(clusters, recommendations)

        # 5. Update knowledge base
        self.update_knowledge_base(recommendations)

        # 6. Save report
        report = {
            'total_errors': len(errors),
            'total_clusters': len(clusters),
            'recommendations': recommendations,
            'timestamp': datetime.now().isoformat()
        }

        with open('reports/phase89-cuda-clustering-report.json', 'w') as f:
            json.dump(report, f, indent=2)

        print(f"\n✅ CUDA clustering complete! Report saved to reports/phase89-cuda-clustering-report.json")

        self.conn.close()

if __name__ == '__main__':
    clusterer = CUDAErrorClusterer()
    clusterer.run()
