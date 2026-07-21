---
type: tool
title: Miniforge ML Ranking Sidecar
id: tool/ml-ranking-sidecar
status: active
owners:
  - legal-ai-team
source_refs:
  - scripts/ml/ml_sidecar/server.py
  - sveltekit-frontend/src/lib/server/ml/miniforge-ml-sidecar.ts
related:
  - pipeline/retrieval-ranking-synthesis
  - system/deep-research
---

# Miniforge ML Ranking Sidecar

## Overview

The Miniforge ML sidecar is a Python Flask HTTP server running at :8095 that provides XGBoost and Naive Bayes candidate ranking for the deep research pipeline. It accepts feature vectors from TypeScript, performs ML inference, and returns normalized scores for score blending.

## Architecture

```
SvelteKit (TypeScript)
    ↓
/api/research/deep endpoint
    ↓
Extract features (semantic_similarity, bm25, freshness, authority, ...)
    ↓
HTTP POST to http://127.0.0.1:8095/rank
    ↓
Miniforge Flask server (Python)
    ├─ Load XGBoost model
    ├─ Normalize features
    ├─ Inference (GPU via CUDA, CPU fallback)
    └─ Return normalized scores [0, 1]
    ↓
TypeScript receives scores
    ↓
Score blending: 0.6·ML + 0.4·upstream
    ↓
RRF fusion + top-K selection
```

## HTTP API

### POST /rank

**Request**:
```json
{
  "candidates": [
    {
      "semantic_similarity": 0.87,
      "bm25_score": 0.72,
      "freshness": 0.65,
      "authority_score": 0.8,
      "length_score": 0.9,
      "recency_boost": 0.5
    },
    ...
  ],
  "model": "xgboost"
}
```

**Response**:
```json
{
  "scores": [0.89, 0.75, 0.68, ...],
  "metadata": {
    "model": "xgboost",
    "timestamp": "2026-07-20T...",
    "inference_ms": 45
  }
}
```

### POST /classify

**Request**:
```json
{
  "text": "This is evidence of hearsay under FRE 801(c).",
  "model": "naive_bayes"
}
```

**Response**:
```json
{
  "class": "evidence_rule",
  "confidence": 0.92,
  "probabilities": {
    "evidence_rule": 0.92,
    "procedural_rule": 0.05,
    "other": 0.03
  }
}
```

### POST /cluster

**Request**:
```json
{
  "vectors": [[0.1, 0.2, 0.3, ...], [0.15, 0.22, 0.28, ...], ...],
  "n_clusters": 5,
  "model": "kmeans"
}
```

**Response**:
```json
{
  "clusters": [0, 1, 0, 2, ...],
  "centroids": [[0.12, 0.21, 0.29, ...], ...],
  "inertia": 12.45,
  "metadata": {
    "model": "kmeans",
    "gpu_used": true
  }
}
```

### GET /health

**Response**:
```json
{
  "status": "healthy",
  "models": {
    "xgboost": { "loaded": true, "gpu_available": true },
    "naive_bayes": { "loaded": true },
    "kmeans": { "loaded": true, "gpu_available": true }
  },
  "gpu": {
    "available": true,
    "device": "NVIDIA RTX 3060 Ti",
    "vram_mb": 8192,
    "vram_free_mb": 2145
  }
}
```

## Installation & Setup

### Prerequisites

```bash
# Python 3.9+
python --version  # Python 3.9.x or later

# Miniforge (conda)
conda --version
```

### Install Dependencies

```bash
# Create virtual environment
conda create -n ml-sidecar python=3.9 -y
conda activate ml-sidecar

# Install packages (from sveltekit-frontend/scripts/ml/ml_sidecar/)
pip install -r requirements.txt
```

### requirements.txt

```
flask==2.3.3
scikit-learn==1.3.0
xgboost==2.0.0
numpy==1.24.3
cuml==23.08 (optional, for GPU clustering)
cupy==12.0 (optional, for GPU acceleration)
cuda-python==12.1 (optional, for NVIDIA CUDA)
```

### Launch Server

```bash
# From sveltekit-frontend/scripts/ml/ml_sidecar/
python server.py --port 8095 --gpu

# Or background (Anaconda terminal)
start python server.py --port 8095 --gpu
```

**Environment Variables**:
```bash
export ML_SIDECAR_PORT=8095
export ML_SIDECAR_GPU=1          # 1=use GPU, 0=CPU only
export ML_SIDECAR_MODEL_PATH=/path/to/models
```

## TypeScript Client

**Location**: `sveltekit-frontend/src/lib/server/ml/miniforge-ml-sidecar.ts`

**Exports**:
```typescript
export async function rankCandidates(
  candidates: CandidateFeatures[],
  model: 'xgboost' | 'naive_bayes'
): Promise<number[]>

export async function classifyText(
  text: string,
  model: 'naive_bayes'
): Promise<ClassificationResult>

export async function clusterVectors(
  vectors: number[][],
  nClusters: number,
  model: 'kmeans'
): Promise<ClusteringResult>

export async function healthCheck(): Promise<HealthStatus>
```

**Usage**:

