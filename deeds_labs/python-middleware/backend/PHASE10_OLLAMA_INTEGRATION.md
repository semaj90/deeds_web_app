# Phase 10: Ollama Integration Guide

## Overview

This guide shows how to integrate the optimized `chr97_image_processor.py` with your existing CH-ROM97 pipeline, using Ollama for embeddings instead of loading large HF models locally.

## Architecture

```
Legal Document Image
    ↓
YOLO Detection (yolov8n.pt)
    ↓
SAM Segmentation (optional)
    ↓
Ollama Embeddings (embeddinggemma or gemma3-legal)
    ↓
DBSCAN Clustering + 4D Quantization
    ↓
Qdrant + Postgres + MinIO Storage
    ↓
image_topology.json
    ↓
CH-ROM97 Builder (chr97.mjs)
    ↓
demo.chr97 Cartridge
```

## Setup

### 1. Install Dependencies

```bash
pip install -r backend/requirements-phase10.txt
```

**Key packages:**
- `numpy`, `scikit-learn`, `umap-learn` – data processing
- `torch`, `torchvision`, `opencv-python` – vision
- `ultralytics` – YOLO detection
- `segment-anything` – SAM segmentation
- `qdrant-client`, `psycopg2-binary`, `boto3` – storage
- `requests` – Ollama API calls

**Dropped (no longer needed):**
- `transformers` – no HF model loading
- `ibm/granite-13b-instruct-v2` – use Ollama instead
- `google/gemma-2b` – use Ollama instead
- `trl` – not needed for inference

### 2. Start Ollama

```bash
# Terminal 1: Start Ollama server
ollama serve

# Terminal 2: Pull embedding model
ollama pull embeddinggemma:latest
# OR for legal-specific embeddings:
ollama pull gemma3-legal:latest
```

### 3. Set Environment Variables

```bash
# .env or shell
export OLLAMA_URL=http://localhost:11434
export OLLAMA_EMBED_MODEL=embeddinggemma:latest
# OR
export OLLAMA_EMBED_MODEL=gemma3-legal:latest
```

### 4. Ensure Backend Services Running

```bash
# Qdrant (vector DB)
docker run -p 6333:6333 qdrant/qdrant

# PostgreSQL (with pgvector)
docker run -e POSTGRES_PASSWORD=password -p 5432:5432 postgres:15-alpine

# MinIO (S3-compatible storage)
docker run -p 9000:9000 -p 9001:9001 minio/minio server /data
```

## Usage

### Basic Image Processing

```python
from backend.services.chr97_image_processor import CHR97ImageProcessor

processor = CHR97ImageProcessor()

metadata = {
    "case_id": "LEGAL-IMG-001",
    "document_type": "contract",
    "confidentiality": "privileged",
}

topology = processor.process_legal_image(
    "path/to/legal_document.jpg",
    metadata
)

# Outputs:
# - image_topology.json (for CH-ROM97 builder)
# - Vectors in Qdrant + Postgres
# - Summaries in MinIO
```

### Integration with CH-ROM97 Builder

```bash
# 1. Process image → image_topology.json
python backend/services/chr97_image_processor.py

# 2. Build manifold (existing)
python manifold_demo.py

# 3. Build cartridge with both topologies
node chr97.mjs build

# 4. Inspect result
node chr97.mjs inspect demo.chr97
```

### CH-ROM97 Builder Integration (chr97.mjs)

```javascript
import { CartridgeBuilder } from './chr97.mjs';

const builder = new CartridgeBuilder();

// Load manifold topology
const manifoldTopology = JSON.parse(fs.readFileSync('manifold_export.json'));
builder.addManifoldTopology(manifoldTopology);

// Load image topology
const imageTopology = JSON.parse(fs.readFileSync('image_topology.json'));
builder.addImageTopology(imageTopology);

// Build cartridge
const cartridge = builder.build();
fs.writeFileSync('demo.chr97', cartridge);
```

## Data Flow

### Input: Legal Document Image
```
sample_legal_document.jpg (1920x1080, RGB)
```

