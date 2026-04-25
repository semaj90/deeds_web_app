# WebGPU Redis Tensor AI Starter Repository

A comprehensive starter repository for building GPU-accelerated AI applications with multi-layered tensor caching, WebGPU visualization, and memory-mapped performance optimization.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SvelteKit 2 Frontend                        │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │   WebGPU        │ │  IndexedDB      │ │  Service        │   │
│  │ Visualizer      │ │   Cache         │ │   Worker        │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
│              │                │                │               │
│              └────────────────┼────────────────┘               │
│                               │                                │
└───────────────────────────────┼────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │        API Gateway (SvelteKit)   │
              └─────────────────┼─────────────────┘
                                │
    ┌───────────────────────────┼───────────────────────────────┐
    │                                                           │
    ▼                           ▼                               ▼
┌─────────┐              ┌─────────────┐              ┌─────────────┐
│   Go    │              │   FastAPI   │              │   Storage   │
│Micro-   │◄────────────►│   vLLM      │◄────────────►│   Layer     │
│service  │              │ Gemma3      │              │             │
└─────────┘              └─────────────┘              └─────────────┘
│ mmap    │              │ Memory      │              │ Redis       │
│ sync    │              │ Mapped KV   │              │ MinIO       │
│ Pool    │              │ Caches      │              │ PostgreSQL  │
└─────────┘              └─────────────┘              └─────────────┘
```

## ✨ Key Features

### 🚀 Multi-Tier Memory Management
- **GPU Tier**: WebGPU buffers with LoD (Level of Detail) optimization
- **RAM Tier**: Redis + memory-mapped tensors with Go sync.Pool
- **Storage Tier**: MinIO + PostgreSQL with bit-packed compression
- **Fire-and-forget**: Automatic cache eviction and prefetching

### 🧠 AI & Machine Learning
- **Custom vLLM**: Gemma3 legal model with memory-mapped KV caches
- **Embedding Reuse**: WASM-accelerated tensor operations
- **K-means Clustering**: Client-side clustering with WebAssembly
- **Context Awareness**: Legal precedent and case similarity matching

### 🎨 WebGPU Visualization
- **Real-time Rendering**: Tensor data visualization with vertex shaders
- **Memory-aware LoD**: Dynamic quality based on available GPU memory
- **Bit-encoding**: Float16/Int8 compression for efficient storage
- **Interactive**: Real-time manipulation of tensor visualizations

### 🔄 Development Workflow
- **tmux Integration**: Multi-pane development environment
- **Docker Compose**: Full-stack orchestration
- **Hot Reloading**: All services support live development
- **Background Workers**: Dataset generation and tensor processing

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+**
- **Go 1.21+**
- **Python 3.11+**
- **Docker & Docker Compose**
- **tmux** (for development workflow)
- **NVIDIA GPU** (optional, for GPU acceleration)

### 1. Clone and Setup
```bash
git clone <repository-url>
cd webgpu-redis-starter-repo

# Setup SvelteKit frontend
cd sveltekit-frontend
npm install
cd ..

# Setup Go microservice
cd server/go-microservice
go mod init tensor-service
go mod tidy
cd ../..

# Setup Python services
cd server/fastapi
pip install -r requirements.txt
cd ../..
```

### 2. Start Development Environment
```bash
# Make tmux script executable
chmod +x tmux-dev.sh

# Start full development environment
./tmux-dev.sh
```

This launches a tmux session with 6 windows:
- **services**: Core services (Redis, Go, FastAPI, SvelteKit)
- **workers**: Background workers (dataset, embedding, clustering)
- **monitoring**: System monitoring and logs
- **testing**: API testing and dataset generation
- **database**: Database consoles (PostgreSQL, Redis, MinIO)
- **dev-tools**: Build tools and file watchers

### 3. Access Services
- **Frontend**: http://localhost:5173
- **API Documentation**: http://localhost:8000/docs
- **MinIO Console**: http://localhost:9001
- **Go Tensor Service**: http://localhost:8080

## 📚 API Usage Examples

### Tensor Storage & Retrieval
```typescript
// Store tensor with GPU reuse
const tensorData = new Float32Array([1, 2, 3, 4, 5]);
await fetch('/api/tensor/my-tensor', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/octet-stream',
    'X-Tensor-Shape': JSON.stringify([5]),
    'X-Tensor-Dtype': 'float32',
    'X-GPU-Reusable': 'true'
  },
  body: tensorData.buffer
});

