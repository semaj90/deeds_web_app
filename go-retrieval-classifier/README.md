# XGBoost Classifier + Hybrid Retrieval Sidecar

Go microservice that loads a trained XGBoost classifier and orchestrates hybrid search (Qdrant dense + PostgreSQL sparse) via Reciprocal Rank Fusion (RRF).

## Architecture

```
Query → Classifier → Lane Prediction → Hybrid Search → RRF Fusion → Results
                        ↓
                  (qdrant-dense, neo4j-authority, som-topology, bm25-fallback)
```

## Setup

### Build

```bash
go mod download
go build -o bin/classifier-sidecar ./cmd/classifier-sidecar
```

### Run

```bash
./bin/classifier-sidecar \
  -port 8095 \
  -model ../sveltekit-frontend/classifier-models/xgboost-lane-classifier.json \
  -metadata ../sveltekit-frontend/classifier-models/xgboost-metadata.json \
  -qdrant http://127.0.0.1:6333 \
  -postgres postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db \
  -log info
```

## API

### POST /predict

Predict retrieval lane and execute hybrid search.

**Request:**
```json
{
  "packet_key": "ace:packet:001",
  "features": [0.5, 10, 15, 5, 3.2, 1, 1, 0, 2, 0.75],
  "query_text": "authentication session validation",
  "case_id": "case-123",
  "top_k": 10,
  "hybrid_mode": "hybrid",
  "include_trace": true
}
```

**Features (order):**
1. `pagerank` (Neo4j authority score)
2. `som_row` (SOM grid row)
3. `som_col` (SOM grid column)
4. `community_id` (Louvain community)
5. `days_old` (age in days)
6. `has_content_vec` (0/1)
7. `has_summary_vec` (0/1)
8. `has_keyword_vec` (0/1)
9. `graph_degree` (Neo4j relationships)
10. `bm25_score` (BM25 FTS score)

**Response:**
```json
{
  "packet_key": "ace:packet:001",
  "lane": "qdrant-dense",
  "confidence": 0.9876,
  "candidates": [
    {
      "packet_key": "ace:packet:042",
      "source_ref": "src/lib/server/auth.ts",
      "title": "Session validator",
      "lane": "auth",
      "score": 0.92,
      "dense_score": 0.95,
      "sparse_score": 0.88,
      "rrf_rank": 1
    }
  ],
  "score": 0.87,
  "execution_time_ms": 142,
  "trace": {
    "classifier_confidence": 0.9876,
    "predicted_lane": "qdrant-dense",
    "mode": "hybrid",
    "top_k": 10,
    "num_candidates": 8
  }
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "classifier": "loaded"
}
```

### GET /lanes

List available retrieval lanes.

**Response:**
```json
{
  "classes": ["bm25-fallback", "neo4j-authority", "qdrant-dense", "som-topology"],
  "num_classes": 4
}
```

## Hybrid Search Modes

- **dense** — Qdrant ANN only (768-dim vector similarity)
- **sparse** — PostgreSQL BM25 FTS only (lexical match)
- **hybrid** — RRF blend of dense + sparse (0.6 weight dense, 0.4 weight sparse)

## Classifier Details

- **Model**: XGBoost multiclass (4 classes)
- **Features**: 10 numeric signals (pagerank, SOM, vectors, graph degree, BM25)
- **Format**: JSON trees (parsed in Go, cross-platform compatible)
- **Accuracy**: 99.90% on test set
- **Training data**: 58,365 packets, 80/20 train-test split

## Integration Points

### 1. SvelteKit /api/embed

The hybrid searcher calls SvelteKit's embedding endpoint to embed query text.

```bash
POST http://127.0.0.1:5173/api/embed
Content-Type: application/json

{
  "text": "session validation"
}
```

Returns:
```json
{
  "embedding": [0.1, 0.2, ...]
}
```

### 2. Qdrant /collections/codebase_chunks_768/points/search

Dense vector search via Qdrant HTTP API.

### 3. PostgreSQL atlas_packets

Sparse BM25 FTS via PostgreSQL full-text search.

## Performance

- **Classifier inference**: < 1ms per packet
- **Dense search (Qdrant ANN)**: 20-50ms for 10 results
- **Sparse search (PostgreSQL FTS)**: 10-30ms for 10 results
- **Hybrid (parallel)**: 20-50ms (parallelized dense + sparse)
- **RRF fusion**: < 5ms
- **Total**: ~50-100ms for full pipeline

## Future Enhancements

1. **Neo4j contextual trees**: Add Neo4j USED_CONCEPT edges to rank by graph authority
2. **JSONB autoencoding**: Compress 768-dim embeddings to 20x20 SOM grid for memory efficiency
3. **Confidence calibration**: Use Platt scaling to convert raw scores to probabilities
4. **Caching**: Add Redis L1 cache for exact query matches
5. **Observability**: Structured logging + Prometheus metrics
6. **Multi-model support**: Load different classifiers per domain (auth vs ui vs retrieval)

## Development

### Testing

```bash
# Test classifier loading
go test ./internal/classifier -v

# Test hybrid search
go test ./internal/hybrid -v

# Integration test
go run ./cmd/classifier-sidecar -port 8095 &
curl -X POST http://127.0.0.1:8095/predict -H "Content-Type: application/json" \
  -d '{
    "packet_key": "test",
    "features": [0.5, 10, 15, 5, 3.2, 1, 1, 0, 2, 0.75],
    "query_text": "auth session",
    "top_k": 5,
    "include_trace": true
  }'
```

### Performance Profiling

```bash
go run -cpuprofile=cpu.prof ./cmd/classifier-sidecar
# ... make requests ...
go tool pprof cpu.prof
```

## References

- XGBoost JSON export format: https://xgboost.readthedocs.io/
- Qdrant HTTP API: https://qdrant.tech/documentation/concepts/
- PostgreSQL FTS: https://www.postgresql.org/docs/current/textsearch.html
- RRF (Reciprocal Rank Fusion): https://en.wikipedia.org/wiki/Reciprocal_rank_fusion
