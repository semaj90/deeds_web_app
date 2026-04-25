# Production-Ready RAG System Setup Guide

This guide covers the complete setup and deployment of the enhanced Legal RAG system with PostgreSQL + pgvector, Qdrant, Rust/Tauri local LLMs, and comprehensive vector search capabilities.

## 📋 Prerequisites

### System Requirements
- **Node.js** 18+ with npm/pnpm
- **PostgreSQL** 14+ with pgvector extension
- **Rust** 1.70+ (for Tauri backend)
- **Docker** (for Qdrant and Redis)
- **Python** 3.9+ (optional, for additional ML tools)

### Hardware Recommendations
- **Development**: 8GB RAM, 4 CPU cores, 50GB storage
- **Production**: 16GB+ RAM, 8+ CPU cores, 500GB+ storage, GPU optional

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Clone and navigate to project
cd web-app/sveltekit-frontend

# Install dependencies
npm install

# Copy environment files
cp .env.example .env.development
cp .env.example .env.production
```

### 2. Configure Environment Variables

#### `.env.development`
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/deeds_dev"
POSTGRES_USER=deeds_user
POSTGRES_PASSWORD=secure_password
POSTGRES_DB=deeds_dev

# Vector Services
QDRANT_URL="http://localhost:6333"
REDIS_URL="redis://localhost:6379"

# AI/LLM Configuration
OPENAI_API_KEY="your-openai-key"
EMBEDDING_PROVIDER="openai"
EMBEDDING_MODEL="text-embedding-ada-002"

# Tauri/Local LLM
ENABLE_LOCAL_LLM=true
LOCAL_MODEL_PATH="./models"

# Performance
VECTOR_CACHE_TTL=3600
SEARCH_BATCH_SIZE=50
```

#### `.env.production`
```env
# Production database with connection pooling
DATABASE_URL="postgresql://user:password@prod-db:5432/deeds_prod?pool_timeout=60&connection_limit=50"

# Production vector services
QDRANT_URL="https://qdrant-cluster.your-domain.com"
REDIS_URL="redis://redis-cluster:6379"

# Production AI configuration
OPENAI_API_KEY="prod-openai-key"
EMBEDDING_PROVIDER="openai"
EMBEDDING_MODEL="text-embedding-ada-002"

# Security and performance
NODE_ENV=production
ENABLE_VECTOR_CACHING=true
ENABLE_BACKGROUND_SYNC=true
LOG_LEVEL=info
```

### 3. Database Setup

#### PostgreSQL + pgvector Installation

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo apt install postgresql-14-pgvector

# macOS with Homebrew
brew install postgresql pgvector

# Docker (recommended for development)
docker run -d \
  --name postgres-pgvector \
  -e POSTGRES_USER=deeds_user \
  -e POSTGRES_PASSWORD=secure_password \
  -e POSTGRES_DB=deeds_dev \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  pgvector/pgvector:pg14
```

#### Initialize Database Schema

```bash
# Run enhanced pgvector setup
psql -h localhost -U deeds_user -d deeds_dev -f scripts/init-pgvector-enhanced.sql

# Run Drizzle migrations
npm run db:migrate

# Seed initial data (optional)
npm run db:seed
```

### 4. Vector Services Setup

#### Qdrant (Production Vector Store)

```bash
# Docker setup
docker run -d \
  --name qdrant \
  -p 6333:6333 \
  -v qdrant_data:/qdrant/storage \
  qdrant/qdrant:latest

# Docker Compose (recommended)
docker-compose up -d qdrant
```

#### Redis (Caching and Event Streaming)

```bash
# Docker setup
docker run -d \
  --name redis \
  -p 6379:6379 \
  -v redis_data:/data \
  redis:latest redis-server --appendonly yes

# Docker Compose
docker-compose up -d redis
```

### 5. Tauri/Rust Backend Setup

#### Install Rust and Dependencies

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Install Tauri CLI
cargo install tauri-cli

# Navigate to Tauri directory
cd src-tauri

# Copy enhanced Cargo.toml and main.rs
cp Cargo-enhanced.toml Cargo.toml
cp main-enhanced.rs src/main.rs
```

#### Download Legal-BERT Models

```bash
# Create models directory
mkdir -p models/legal-bert-base-uncased

# Download models (this requires git-lfs)
git lfs install
git clone https://huggingface.co/nlpaueb/legal-bert-base-uncased models/legal-bert-base-uncased

# Alternative: Download manually from Hugging Face Hub
# Place model files in models/legal-bert-base-uncased/
```

#### Build Tauri Application

```bash
# Development build
cargo tauri dev

# Production build
cargo tauri build --release

# Build for specific targets
cargo tauri build --target x86_64-pc-windows-msvc
cargo tauri build --target x86_64-apple-darwin
cargo tauri build --target x86_64-unknown-linux-gnu
```

## 🏗️ Architecture Overview

### Component Interaction Flow

