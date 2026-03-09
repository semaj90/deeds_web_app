# TensorRT-LLM Legal AI Production Deployment Guide

## 🚀 Quick Start

### 1. Deploy Infrastructure Services
```bash
# Start PostgreSQL, Redis, RabbitMQ, MinIO, Qdrant
docker-compose -f docker-compose.existing-stack.yml up -d redis-legal rabbitmq-legal minio-legal qdrant-legal

# Verify services are healthy
docker-compose -f docker-compose.existing-stack.yml ps
```

### 2. Deploy TensorRT-LLM Legal AI Service
```bash
# Build and start the complete stack
docker-compose -f docker-compose.existing-stack.yml -f docker-compose.override.yml up -d

# Check TensorRT-LLM service status
docker logs legal-ai-tensorrt -f
```

### 3. Verify Integration
```bash
# Test unified endpoint
curl http://localhost:8090/health

# Test TensorRT-LLM inference
curl -X POST http://localhost:8090/api/legal/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is breach of contract?", "max_results": 5}'

# Test Ollama fallback
curl -X POST http://localhost:8090/api/legal/ollama/generate \
  -H "Content-Type: application/json" \
  -d '{"model": "gemma3-legal:latest", "prompt": "Define consideration in contract law"}'
```

## 📋 Service Architecture

### Endpoints
- **Primary**: `http://localhost:8090/api/legal/query` (TensorRT-LLM)
- **Fallback**: `http://localhost:8090/api/legal/ollama/` (Ollama)
- **Batch**: `http://localhost:8090/api/legal/batch/` (Heavy processing)
- **Stream**: `http://localhost:8090/api/legal/stream` (WebSocket)
- **Health**: `http://localhost:8090/health`
- **Metrics**: `http://localhost:8090/metrics`

### Network Configuration
```
nginx-legal-tensorrt:8090 ← Load Balancer
├── legal-ai-tensorrt:8096 (Primary TensorRT-LLM)
├── host.docker.internal:11434 (Ollama fallback)
└── Infrastructure services:
    ├── redis-legal:6379
    ├── rabbitmq-legal:5672
    ├── minio-legal:9000
    ├── qdrant-legal:6333
    └── host.docker.internal:5433 (Your PostgreSQL 17 + pgvector)
```

## 🔧 Production Configuration

### Environment Variables
Create `.env` file:
```env
# PostgreSQL (your existing containers)
POSTGRES_HOST=host.docker.internal
POSTGRES_PORT=5433
POSTGRES_DB=legal_ai_db
POSTGRES_USER=legal_admin
POSTGRES_PASSWORD=123456

# TensorRT-LLM Settings
TENSORRT_LLM_MODEL_PATH=/app/models/gemma3-legal
MAX_BATCH_SIZE=8
MAX_INPUT_LEN=2048
MAX_OUTPUT_LEN=1024

# GPU Configuration
NVIDIA_VISIBLE_DEVICES=all
CUDA_VISIBLE_DEVICES=0
```

### Volume Mounts
- `./TensorRT-LLM/tensorrt_env:/opt/tensorrt_env:ro` (TensorRT environment)
- `./models:/app/models:ro` (Model files)
- `./engines:/app/engines:rw` (Compiled TensorRT engines)

## 📊 Performance Monitoring

### Health Checks
```bash
# Service health
curl http://localhost:8090/health

# Detailed metrics
curl http://localhost:8090/metrics

# Container health
docker-compose -f docker-compose.existing-stack.yml -f docker-compose.override.yml ps
```

### Performance Metrics
- **Latency**: Sub-second inference on RTX 3060 Ti
- **Throughput**: 8 concurrent batches
- **Memory**: ~6-8GB GPU memory usage
- **Uptime**: Health checks every 30s

## 🧪 Testing Commands

### Basic Functionality
```bash
# Legal query test
curl -X POST http://localhost:8090/api/legal/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the elements of a valid contract?",
    "document_type": "contract",
    "jurisdiction": "US",
    "max_results": 10
  }'
```

### Load Testing
```bash
# Concurrent requests
for i in {1..10}; do
  curl -X POST http://localhost:8090/api/legal/query \
    -H "Content-Type: application/json" \
    -d '{"query": "Contract law question '$i'"}' &
done
wait
```

### Vector Search Integration
```bash
# Test PostgreSQL + pgvector integration
curl -X POST http://localhost:8090/api/legal/tensorrt/search \
  -H "Content-Type: application/json" \
  -d '{"text": "breach of contract", "limit": 5}'
```

## 🚨 Troubleshooting

### Common Issues

1. **TensorRT Engine Not Found**
   ```bash
   # Check engine compilation
   docker exec legal-ai-tensorrt ls -la /app/engines/

   # Rebuild engine if needed
   docker exec legal-ai-tensorrt python /app/build_engine.py
   ```

2. **GPU Not Available**
   ```bash
   # Verify GPU access
   docker exec legal-ai-tensorrt nvidia-smi

   # Check CUDA in container
   docker exec legal-ai-tensorrt python -c "import torch; print(torch.cuda.is_available())"
   ```

3. **Service Connection Issues**
   ```bash
   # Check network connectivity
   docker exec legal-ai-tensorrt ping redis-legal
   docker exec legal-ai-tensorrt ping rabbitmq-legal
   ```

### Logs
```bash
# TensorRT service logs
docker logs legal-ai-tensorrt -f

# Infrastructure services
docker logs redis-legal -f
docker logs rabbitmq-legal -f
docker logs minio-legal -f
docker logs qdrant-legal -f

# Nginx logs
docker logs nginx-legal-tensorrt -f
```

## 📈 Scaling

### Horizontal Scaling
```yaml
# Add to docker-compose.override.yml
legal-ai-tensorrt:
  deploy:
    replicas: 3
  ports:
    - "8096-8098:8096"
```

### GPU Multi-Instance
```yaml
# For multiple GPUs
environment:
  CUDA_VISIBLE_DEVICES: "0,1"
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 2
          capabilities: [gpu]
```

## ✅ Production Checklist

- [ ] All services healthy (`docker-compose ps`)
- [ ] TensorRT engine compiled and loaded
- [ ] GPU memory allocation confirmed
- [ ] PostgreSQL 17 + pgvector connection verified
- [ ] Redis cache operational
- [ ] RabbitMQ queues configured
- [ ] MinIO buckets created
- [ ] Qdrant collections initialized
- [ ] Load balancer routing correctly
- [ ] SSL certificates configured (if using HTTPS)
- [ ] Monitoring and alerting setup
- [ ] Backup strategy implemented

## 🎯 Next Steps

1. **Optimize TensorRT Engines**: Compile model-specific engines for your GPU
2. **Configure Monitoring**: Set up Prometheus + Grafana dashboards
3. **Implement Caching**: Cache frequently requested legal queries
4. **Scale Infrastructure**: Add read replicas for PostgreSQL
5. **Security Hardening**: Implement authentication and rate limiting