# Miniforge ML Sidecar + Local-Deep-Research Integration

**Status**: ✅ Complete wiring | Separate from Miniforge Python pipeline
**Three-process architecture**: Orchestration (LDR) + ML Ranking (Miniforge) + Synthesis (Gemma4)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ SvelteKit Frontend (:5173)                                      │
│  POST /api/research/deep { query, top_k, rank_model, ... }     │
└─────────────────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────────────────┐
│ Deep Research Orchestrator (TypeScript)                          │
│  1. Dense search → Qdrant (:6333)                               │
│  2. Web search → Firecrawl (:8101)                              │
│  3. Autonomous research → Local-Deep-Research (:5000)           │
│  4. ML Ranking → Miniforge Sidecar (:8095)                      │
│  5. Synthesis → Gemma4 (:8090)                                  │
└─────────────────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────────────────┐
│ COMPLETELY SEPARATE SERVICES (DO NOT MIX)                        │
├─────────────────────────────────────────────────────────────────┤
│ Miniforge ML Sidecar (:8095)                                    │
│  - Language: Python (conda environment)                         │
│  - GPU: CUDA (if PyTorch compiled with it)                      │
│  - Models: Naive Bayes, XGBoost, cuVS, RAPIDS                  │
│  - Endpoints: /rank, /classify, /cluster                        │
│                                                                 │
│ Local-Deep-Research (:5000)                                     │
│  - Language: Python (pip install local-deep-research)           │
│  - GPU: NO (orchestration only, delegates to endpoints)         │
│  - Purpose: Autonomous web research + search engine routing    │
│  - Endpoint: /research                                          │
│                                                                 │
│ Gemma4 (:8090)                                                  │
│  - Language: llama.cpp C++                                      │
│  - GPU: CUDA (TurboQuant KV cache)                              │
│  - Model: gemma4-legal-iq4xs-direct.gguf                        │
│  - Endpoint: /v1/chat/completions                               │
│                                                                 │
│ EmbeddingGemma (:11434)                                         │
│  - Language: Go (Ollama)                                        │
│  - GPU: CUDA                                                    │
│  - Model: embeddinggemma:latest (768-dim)                       │
│  - Endpoint: /api/embeddings                                    │
│                                                                 │
│ Qdrant (:6333)                                                  │
│  - Language: Rust                                               │
│  - GPU: CUDA (optional)                                         │
│  - Purpose: Dense vector search (HNSW)                          │
│  - Collection: codebase_chunks_768 (40.5K points)              │
└─────────────────────────────────────────────────────────────────┘
```

## Installation & Startup

### 1. Miniforge Python Environment (ML Sidecar)

**Install dependencies:**
```bash
# Activate Miniforge environment
conda create -n ldr python=3.11
conda activate ldr

# Install ML libraries with CUDA support
conda install pytorch::pytorch pytorch::torchvision pytorch::torchaudio -c pytorch
pip install flask scikit-learn xgboost numpy

# Optional GPU acceleration
pip install cuvs  # GPU-accelerated clustering
pip install umap  # Dimensionality reduction

# Verify CUDA
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
```

**Start Miniforge ML Sidecar:**
```bash
conda activate ldr
cd sveltekit-frontend/scripts/ml/ml_sidecar
python -m server
# Server runs on http://127.0.0.1:8095
```

### 2. Local-Deep-Research (Orchestration)

**Install from pip:**
```bash
# NEW environment (separate from Miniforge)
conda create -n ldr-web python=3.11
conda activate ldr-web

# Install LDR (orchestration only, no GPU)
pip install local-deep-research searxng requests

# Start web interface
ldr-web
# Web interface on http://127.0.0.1:5000
```

**Key difference**: LDR orchestration ≠ ML ranking. LDR routes queries to your Miniforge sidecar via HTTP.

### 3. SearXNG (Distributed Search)

```bash
# Docker (recommended for isolation)
docker run -d --name searxng -p 8888:8080 searxng/searxng:latest