```mermaid
graph TB
    A[SvelteKit Frontend] --> B[API Endpoints]
    B --> C[Enhanced Vector Search]
    C --> D[PostgreSQL + pgvector]
    C --> E[Qdrant Vector DB]
    B --> F[Tauri LLM Service]
    F --> G[Local rust-bert Models]
    B --> H[Background Sync Service]
    H --> I[Redis Event Stream]
    H --> J[Database Triggers]
    
    subgraph "Vector Search Strategy"
        K[HNSW Index] --> L[High-Speed Queries]
        M[IVFFlat Index] --> N[Development/Batch]
        O[Hybrid Search] --> P[Vector + Text]
    end
    
    subgraph "Caching Layer"
        Q[IndexedDB Client]
        R[Redis Server]
        S[PostgreSQL Cache]
    end
```

### Data Flow for RAG Queries

1. **Query Input** → SvelteKit API endpoint
2. **Vector Search** → PostgreSQL/Qdrant with intelligent routing
3. **Context Assembly** → Combine search results with conversation history
4. **LLM Selection** → Auto-select local vs. cloud based on query characteristics
5. **Response Generation** → Legal-BERT or cloud LLM generates response
6. **Enhancement** → Add citations, confidence scores, follow-up questions
7. **Caching** → Store results for future queries
8. **Background Sync** → Update vector stores and analytics

## 🔧 Configuration Options

### Vector Search Configuration

```typescript
// src/lib/config/vector-search.ts
export const vectorSearchConfig = {
  // Index strategy selection
  indexStrategy: process.env.NODE_ENV === 'production' ? 'hnsw' : 'ivfflat',
  
  // Search performance tuning
  searchThreshold: 0.7,
  maxSources: 5,
  batchSize: 50,
  
  // Fallback configuration
  enableQdrantFallback: true,
  enableCaching: true,
  cacheTTL: 3600,
  
  // Hybrid search weights
  vectorWeight: 0.7,
  textWeight: 0.3
};
```

### Embedding Configuration

```typescript
// src/lib/config/embeddings.ts
export const embeddingConfig = {
  providers: {
    openai: {
      model: 'text-embedding-ada-002',
      dimensions: 1536,
      maxTokens: 8191
    },
    local: {
      model: 'legal-bert-base-uncased',
      dimensions: 768,
      maxTokens: 512
    }
  },
  
  // Auto-selection criteria
  autoSelection: {
    useLocalForLegal: true,
    useCloudForLongContext: true,
    fallbackToCloud: true
  }
};
```

### Legal-BERT Model Configuration

```rust
// src-tauri/src/config.rs
pub struct ModelConfig {
    pub legal_bert_path: String,
    pub cache_size: usize,
    pub device: Device,
    pub batch_size: usize,
}

impl Default for ModelConfig {
    fn default() -> Self {
        Self {
            legal_bert_path: "models/legal-bert-base-uncased".to_string(),
            cache_size: 1024 * 1024 * 512, // 512MB
            device: Device::Cpu,
            batch_size: 32,
        }
    }
}
```

## 📊 Performance Optimization

### Database Optimization

```sql
-- PostgreSQL configuration for vector operations
-- Add to postgresql.conf:

# Memory settings
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
work_mem = 64MB

# Vector-specific settings
pgvector.vector_size_limit = 2000

# Parallel processing
max_parallel_maintenance_workers = 4
max_parallel_workers = 8

# Index build optimization
random_page_cost = 1.1  # For SSD storage
effective_io_concurrency = 200
```

### HNSW vs IVFFlat Index Strategy

```sql
-- Production HNSW index (high performance, more memory)
CREATE INDEX CONCURRENTLY idx_embeddings_vector_hnsw 
ON embeddings USING hnsw (embedding_vector vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- Development IVFFlat index (faster to build)
CREATE INDEX CONCURRENTLY idx_embeddings_vector_ivfflat 
ON embeddings USING ivfflat (embedding_vector vector_cosine_ops) 
WITH (lists = 100);
```

### Memory Management for Local LLMs

```rust
// Rust memory optimization
use std::sync::Arc;
use once_cell::sync::Lazy;

// Pre-load models with memory pooling
static MODEL_POOL: Lazy<Arc<ModelManager>> = Lazy::new(|| {
    Arc::new(ModelManager::with_config(ModelConfig {
        cache_size: 512 * 1024 * 1024, // 512MB
        max_concurrent_requests: 4,
        model_unload_timeout: 300, // 5 minutes
        ..Default::default()
    }))
});
```

## 🚀 Deployment

### Docker Compose Production Setup

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg14
    environment:
      POSTGRES_DB: deeds_prod
      POSTGRES_USER: deeds_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-pgvector-enhanced.sql:/docker-entrypoint-initdb.d/
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '2'

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: '4'

  redis:
    image: redis:alpine
    command: redis-server --appendonly yes --maxmemory 512mb
    volumes:
      - redis_data:/data

  app:
    build: .
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://deeds_user:${POSTGRES_PASSWORD}@postgres:5432/deeds_prod
      QDRANT_URL: http://qdrant:6333
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - qdrant
      - redis
    ports:
      - "3000:3000"
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '2'

