# 🧠 RAG-Powered Legal Case Management System

A production-ready, modular Retrieval-Augmented Generation (RAG) system built with SvelteKit, PostgreSQL + pgvector, Qdrant, and comprehensive AI integration.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   SvelteKit     │    │  PostgreSQL +   │    │     Qdrant      │
│   Frontend      │◄──►│    pgvector     │◄──►│  Vector Store   │
│                 │    │  (Primary DB)   │    │   (Advanced)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   IndexedDB     │    │     Redis       │    │   Ollama/AI     │
│ (Client Cache)  │    │    (Cache)      │    │    (LLM)        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Key Features

### 🎯 **Hybrid Vector Search**

- **Fast pgvector**: Lightning-quick similarity search using PostgreSQL with ivfflat indexing
- **Advanced Qdrant**: Complex filtering, metadata search, and fallback for heavy queries
- **Intelligent Routing**: Automatically chooses optimal search strategy based on query complexity

### 🧠 **AI Integration**

- **Local LLM Support**: Ollama integration for privacy-focused local AI
- **OpenAI Fallback**: Cloud-based AI for enhanced capabilities
- **RAG Pipeline**: Combines vector search with LLM generation for accurate, contextual responses

### ⚡ **Performance Optimized**

- **Multi-layer Caching**: Redis, IndexedDB, and Loki.js for different use cases
- **Memory Limits**: WSL2 and Docker optimizations for Windows development
- **Background Sync**: Automatic sync between PostgreSQL and Qdrant

### 🎨 **Modern UI/UX**

- **XState Integration**: Complex UI flows with state machines
- **SSR Support**: Server-side rendering with hydration
- **Responsive Design**: Works on desktop and mobile devices

## 📋 Prerequisites

### Required Software

- **Node.js** 18+ and npm
- **Docker Desktop** with WSL2 backend
- **PostgreSQL** with pgvector extension
- **Git** for version control

### Optional

- **Ollama** for local LLM (recommended for privacy)
- **Windows Subsystem for Linux** (WSL2) for optimal Docker performance

## ⚙️ Quick Setup

### 1. Clone and Install

```bash
git clone <repository-url>
cd web-app/sveltekit-frontend
npm install
```

### 2. Environment Configuration

```bash
# Development (postgresql + Docker)
npm run env:dev

# Testing (PostgreSQL + Docker)
npm run env:test

# Production (PostgreSQL + Qdrant Cloud)
npm run env:prod
```

### 3. Start Development Environment

```bash
# Option A: SQLite Development (fastest)
npm run dev

# Option B: Full Stack with Docker
npm run setup:test
```

### 4. Initialize Vector Search

```bash
# Create pgvector indexes and Qdrant collections
npm run vector:init
```

## 🐳 Docker Setup (Recommended for Testing/Production)

### WSL2 Memory Configuration

Create `C:\Users\<username>\.wslconfig`:

```ini
[wsl2]
memory=2GB
processors=2
```

Restart WSL:

```bash
wsl --shutdown
```

### Start Services

```bash
# Start PostgreSQL + pgvector + Qdrant + Redis
npm run db:start

# Check service health
docker-compose ps
```

### Resource Monitoring

```bash
# Monitor memory usage
docker stats

# View logs
npm run docker:logs
```

## 🔧 Configuration

### Environment Variables

#### Development (`.env.development`)

```bash
NODE_ENV=development
DATABASE_URL=sqlite:./dev.db
QDRANT_URL=                    # Disabled in dev
REDIS_URL=                     # Memory cache only
OPENAI_API_KEY=your_key_here
OLLAMA_URL=http://localhost:11434
EMBEDDING_MODEL=openai
CACHE_TYPE=memory
VECTOR_SEARCH_THRESHOLD=0.7
```

#### Testing (`.env.testing`)

```bash
NODE_ENV=testing
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/prosecutor_db
QDRANT_URL=http://localhost:6333
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=your_key_here
OLLAMA_URL=http://localhost:11434
EMBEDDING_MODEL=openai
CACHE_TYPE=redis
VECTOR_SEARCH_THRESHOLD=0.7
PGVECTOR_LISTS=100
VECTOR_SYNC_INTERVAL=300
```

#### Production (`.env.production`)

```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/db
QDRANT_URL=https://your-qdrant.fly.dev
QDRANT_API_KEY=your_api_key
REDIS_URL=redis://your-redis-cluster
OPENAI_API_KEY=your_production_key
EMBEDDING_MODEL=openai
CACHE_TYPE=redis
VECTOR_SEARCH_THRESHOLD=0.75
PGVECTOR_LISTS=200
MAX_CONCURRENT_EMBEDDINGS=5
```

## 🧪 Usage Examples

### Basic Vector Search

```typescript
import { searchVector } from "$lib/server/search/vector-search";

// Fast pgvector search
const results = await searchVector("gun evidence", {
  searchType: "fast",
  threshold: 0.7,
  limit: 10,
});

// Advanced Qdrant search with filtering
const filteredResults = await searchVector("drug possession", {
  searchType: "comprehensive",
  filter: {
    must: [
      { key: "case_status", match: { value: "open" } },
      { key: "jurisdiction", match: { value: "federal" } },
    ],
  },
});

// Hybrid search (recommended)
const hybridResults = await searchVector("witness testimony", {
  searchType: "hybrid",
  fallbackToQdrant: true,
});
```

### AI Chat Integration

