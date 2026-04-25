# Redis-GPU Pipeline Integration with `npm run dev:full`

## 🚀 Complete Integration Overview

Your `npm run dev:full` command now includes a comprehensive Redis-GPU pipeline system that
integrates seamlessly with your existing legal AI infrastructure.

## 🔧 What's Included

### **Enhanced `dev:full` Stack**

When you run `npm run dev:full`, the following services now start automatically:

1. **Docker Services** (PostgreSQL, Redis, RabbitMQ, MinIO, Qdrant)
2. **CUDA Service** (GPU memory management)
3. **Ollama AI** (Gemma3-legal model)
4. **Redis-GPU Bridge** 🆕 (Job queue and orchestration)
5. **GPU Cluster Executor** 🆕 (Legal AI processing)
6. **SvelteKit Frontend** (Enhanced with pipeline integration)

### **New Redis-GPU Components**

#### **1. Redis-GPU Bridge (`redis-gpu-bridge.mjs`)**

- **Job Queue Management**: Intelligent queueing of legal AI tasks
- **Real-time Monitoring**: Performance metrics and health tracking
- **Auto-scaling**: Dynamic worker allocation based on load
- **Error Recovery**: Retry logic and graceful failure handling

#### **2. GPU Cluster Executor (Enhanced)**

- **Legal Task Definitions**: Specialized for legal document processing
- **RTX 3060 Ti Optimization**: Memory-aware batch processing
- **Performance Tracking**: Database integration for metrics storage
- **Auto-restart**: Resilient operation with failure recovery

#### **3. Legal AI Processing Scripts**

- `generate-legal-embeddings.mjs`: Batch embedding generation
- `process-case-similarity.mjs`: pgvector-powered case analysis
- `process-evidence-batch.mjs`: Evidence processing with AI analysis
- `persist-chat-embeddings.mjs`: Chat session persistence

## 📊 Service Startup Sequence

```
1. Docker Desktop Check & Services
2. Port Discovery (Frontend, Ollama, CUDA)
3. GPU Memory Initialization (RTX 3060 Ti)
4. PostgreSQL (legal-ai-postgres:5433)
5. Redis (legal-ai-redis:6379)
6. CUDA Service Worker
7. Ollama AI Service (Gemma3-legal)
8. Redis-GPU Bridge 🆕 (Job orchestration)
9. GPU Cluster Executor 🆕 (Background processing)
10. SvelteKit Frontend (With WebSocket & pipeline integration)
```

## 🎯 Available Services After Startup

### **Frontend Services**

- **Frontend**: http://localhost:[auto-discovered-port]
- **pgvector test**: http://localhost:[port]/dev/pgvector-test
- **WebSocket API**: ws://localhost:[port]/websocket
- **Binary QLoRA**: http://localhost:[port]/api/ai/qlora-topology

### **AI Services**

- **Ollama API**: http://localhost:[auto-discovered-port]
- **CUDA Service**: http://localhost:[auto-discovered-port]
- **Redis-GPU Bridge**: Active (job queue processing)
- **GPU Cluster**: Legal AI pipeline running

### **Docker Services**

- **PostgreSQL**: http://localhost:5433 (legal-ai-postgres)
- **Redis**: http://localhost:6379 (legal-ai-redis)
- **RabbitMQ**: http://localhost:15672 (legal-ai-rabbitmq)
- **MinIO**: http://localhost:9001 (legal-ai-minio)
- **Qdrant**: http://localhost:6333 (legal-ai-qdrant)

### **Legal AI Pipeline Features**

- **📄 Legal Document Embeddings** (GPU-accelerated)
- **⚖️ Case Similarity Analysis** (pgvector)
- **📁 Evidence Processing** (Gemma3-legal)
- **💬 Chat Session Persistence** (Redis cache)

## 🚀 Usage

### **Start Complete System**

```bash
npm run dev:full
```

### **Individual Components**

```bash
# Just Redis-GPU integration without postgres test
npm run dev:full:redis-gpu

# Individual GPU cluster operations
npm run gpu:cluster:legal              # Full legal AI pipeline
npm run gpu:cluster:embeddings         # Legal document embeddings
npm run gpu:cluster:similarity         # Case similarity analysis
npm run gpu:cluster:evidence           # Evidence processing

# Redis-GPU bridge operations
npm run redis:gpu:bridge               # Start job queue bridge
npm run redis:gpu:full                 # Bridge + GPU cluster
```

## 🎛️ Real-time Monitoring

The enhanced `dev:full` provides color-coded console output:

- **🔴 Redis**: Cache server operations
- **🔗 Redis-GPU**: Bridge job processing (blue)
- **⚡ GPU-Cluster**: RTX 3060 Ti operations (magenta)
- **🐘 PostgreSQL**: Database operations (blue)
- **🤖 Ollama**: AI model operations (yellow)
- **🌐 Frontend**: SvelteKit development (cyan)

## 🔧 Configuration

### **Environment Variables (Auto-set by dev:full)**

```bash
ENABLE_GPU=true
RTX_3060_OPTIMIZATION=true
OLLAMA_GPU_LAYERS=35
GPU_MEMORY_LIMIT=6144
BATCH_SIZE=16
REDIS_URL=redis://127.0.0.1:6379
```

### **GPU Cluster Configuration**

- **Workers**: 4 concurrent workers
- **GPU Contexts**: 2 (optimized for RTX 3060 Ti)
- **Memory Reservation**: 6GB VRAM
- **Batch Size**: 16 (legal documents)
- **Auto-restart**: Enabled with 5-second delay

## 🎯 Integration Benefits

1. **Seamless Operation**: Everything starts with one command
2. **RTX 3060 Ti Optimization**: Memory-aware processing
3. **Intelligent Job Queue**: Redis-based task distribution
4. **Real-time Processing**: Background legal AI pipeline
5. **Comprehensive Monitoring**: Health checks and performance metrics
6. **Error Recovery**: Auto-restart and retry logic
7. **Database Integration**: Performance tracking and results storage

## 🚦 Health Monitoring

The system includes automatic health monitoring:

- **Redis Connection**: Continuous connectivity checks
- **GPU Memory**: RTX 3060 Ti utilization tracking
- **Job Queue Status**: Processing rates and success metrics
- **Service Health**: All components monitored continuously

## 🔄 Auto-restart Features

- **GPU Cluster**: Auto-restarts on failure (5-second delay)
- **Graceful Shutdown**: SIGINT/SIGTERM handling
- **Process Cleanup**: Proper resource cleanup on exit

Your `npm run dev:full` now provides a complete, production-ready legal AI development environment
with Redis-GPU pipeline integration, optimized specifically for your RTX 3060 Ti hardware and legal
document processing workflows.
