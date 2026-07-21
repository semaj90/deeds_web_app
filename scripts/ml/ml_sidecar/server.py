#!/usr/bin/env python3
"""
Miniforge ML Sidecar Server
Runs on :8095, serves Naive Bayes / XGBoost / cuVS / RAPIDS ML models
Designed to be called by SvelteKit and Local-Deep-Research

Start with:
  conda activate ldr
  python -m ml_sidecar.server
"""

import json
import time
import torch
import numpy as np
from typing import List, Dict, Any
from flask import Flask, request, jsonify
import logging

# ML imports (installed in conda environment)
try:
    from sklearn.naive_bayes import MultinomialNB
    from sklearn.feature_extraction.text import TfidfVectorizer
    import xgboost as xgb
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    print("Warning: sklearn/xgboost not available. Install with: pip install scikit-learn xgboost")

try:
    import cuvs
    CUVS_AVAILABLE = True
except ImportError:
    CUVS_AVAILABLE = False
    print("Warning: cuVS not available. Install with: pip install cuvs")

try:
    import umap
    UMAP_AVAILABLE = True
except ImportError:
    UMAP_AVAILABLE = False
    print("Warning: UMAP not available. Install with: pip install umap-learn")

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Global model instances
models = {
    'xgboost': None,
    'naive_bayes': None,
    'vectorizer': None,
    'cuVS_index': None,
}

# Track CUDA availability
CUDA_AVAILABLE = torch.cuda.is_available()
DEVICE = 'cuda' if CUDA_AVAILABLE else 'cpu'


def load_models():
    """Load pre-trained ML models from disk or initialize new ones."""
    global models

    if SKLEARN_AVAILABLE:
        try:
            # Try to load saved models
            logger.info("Loading XGBoost model...")
            models['xgboost'] = xgb.Booster()
            models['xgboost'].load_model('models/xgboost_ranker.model')

            logger.info("Loading Naive Bayes + Vectorizer...")
            import pickle
            with open('models/naive_bayes.pkl', 'rb') as f:
                models['naive_bayes'], models['vectorizer'] = pickle.load(f)
        except FileNotFoundError:
            logger.warning("Pre-trained models not found. Using dummy models for demo.")
            # Initialize dummy models for demo
            models['vectorizer'] = TfidfVectorizer(max_features=100)
            models['naive_bayes'] = MultinomialNB()
            # Dummy XGBoost booster (won't be used in this demo)

    logger.info(f"CUDA available: {CUDA_AVAILABLE}")
    logger.info(f"Device: {DEVICE}")


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        'status': 'ok',
        'cuda_available': CUDA_AVAILABLE,
        'device': DEVICE,
        'sklearn_available': SKLEARN_AVAILABLE,
        'cuvS_available': CUVS_AVAILABLE,
        'umap_available': UMAP_AVAILABLE,
    })


@app.route('/info', methods=['GET'])
def info():
    """Get model info (versions, CUDA status, etc.)."""
    return jsonify({
        'models_loaded': {
            'xgboost': models['xgboost'] is not None,
            'naive_bayes': models['naive_bayes'] is not None,
            'vectorizer': models['vectorizer'] is not None,
        },
        'cuda': {
            'available': CUDA_AVAILABLE,
            'device': DEVICE,
            'device_name': torch.cuda.get_device_name(0) if CUDA_AVAILABLE else None,
        },
        'versions': {
            'torch': torch.__version__,
            'numpy': np.__version__,
        },
    })


@app.route('/rank', methods=['POST'])
def rank():
    """
    Rank candidates using ML model (XGBoost or Naive Bayes).

    Request JSON:
    {
      "candidates": [{"id": "...", "text": "...", "source": "qdrant", "score": 0.8}],
      "query": "...",
      "model": "xgboost" | "naive_bayes",
      "top_k": 5
    }
    """
    start = time.time()

    try:
        data = request.get_json()
        candidates = data.get('candidates', [])
        query = data.get('query', '')
        model_name = data.get('model', 'naive_bayes')
        top_k = data.get('top_k', len(candidates))

        if not SKLEARN_AVAILABLE:
            return jsonify({'error': 'sklearn not available'}), 503

        if not candidates:
            return jsonify({'ranked': [], 'model_used': model_name, 'duration_ms': 0}), 200

        # Vectorize query and candidates
        candidate_texts = [c['text'] for c in candidates]

        if model_name == 'naive_bayes':
            # Use TF-IDF vectorizer + Naive Bayes
            if models['vectorizer'] is None:
                # Fit on the fly (demo mode)
                models['vectorizer'] = TfidfVectorizer(max_features=100)
                all_texts = [query] + candidate_texts
                models['vectorizer'].fit(all_texts)

            query_vec = models['vectorizer'].transform([query])
            candidate_vecs = models['vectorizer'].transform(candidate_texts)

            # Use Naive Bayes to predict relevance probability
            if models['naive_bayes'] is None:
                models['naive_bayes'] = MultinomialNB()
                # Dummy training data for demo
                dummy_texts = models['vectorizer'].transform(['relevant', 'not relevant'])
                models['naive_bayes'].fit(dummy_texts, [1, 0])

            scores = models['naive_bayes'].predict_proba(candidate_vecs)[:, 1]

        elif model_name == 'xgboost':
            # Use XGBoost for ranking (requires feature extraction)
            if models['xgboost'] is None:
                logger.warning("XGBoost model not loaded. Falling back to score only.")
                scores = np.array([c.get('score', 0.5) for c in candidates])
            else:
                # Create feature matrix from upstream scores + text length
                features = np.array([
                    [c.get('score', 0.5), len(c['text']), len(query)]
                    for c in candidates
                ])
                scores = models['xgboost'].predict(xgb.DMatrix(features))

        else:
            return jsonify({'error': f'Unknown model: {model_name}'}), 400

        # Combine upstream score with ML score (weighted)
        ml_scores = scores.tolist()
        combined = []
        for i, (c, ml_score) in enumerate(zip(candidates, ml_scores)):
            upstream = c.get('score', 0.5)
            # Blend: 60% ML, 40% upstream
            final_score = 0.6 * ml_score + 0.4 * upstream
            combined.append({
                'id': c['id'],
                'text': c['text'],
                'source': c['source'],
                'upstream_score': upstream,
                'ml_score': ml_score,
                'final_score': final_score,
            })

        # Sort by final score and return top_k
        ranked = sorted(combined, key=lambda x: x['final_score'], reverse=True)[:top_k]
        for i, r in enumerate(ranked):
            r['rank'] = i + 1

        duration = (time.time() - start) * 1000
        return jsonify({
            'ranked': ranked,
            'model_used': model_name,
            'duration_ms': duration,
        }), 200

    except Exception as e:
        logger.exception("Ranking error")
        return jsonify({'error': str(e)}), 500