```svelte
<script>
  import AskAI from '$lib/components/ai/AskAI.svelte';

  function handleAIResponse(event) {
    const { answer, references, confidence } = event.detail;
    console.log(`AI Response (${Math.round(confidence * 100)}% confidence):`, answer);

    references.forEach(ref => {
      console.log(`Reference: ${ref.type} - ${ref.title} (${ref.relevanceScore})`);
    });
  }

  function handleReferenceClick(event) {
    const { id, type } = event.detail;
    // Navigate to the referenced case/evidence
    window.location.href = `/${type}/${id}`;
  }
</script>

<AskAI
  caseId="case-123"
  evidenceIds={["evidence-1", "evidence-2"]}
  showReferences={true}
  enableVoiceInput={true}
  on:response={handleAIResponse}
  on:referenceClicked={handleReferenceClick}
/>
```

### Client-side Caching

```typescript
import {
  getIndexedDBService,
  trackUserActivity,
} from "$lib/services/indexeddb";

const indexedDB = getIndexedDBService();

// Cache embeddings locally
await indexedDB.cacheEmbedding("search query", embedding, "openai");

// Track user activity
await trackUserActivity({
  type: "search",
  target: "case",
  targetId: "case-123",
  query: "evidence analysis",
});

// Get recent activity for context
const recentActivity = await indexedDB.getRecentActivity(10);
```

## 📊 API Endpoints

### Vector Search

```bash
# Search cases
POST /api/search/cases
{
  "query": "assault with weapon",
  "threshold": 0.7,
  "limit": 20,
  "filter": { "status": "open" }
}

# Search evidence
POST /api/search/evidence
{
  "query": "fingerprint analysis",
  "caseId": "case-123",
  "threshold": 0.75
}
```

### AI Chat

```bash
# Ask AI with context
POST /api/ai/ask
{
  "question": "What evidence supports the assault charge?",
  "context": {
    "caseId": "case-123",
    "maxResults": 10,
    "searchThreshold": 0.7
  },
  "options": {
    "model": "openai",
    "temperature": 0.7,
    "includeReferences": true
  }
}

# Health check
GET /api/ai/ask
```

## 🔍 Monitoring & Debugging

### Service Health

```bash
# Check all services
curl http://localhost:5173/api/ai/ask

# Response includes:
{
  "status": "healthy",
  "components": {
    "pgvector": true,
    "qdrant": true,
    "cache": true
  }
}
```

### Performance Monitoring

```typescript
// Check cache statistics
const stats = await indexedDBService.getCacheStats();
console.log("Cache stats:", stats);

// Vector search performance
const startTime = Date.now();
const results = await searchVector(query);
console.log(`Search took ${Date.now() - startTime}ms`);
```

### Database Optimization

```sql
-- Check pgvector index usage
EXPLAIN ANALYZE SELECT * FROM cases
WHERE title_embedding <-> '[0.1, 0.2, ...]'::vector < 0.3
ORDER BY title_embedding <-> '[0.1, 0.2, ...]'::vector
LIMIT 10;

-- Monitor index performance
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE indexname LIKE '%embedding%';
```

## 🚀 Deployment

### Development

```bash
npm run dev                    # SQLite, memory cache
```

### Testing

```bash
npm run setup:test           # PostgreSQL + Docker services
npm run test                 # Run Playwright tests
```

### Production

```bash
npm run setup:prod          # Production environment
npm run build:prod          # Optimized build
npm run db:migrate          # Run migrations
```

## 🛠️ Advanced Configuration

### Custom Embedding Models

```typescript
// Add custom embedding provider
export async function generateCustomEmbedding(text: string): Promise<number[]> {
  // Your custom embedding logic
  return embedding;
}
```

### Custom Search Strategies

```typescript
// Register custom search strategy
vectorSearchService.strategies.set("custom", {
  name: "Custom Strategy",
  description: "Your custom search logic",
  execute: async (query, options) => {
    // Your search implementation
    return results;
  },
});
```

### Vector Index Tuning

```sql
-- Optimize for your data size
CREATE INDEX idx_cases_embedding ON cases
USING ivfflat (title_embedding vector_cosine_ops)
WITH (lists = 100);  -- Adjust lists based on data size

-- For large datasets (>1M vectors), consider higher lists value
-- lists = sqrt(rows) is a good starting point
```

## 🐛 Troubleshooting

### Common Issues

**Docker Memory Issues on Windows:**

```bash
# Check WSL memory
wsl --status
wsl --shutdown

# Update .wslconfig with memory limits
```

**pgvector Extension Missing:**

```bash
# Rebuild with pgvector
docker-compose down -v
docker-compose up --build
```

**Qdrant Connection Errors:**

```bash
# Check Qdrant health
curl http://localhost:6333/health

# Restart Qdrant service
docker-compose restart qdrant
```

**Search Performance Issues:**

```sql
-- Check index usage
\d+ cases  -- Verify indexes exist
REINDEX INDEX idx_cases_title_embedding;  -- Rebuild if needed
```

### Performance Tuning

**Memory Optimization:**

- Reduce `PGVECTOR_LISTS` for smaller datasets
- Enable Qdrant quantization for memory savings
- Use Redis for frequently accessed embeddings

**Speed Optimization:**

- Increase `PGVECTOR_PROBES` for better accuracy
- Use hybrid search strategy
- Cache frequent queries in Redis

## 📈 Scaling Considerations

### Horizontal Scaling

- **Database**: Read replicas for search queries
- **Cache**: Redis cluster for distributed caching
- **AI**: Multiple Ollama instances behind load balancer

### Vertical Scaling

- **Memory**: Increase for larger embedding caches
- **CPU**: More cores for parallel embedding generation
- **Storage**: SSD for faster vector index access

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

- **Documentation**: Check this README and inline comments
- **Issues**: Create GitHub issues for bugs
- **Discussions**: Use GitHub Discussions for questions
- **Discord**: Join our community for real-time help

---

**Built with ❤️ for legal professionals who demand accuracy, performance, and privacy.**