// Retrieve with LoD optimization
const response = await fetch('/api/tensor/my-tensor?lod=1&gpu=true');
const tensorBuffer = await response.arrayBuffer();
```

### AI Chat with Context Reuse
```typescript
// Streaming chat with KV cache reuse
const response = await fetch('/api/chat/case-123', {
  method: 'POST',
  headers: {
    'Accept': 'text/event-stream',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: "Analyze this contract for liability issues",
    useKVCache: true,
    reuseEmbeddings: true
  })
});

// Process streaming response
const reader = response.body?.getReader();
while (true) {
  const { done, value } = await reader!.read();
  if (done) break;

  const text = new TextDecoder().decode(value);
  console.log(text); // Real-time AI response
}
```

### WebGPU Tensor Visualization
```typescript
import { TensorVisualizer } from '$lib/gpu/tensor-visualizer';

const canvas = document.querySelector('canvas');
const visualizer = new TensorVisualizer();
await visualizer.init(canvas);

// Upload and visualize tensor
const gpuBuffer = await visualizer.uploadTensor(
  'my-tensor',
  tensorData.buffer,
  [256, 256]
);

// Render with LoD
await visualizer.renderTensor('my-tensor', 1.0);
```

## 🔧 Configuration

### Environment Variables
```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=redis

# Database
POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/tensor_db

# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123

# AI Models
LEGAL_MODEL_NAME=google/gemma-2b-it
EMBEDDING_MODEL=embeddinggemma:latest

# GPU Settings
CUDA_VISIBLE_DEVICES=0
GPU_MEMORY_UTILIZATION=0.8
```

### Memory Optimization
```go
// Go microservice memory pool configuration
tensorPool := NewTensorPool(1024 * 1024) // 1MB slices
maxCacheSize := 50 // Max GPU buffers
```

```python
# Python vLLM configuration
engine = CustomvLLMEngine(
    model_name="google/gemma-2b-it",
    gpu_memory_utilization=0.8,
    max_model_len=4096
)
```

## 🧪 Testing & Dataset Generation

### Generate Test Dataset
```bash
# In tmux testing window
python scripts/generate_embeddings.py --count 1000
python scripts/generate_legal_dataset.py --cases 500
```

### Benchmark Performance
```bash
python scripts/benchmark_webgpu.py
python scripts/load_test.py --concurrent 10
```

### API Testing
```bash
# Test embedding endpoint
curl -X POST http://localhost:8000/embed \
  -H "Content-Type: application/json" \
  -d '{"text": "test legal document", "tensor_id": "test123"}'

# Test WebGPU visualization
open http://localhost:5173/test-webgpu
```

## 📖 Architecture Details

### Memory-Mapped Tensors
The Go microservice uses memory-mapped files for efficient tensor storage:
- **Virtual Memory**: 64-bit addressing for exabyte-scale datasets
- **sync.Pool**: Reusable memory slices to reduce GC pressure
- **LRU Eviction**: Automatic cleanup of old tensors
- **GPU Integration**: Direct upload to WebGPU buffers

### WebGPU Visualization
Browser-based tensor visualization with:
- **Vertex Shaders**: Efficient tensor-to-geometry conversion
- **LoD System**: Quality adaptation based on GPU memory
- **Bit-packing**: Float16/Int8 compression for storage
- **Cache Management**: LRU eviction of GPU buffers

### AI Context Reuse
Legal AI assistant with:
- **KV Cache Reuse**: Memory-mapped attention states
- **Embedding Similarity**: Fast case similarity matching
- **Precedent Search**: Legal context integration
- **Streaming Responses**: Real-time AI generation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all services pass health checks
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- **vLLM Team**: For efficient LLM inference
- **WebGPU Spec**: For modern GPU compute
- **SvelteKit**: For the excellent full-stack framework
- **Redis**: For high-performance caching