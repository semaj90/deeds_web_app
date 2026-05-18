# Granite-Docling Worker - W-I9 Optimized

A high-performance document processing worker optimized for Intel 11th-Gen i7/i9 systems running Windows 10/11. Implements a hybrid GPU/CPU pipeline with Redis caching, page classification, and Tesseract fallback.

## Features

- **W-I9 CPU Optimization**: Auto-detected profile for Intel 11th-Gen i7/i9 (8C/16T)
- **Hybrid GPU/CPU Pipeline**: Granite-Docling (GPU) + Tesseract (CPU fallback)
- **Redis Caching**: 7-day TTL with auto-refresh for OCR results
- **Page Classification**: Micro-ML classifier for optimal routing
- **Parallel Streaming**: object storage integration with 4-8 parallel streams
- **LangExtract Chunking**: Semantic text chunking for RAG
- **R2/R3 Ranking**: BM25 + semantic ranking hooks
- **TensorRT-LLM Ready**: Migration path for future optimization
- **Windows Native**: MSVC/MinGW build support, Docker Desktop optional

## Performance Targets

- **50-100 page document**: 4-10 seconds (full parse + embeddings)
- **1-5 page document**: <2 seconds
- **GPU Utilization**: 80%+
- **CPU Utilization**: 70%+

## System Requirements

### Hardware
- Intel 11th-Gen i7/i9 (8 cores, 16 threads)
- 16GB+ RAM
- NVIDIA GPU with CUDA 11.8+ support (optional but recommended)

### Software
- Windows 10/11
- Python 3.10+
- CUDA 11.8+ and cuDNN 8.6+ (for GPU support)
- Docker Desktop (optional)

### Dependencies
- Tesseract OCR
- object storage
- Redis
- Granite-Docling model

## Installation

### 1. Clone Repository
```bash
git clone https://github.com/legalai/granite-docling-worker.git
cd granite-docling-worker
```

### 2. Create Virtual Environment
```bash
python -m venv venv
venv\Scripts\activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Install Tesseract (Windows)
```bash
# Download installer from: https://github.com/UB-Mannheim/tesseract/wiki
# Or use Chocolatey:
choco install tesseract
```

### 5. Configure Environment
```bash
cp .env.example .env
# Edit .env with your settings
```

### 6. Build Native Components (Optional)
```bash
# Using MSVC
mkdir build
cd build
cmake -G "Visual Studio 17 2022" ..
cmake --build . --config Release

# Or using MinGW
cmake -G "MinGW Makefiles" ..
cmake --build .
```

## Quick Start

Historical setup note: SeaweedFS S3 is the canonical object store in this repo now; keep `MINIO_*` names only as compatibility aliases.

### 1. Start Dependencies
```bash
# Object storage (historical MinIO container; SeaweedFS S3 is canonical now)
docker run -p 9000:9000 -p 9001:9001 minio/minio server /data

# Redis
docker run -p 6379:6379 redis:latest
```

### 2. Run Worker
```bash
python -m granite_worker.main
```

### 3. Check W-I9 Profile
```bash
python -c "from granite_worker.core.w_i9_profiler import get_w_i9_profile; print(get_w_i9_profile())"
```

## Configuration

### W-I9 Profile Auto-Detection
The worker automatically detects CPU capabilities and applies optimal settings:

```python
from granite_worker.core.w_i9_profiler import get_w_i9_profile

profile = get_w_i9_profile()
print(f"Worker threads: {profile.worker_threads}")
print(f"Batch size: {profile.batch_size}")
print(f"AVX2 enabled: {profile.avx2_enabled}")
```

### Environment Variables
See `.env.example` for all available configuration options.

Key settings:
- `WORKER_THREADS`: Number of worker threads (auto-detected)
- `BATCH_SIZE`: Page batch size (default: 32)
- `GPU_ENABLED`: Enable GPU processing (default: true)
- `REDIS_CACHE_TTL`: Cache TTL in seconds (default: 604800 = 7 days)
- `MINIO_PARALLEL_STREAMS`: Parallel upload streams (legacy alias for SeaweedFS-backed uploads, default: 4)

## API Endpoints

### Health Check
```bash
GET /health
```

### Process Document
```bash
POST /process
Content-Type: application/json

