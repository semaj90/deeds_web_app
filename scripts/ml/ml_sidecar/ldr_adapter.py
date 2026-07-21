#!/usr/bin/env python3
"""
Local-Deep-Research Adapter for Miniforge ML Sidecar
Integrates the ML ranking/classification service into LDR workflows

Usage:
  from ml_sidecar.ldr_adapter import MLRanker
  ranker = MLRanker(model='xgboost', top_k=5)
  ranked_results = ranker.rank(query, candidates)
"""

import requests
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

SIDECAR_URL = 'http://127.0.0.1:8095'


class MLRanker:
    """Ranks LDR search results using ML sidecar (XGBoost or Naive Bayes)."""

    def __init__(self, model: str = 'xgboost', top_k: int = 5, sidecar_url: str = SIDECAR_URL):
        self.model = model
        self.top_k = top_k
        self.sidecar_url = sidecar_url
        self._check_health()

    def _check_health(self) -> bool:
        """Verify sidecar is running."""
        try:
            resp = requests.get(f'{self.sidecar_url}/health', timeout=5)
            resp.raise_for_status()
            logger.info(f"ML sidecar ready at {self.sidecar_url}")
            return True
        except Exception as e:
            logger.warning(f"ML sidecar not available: {e}")
            return False

    def rank(
        self,
        query: str,
        candidates: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Rank candidates using ML sidecar.

        Args:
            query: Search query
            candidates: List of dicts with 'id', 'text', 'source', optionally 'score'

        Returns:
            Ranked candidates with 'rank' and 'ml_score' fields
        """
        try:
            payload = {
                'query': query,
                'candidates': candidates,
                'model': self.model,
                'top_k': self.top_k,
            }

            resp = requests.post(
                f'{self.sidecar_url}/rank',
                json=payload,
                timeout=30,
            )
            resp.raise_for_status()

            result = resp.json()
            logger.info(
                f"Ranked {len(result['ranked'])} candidates in {result['duration_ms']:.1f}ms"
            )
            return result['ranked']

        except Exception as e:
            logger.error(f"Ranking failed: {e}")
            # Fallback: return candidates sorted by upstream score
            return sorted(
                candidates,
                key=lambda x: x.get('score', 0),
                reverse=True,
            )[:self.top_k]


class MLClassifier:
    """Classifies text using ML sidecar (domain classifier or semantic tagger)."""

    def __init__(self, model: str = 'domain_classifier', sidecar_url: str = SIDECAR_URL):
        self.model = model
        self.sidecar_url = sidecar_url
        self._check_health()

    def _check_health(self) -> bool:
        """Verify sidecar is running."""
        try:
            resp = requests.get(f'{self.sidecar_url}/health', timeout=5)
            resp.raise_for_status()
            return True
        except Exception as e:
            logger.warning(f"ML sidecar not available: {e}")
            return False

    def classify(self, text: str, top_k: int = 3) -> List[Dict[str, Any]]:
        """
        Classify text using ML sidecar.

        Args:
            text: Text to classify
            top_k: Return top K classifications

        Returns:
            List of classifications with 'label' and 'confidence'
        """
        try:
            payload = {
                'text': text,
                'model': self.model,
                'top_k': top_k,
            }

            resp = requests.post(
                f'{self.sidecar_url}/classify',
                json=payload,
                timeout=30,
            )
            resp.raise_for_status()

            result = resp.json()
            logger.info(f"Classified with {len(result['classifications'])} labels")
            return result['classifications']

        except Exception as e:
            logger.error(f"Classification failed: {e}")
            return []


class MLClustering:
    """Clusters vectors using cuVS (GPU) or RAPIDS."""

    def __init__(self, algorithm: str = 'cuVS_kmeans', sidecar_url: str = SIDECAR_URL):
        self.algorithm = algorithm
        self.sidecar_url = sidecar_url
        self._check_health()

    def _check_health(self) -> bool:
        """Verify sidecar is running."""
        try:
            resp = requests.get(f'{self.sidecar_url}/health', timeout=5)
            resp.raise_for_status()
            return True
        except Exception as e:
            logger.warning(f"ML sidecar not available: {e}")
            return False

    def cluster(
        self,
        vectors: List[List[float]],
        n_clusters: int = 5,
    ) -> Dict[str, Any]:
        """
        Cluster vectors using ML sidecar.

        Args:
            vectors: List of vectors (each vector is a list of floats)
            n_clusters: Number of clusters

        Returns:
            Dict with 'cluster_ids' and 'centroids'
        """
        try:
            payload = {
                'vectors': vectors,
                'n_clusters': n_clusters,
                'algorithm': self.algorithm,
            }

            resp = requests.post(
                f'{self.sidecar_url}/cluster',
                json=payload,
                timeout=60,
            )
            resp.raise_for_status()

            result = resp.json()
            logger.info(
                f"Clustered {len(vectors)} vectors into {n_clusters} clusters in {result['duration_ms']:.1f}ms"
            )
            return result

        except Exception as e:
            logger.error(f"Clustering failed: {e}")
            return {'cluster_ids': [], 'centroids': [], 'algorithm_used': self.algorithm}


# Example: Using with Local-Deep-Research
def example_ldr_pipeline():
    """Example of integrating ML ranking into LDR workflow."""
    from local_deep_research import LocalDeepResearch

    # Initialize LDR
    ldr = LocalDeepResearch(
        search_engines=['searxng', 'arxiv'],
        llm='ollama',
        llm_url='http://127.0.0.1:8090/v1',
        model='gemma4-legal-iq4xs-direct.gguf',
    )

    # Initialize ML ranker
    ranker = MLRanker(model='xgboost', top_k=5)

    # Run LDR query
    query = "What are the key requirements for evidence admissibility in federal court?"
    results = ldr.search(query, max_results=20)

    # Rank results with ML
    candidates = [
        {'id': r['id'], 'text': r['title'] + ' ' + r['snippet'], 'source': r['source'], 'score': r['relevance']}
        for r in results
    ]
    ranked = ranker.rank(query, candidates)

    # Classify top result
    classifier = MLClassifier(model='domain_classifier')
    top_text = ranked[0]['text'] if ranked else ''
    classifications = classifier.classify(top_text)

    return {
        'query': query,
        'ranked_results': ranked,
        'classifications': classifications,
    }


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    result = example_ldr_pipeline()
    print(result)