```typescript
import { rankCandidates, healthCheck } from '$lib/server/ml/miniforge-ml-sidecar';

// Check health before ranking
const health = await healthCheck();
if (!health.models.xgboost.loaded) {
  console.warn('XGBoost model not loaded, skipping ML ranking');
  return fallbackRanking;
}

// Extract features from candidates
const features = candidates.map(c => ({
  semantic_similarity: c.score,
  bm25_score: c.bm25,
  freshness: calculateFreshness(c.publishDate),
  authority_score: calculateAuthority(c.statute),
  length_score: c.summary.length / 500,  // Prefer 500 tokens
  recency_boost: c.updatedAt > 7 ? 0.5 : 0  // Within 7 days
}));

// Call ML sidecar
const mlScores = await rankCandidates(features, 'xgboost');

// Blend scores
const finalScores = candidates.map((c, i) => ({
  ...c,
  score: 0.6 * mlScores[i] + 0.4 * c.upstreamScore
}));
```

## Feature Engineering

The ML sidecar expects normalized features in [0, 1] range:

| Feature | Calculation | Notes |
|---|---|---|
| `semantic_similarity` | Cosine distance (Qdrant) | Already normalized [0, 1] |
| `bm25_score` | BM25 ranking / max_possible | Normalize by dividing by typical max (usually 10–20) |
| `freshness` | (now - publish_date) / 30_days | Clamped to [0, 1] (older = 1) |
| `authority_score` | 0.0–1.0 by source type | Statute +0.8, precedent +0.6, blog +0.2, test +0.0 |
| `length_score` | actual_tokens / 500 | Prefer 200–500 tokens, clamp [0, 1] |
| `recency_boost` | 1.0 if updated within 7 days, 0.0 else | Binary boost for recent changes |

**Normalization function**:
```typescript
function normalizeFeature(value: number, min: number, max: number): number {
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

const normalizedFeatures = {
  semantic_similarity: c.score,  // Already [0, 1]
  bm25_score: normalizeFeature(c.bm25, 0, 20),
  freshness: normalizeFeature((Date.now() - c.publishDate) / 1000 / 86400, 0, 30),
  authority_score: c.authorityScore,  // Manual mapping [0, 1]
  length_score: normalizeFeature(c.summary.split(/\s+/).length, 0, 1000),
  recency_boost: c.updatedAt > Date.now() - 7 * 86400e3 ? 1.0 : 0.0
};
```

## Model Training (Future)

Currently, XGBoost model (`xgboost_legal_ranker.pkl`) is pre-trained on 7,051 labeled samples (4-grade relevance scale: 0=irrelevant, 1=somewhat, 2=relevant, 3=highly relevant).

To retrain after collecting new labels:

```python
import xgboost as xgb
from sklearn.metrics import ndcg_score

# Load training data
X_train = load_feature_matrix('data/training_features.csv')
y_train = load_labels('data/training_labels.csv')

# Train model
model = xgb.XGBRanker(
    objective='rank:ndcg',
    eval_metric=['ndcg'],
    learning_rate=0.1,
    n_estimators=100,
    max_depth=6,
    tree_method='gpu_hist' if gpu_available else 'hist'
)
model.fit(X_train, y_train, group=group_sizes)

# Evaluate
y_pred = model.predict(X_test)
ndcg = ndcg_score(y_test, y_pred, k=5)
print(f"NDCG@5: {ndcg:.3f}")

# Save
model.save_model('xgboost_legal_ranker.pkl')
```

## Performance Targets

| Operation | Target | Notes |
|---|---|---|
| /rank (50 candidates) | 50–100ms | XGBoost inference (GPU faster) |
| /classify (single text) | 10–20ms | Naive Bayes is fast |
| /cluster (1000 vectors, k=5) | 100–500ms | GPU cuML or CPU scikit-learn |
| /health | <5ms | Quick connectivity check |

## Error Handling

**Timeout**: If `/rank` takes >500ms, fall back to upstream score blending (no ML).

```typescript
try {
  const mlScores = await Promise.race([
    rankCandidates(features, 'xgboost'),
    new Promise((_, reject) => setTimeout(() => reject('Timeout'), 500))
  ]);
} catch (err) {
  console.warn('ML ranking timeout, using upstream scores only', err);
  // Fall back to non-ML ranking
}
```

**Not Loaded**: If `/health` shows model not loaded, skip ML ranking gracefully.

```typescript
const health = await healthCheck();
if (!health.models.xgboost.loaded) {
  console.warn('Skipping ML ranking: model not loaded');
  return candidates.sort((a, b) => b.score - a.score);  // Upstream only
}
```

## Troubleshooting

| Issue | Diagnosis | Fix |
|---|---|---|
| Connection refused (:8095) | Server not running | Run `python server.py --port 8095` in terminal |
| "Model not found" | `xgboost_legal_ranker.pkl` missing | Download pre-trained model or train new one |
| GPU not being used | CUDA not configured | Install `cuml`, `cupy`, `nvidia-ml-py` |
| Slow inference (>500ms) | CPU-only mode | Install CUDA 12.1, restart server with `--gpu` flag |
| OOM errors (cuml) | GPU memory insufficient | Reduce batch size or use CPU mode (`--gpu 0`) |