volumes:
  postgres_data:
  qdrant_data:
  redis_data:
```

### Kubernetes Deployment

```yaml
# k8s/deployment.yml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: legal-rag-system
spec:
  replicas: 3
  selector:
    matchLabels:
      app: legal-rag
  template:
    metadata:
      labels:
        app: legal-rag
    spec:
      containers:
      - name: app
        image: legal-rag:latest
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secrets
              key: connection-string
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: ai-secrets
              key: openai-key
```

## 🧪 Testing and Validation

### End-to-End Testing

```bash
# Run comprehensive test suite
npm run test:e2e

# Test vector search functionality
npm run test:vector-search

# Test Tauri LLM integration
npm run test:tauri-llm

# Performance benchmarks
npm run benchmark:vector-search
npm run benchmark:embedding-generation
```

### API Testing Examples

```bash
# Test enhanced RAG endpoint
curl -X POST http://localhost:3000/api/ai/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the key evidence items in case 123?",
    "options": {
      "maxSources": 5,
      "searchThreshold": 0.8,
      "provider": "auto",
      "searchMode": "hybrid",
      "entityFilters": {
        "caseId": "case-123"
      }
    }
  }'

# Test vector search endpoint
curl -X POST http://localhost:3000/api/search/vector \
  -H "Content-Type: application/json" \
  -d '{
    "query": "contract violation evidence",
    "limit": 10,
    "threshold": 0.7,
    "useHybrid": true
  }'
```

## 📈 Monitoring and Analytics

### Performance Metrics Collection

```typescript
// Monitor vector search performance
export const searchMetrics = {
  async trackSearch(query: string, results: any[], executionTime: number) {
    await db.insert(searchAnalytics).values({
      query,
      resultCount: results.length,
      executionTime,
      timestamp: new Date()
    });
  },
  
  async getPerformanceStats() {
    return await db.select({
      avgResponseTime: sql`avg(execution_time)`,
      totalQueries: sql`count(*)`,
      cacheHitRate: sql`sum(case when from_cache then 1 else 0 end)::float / count(*)`
    }).from(searchAnalytics);
  }
};
```

### Health Checks

```typescript
// Health check endpoint
export const GET: RequestHandler = async () => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: await checkDatabaseHealth(),
      qdrant: await checkQdrantHealth(),
      redis: await checkRedisHealth(),
      localLLM: tauriLLM.isAvailable()
    }
  };
  
  const isHealthy = Object.values(health.services).every(Boolean);
  
  return json(health, { 
    status: isHealthy ? 200 : 503 
  });
};
```

## 🔒 Security Considerations

### Data Privacy and Local Processing

- **Local LLM Processing**: Sensitive legal documents never leave the local environment
- **Encryption**: All data encrypted at rest and in transit
- **Access Control**: Role-based access to different document types
- **Audit Logging**: Complete audit trail of all queries and responses

### Security Configuration

```typescript
// Security middleware
export const securityConfig = {
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  },
  
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
    credentials: true
  },
  
  helmet: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"]
      }
    }
  }
};
```

## 🛠️ Troubleshooting

### Common Issues and Solutions

#### Vector Search Performance
```bash
# Check index usage
EXPLAIN ANALYZE SELECT * FROM embeddings 
ORDER BY embedding_vector <=> '[0.1,0.2,...]' LIMIT 10;

# Rebuild indexes if needed
REINDEX INDEX CONCURRENTLY idx_embeddings_vector_hnsw;
```

#### Local LLM Memory Issues
```rust
// Reduce model cache size
ModelConfig {
    cache_size: 256 * 1024 * 1024, // 256MB instead of 512MB
    max_concurrent_requests: 2,     // Reduce from 4
    ..Default::default()
}
```

#### Qdrant Connection Issues
```bash
# Check Qdrant health
curl http://localhost:6333/health

# View Qdrant logs
docker logs qdrant

# Restart Qdrant if needed
docker restart qdrant
```

## 📚 Additional Resources

- [PostgreSQL + pgvector Documentation](https://github.com/pgvector/pgvector)
- [Qdrant Vector Database](https://qdrant.tech/documentation/)
- [rust-bert Library](https://github.com/guillaume-be/rust-bert)
- [Legal-BERT Models](https://huggingface.co/nlpaueb/legal-bert-base-uncased)
- [Tauri Framework](https://tauri.app/)

## 🤝 Contributing

For development contributions:
1. Fork the repository
2. Create a feature branch
3. Run the test suite: `npm run test:all`
4. Submit a pull request with detailed description

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Next Steps**: After completing this setup, you'll have a production-ready legal RAG system with:
- ✅ Hybrid vector search (PostgreSQL + Qdrant)
- ✅ Local LLM processing with legal-bert
- ✅ Intelligent caching and performance optimization
- ✅ Background synchronization
- ✅ Comprehensive monitoring and analytics
- ✅ Privacy-first architecture for sensitive legal data
