# Production Pipeline Setup Guide

## 🚀 Complete Crawl → OCR → Embed → Index → Cache → Serve Pipeline

This is your complete production-ready legal AI pipeline that integrates with your existing stack.

## 📋 Prerequisites

- ✅ **PostgreSQL 17** running on port 5432
- ✅ **Redis** running on port 4005  
- ✅ **MinIO** running on ports 4002/4003
- **RabbitMQ** (need to install)
- **Node.js 18+** for workers
- **Go 1.21+** for gRPC gateway
- **Caddy 2+** for HTTP/3 QUIC proxy
- **Ollama** for embeddings (nomic-embed-text model)

## 🛠️ Installation Steps

### 1. Install RabbitMQ

```bash
# Windows (using Chocolatey)
choco install rabbitmq

# Or download from: https://www.rabbitmq.com/download.html
# Start RabbitMQ service
rabbitmq-service start

# Enable management plugin
rabbitmq-plugins enable rabbitmq_management
```

Access management UI at: http://localhost:15672 (guest/guest)

### 2. Install Dependencies

#### Node.js Worker Dependencies
```bash
cd production-pipeline
npm install amqplib puppeteer tesseract.js ioredis drizzle-orm pg @types/pg
```

#### Go Gateway Dependencies
```bash
cd production-pipeline/grpc-gateway
go mod download
```

### 3. Database Setup

```bash
# Run the database schema creation
cd sveltekit-frontend
npx drizzle-kit push
```

### 4. Start Services

#### Start Core Services (you have these running)
```bash
# PostgreSQL (already running)
set PGPASSWORD=123456 && "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" start -D "C:\Program Files\PostgreSQL\17\data"

# Redis (already running) 
./redis-latest/redis-server.exe --port 4005

# MinIO (already running)
./minio.exe server --address :4002 --console-address :4003
```

#### Start New Pipeline Services
```bash
# Terminal 1: Node.js Workers (handles crawl + OCR + embed + store)
cd production-pipeline
node crawl-ocr-embed-worker.js

# Terminal 2: Go gRPC Gateway (HTTP/JSON API)
cd production-pipeline/grpc-gateway
go run main.go

# Terminal 3: Caddy HTTP/3 Proxy
cd production-pipeline
caddy run --config Caddyfile

# Terminal 4: SvelteKit Frontend (already running)
cd sveltekit-frontend
npm run dev
```

## 📡 API Endpoints

### Gateway (port 8090)
- `POST /api/documents` - Upload documents for processing
- `POST /api/search` - Hybrid search (vector + fulltext)
- `POST /api/embeddings/generate` - Generate embeddings
- `GET /api/jobs` - List processing jobs
- `GET /api/jobs/{id}` - Get job status
- `DELETE /api/cache` - Invalidate cache
- `GET /api/health` - Health check

### Direct Usage Examples

#### 1. Upload & Process Documents
```bash
curl -X POST http://localhost:8090/api/documents \
  -F "documents=@sample.pdf" \
  -F "documents=@contract.docx"
```

#### 2. Process URL (Web Crawling)
```bash
curl -X POST http://localhost:8090/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "crawl",
    "url": "https://example-legal-site.com",
    "options": {"depth": 2}
  }'
```

#### 3. Search Documents
```bash
curl -X POST http://localhost:8090/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "contract termination clause",
    "search_type": "hybrid",
    "limit": 10
  }'
```

## 🔄 Data Flow

```
1. INGESTION
   📄 Document/URL → RabbitMQ queue → Node Worker

2. PROCESSING  
   🕷️ Crawl → 👁️ OCR → ✂️ Chunk → 🧠 Embed

3. STORAGE
   📦 MinIO (blobs) + 🐘 PostgreSQL (metadata + vectors)

4. CACHING
   ⚡ Redis (search results + embeddings + blobs)

5. SERVING
   🌐 Caddy HTTP/3 → Go Gateway → SvelteKit UI
```

## 📊 Monitoring

### Health Checks
```bash
# Overall gateway health
curl http://localhost:8090/health

# Cache statistics
curl http://localhost:8090/api/cache/stats

# System metrics
curl http://localhost:8090/api/stats

# Prometheus metrics
curl http://localhost:8090/metrics
```

### RabbitMQ Management
- URL: http://localhost:15672
- User/Pass: guest/guest
- Monitor queues: `crawl_queue`, `ocr_queue`, `embed_queue`, `index_queue`

