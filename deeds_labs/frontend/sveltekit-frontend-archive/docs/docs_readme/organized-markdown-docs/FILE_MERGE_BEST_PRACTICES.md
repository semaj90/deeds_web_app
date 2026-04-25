# File Merge System - Best Practices and Setup Guide

## 📚 Table of Contents
1. [System Architecture Best Practices](#system-architecture-best-practices)
2. [Setup Instructions](#setup-instructions)
3. [Service Configuration](#service-configuration)
4. [Development Best Practices](#development-best-practices)
5. [Production Deployment](#production-deployment)
6. [Troubleshooting](#troubleshooting)

## 🏗️ System Architecture Best Practices

### 1. **Microservices Architecture**
Your system uses a microservices architecture with the following components:

```
┌─────────────────────────────────────────────────────────┐
│                    Nginx (Port 80)                       │
│                   (Reverse Proxy)                        │
└────────────┬────────────────────────┬───────────────────┘
             │                        │
             ▼                        ▼
    ┌────────────────┐       ┌────────────────┐
    │   SvelteKit    │       │   Go Backend   │
    │   (Port 5173)  │       │  (Port 8084)   │
    └────────────────┘       └────────────────┘
             │                        │
             └──────────┬─────────────┘
                        │
    ┌───────────────────┴───────────────────────┐
    │            Service Layer                  │
    ├───────────┬──────────┬──────────┬────────┤
    │PostgreSQL │  MinIO   │  Qdrant  │ Redis  │
    │  (5432)   │  (9000)  │  (6333)  │ (6379) │
    └───────────┴──────────┴──────────┴────────┘
                        │
                  ┌─────▼─────┐
                  │   Ollama   │
                  │  (11434)   │
                  └────────────┘
```

### 2. **Data Flow Best Practices**

#### Document Upload Flow:
1. User uploads document via SvelteKit UI
2. File is stored in MinIO object storage
3. Metadata saved to PostgreSQL
4. Document processed and chunked
5. Embeddings generated via Ollama
6. Vectors stored in Qdrant
7. Cache updated in Redis

#### Document Merge Flow:
1. User selects documents to merge
2. System retrieves from MinIO
3. AI processes and merges content
4. Result saved as new document
5. User can download merged file

## 📋 Setup Instructions

### Prerequisites Check
```powershell
# Run the enhanced setup script with all features
.\scripts\setup-complete-system.ps1 `
    -GenerateSecureConfig `
    -EnableMonitoring `
    -CreateBackup
```

### Quick Start
```powershell
# 1. Clone the repository
git clone https://github.com/yourusername/file-merge-system.git
cd file-merge-system

# 2. Run the setup script
.\scripts\setup-complete-system.ps1

# 3. Start the system
.\start-system.bat

# 4. Access the application
Start-Process "http://localhost:5173"
```

## ⚙️ Service Configuration

### PostgreSQL with pgVector
```sql
-- Optimal configuration for vector operations
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '2GB';
ALTER SYSTEM SET effective_cache_size = '6GB';
ALTER SYSTEM SET maintenance_work_mem = '512MB';
ALTER SYSTEM SET work_mem = '32MB';

-- Vector-specific settings
ALTER SYSTEM SET ivfflat.probes = 10;
```

### MinIO Object Storage
```yaml
# Best practices for file storage
buckets:
  legal-documents:
    versioning: enabled
    lifecycle:
      - rule: delete-old-versions
        days: 90
    encryption: AES256
    public: false
```

### Qdrant Vector Database
```json
{
  "collection": {
    "name": "legal_documents",
    "vectors": {
      "size": 1536,
      "distance": "Cosine"
    },
    "optimizers": {
      "indexing_threshold": 20000,
      "memmap_threshold": 50000
    },
    "wal": {
      "wal_capacity_mb": 32,
      "wal_segments_ahead": 0
    }
  }
}
```

### Redis Caching Strategy
```javascript
// Caching patterns
const cachePatterns = {
  // Document metadata - long TTL
  documentMeta: {
    key: 'doc:meta:{id}',
    ttl: 3600 // 1 hour
  },
  
  // Search results - medium TTL
  searchResults: {
    key: 'search:{hash}',
    ttl: 600 // 10 minutes
  },
  
  // Session data - short TTL
  session: {
    key: 'session:{id}',
    ttl: 300 // 5 minutes
  }
};
```

### Ollama Embedding Configuration
```javascript
// Optimal settings for nomic-embed-text
const embeddingConfig = {
  model: 'nomic-embed-text',
  options: {
    temperature: 0.1,  // Low temperature for consistent embeddings
    num_ctx: 8192,      // Context window
    num_batch: 512,     // Batch size for processing
    num_gpu: 1,         // GPU layers
    main_gpu: 0         // Primary GPU
  }
};
```

## 💻 Development Best Practices

### 1. **SvelteKit Frontend**

#### Component Structure
```typescript
// src/lib/components/DocumentUpload.svelte
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { uploadDocument } from '$lib/api/documents';
  
  export let maxSize = 100 * 1024 * 1024; // 100MB
  export let allowedTypes = ['pdf', 'docx', 'txt'];
  
  const dispatch = createEventDispatcher();
  
  async function handleUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    
    // Validation
    if (file.size > maxSize) {
      dispatch('error', { message: 'File too large' });
      return;
    }
    
    // Upload
    try {
      const result = await uploadDocument(file);
      dispatch('success', result);
    } catch (error) {
      dispatch('error', error);
    }
  }
</script>
```

#### API Integration
```typescript
// src/lib/api/documents.ts
import type { Document } from '$lib/types';

export async function uploadDocument(file: File): Promise<Document> {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch('/api/documents/upload', {
    method: 'POST',
    body: formData
  });
  
  if (!response.ok) {
    throw new Error('Upload failed');
  }
  
  return response.json();
}

export async function mergeDocuments(
  documentIds: string[],
  options: MergeOptions
): Promise<Document> {
  const response = await fetch('/api/documents/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentIds, options })
  });
  
  if (!response.ok) {
    throw new Error('Merge failed');
  }
  
  return response.json();
}
```

### 2. **Go Backend**

#### Service Layer Pattern
```go
// services/document_service.go
package services

import (
    "context"
    "github.com/minio/minio-go/v7"
    "github.com/jackc/pgx/v5/pgxpool"
)

type DocumentService struct {
    db       *pgxpool.Pool
    minio    *minio.Client
    qdrant   *QdrantClient
    redis    *RedisClient
    embedder *OllamaEmbedder
}

func (s *DocumentService) ProcessDocument(ctx context.Context, doc Document) error {
    // 1. Store in MinIO
    objectID, err := s.storeInMinIO(ctx, doc)
    if err != nil {
        return err
    }
    
    // 2. Save metadata to PostgreSQL
    doc.ObjectID = objectID
    if err := s.saveMetadata(ctx, doc); err != nil {
        return err
    }
    
    // 3. Generate embeddings
    chunks := s.chunkDocument(doc)
    embeddings, err := s.embedder.GenerateEmbeddings(ctx, chunks)
    if err != nil {
        return err
    }
    
    // 4. Store in Qdrant
    if err := s.storeVectors(ctx, doc.ID, embeddings); err != nil {
        return err
    }
    
    // 5. Update cache
    s.redis.Set(ctx, fmt.Sprintf("doc:%s", doc.ID), doc, time.Hour)
    
    return nil
}
```

#### Middleware Configuration
```go
// middleware/cors.go
func CORSMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
        c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
        
        if c.Request.Method == "OPTIONS" {
            c.AbortWithStatus(204)
            return
        }
        
        c.Next()
    }
}

// middleware/ratelimit.go
func RateLimitMiddleware(limit int) gin.HandlerFunc {
    limiter := rate.NewLimiter(rate.Limit(limit), limit)
    
    return func(c *gin.Context) {
        if !limiter.Allow() {
            c.JSON(http.StatusTooManyRequests, gin.H{
                "error": "Rate limit exceeded",
            })
            c.Abort()
            return
        }
        c.Next()
    }
}
```

### 3. **Database Design**

#### Indexing Strategy
```sql
-- Performance indexes
CREATE INDEX idx_documents_created_at ON documents(upload_date DESC);
CREATE INDEX idx_documents_file_type ON documents(file_type);
CREATE INDEX idx_documents_created_by ON documents(created_by);

-- Full-text search
CREATE INDEX idx_documents_filename_trgm ON documents USING gin(filename gin_trgm_ops);

-- JSONB indexes
CREATE INDEX idx_documents_metadata ON documents USING gin(metadata);

-- Vector similarity search
CREATE INDEX idx_embeddings_vector_l2 ON document_embeddings USING ivfflat (embedding vector_l2_ops);
```

## 🚀 Production Deployment

### 1. **Environment Variables**
```bash
# Production .env
NODE_ENV=production
LOG_LEVEL=error

# Use environment-specific configs
DATABASE_URL=${DATABASE_URL}
REDIS_URL=${REDIS_URL}
MINIO_ENDPOINT=${MINIO_ENDPOINT}

# Security
JWT_SECRET=${JWT_SECRET}  # From secrets manager
ENCRYPTION_KEY=${ENCRYPTION_KEY}  # From secrets manager
```

### 2. **Docker Production Configuration**
```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg16
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: always
    
  redis:
    image: redis:7-alpine
    deploy:
      resources:
        limits:
          memory: 1G
    command: >
      redis-server
      --appendonly yes
      --maxmemory 800mb
      --maxmemory-policy allkeys-lru
      --requirepass ${REDIS_PASSWORD}
    restart: always
```

### 3. **Monitoring Setup**
```yaml
# Prometheus configuration
global:
  scrape_interval: 15s
  
scrape_configs:
  - job_name: 'app-metrics'
    static_configs:
      - targets: ['app:8084/metrics']
    
  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['postgres-exporter:9187']
      
  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['redis-exporter:9121']
```

## 🔧 Troubleshooting

### Common Issues and Solutions

#### 1. PostgreSQL Connection Issues
```powershell
# Check if PostgreSQL is running
docker ps | Select-String "postgres"

# Test connection
docker exec legal-ai-postgres psql -U postgres -c "SELECT 1"

# Reset password if needed
docker exec legal-ai-postgres psql -U postgres -c "ALTER USER postgres PASSWORD 'newpassword';"
```

#### 2. MinIO Bucket Access
```powershell
# Check MinIO status
curl http://localhost:9000/minio/health/live

# Create bucket manually
docker exec legal-ai-minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec legal-ai-minio mc mb local/legal-documents
```

#### 3. Qdrant Collection Issues
```powershell
# Check collection
Invoke-RestMethod -Uri "http://localhost:6333/collections/legal_documents" -Method GET

# Recreate collection
$body = @{
    vectors = @{
        size = 1536
        distance = "Cosine"
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:6333/collections/legal_documents" `
    -Method PUT `
    -Body $body `
    -ContentType "application/json"
```

#### 4. Ollama Model Loading
```powershell
# Check available models
ollama list

# Pull model if missing
ollama pull nomic-embed-text

# Test embedding generation
ollama run nomic-embed-text "Test embedding"
```

#### 5. Redis Connection
```powershell
# Test Redis connection
docker exec legal-ai-redis redis-cli ping

# Clear cache if needed
docker exec legal-ai-redis redis-cli FLUSHALL
```

## 📊 Performance Optimization

### 1. **Database Query Optimization**
```sql
-- Analyze query performance
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM documents 
WHERE created_by = 'user123' 
ORDER BY upload_date DESC 
LIMIT 10;

-- Update statistics
ANALYZE documents;
ANALYZE document_embeddings;
```

### 2. **Vector Search Optimization**
```python
# Batch processing for embeddings
def process_documents_batch(documents, batch_size=32):
    for i in range(0, len(documents), batch_size):
        batch = documents[i:i+batch_size]
        embeddings = generate_embeddings_batch(batch)
        store_embeddings_batch(embeddings)
```

### 3. **Caching Strategy**
```javascript
// Implement cache-aside pattern
async function getDocument(id) {
  // Check cache first
  const cached = await redis.get(`doc:${id}`);
  if (cached) return JSON.parse(cached);
  
  // Fetch from database
  const doc = await db.getDocument(id);
  
  // Update cache
  await redis.setex(`doc:${id}`, 3600, JSON.stringify(doc));
  
  return doc;
}
```

## 🔐 Security Best Practices

### 1. **Authentication & Authorization**
```typescript
// JWT middleware
export async function handle({ event, resolve }) {
  const token = event.cookies.get('token');
  
  if (token) {
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      event.locals.user = user;
    } catch (err) {
      // Invalid token
      event.cookies.delete('token');
    }
  }
  
  return resolve(event);
}
```

### 2. **Input Validation**
```go
// Validate file uploads
func validateUpload(file *multipart.FileHeader) error {
    // Check file size
    if file.Size > 100*1024*1024 { // 100MB
        return errors.New("file too large")
    }
    
    // Check file type
    allowedTypes := map[string]bool{
        "application/pdf": true,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
        "text/plain": true,
    }
    
    contentType := file.Header.Get("Content-Type")
    if !allowedTypes[contentType] {
        return errors.New("invalid file type")
    }
    
    return nil
}
```

### 3. **Rate Limiting**
```typescript
// Rate limiting configuration
const rateLimiter = new Map();

export async function rateLimit(ip: string, limit = 100) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  
  if (!rateLimiter.has(ip)) {
    rateLimiter.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  const limit = rateLimiter.get(ip);
  if (now > limit.resetTime) {
    limit.count = 1;
    limit.resetTime = now + windowMs;
    return true;
  }
  
  if (limit.count >= limit) {
    return false;
  }
  
  limit.count++;
  return true;
}
```

## 📈 Monitoring and Logging

### Structured Logging
```go
// Use structured logging
logger := zap.NewProduction()
defer logger.Sync()

logger.Info("document processed",
    zap.String("document_id", doc.ID),
    zap.Int("chunks", len(chunks)),
    zap.Duration("processing_time", time.Since(start)),
)
```

### Health Checks
```go
// Comprehensive health check endpoint
func HealthCheck(c *gin.Context) {
    health := map[string]string{
        "postgres": checkPostgres(),
        "minio": checkMinIO(),
        "qdrant": checkQdrant(),
        "redis": checkRedis(),
        "ollama": checkOllama(),
    }
    
    allHealthy := true
    for _, status := range health {
        if status != "healthy" {
            allHealthy = false
            break
        }
    }
    
    statusCode := http.StatusOK
    if !allHealthy {
        statusCode = http.StatusServiceUnavailable
    }
    
    c.JSON(statusCode, gin.H{
        "status": health,
        "timestamp": time.Now().Unix(),
    })
}
```

## 🎯 Next Steps

1. **Implement user authentication system**
2. **Add document versioning**
3. **Implement real-time collaboration**
4. **Add OCR for scanned documents**
5. **Implement advanced search with filters**
6. **Add export to multiple formats**
7. **Implement audit logging**
8. **Add backup and restore procedures**

## 📚 Additional Resources

- [PostgreSQL pgVector Documentation](https://github.com/pgvector/pgvector)
- [MinIO Best Practices](https://docs.min.io/docs/minio-best-practices.html)
- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [SvelteKit Documentation](https://kit.svelte.dev/docs)
- [Go Best Practices](https://go.dev/doc/effective_go)
- [Docker Production Best Practices](https://docs.docker.com/develop/dev-best-practices/)

---

**Last Updated:** $(Get-Date -Format 'yyyy-MM-dd')
**Version:** 2.0
**Author:** File Merge System Team
