# Advanced Multimodal Retriever Engine - Backend

GPU-accelerated cognitive retrieval system combining RAG, KAG, VAG, HMM, and SOM for legal document discovery.

## Project Structure

```
backend/
├── services/          # Core service implementations
├── cuda/              # CUDA kernel implementations
├── proto/             # gRPC protocol definitions
├── api/               # FastAPI bridge layer
├── tests/             # Test suite
│   ├── unit/          # Unit tests
│   ├── integration/   # Integration tests
│   └── benchmarks/    # Performance benchmarks
├── requirements.txt   # Python dependencies
├── package.json       # TypeScript dependencies
├── pytest.ini         # Pytest configuration
├── tsconfig.json      # TypeScript configuration
└── .env.example       # Environment variables template
```

## Setup

### 1. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 2. Install TypeScript Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 4. Start Services

```bash
# Start Qdrant (vector store)
docker run -p 6333:6333 qdrant/qdrant

# Start Neo4j (graph database)
docker run -p 7687:7687 -p 7474:7474 neo4j:latest

# Start Redis (cache)
docker run -p 6379:6379 redis:latest

# Start MinIO (object storage)
docker run -p 9000:9000 -p 9001:9001 minio/minio
```

### 5. Run Tests

```bash
# Run all tests
pytest

# Run unit tests only
pytest -m unit

# Run property-based tests
pytest -m property

# Run with coverage
pytest --cov=backend/services
```

### 6. Start API Server

```bash
uvicorn backend.api.bridge:app --reload --host 0.0.0.0 --port 8000
```

## Components

### Phase 1: Rune System & Embeddings
- `services/rune_uuid_generator.ts` - Rune-to-tensor UUID mapping
- `services/embedding_service.py` - FP16 embedding generation
- `services/latent_quantizer.py` - INT4 quantization
- `services/atlas_indexer.py` - Tile index computation
- `services/rune_bank_store.py` - Rune bank persistence

### Phase 2: GPU Tile Processing
- `services/atlas_generator.py` - N64 tile atlas generation
- `cuda/glyph_tile_kernel.cu` - GPU tile processor kernel
- `services/tile_loader.py` - Tile loading and caching

### Phase 3: Graph & Vector Stores
- `services/kag_loader.py` - Neo4j KAG loader
- `services/qdrant_client.py` - Qdrant integration
- `services/faiss_builder.py` - FAISS index builder

### Phase 4: Multimodal Retrieval
- `services/query_embedder.py` - Query embedding
- `services/kag_expander.py` - KAG expansion
- `services/fusion_ranker.py` - Result fusion
- `services/multimodal_retriever.py` - Main retriever

### Phase 5: Inference Engines
- `services/hmm_engine.py` - HMM missing-link inference
- `services/som_engine.py` - SOM fallback clustering
- `services/recall_monitor.py` - Semantic recall monitoring

### Phase 6: GPU Manifold Processing
- `cuda/manifold.cu` - Quaternion transformer (4D→3D)
- `cuda/tricubic.cu` - Tricubic interpolation
- `services/manifold_projector.py` - Manifold projection service

### Phase 7: Latent Encoding & Cartridges
- `services/latent_collapse.py` - Latent collapse to rune
- `services/latent_marker.py` - Latent marker encoding
- `services/cartridge_builder.py` - CH-ROM97 cartridge assembly
- `services/cartridge_serializer.py` - Cartridge serialization

### Phase 8: Visual Context & Hybrid Search
- `services/yolo_detector.py` - YOLO object detection
- `services/sam_segmenter.py` - SAM segmentation
- `services/visual_context.py` - Visual context enhancement
- `services/faiss_reranker.py` - FAISS re-ranking

### Phase 9: Bridge Layer & API
- `api/bridge.py` - FastAPI bridge layer
- `api/error_handler.py` - Error handling
- `api/async_processor.py` - Async processing
- `api/validators.py` - Request validation

## API Endpoints

### Search
```
GET /bridge/search?q=<query>
```

Returns ranked retrieval results with 3D coordinates and cartridge data.

### 3D Memory Palace
```
GET /bridge/3d/memory?q=<query>
```

Returns 3D coordinates for memory palace visualization.

### Cartridge Assembly
```
POST /bridge/cartridge
Content-Type: application/json

{
  "results": [...]
}
```

Returns CH-ROM97 cartridge binary data.

## Configuration

See `.env.example` for all configuration options.

Key settings:
- `EMBEDDING_MODEL`: Sentence transformer model
- `EMBEDDING_DIM`: Embedding dimensionality (768)
- `CUDA_DEVICE`: GPU device ID
- `CUDA_BATCH_SIZE`: Batch size for GPU processing
- `FAISS_NPROBE`: Number of probes for FAISS search
- `SOM_GRID_SIZE`: Self-organizing map grid size

## Performance

Typical latencies (RTX 3060 Ti):
- Query embedding: ~10ms
- Qdrant ANN search: ~50ms
- Neo4j KAG expansion: ~100ms
- CUDA tile similarity: ~30ms
- Manifold projection: ~20ms
- Total end-to-end: ~250ms

## Testing

### Unit Tests
```bash
pytest tests/unit -v
```

### Property-Based Tests
```bash
pytest tests/ -m property -v
```

### Integration Tests
```bash
pytest tests/integration -v
```

### Benchmarks
```bash
pytest tests/benchmarks --benchmark-only
```

## Troubleshooting

### CUDA Out of Memory
- Reduce `CUDA_BATCH_SIZE` in `.env`
- Use FP16 quantization for embeddings
- Enable gradient checkpointing

### Slow Qdrant Queries
- Increase `FAISS_NPROBE` for better recall
- Build FAISS index with more training data
- Use SSD for Qdrant storage

### Neo4j Connection Issues
- Verify Neo4j is running: `docker ps | grep neo4j`
- Check credentials in `.env`
- Ensure bolt port (7687) is accessible

## Development

### Adding a New Service

1. Create service file in `backend/services/`
2. Implement service class with clear interface
3. Add unit tests in `tests/unit/`
4. Add property-based tests for correctness properties
5. Integrate into bridge layer in `backend/api/bridge.py`

### Adding a CUDA Kernel

1. Create `.cu` file in `backend/cuda/`
2. Implement kernel with clear interface
3. Create Python wrapper using pycuda
4. Add unit tests with CPU reference implementation
5. Benchmark against CPU version

## License

Proprietary - Legal AI System

## Contact

For questions or issues, contact the development team.