{
  "document_id": "doc-123",
  "file_path": "/path/to/document.pdf",
  "metadata": {
    "case_id": "case-456"
  }
}
```

### Get Status
```bash
GET /status/{document_id}
```

### Get Results
```bash
GET /results/{document_id}
```

## Architecture

```
Document Upload (object storage)
    ↓
Page Classification (Micro-ML)
    ↓
GPU/CPU Pipeline Manager
    ├─ GPU Path: Granite-Docling (258M VLM)
    └─ CPU Path: Tesseract + AVX2 SIMD
    ↓
Redis Cache (7-day TTL)
    ↓
Text Extraction & Chunking (LangExtract)
    ↓
RAG Preparation (R2/R3 Ranking)
    ↓
Status Events (SSE to Dashboard)
```

## Performance Tuning

### For Large Documents (50-100 pages)
```env
BATCH_SIZE=32
GPU_BATCH_SIZE=32
WORKER_THREADS=14
```

### For Small Documents (1-5 pages)
```env
BATCH_SIZE=8
GPU_BATCH_SIZE=8
WORKER_THREADS=10
```

### For CPU-Only Processing
```env
GPU_ENABLED=false
CPU_THREADS=8
CPU_BATCH_SIZE=16
```

## Troubleshooting

### GPU Not Detected
```bash
# Check CUDA installation
python -c "import torch; print(torch.cuda.is_available())"

# Check GPU memory
python -c "import torch; print(torch.cuda.get_device_properties(0))"
```

### Tesseract Not Found
```bash
# Set Tesseract path in .env
TESSERACT_PATH=C:\Program Files\Tesseract-OCR\tesseract.exe
```

### Redis Connection Failed
```bash
# Check Redis is running
redis-cli ping
```

### Object storage Connection Failed
```bash
# Check object storage is running
curl http://localhost:9333/cluster/status
```

## Development

### Run Tests
```bash
pytest tests/
```

### Run with Coverage
```bash
pytest --cov=granite_worker tests/
```

### Code Quality
```bash
# Format code
black src/

# Lint
flake8 src/

# Type checking
mypy src/
```

## Building for Distribution

### Create ZIP Package
```bash
python setup.py sdist --formats=zip
```

### Build Wheel
```bash
pip install wheel
python setup.py bdist_wheel
```

## Docker Deployment

### Build Image
```bash
docker build -t granite-docling-worker:latest .
```

### Run Container
```bash
docker run -p 8000:8000 \
  -e MINIO_ENDPOINT=host.docker.internal:8333 \
  -e REDIS_HOST=host.docker.internal \
  granite-docling-worker:latest
```

## Integration with Legal Dashboard

The worker sends status events to the Legal Dashboard via SSE:

```python
# Configure in .env
DASHBOARD_SSE_ENDPOINT=http://127.0.0.1:3000/api/document-processing/stream
DASHBOARD_AUTH_TOKEN=your-auth-token
```

Events include:
- Processing stage (ingestion, classification, gpu_processing, etc.)
- Progress percentage
- ETA in seconds
- Detailed status information

## TensorRT-LLM Migration

The worker supports TensorRT-LLM engine plans for future optimization:

```env
TENSORRT_ENABLED=true
TENSORRT_ENGINE_PATH=/path/to/engine.plan
```

Expected 2-5x speedup with TensorRT optimization.

## License

MIT License - See LICENSE file for details

## Support

For issues, questions, or contributions:
- GitHub Issues: https://github.com/legalai/granite-docling-worker/issues
- Documentation: https://github.com/legalai/granite-docling-worker/wiki
- Email: team@legalai.dev

## Changelog

### v1.0.0 (2025-11-23)
- Initial release
- W-I9 profile optimization
- GPU/CPU hybrid pipeline
- Redis caching
- Page classification
- object storage integration
- LangExtract chunking
- R2/R3 ranking hooks
- Windows native build support