@app.route('/classify', methods=['POST'])
def classify():
    """
    Classify text using domain classifier or semantic tagger.

    Request JSON:
    {
      "text": "...",
      "model": "domain_classifier" | "semantic_tagger",
      "top_k": 3
    }
    """
    start = time.time()

    try:
        data = request.get_json()
        text = data.get('text', '')
        model_name = data.get('model', 'domain_classifier')
        top_k = data.get('top_k', 3)

        if not text:
            return jsonify({'classifications': [], 'model_used': model_name, 'duration_ms': 0}), 200

        # Dummy classification (replace with real model inference)
        if model_name == 'domain_classifier':
            # Keywords for legal domain detection
            legal_keywords = ['court', 'judge', 'law', 'statute', 'case', 'evidence']
            score = sum(1 for kw in legal_keywords if kw.lower() in text.lower()) / len(legal_keywords)

            classifications = [
                {'label': 'legal', 'confidence': min(score, 0.95)},
                {'label': 'technical', 'confidence': 0.3},
                {'label': 'general', 'confidence': 1 - score},
            ]

        elif model_name == 'semantic_tagger':
            # Dummy semantic tags
            classifications = [
                {'label': 'entity_extraction', 'confidence': 0.7},
                {'label': 'sentiment_neutral', 'confidence': 0.6},
                {'label': 'source_legal', 'confidence': 0.5},
            ]

        else:
            return jsonify({'error': f'Unknown model: {model_name}'}), 400

        # Sort by confidence and return top_k
        top = sorted(classifications, key=lambda x: x['confidence'], reverse=True)[:top_k]

        duration = (time.time() - start) * 1000
        return jsonify({
            'classifications': top,
            'model_used': model_name,
            'duration_ms': duration,
        }), 200

    except Exception as e:
        logger.exception("Classification error")
        return jsonify({'error': str(e)}), 500


@app.route('/cluster', methods=['POST'])
def cluster():
    """
    Cluster vectors using cuVS (GPU-accelerated KMeans) or RAPIDS UMAP.

    Request JSON:
    {
      "vectors": [[1.0, 2.0, ...], ...],
      "n_clusters": 5,
      "algorithm": "cuVS_kmeans" | "rapids_umap"
    }
    """
    start = time.time()

    try:
        data = request.get_json()
        vectors = np.array(data.get('vectors', []))
        n_clusters = data.get('n_clusters', 5)
        algorithm = data.get('algorithm', 'cuVS_kmeans')

        if vectors.size == 0:
            return jsonify({
                'cluster_ids': [],
                'centroids': [],
                'algorithm_used': algorithm,
                'duration_ms': 0,
            }), 200

        if algorithm == 'cuVS_kmeans':
            if not CUVS_AVAILABLE:
                return jsonify({'error': 'cuVS not available'}), 503

            # Use cuVS for GPU-accelerated KMeans
            from cuml.cluster import KMeans as cuMLKMeans
            kmeans = cuMLKMeans(n_clusters=n_clusters, output_type='numpy')
            cluster_ids = kmeans.fit_predict(vectors)
            centroids = kmeans.cluster_centers_.tolist()

        elif algorithm == 'rapids_umap':
            if not UMAP_AVAILABLE:
                return jsonify({'error': 'UMAP not available'}), 503

            # Dummy UMAP clustering (real RAPIDS UMAP requires cuML)
            from sklearn.cluster import KMeans
            kmeans = KMeans(n_clusters=n_clusters)
            cluster_ids = kmeans.fit_predict(vectors)
            centroids = kmeans.cluster_centers_.tolist()

        else:
            return jsonify({'error': f'Unknown algorithm: {algorithm}'}), 400

        duration = (time.time() - start) * 1000
        return jsonify({
            'cluster_ids': cluster_ids.tolist(),
            'centroids': centroids,
            'algorithm_used': algorithm,
            'duration_ms': duration,
        }), 200

    except Exception as e:
        logger.exception("Clustering error")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    load_models()
    app.run(host='127.0.0.1', port=8095, debug=False, threaded=True)
