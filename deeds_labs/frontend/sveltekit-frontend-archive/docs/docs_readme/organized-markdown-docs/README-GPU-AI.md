# GPU-Accelerated Legal AI Summarization Service

## 🚀 Overview

Production-ready Go microservice for GPU-accelerated legal document summarization using RTX 3060 Ti and Ollama with Gemma3-Legal model.

## 🎯 Features

- **GPU Acceleration**: Optimized for RTX 3060 Ti (7GB VRAM)
- **AI Summarization**: Legal-specific document analysis
- **Concurrent Processing**: Semaphore-controlled GPU access (max 3 concurrent)
- **Caching**: Redis-based response caching
- **Streaming**: Real-time response streaming
- **Batch Processing**: Handle multiple documents efficiently
- **Performance Monitoring**: Built-in metrics and health checks

## 📋 Requirements

- **GPU**: NVIDIA RTX 3060 Ti or better
- **CUDA**: Version 11.8 or 12.x
- **RAM**: 16GB minimum
- **Go**: Version 1.21+
- **Docker**: (optional) with NVIDIA Container Toolkit
- **Ollama**: Latest version with Gemma3-Legal model

## 🔧 Quick Start

### 1. Install Dependencies

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull Gemma3-Legal model
ollama serve gemma3-legal:latest

# Install Redis (required)
# Windows: https://github.com/tporadowski/redis/releases (or use Docker below)
# Linux: sudo apt-get update && sudo apt-get install -y redis-server
# Verify Redis local URL
redis-cli -u redis://localhost:6379 ping

# Install PostgreSQL (optional)
# Windows: https://www.postgresql.org/download/windows/
# Linux: sudo apt-get install -y postgresql postgresql-contrib

# Local service URLs (env vars for dev)
export REDIS_URL=redis://localhost:6379
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/deeds?sslmode=disable

# Docker (alternative local setup)
docker run -d --name redis -p 6379:6379 redis:7
docker run -d --name pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=deeds -p 5432:5432 postgres:16
```

### 2. Start the Service

```bash
# Windows
START-GPU-LEGAL-AI-8084.bat

# Linux/Mac
./start-gpu-legal-ai.sh
```

### 3. Optimize GPU Performance

```powershell
# Run optimization script (Windows)
.\optimize-gpu-legal-ai.ps1
```

### 4. Monitor Performance

```powershell
# Real-time monitoring
.\monitor-gpu-ai.ps1

# Or via web interface
Open: http://localhost:8084/api/metrics
```

## 📊 API Endpoints

### Health Check

```bash
GET http://localhost:8084/api/health
```

### Document Summarization

```bash
POST http://localhost:8084/api/ai/summarize
Content-Type: application/json

{
  "content": "Your legal document text...",
  "document_type": "contract",
  "options": {
    "style": "executive",
    "max_length": 500,
    "temperature": 0.2
  }
}
```

### Batch Processing

```bash
POST http://localhost:8084/api/ai/summarize/batch
Content-Type: application/json

[
  {"content": "Document 1...", "document_type": "contract"},
  {"content": "Document 2...", "document_type": "agreement"}
]
```

### Streaming Response

```bash
POST http://localhost:8084/api/ai/summarize/stream
Accept: text/event-stream
```

## 🐳 Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d

# Scale service (with load balancer)
docker-compose up -d --scale legal-ai-service=3
```

## ⚡ Performance Optimization

### GPU Memory Settings

- **VRAM Allocation**: 6GB for model, 1GB reserved
- **Max Concurrency**: 3 requests (optimal for RTX 3060 Ti)
- **Context Window**: 4096 tokens
- **Batch Size**: 512 tokens

### Cache Configuration

- **Redis**: 30-minute expiration
- **Key**: MD5 hash of document content
- **Hit Rate**: Monitor via `/api/metrics`

### Load Balancing (Production)

```nginx
upstream legal_ai {
    least_conn;
    server localhost:8084 weight=3;
    server localhost:8085 weight=2;
    server localhost:8086 weight=1;
}
```

## 📈 Monitoring

### Prometheus Metrics

- `tokens_processed_total`: Total tokens processed
- `request_duration_seconds`: Request latency histogram
- `gpu_memory_used_bytes`: GPU memory usage
- `cache_hit_ratio`: Cache effectiveness

### Grafana Dashboard

Access at: `http://localhost:3000`

- Default login: admin/admin
- Import dashboard from `./grafana/dashboards/`

## 🧪 Testing

```bash
# Run load tests
test-gpu-ai-load.bat

# Options:
# 1. Quick Test (single document)
# 2. Concurrent Test (3 simultaneous)
# 3. Batch Test (5 documents)
# 4. Stress Test (10 sequential)
# 5. Streaming Test
# 6. Cache Performance Test
```

## 🔍 Troubleshooting

### GPU Not Detected

```bash
# Check NVIDIA driver
nvidia-smi

# Reset GPU
nvidia-smi --gpu-reset
```

### Out of Memory

```bash
# Clear GPU cache
nvidia-smi --gpu-reset

# Reduce concurrency in environment
set MAX_CONCURRENCY=2
```

### Ollama Connection Issues

```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Restart Ollama
ollama serve
```

## 📝 Configuration

Environment variables in `START-GPU-LEGAL-AI-8084.bat`:

| Variable                   | Default | Description                   |
| -------------------------- | ------- | ----------------------------- |
| `MAX_CONCURRENCY`          | 3       | Max simultaneous GPU requests |
| `GPU_MEMORY_LIMIT_MB`      | 6000    | VRAM allocation limit         |
| `MODEL_CONTEXT`            | 4096    | Token context window          |
| `TEMPERATURE`              | 0.2     | Model creativity (0-1)        |
| `CACHE_EXPIRATION_MINUTES` | 30      | Redis cache TTL               |

## 🛡️ Security

- Non-root Docker user
- Rate limiting via semaphore
- Input validation (100KB max)
- Secure PostgreSQL connections
- CORS configuration for frontend

## 📚 Documentation

- [Go Service Code](./main.go)
- [API Documentation](http://localhost:8084/)
- [Monitoring Guide](./docs/monitoring.md)
- [Performance Tuning](./docs/performance.md)

## 🤝 Support

For issues or questions:

1. Check health endpoint: `http://localhost:8084/api/health`
2. Review logs: `docker-compose logs legal-ai-service`
3. Monitor GPU: `nvidia-smi -l 1`
4. Test with: `test-gpu-ai-load.bat`

## 📄 License

MIT License - See LICENSE file for details
