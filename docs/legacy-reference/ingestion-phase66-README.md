# Phase 66 GPU Ingestion Repository

A production-ready, enterprise-scale document ingestion pipeline for legal AI applications, featuring GPU acceleration, vector embeddings, and comprehensive document processing capabilities.

## 🚀 Overview

This repository implements a complete document ingestion system optimized for legal documents, supporting 1GB+ files with advanced AI processing including:

- **GPU-Accelerated Processing**: CUDA-enabled workers for PDF, text, vision, and embedding tasks
- **Multi-Format Support**: PDF, DOCX, images, plain text with OCR fallback
- **AI-Powered Analysis**: Gemma-3 Vision, LangExtract structure analysis, MCP document validation
- **Vector Search**: Qdrant integration with pgvector for hybrid search capabilities
- **Scalable Architecture**: RabbitMQ message queuing, Redis caching, object storage
- **Legal Document Focus**: Specialized processing for contracts, NDAs, leases, and legal agreements

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   SvelteKit     │    │   Node.js API   │    │   GPU Workers   │
│   Frontend      │◄──►│   Orchestrator  │◄──►│   (Python)      │
│                 │    │                 │    │                 │
│ • Drag & Drop   │    │ • Upload API    │    │ • PDF Worker    │
│ • Status UI     │    │ • Job Queue     │    │ • Text Worker   │
│ • Real-time     │    │ • Health Checks │    │ • Vision Worker │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Object Store   │    │    RabbitMQ     │    │     Qdrant      │
│  Object Store   │    │  Message Queue  │    │  Vector DB      │
│                 │    │                 │    │                 │
│ • Raw Files     │    │ • Job Queueing  │    │ • Embeddings    │
│ • 1GB+ Support  │    │ • Load Balance  │    │ • Similarity    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │     Redis       │    │   LangExtract   │
│   + pgvector    │    │    Cache        │    │   Service       │
│                 │    │                 │    │                 │
│ • Document      │    │ • Job Status    │    │ • Structure     │
│   Metadata      │    │ • Performance   │    │ • Entities      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📦 Components

### Core Services

#### 1. Docker Orchestration (`docker-compose.yml`)
- **PostgreSQL 17** with pgvector extension
- **Redis** for caching and job status
- **RabbitMQ** for distributed job processing
- **Object storage** for S3-compatible uploads
- **Qdrant** for high-performance vector search
- **GPU Workers** with CUDA acceleration

#### 2. Node.js Ingestion API (`node-ingestion-api/`)
- **Express Server** with security middleware
- **Upload Orchestration** with file validation
- **Job Queue Management** via RabbitMQ
- **Health Monitoring** across all services
- **Status Tracking** with real-time updates

#### 3. SvelteKit Frontend (`sveltekit-frontend/`)
- **Drag & Drop Upload** interface
- **Real-time Progress** tracking
- **Status Dashboard** with job monitoring
- **File Preview** and validation
- **Responsive Design** for desktop/mobile

### GPU Workers

#### 4. PDF Processing Worker (`gpu-pdf-worker.py`)
- **PyMuPDF** for PDF parsing
- **EasyOCR** for image text extraction
- **CUDA Acceleration** for GPU processing
- **Chunking & Embedding** generation

#### 5. Text Processing Worker (`gpu-text-worker.py`)
- **Transformer Models** for embeddings
- **Sentence-aware Chunking** with overlap
- **Batch Processing** optimization
- **GPU Memory Management**

#### 6. Vision Processing Worker (`gpu-vision-worker.py`)
- **Gemma-3 Vision** for document understanding
- **OCR Fallback** for image processing
- **Multi-modal Analysis** combining text and vision
- **Advanced Layout Understanding**

#### 7. Embedding Worker (`gpu-embedder.py`)
- **Dedicated Embedding Generation** using embeddinggemma
- **Batch Optimization** for performance
- **GPU Memory Monitoring** and management
- **Qdrant Integration** for vector storage

### AI Services

#### 8. LangExtract Service (`python-services/langextract_service.py`)
- **FastAPI** for structure extraction
- **spaCy** for named entity recognition
- **Legal Document Analysis** with contract-specific patterns
- **Metadata Extraction** and classification

#### 9. MCP Document Validator (`python-services/mcp_validator.py`)
- **Gemma3 Integration** for AI-powered validation
- **Legal Compliance Checking** with rule-based validation
- **Document Repair** with automatic fixes
- **Confidence Scoring** and risk assessment

#### 10. Qdrant Auto-Tagger (`python-services/qdrant_auto_tagger.py`)
- **Automatic Categorization** using vector similarity
- **Legal Document Classification** with 10+ categories
- **Tag Generation** from content analysis
- **Clustering** for document organization

## 🚀 Quick Start

### Prerequisites
- **Docker & Docker Compose** (v2.0+)
- **NVIDIA GPU** with CUDA 12.0+ (optional but recommended)
- **Node.js** 18+ and Python 3.9+
- **16GB+ RAM** for full GPU processing