### Processing:
1. **YOLO Detection** → Bounding boxes for text regions, tables, signatures
2. **SAM Segmentation** → Precise masks for each detected region
3. **Ollama Embeddings** → 768-d text vectors (embeddinggemma)
4. **Visual Features** → 515-d color histogram + shape metrics
5. **Combined** → 1283-d vectors for clustering
6. **DBSCAN** → Cluster similar regions
7. **4D Quantization** → NES/N64-style spatial hashing

### Output: image_topology.json
```json
{
  "version": "1.0",
  "type": "image_topology",
  "metadata": {
    "case_id": "LEGAL-IMG-001",
    "document_type": "contract",
    "confidentiality": "privileged"
  },
  "clusters": [0, 0, 1, 1, 2, -1],
  "topology_4d": [
    [-0.5, 0.3, 0.8, -0.2],
    [0.1, -0.6, 0.4, 0.9],
    ...
  ],
  "quantized_topology": [
    [64, 102, 204, 51],
    [77, 51, 128, 230],
    ...
  ],
  "segment_count": 6,
  "cluster_count": 3,
  "embeddings_dim": 1283,
  "created_at": "2025-11-28T..."
}
```

### Storage:
- **Qdrant**: 768-d text embeddings (searchable)
- **Postgres**: Full metadata + embeddings (queryable)
- **MinIO**: Cluster summaries (archival)

## Performance

| Component | Time | Notes |
|-----------|------|-------|
| YOLO Detection | ~100ms | yolov8n.pt on GPU |
| SAM Segmentation | ~200ms | per detection |
| Ollama Embeddings | ~50ms | per segment (cached) |
| DBSCAN Clustering | ~10ms | 6 segments |
| Storage (Qdrant+PG) | ~20ms | batch insert |
| **Total** | **~400ms** | For typical legal doc |

## Troubleshooting

### Ollama Connection Failed
```
❌ Ollama embedding failed: Connection refused
```
**Fix:** Ensure Ollama is running (`ollama serve`) and accessible at `OLLAMA_URL`.

### SAM Checkpoint Missing
```
⚠️ SAM checkpoint not found; segmentation disabled
```
**Fix:** Download SAM checkpoint:
```bash
wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth
```

### Qdrant Collection Error
```
⚠️ Qdrant init warning: ...
```
**Fix:** Ensure Qdrant is running and accessible at `localhost:6333`.

### PostgreSQL Connection Failed
```
psycopg2.OperationalError: could not connect to server
```
**Fix:** Ensure PostgreSQL is running with pgvector extension:
```bash
docker run -e POSTGRES_PASSWORD=password -p 5432:5432 postgres:15-alpine
```

## Next Steps

### 1. Real OCR Integration
Replace mock text extraction with real OCR:
```python
def _extract_segment_texts(self, segments):
    # Use Tesseract, EasyOCR, or Gemma-3 vision
    texts = []
    for seg in segments:
        text = ocr_engine.extract(seg["mask"])
        texts.append(text)
    return texts
```

### 2. RAG Demo
Query embeddings and retrieve relevant documents:
```python
def rag_search(query: str, top_k: int = 5):
    query_vec = ollama_embed(query)
    results = qdrant.search(
        collection_name="legal_images",
        query_vector=query_vec,
        limit=top_k
    )
    return results
```

### 3. Gemma-3 Legal Context Fusion
Use ACE synthesis to combine image topology with legal reasoning:
```python
def synthesize_legal_context(image_topology, query):
    # Fuse image clusters + vector search + graph reasoning
    context = ace_synthesize(image_topology, query)
    # Feed to Gemma-3 Legal for reasoning
    response = gemma3_legal(context, query)
    return response
```

## Files

- `backend/services/chr97_image_processor.py` – Main processor
- `backend/requirements-phase10.txt` – Dependencies
- `image_topology.json` – Output (CH-ROM97 input)
- `manifold_export.json` – Existing manifold topology
- `demo.chr97` – Final cartridge

## References

- [CH-ROM97 Format](./chr97.mjs)
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [Qdrant Docs](https://qdrant.tech/documentation/)
- [SAM Docs](https://github.com/facebookresearch/segment-anything)
- [YOLO Docs](https://docs.ultralytics.com/)
