#!/usr/bin/env python3
"""
Phase 46: Code Deduplication and Clustering
Removes duplicate code and clusters similar code snippets
"""

import os
import json
import numpy as np
from typing import List, Dict, Any, Tuple, Set
from qdrant_client import QdrantClient
from sklearn.cluster import DBSCAN
from sklearn.metrics.pairwise import cosine_similarity
import argparse
import logging
from collections import defaultdict
import hashlib

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CodeClustering:
    """Deduplicates and clusters code embeddings"""

    def __init__(self, qdrant_url: str = "http://localhost:6333", collection_name: str = "code_embeddings"):
        self.qdrant_url = qdrant_url
        self.collection_name = collection_name
        self.client = None

    def connect_qdrant(self):
        """Connect to Qdrant"""
        self.client = QdrantClient(url=self.qdrant_url)
        logger.info("Connected to Qdrant")

    def fetch_all_embeddings(self) -> Tuple[List[np.ndarray], List[Dict[str, Any]]]:
        """Fetch all embeddings and metadata from Qdrant"""
        logger.info("Fetching embeddings from Qdrant...")

        # Scroll through all points
        embeddings = []
        metadata = []

        offset = None
        batch_size = 1000

        while True:
            response = self.client.scroll(
                collection_name=self.collection_name,
                limit=batch_size,
                offset=offset,
                with_payload=True,
                with_vectors=True
            )

            if not response[0]:
                break

            for point in response[0]:
                embeddings.append(np.array(point.vector))
                metadata.append({
                    'id': point.id,
                    'payload': point.payload
                })

            offset = response[1]
            logger.info(f"Fetched {len(embeddings)} embeddings so far...")

        logger.info(f"Total embeddings fetched: {len(embeddings)}")
        return embeddings, metadata

    def deduplicate_embeddings(self, embeddings: List[np.ndarray], metadata: List[Dict[str, Any]],
                              similarity_threshold: float = 0.95) -> Tuple[List[np.ndarray], List[Dict[str, Any]]]:
        """Remove near-duplicate embeddings"""
        logger.info("Starting deduplication...")

        if not embeddings:
            return [], []

        # Convert to numpy array
        embeddings_array = np.array(embeddings)

        # Calculate pairwise similarities (this can be memory intensive for large datasets)
        logger.info("Calculating similarity matrix...")
        similarity_matrix = cosine_similarity(embeddings_array)

        # Find duplicates
        to_keep = set(range(len(embeddings)))
        duplicates_found = 0

        for i in range(len(embeddings)):
            if i not in to_keep:
                continue

            for j in range(i + 1, len(embeddings)):
                if j not in to_keep:
                    continue

                if similarity_matrix[i, j] >= similarity_threshold:
                    # Keep the one with more detailed metadata
                    meta_i = metadata[i]['payload']['metadata']
                    meta_j = metadata[j]['payload']['metadata']

                    # Prefer function/class over generic code
                    type_priority = {'function': 3, 'class': 2, 'file': 1, 'ast_node': 0}
                    priority_i = type_priority.get(meta_i.get('type', ''), 0)
                    priority_j = type_priority.get(meta_j.get('type', ''), 0)

                    if priority_j > priority_i:
                        to_keep.remove(i)
                        duplicates_found += 1
                        break
                    else:
                        to_keep.remove(j)
                        duplicates_found += 1

        # Filter embeddings and metadata
        filtered_embeddings = [embeddings[i] for i in sorted(to_keep)]
        filtered_metadata = [metadata[i] for i in sorted(to_keep)]

        logger.info(f"Removed {duplicates_found} duplicates, kept {len(filtered_embeddings)} unique embeddings")
        return filtered_embeddings, filtered_metadata

    def cluster_embeddings(self, embeddings: List[np.ndarray], metadata: List[Dict[str, Any]],
                          eps: float = 0.3, min_samples: int = 3) -> Dict[int, List[Dict[str, Any]]]:
        """Cluster similar code using DBSCAN"""
        logger.info("Starting clustering...")

        if not embeddings:
            return {}

        embeddings_array = np.array(embeddings)

        # Perform DBSCAN clustering
        clustering = DBSCAN(eps=eps, min_samples=min_samples, metric='cosine').fit(embeddings_array)

        # Group by cluster
        clusters = defaultdict(list)
        for i, label in enumerate(clustering.labels_):
            clusters[label].append({
                'embedding': embeddings[i],
                'metadata': metadata[i]
            })

        # Log cluster statistics
        n_clusters = len([k for k in clusters.keys() if k != -1])
        n_noise = len(clusters.get(-1, []))

        logger.info(f"Found {n_clusters} clusters and {n_noise} noise points")

        # Print cluster sizes
        cluster_sizes = {}
        for label, points in clusters.items():
            if label != -1:
                cluster_sizes[label] = len(points)

        if cluster_sizes:
            sorted_sizes = sorted(cluster_sizes.items(), key=lambda x: x[1], reverse=True)
            logger.info("Top 10 cluster sizes:")
            for label, size in sorted_sizes[:10]:
                logger.info(f"  Cluster {label}: {size} points")

        return dict(clusters)

    def select_representative_samples(self, clusters: Dict[int, List[Dict[str, Any]]],
                                    samples_per_cluster: int = 5) -> List[Dict[str, Any]]:
        """Select representative samples from each cluster"""
        logger.info("Selecting representative samples...")

        representatives = []

        for label, points in clusters.items():
            if label == -1:  # Skip noise points
                continue

            cluster_points = points

            # For small clusters, take all points
            if len(cluster_points) <= samples_per_cluster:
                representatives.extend(cluster_points)
            else:
                # Select diverse samples (simple approach: take first N)
                # Could be improved with more sophisticated selection
                representatives.extend(cluster_points[:samples_per_cluster])

        logger.info(f"Selected {len(representatives)} representative samples")
        return representatives

    def save_clustered_data(self, representatives: List[Dict[str, Any]], output_file: str):
        """Save clustered data to JSONL"""
        logger.info(f"Saving clustered data to {output_file}")

        with open(output_file, 'w', encoding='utf-8') as f:
            for rep in representatives:
                # Extract text and metadata
                payload = rep['metadata']['payload']
                text = payload.get('text', '')
                metadata = payload.get('metadata', {})

                record = {
                    'text': text,
                    'metadata': metadata,
                    'cluster_info': {
                        'id': rep['metadata']['id']
                    }
                }

                json.dump(record, f, ensure_ascii=False)
                f.write('\n')

        logger.info(f"Saved {len(representatives)} records to {output_file}")

    def run_pipeline(self, output_file: str, similarity_threshold: float = 0.95,
                    eps: float = 0.3, min_samples: int = 3, samples_per_cluster: int = 5):
        """Run the complete deduplication and clustering pipeline"""
        logger.info("Starting deduplication and clustering pipeline")

        # Connect to Qdrant
        self.connect_qdrant()

        # Fetch embeddings
        embeddings, metadata = self.fetch_all_embeddings()

        if not embeddings:
            logger.warning("No embeddings found in Qdrant")
            return

        # Deduplicate
        unique_embeddings, unique_metadata = self.deduplicate_embeddings(
            embeddings, metadata, similarity_threshold
        )

        # Cluster
        clusters = self.cluster_embeddings(unique_embeddings, unique_metadata, eps, min_samples)

        # Select representatives
        representatives = self.select_representative_samples(clusters, samples_per_cluster)

        # Save results
        self.save_clustered_data(representatives, output_file)

        logger.info("Pipeline complete!")

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Deduplicate and cluster code embeddings")
    parser.add_argument("output_file", help="Output JSONL file for clustered data")
    parser.add_argument("--qdrant-url", default="http://localhost:6333", help="Qdrant URL")
    parser.add_argument("--collection", default="code_embeddings", help="Qdrant collection name")
    parser.add_argument("--similarity-threshold", type=float, default=0.95, help="Similarity threshold for deduplication")
    parser.add_argument("--eps", type=float, default=0.3, help="DBSCAN eps parameter")
    parser.add_argument("--min-samples", type=int, default=3, help="DBSCAN min_samples parameter")
    parser.add_argument("--samples-per-cluster", type=int, default=5, help="Samples to keep per cluster")

    args = parser.parse_args()

    clustering = CodeClustering(args.qdrant_url, args.collection)
    clustering.run_pipeline(
        args.output_file,
        args.similarity_threshold,
        args.eps,
        args.min_samples,
        args.samples_per_cluster
    )

if __name__ == "__main__":
    main()