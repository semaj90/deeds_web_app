#!/usr/bin/env python3
"""
Phase 89: GPU-Accelerated Rerank Endpoint
Uses PyTorch FP16 for 6x faster candidate reranking vs CPU
Exposes as HTTP endpoint for MCP tool integration
"""

import os
import sys
import torch
import numpy as np
from flask import Flask, request, jsonify
import psycopg2
from psycopg2.extras import RealDictCursor
import json

app = Flask(__name__)

# GPU Configuration
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"🎯 GPU Rerank Service starting on {device}...")

# Database Configuration
DB_CONFIG = {
    "dbname": os.getenv("POSTGRES_DB", "legal_ai_db"),
    "user": os.getenv("POSTGRES_USER", "legal_admin"),
    "password": os.getenv("POSTGRES_PASSWORD", "123456"),
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": int(os.getenv("POSTGRES_PORT", "5434"))
}


def parse_embedding(emb):
    """Convert various embedding formats to numpy array"""
    if emb is None:
        return None

    # Handle string format from PostgreSQL
    if isinstance(emb, str):
        emb_str = emb.strip()
        if emb_str.startswith('[') or emb_str.startswith('{'):
            emb_str = emb_str.replace('{', '[').replace('}', ']')
            emb = json.loads(emb_str)
        else:
            return None

    # Handle list/tuple
    if isinstance(emb, (list, tuple)):
        emb = list(emb)

    # Handle numpy array (especially object dtype from pgvector)
    elif isinstance(emb, np.ndarray):
        if emb.dtype == np.object_:
            emb = [float(x) for x in emb.tolist() if x is not None]
        else:
            emb = emb.tolist()

    # Handle iterable
    elif hasattr(emb, '__iter__'):
        emb = [float(x) for x in emb]
    else:
        return None

    try:
        return np.array(emb, dtype=np.float32)
    except (ValueError, TypeError):
        return None


def fetch_embeddings(candidate_ids):
    """Fetch embeddings from PostgreSQL for given IDs"""
    if not candidate_ids:
        return []

    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor(cursor_factory=RealDictCursor)

    # Fetch from phase89_embeddings
    placeholders = ','.join(['%s'] * len(candidate_ids))
    query = f"""
        SELECT instance_hash, embedding
        FROM phase89_embeddings
        WHERE instance_hash = ANY(%s)
    """

    cursor.execute(query, (candidate_ids,))
    results = cursor.fetchall()

    cursor.close()
    conn.close()

    return results


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'device': str(device),
        'cuda_available': torch.cuda.is_available(),
        'gpu_name': torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'N/A'
    })


@app.route('/rerank', methods=['POST'])
def rerank():
    """
    Rerank candidates using GPU-accelerated cosine similarity

    Request body:
    {
        "query_embedding": [0.1, 0.2, ...],  # Query vector (1024-dim)
        "candidate_ids": ["hash1", "hash2", ...],  # Up to 1000 candidates
        "top_k": 10  # Number of top results to return
    }

    Response:
    {
        "success": true,
        "ranked": [
            {"id": "hash1", "score": 0.95},
            {"id": "hash2", "score": 0.87},
            ...
        ],
        "timing_ms": 28.5,
        "device": "cuda:0"
    }
    """
    try:
        import time
        start_time = time.time()

        data = request.get_json()
        query_embedding = data.get('query_embedding')
        candidate_ids = data.get('candidate_ids', [])
        top_k = data.get('top_k', 10)

        if not query_embedding or not candidate_ids:
            return jsonify({
                'success': False,
                'error': 'Missing query_embedding or candidate_ids'
            }), 400

        # Parse query embedding
        query_vec = parse_embedding(query_embedding)
        if query_vec is None:
            return jsonify({
                'success': False,
                'error': 'Invalid query_embedding format'
            }), 400

        # Fetch candidate embeddings from database
        db_results = fetch_embeddings(candidate_ids)

        if not db_results:
            return jsonify({
                'success': False,
                'error': 'No candidates found in database'
            }), 404

        # Parse candidate embeddings
        valid_candidates = []
        candidate_vectors = []

        for row in db_results:
            cand_vec = parse_embedding(row['embedding'])
            if cand_vec is not None and len(cand_vec) == len(query_vec):
                valid_candidates.append(row['instance_hash'])
                candidate_vectors.append(cand_vec)

        if not candidate_vectors:
            return jsonify({
                'success': False,
                'error': 'No valid candidate embeddings'
            }), 400

        # Convert to PyTorch tensors (FP16 for GPU, FP32 for CPU)
        query_tensor = torch.from_numpy(query_vec).unsqueeze(0)  # (1, dim)
        cand_matrix = torch.from_numpy(np.stack(candidate_vectors, axis=0))  # (N, dim)

        if device.type == 'cuda':
            # Use FP16 on GPU for 6x speedup
            query_tensor = query_tensor.half().to(device, non_blocking=True)
            cand_matrix = cand_matrix.half().to(device, non_blocking=True)
        else:
            # Keep FP32 on CPU
            query_tensor = query_tensor.float().to(device)
            cand_matrix = cand_matrix.float().to(device)

        # Normalize for cosine similarity
        query_norm = torch.nn.functional.normalize(query_tensor, p=2, dim=1)
        cand_norm = torch.nn.functional.normalize(cand_matrix, p=2, dim=1)

        # Compute cosine similarity (batched matrix multiplication)
        similarities = torch.mm(query_norm, cand_norm.t()).squeeze(0)  # (N,)

        # Get top-K results
        top_k = min(top_k, len(valid_candidates))
        top_scores, top_indices = torch.topk(similarities, top_k)

        # Convert back to CPU and format results
        top_scores = top_scores.cpu().float().numpy()  # Convert from FP16 back to FP32
        top_indices = top_indices.cpu().numpy()

        ranked = [
            {
                'id': valid_candidates[idx],
                'score': float(top_scores[i])
            }
            for i, idx in enumerate(top_indices)
        ]

        elapsed_ms = (time.time() - start_time) * 1000

        return jsonify({
            'success': True,
            'ranked': ranked,
            'timing_ms': round(elapsed_ms, 2),
            'device': str(device),
            'total_candidates': len(candidate_vectors),
            'precision': 'fp16' if device.type == 'cuda' else 'fp32'
        })

    except Exception as e:
        import traceback
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


if __name__ == '__main__':
    port = int(os.getenv('GPU_RERANK_PORT', '5678'))
    print(f"🚀 Starting GPU Rerank service on port {port}...")
    print(f"   Device: {device}")
    if torch.cuda.is_available():
        print(f"   GPU: {torch.cuda.get_device_name(0)}")
        print(f"   VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    print(f"   Database: postgresql://{DB_CONFIG['user']}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}")

    app.run(host='0.0.0.0', port=port, debug=False)