# Or direct Python
pip install searxng
python -m searx.webapp
# Running on http://127.0.0.1:8888
```

### 4. Firecrawl (Web Scraping)

```bash
# Docker
docker run -d --name firecrawl -p 8101:3000 mendableai/firecrawl:latest

# Set env for SvelteKit
export FIRECRAWL_URL=http://127.0.0.1:8101
export FIRECRAWL_API_KEY=sk-local-test
```

### 5. Verify All Services

```bash
# Health checks
curl http://127.0.0.1:8095/health  # Miniforge ML Sidecar
curl http://127.0.0.1:5000         # Local-Deep-Research
curl http://127.0.0.1:8090/v1/models  # Gemma4
curl http://127.0.0.1:11434/api/tags  # EmbeddingGemma
curl http://127.0.0.1:6333         # Qdrant

# Output should show status: ok, CUDA available: true
```

## Startup Script (WSL2)

**Combined startup** (start all ML services at once):

```bash
bash sveltekit-frontend/scripts/ml/start-ml-stack.sh
```

This script:
1. Checks conda environment is active
2. Kills any existing services on :8095, :5000
3. Starts Miniforge ML Sidecar (:8095)
4. Starts Local-Deep-Research (:5000)
5. Verifies health checks
6. Outputs service URLs and logs

## Usage from SvelteKit

### TypeScript Client

```typescript
import { rankCandidates, classifyText, clusterVectors } from '$lib/server/ml/miniforge-ml-sidecar';

// Rank search results
const ranked = await rankCandidates({
  query: 'What are the key requirements for evidence admissibility?',
  candidates: [
    { id: '1', text: 'Federal Rule 401...', source: 'qdrant', score: 0.9 },
    { id: '2', text: 'Evidence must be...', source: 'web', score: 0.7 },
  ],
  model: 'xgboost',
  top_k: 5,
});

// Classify text
const classifications = await classifyText({
  text: 'The witness testified that...',
  model: 'domain_classifier',
  top_k: 3,
});

// Cluster vectors
const clusters = await clusterVectors({
  vectors: [[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]],
  n_clusters: 2,
  algorithm: 'cuVS_kmeans',
});
```

### Python Usage (in LDR workflows)

```python
from ml_sidecar.ldr_adapter import MLRanker, MLClassifier

# Initialize ranker
ranker = MLRanker(model='xgboost', top_k=5)

# Use in LDR query
query = "What are the key requirements for evidence admissibility?"
results = ldr.search(query, max_results=20)

# Rank with ML
candidates = [
    {'id': r['id'], 'text': r['title'] + ' ' + r['snippet'], 'source': r['source']}
    for r in results
]
ranked = ranker.rank(query, candidates)

# Classify top result
classifier = MLClassifier(model='domain_classifier')
classifications = classifier.classify(ranked[0]['text'])
```

## API Endpoints

### Miniforge ML Sidecar (:8095)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check + CUDA status |
| `/info` | GET | Model versions + device info |
| `/rank` | POST | Rank candidates (XGBoost/Naive Bayes) |
| `/classify` | POST | Classify text (domain/semantic) |
| `/cluster` | POST | Cluster vectors (cuVS/RAPIDS) |

### Local-Deep-Research (:5000)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Web interface |
| `/research` | POST | Autonomous research query |
| `/api/search` | POST | Search multiple engines |
| `/api/history` | GET | Query history |

### SvelteKit Deep Research Route (:5173)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/research/deep` | POST | Full orchestration: Qdrant + Firecrawl + LDR + ML + Gemma4 |

**Request:**
```json
{
  "query": "What are the key requirements for evidence admissibility in federal court?",
  "rank_model": "xgboost",
  "include_web_search": true,
  "include_ldr": true,
  "top_k": 5
}
```