### Redis Monitoring  
```bash
./redis-latest/redis-cli.exe -p 4005 info memory
./redis-latest/redis-cli.exe -p 4005 info keyspace
```

## 🎯 Performance Tuning

### Worker Configuration
Edit `crawl-ocr-embed-worker.js`:
```javascript
const CLUSTER_CONFIG = {
  workers: 4,              // Adjust based on CPU cores
  concurrency: 2,          // Jobs per worker
  maxMemoryUsage: '2GB',   // Memory limit per worker
};
```

### Redis Caching
Edit `redis-caching-layer.js`:
```javascript
ttl: {
  searchResults: 1800,     // 30 min
  embeddings: 86400,       // 24 hours  
  documents: 3600,         // 1 hour
  blobs: 7200             // 2 hours
}
```

### Caddy Optimization
Edit `Caddyfile` for your domain:
```caddyfile
{$DOMAIN:localhost} {
  protocols h1 h2 h3       # Enable HTTP/3
  encode gzip zstd         # Compression
  
  # Your SSL certificate
  tls your-cert.pem your-key.pem
}
```

## 🔗 SvelteKit Integration

### Use in Components
```typescript
import { 
  pipelineService, 
  searchResults, 
  activeJobs,
  documents 
} from '$lib/services/production-pipeline-integration';

// Upload documents
await pipelineService.uploadDocuments(fileList);

// Search  
await pipelineService.search('legal contract terms');

// Process URL
await pipelineService.processUrl('https://legal-site.com');

// Monitor jobs
$activeJobs.forEach(job => {
  console.log(`Job ${job.id}: ${job.status} (${job.progress}%)`);
});
```

### Real-time Updates
The WebSocket connection provides real-time job status updates, new document notifications, and cache invalidation events.

## 🚨 Troubleshooting

### Common Issues

#### RabbitMQ Connection Failed
```bash
# Check RabbitMQ status
rabbitmq-diagnostics status

# Restart service
rabbitmq-service restart
```

#### Redis Connection Issues  
```bash
# Test Redis connection
./redis-latest/redis-cli.exe -p 4005 ping

# Check memory usage
./redis-latest/redis-cli.exe -p 4005 info memory
```

#### PostgreSQL Vector Extension
```sql
-- Ensure pgvector is installed
CREATE EXTENSION IF NOT EXISTS vector;

-- Check vector columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'document_chunks' AND column_name = 'embedding';
```

#### OCR Issues (Tesseract)
```bash
# Install Tesseract if OCR fails
# Windows: choco install tesseract
# Make sure it's in PATH
tesseract --version
```

### Performance Issues

#### Slow Embeddings
- Check Ollama status: `ollama list`
- Ensure nomic-embed-text model is downloaded: `ollama pull nomic-embed-text`
- Monitor GPU usage if using GPU acceleration

#### High Memory Usage
- Reduce worker concurrency in cluster config
- Adjust Redis maxmemory settings
- Enable Redis memory eviction policies

#### Slow Search
- Check pgvector indexes: `EXPLAIN ANALYZE SELECT ...`
- Verify Redis cache hit rates
- Consider vector quantization for large datasets

## 🔧 Next Steps

1. **SSL/TLS Setup**: Configure proper certificates for production
2. **Load Balancing**: Add multiple worker instances behind load balancer  
3. **Monitoring**: Set up Prometheus + Grafana dashboards
4. **Backup**: Configure automated backups for PostgreSQL + MinIO
5. **Scaling**: Implement horizontal scaling with Kubernetes/Docker Swarm
6. **Security**: Add authentication, rate limiting, and API keys
7. **CI/CD**: Set up automated deployment pipeline

## 📈 Scaling Architecture

For high-volume production:

```
┌─────────────────────────────────────────────┐
│             LOAD BALANCER                   │
├─────────────────────────────────────────────┤
│  Caddy HTTP/3 Instances (2+)               │
├─────────────────────────────────────────────┤
│  Go Gateway Instances (3+)                 │
├─────────────────────────────────────────────┤  
│  Node Worker Clusters (5+)                 │
├─────────────────────────────────────────────┤
│  Redis Cluster (3+ masters)                │
│  PostgreSQL Cluster (1 master + 2 replicas)│
│  RabbitMQ Cluster (3+ nodes)               │
│  MinIO Cluster (4+ nodes)                  │
└─────────────────────────────────────────────┘
```

Your production pipeline is now complete and ready to handle legal document processing at scale! 🎉