### 1. Environment Setup
```bash
# Clone repository
git clone <repository-url>
cd ingestion-phase66

# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
```

### 2. Start All Services
```bash
# Start complete stack
docker-compose up -d

# Or start with GPU support
docker-compose -f docker-compose.gpu.yml up -d
```

### 3. Install Dependencies
```bash
# Node.js API
cd node-ingestion-api
npm install

# SvelteKit Frontend
cd ../sveltekit-frontend
npm install
```

### 4. Start Development Servers
```bash
# Terminal 1: Node.js API
cd node-ingestion-api
npm run dev

# Terminal 2: SvelteKit Frontend
cd sveltekit-frontend
npm run dev

# Terminal 3: GPU Workers (if not using Docker)
python gpu-pdf-worker.py &
python gpu-text-worker.py &
python gpu-vision-worker.py &
python gpu-embedder.py &
```

## 📋 API Usage

### Upload Document
```bash
curl -X POST http://localhost:3001/api/upload \
  -F "file=@contract.pdf" \
  -F "document_type=legal" \
  -F "metadata={\"priority\": \"high\"}"
```

### Check Status
```bash
curl http://localhost:3001/api/status/job-12345
```

### Health Check
```bash
curl http://localhost:3001/api/health
```

## 🔧 Configuration

### Environment Variables
```env
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=ingestion_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# RabbitMQ
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=guest
RABBITMQ_PASSWORD=guest

# Object storage (SeaweedFS S3 via MinIO-compatible env names)
MINIO_ENDPOINT=http://localhost:8333
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# Qdrant
QDRANT_HOST=localhost
QDRANT_PORT=6333

# AI Models
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
VISION_MODEL=google/gemma-3-4b-it-vision
GEMMA3_MODEL=google/gemma-3-4b-it

# GPU Settings
CUDA_VISIBLE_DEVICES=0
TORCH_CUDA_DEVICE=0
```

## 📊 Monitoring & Metrics

### Health Endpoints
- **API Health**: `GET /api/health`
- **Detailed Health**: `GET /api/health/detailed`
- **Service Status**: Check individual service containers

### Performance Metrics
- **GPU Utilization**: Monitor via `nvidia-smi`
- **Queue Depth**: RabbitMQ management interface
- **Vector Search**: Qdrant metrics endpoint
- **Cache Hit Rate**: Redis INFO command

## 🔍 Document Processing Pipeline

1. **Upload & Validation**
   - File type detection and size validation
   - Virus scanning (integrate with ClamAV)
   - Metadata extraction

2. **Content Extraction**
   - Format-specific parsing (PDF, DOCX, images)
   - OCR for scanned documents
   - Text normalization and cleaning

3. **AI Analysis**
   - Structure extraction with LangExtract
   - Entity recognition and classification
   - Document type identification

4. **Vector Processing**
   - Text chunking with semantic boundaries
   - Embedding generation with GPU acceleration
   - Vector storage in Qdrant

5. **Validation & Repair**
   - MCP validation against legal standards
   - Automatic repair suggestions
   - Compliance checking

6. **Categorization & Tagging**
   - Auto-tagging with Qdrant similarity search
   - Legal category classification
   - Content-based tag generation

7. **Storage & Indexing**
   - Document metadata in PostgreSQL
   - Full-text search with pg_trgm
   - Vector similarity search

## 🧪 Testing

### Unit Tests
```bash
# Node.js API tests
cd node-ingestion-api
npm test

# Python service tests
cd python-services
python -m pytest
```

### Integration Tests
```bash
# Full pipeline test
npm run test:integration

# GPU worker tests
python test_gpu_workers.py
```

### Load Testing
```bash
# API load test
npm run test:load

# Document processing benchmark
python benchmark_processing.py
```

## 🚀 Deployment

### Production Docker Deployment
```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Deploy with GPU support
docker-compose -f docker-compose.prod.yml up -d

# Scale workers
docker-compose up -d --scale gpu-pdf-worker=3
```

### Kubernetes Deployment
```bash
# Apply manifests
kubectl apply -f k8s/

# Scale deployment
kubectl scale deployment gpu-pdf-worker --replicas=5
```

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch
3. **Commit** changes with descriptive messages
4. **Push** to your fork
5. **Create** a Pull Request

### Development Guidelines
- Use TypeScript for Node.js components
- Follow PEP 8 for Python code
- Add tests for new features
- Update documentation
- Ensure GPU compatibility

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Documentation**: Wiki
- **Email**: support@legal-ai-platform.com

## 🔄 Version History

### v1.0.0 (Current)
- Complete GPU ingestion pipeline
- Multi-format document support
- AI-powered analysis and validation
- Production-ready Docker orchestration
- Comprehensive monitoring and health checks

### Future Releases
- **v1.1.0**: Advanced OCR with table extraction
- **v1.2.0**: Multi-language support
- **v2.0.0**: Distributed processing with Kubernetes
- **v2.1.0**: Real-time collaboration features

---

**Built with ❤️ for the legal AI community**