**Response:**
```json
{
  "query": "...",
  "sources": {
    "qdrant": [{"id": "...", "text": "...", "score": 0.9}],
    "web": [{"title": "...", "url": "...", "snippet": "...", "score": 0.8}],
    "ldr": [{"source": "...", "content": "...", "score": 0.75}]
  },
  "ranked": [
    {"id": "...", "text": "...", "source": "qdrant", "ml_score": 0.92, "rank": 1}
  ],
  "synthesis": "Based on Federal Rule 401...",
  "duration_ms": 12450
}
```

## Environment Variables

**In `.env` or shell:**

```bash
# Miniforge ML Sidecar
MINIFORGE_SIDECAR_URL=http://127.0.0.1:8095

# Local-Deep-Research
LDR_URL=http://127.0.0.1:5000

# Firecrawl
FIRECRAWL_URL=http://127.0.0.1:8101
FIRECRAWL_API_KEY=sk-local-test

# Existing services (already running)
QDRANT_URL=http://127.0.0.1:6333
OLLAMA_URL=http://127.0.0.1:11434
GEMMA4_URL=http://127.0.0.1:8090
```

## Troubleshooting

### ML Sidecar won't start

```bash
# Check if port 8095 is already in use
lsof -i :8095

# Check Flask app for errors
python -m ml_sidecar.server  # Run in foreground

# Verify PyTorch CUDA support
python -c "import torch; print(torch.cuda.is_available())"
```

### LDR not responding

```bash
# Check port 5000
lsof -i :5000

# Check logs
tail -f /tmp/ldr.log

# Reinstall LDR
pip install --upgrade local-deep-research
```

### ML ranking fails in deep research route

```bash
# Check health
curl http://127.0.0.1:8095/health

# Check model info
curl http://127.0.0.1:8095/info

# The /api/research/deep route has fallback (degrades gracefully to upstream scores)
```

### CUDA not available

```bash
# Verify CUDA in Miniforge environment
conda activate ldr
python -c "import torch; print(torch.cuda.is_available())"

# If False, reinstall PyTorch with CUDA support
conda install pytorch::pytorch pytorch::torchvision pytorch::torchaudio -c pytorch
```

## Performance Targets

| Operation | Expected Duration | Notes |
|-----------|-------------------|-------|
| Dense search (Qdrant) | 50-200ms | 768-dim HNSW |
| Web search (Firecrawl) | 2-5s | HTTP request + parsing |
| Autonomous research (LDR) | 10-60s | Multiple search engines + synthesis |
| ML ranking (XGBoost) | 100-500ms | CPU-bound on 10-20 candidates |
| Gemma4 synthesis | 5-15s | TurboQuant KV cache, short response |
| **Total (/api/research/deep)** | **15-90s** | Cache hits much faster |

## Next Steps

1. ✅ Install Miniforge environment
2. ✅ Install Local-Deep-Research
3. ✅ Start both services
4. ✅ Test `/api/research/deep` via SvelteKit
5. ⏳ Integrate with case law search / evidence retrieval
6. ⏳ Add more ML models (domain-specific classifiers)
7. ⏳ Implement durable execution for long-running research queries

## FAQ

**Q: Will LDR use GPU acceleration?**  
A: No. LDR is orchestration-only and routes to your ML sidecar (:8095) and Gemma4 (:8090), which use GPU. The GPU work happens in those endpoint services, not in LDR itself.

**Q: Why separate Python environments?**  
A: Miniforge (conda) handles CUDA dependencies better than pip on WSL2. Keeping them separate prevents dependency conflicts (PyTorch + Flask vs sklearn + xgboost).

**Q: Do I need to run all 5 services?**  
A: For full functionality, yes. But the `/api/research/deep` route has graceful fallbacks—if any service is down, it skips that lane and tries the next one. Minimum: Qdrant + Gemma4 + Miniforge sidecar.

**Q: Can I use this without Qdrant?**  
A: Yes, but you lose dense vector search. The route will fall back to web search (Firecrawl) + autonomous research (LDR) + ML ranking.

**Q: What if I don't install cuVS or RAPIDS?**  
A: The ML sidecar will fall back to sklearn (slower clustering), but still fully functional. cuVS/RAPIDS are optional for GPU acceleration of clustering.
