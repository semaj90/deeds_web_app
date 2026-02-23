# GPU OCR Service

Surya OCR + langextract-go + Ollama embeddings integration for Legal AI Platform

## Stack

```
┌─────────────────────────────────────────────────────────┐
│  Python GPU OCR Service (Port 8090)                     │
│  - Surya OCR: PDF/Image → Text (CUDA 13.0)            │
│  - PyTorch GPU acceleration (RTX 3060 Ti)              │
├─────────────────────────────────────────────────────────┤
│  langextract-go CLI                                     │
│  - Legal entity extraction (Go binary)                  │
│  - Parties, dates, citations, clauses                   │
├─────────────────────────────────────────────────────────┤
│  Ollama GPU (Port 11434)                               │
│  - embeddinggemma:latest (768-dim vectors)             │
│  - CUDA GPU acceleration                                │
└─────────────────────────────────────────────────────────┘
                        ↓
        Qdrant + PostgreSQL + SvelteKit
```

## Installation

### 1. Install Python Dependencies

```bash
cd python-gpu-ocr-service
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Build langextract-go

```bash
cd ../langextract-go
go build -o langextract.exe ./cmd/langextract
```

### 3. Verify CUDA

```bash
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
# Should print: CUDA available: True
```

## Usage

### Start Complete Pipeline

```bash
# From project root
start-complete-ocr-pipeline.bat
```

This starts:
1. langextract-go (builds if needed)
2. Ollama GPU (embeddinggemma)
3. Qdrant vector database
4. Python OCR service (port 8090)
5. SvelteKit frontend (port 5173)

### Start OCR Service Only

```bash
cd python-gpu-ocr-service
start-ocr-service.bat
```

### Test OCR Service

```bash
# Health check
curl http://localhost:8090/health

# Upload PDF/Image
curl -X POST http://localhost:8090/ocr \
  -F "file=@test-document.pdf" \
  -F "extract_entities=true" \
  -F "generate_embedding=true"
```

### Test via SvelteKit

```bash
# Upload through SvelteKit API
curl -X POST http://localhost:5173/api/documents/upload-ocr \
  -F "files=@legal-contract.pdf"
```

## Pipeline Flow

```
1. User uploads PDF/Image → SvelteKit API
   ↓
2. SvelteKit forwards → Python OCR Service (port 8090)
   ↓
3. Surya OCR extracts text (GPU CUDA)
   ↓
4. langextract-go extracts entities (CLI)
   ↓
5. Ollama generates embedding (embeddinggemma GPU)
   ↓
6. Returns to SvelteKit: {text, entities, embedding}
   ↓
7. SvelteKit stores in Qdrant + PostgreSQL
```

## Performance

**Hardware**: RTX 3060 Ti (8GB VRAM), CUDA 13.0

**Benchmarks** (legal documents):
- PDF text extraction: ~0.5s per page
- OCR (image-based PDF): ~2s per page (GPU)
- Entity extraction: ~0.3s
- Embedding generation: ~0.5s
- **Total**: ~3s per document (with OCR)

## TensorRT Optimization (Optional)

For 2-5x speedup, convert Surya models to TensorRT:

```python
# TODO: Add TensorRT conversion script
# Converts PyTorch models → TensorRT engines
# Requires: tensorrt >= 10.0.0
```

## Configuration

Environment variables:

```bash
PORT=8090                                    # OCR service port
CUDA_VISIBLE_DEVICES=0                       # GPU device ID
OLLAMA_URL=http://localhost:11434            # Ollama embeddings
LANGEXTRACT_BINARY=../langextract-go/langextract.exe
```

## Dependencies

**Python Packages**:
- `surya-ocr` - GPU-accelerated OCR
- `torch` + `torchvision` - PyTorch GPU support
- `tensorrt` - TensorRT optimization (optional)
- `fastapi` + `uvicorn` - API server
- `PyPDF2`, `pdf2image` - PDF processing

**External Services**:
- langextract-go (Go binary)
- Ollama (embeddinggemma model)
- Qdrant (vector database)
- PostgreSQL (metadata)

## Troubleshooting

**CUDA not available**:
```bash
# Verify CUDA installation
nvcc --version
nvidia-smi

# Reinstall PyTorch with CUDA
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu130
```

**langextract-go not found**:
```bash
cd ../langextract-go
go build -o langextract.exe ./cmd/langextract
```

**Ollama not responding**:
```bash
# Start Ollama
start-ollama-gpu.bat

# Pull embeddinggemma
ollama pull embeddinggemma:latest
```

## API Endpoints

### POST /ocr
Upload document for OCR + entity extraction + embedding

**Request**:
```bash
curl -X POST http://localhost:8090/ocr \
  -F "file=@document.pdf" \
  -F "extract_entities=true" \
  -F "generate_embedding=true"
```

**Response**:
```json
{
  "success": true,
  "text": "extracted text...",
  "entities": {
    "entities": [
      {"type": "party", "value": "John Doe", "offset": [0, 8]},
      {"type": "date", "value": "2024-10-05", "offset": [50, 60]}
    ],
    "source": "langextract-go"
  },
  "embedding": [0.123, -0.456, ...], // 768-dim vector
  "metadata": {
    "filename": "document.pdf",
    "fileType": "application/pdf",
    "textLength": 5432,
    "device": "cuda",
    "ocrEngine": "surya"
  },
  "processingTime": "2.45s"
}
```

### GET /health
Health check

**Response**:
```json
{
  "success": true,
  "services": {
    "surya_ocr": true,
    "pdf_processing": true,
    "gpu_available": true,
    "langextract_go": true,
    "ollama_url": "http://localhost:11434"
  },
  "device": "cuda"
}
```
