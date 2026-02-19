#!/usr/bin/env python3
"""
Simple test for the ML pipeline components
"""

from topic_pipeline import LegalTopicPipeline
import numpy as np

def test_ml_pipeline():
    # Initialize pipeline
    pipeline = LegalTopicPipeline()

    # Create sample embeddings
    embeddings = np.random.randn(50, 128).astype(np.float32)

    print('Testing k-means clustering...')
    kmeans_result = pipeline.cluster_embeddings_kmeans(embeddings, k=5)
    labels, centers, model = kmeans_result
    print(f'✅ k-means: {len(labels)} labels, {centers.shape} centroids')

    print('Testing SOM clustering...')
    som_result = pipeline.cluster_embeddings_som(embeddings, map_size=(5, 5))
    print(f'✅ SOM: {len(som_result.coordinates)} coordinates')

    print('Testing autoencoder...')
    compressed = pipeline.compress_embeddings_autoencoder(embeddings, latent_dim=32)
    print(f'✅ Autoencoder: {compressed.latent_vectors.shape} compressed from {embeddings.shape}')

    print('Testing full pipeline...')
    results = pipeline.run_full_pipeline(embeddings, k_clusters=3)
    print(f'✅ Full pipeline: {len(results["topic_clusters"])} topics generated')

    print('🎉 All ML pipeline tests passed!')
    return True

if __name__ == "__main__":
    test_ml_pipeline()