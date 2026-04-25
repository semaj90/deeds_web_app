# Legal Case Management System - Production Ready

A comprehensive legal case management system with advanced vector search capabilities using PostgreSQL, pgvector, Qdrant, and SvelteKit.

## 🚀 Features

### Multi-Environment Support

- **Development**: SQLite for fast local development
- **Testing**: PostgreSQL + Docker for integration testing
- **Production**: PostgreSQL + pgvector + Qdrant for full vector search

### Advanced Search Capabilities

- **Text Search**: Fast SQL-based full-text search
- **Semantic Search**: AI-powered similarity search using OpenAI embeddings
- **Hybrid Search**: Combines text and semantic results for best accuracy
- **Vector Storage**: pgvector for PostgreSQL, Qdrant for advanced scenarios

### Performance Optimizations

- **Redis Caching**: Cached embeddings and search results
- **Memory Limits**: Docker containers configured with resource limits
- **Connection Pooling**: Optimized database connections
- **Background Processing**: Non-blocking embedding generation

## 🛠️ Quick Setup

### 1. Development Mode (SQLite - No Docker Required)

```bash
npm run setup:dev
npm run dev
```

### 2. Testing Mode (PostgreSQL + Docker)

```bash
# Ensure Docker Desktop is running
npm run setup:test
npm run dev:postgres
```

### 3. Production Mode

```bash
npm run setup:prod
npm run build:prod
```

## 📦 Environment Configuration

### Development (.env.development)

- Uses SQLite for fast development
- No vector search capabilities
- No external dependencies

### Testing (.env.testing)

- PostgreSQL with pgvector extension
- Local Qdrant via Docker
- Redis caching
- Full vector search enabled

### Production (.env.production)

- PostgreSQL with pgvector
- External Qdrant (or local Docker)
- Redis caching
- Optimized for performance

## 🔍 Search API Endpoints

### Case Search

```bash
# Text search (fast, no AI)
GET /api/search/cases?q=murder&type=text

# Semantic search (AI-powered)
GET /api/search/cases?q=violent crime&type=semantic

# Hybrid search (best results)
GET /api/search/cases?q=domestic violence&type=hybrid

# With filters
GET /api/search/cases?q=assault&status=open&priority=high
```

### Evidence Search

```bash
# Metadata search
GET /api/search/evidence?q=fingerprint&mode=text

# Content search (Qdrant)
GET /api/search/evidence?q=DNA analysis&mode=content

# Semantic search (pgvector)
GET /api/search/evidence?q=ballistics report&mode=semantic

# Hybrid search
GET /api/search/evidence?q=forensic evidence&mode=hybrid
```

## 🗄️ Database Management

### Schema Management

```bash
# Generate migrations
npm run db:generate:dev    # SQLite
npm run db:generate:test   # PostgreSQL

# Push schema changes
npm run db:push:dev
npm run db:push:test

# Open Drizzle Studio
npm run db:studio
```

### Docker Services

```bash
# Start all services
npm run docker:up

# Stop services
npm run docker:down

# View logs
npm run docker:logs
```

## 🔧 Vector Search Setup

### Initialize Vector Search

```bash
npm run vector:init
```

This script:

- Sets up Qdrant collections
- Creates PostgreSQL vector indexes
- Tests embedding generation
- Validates the setup

### Manual Vector Index Creation

```sql
-- PostgreSQL vector indexes (if not auto-created)
CREATE INDEX CONCURRENTLY cases_title_embedding_idx
ON cases USING hnsw (title_embedding vector_cosine_ops);

CREATE INDEX CONCURRENTLY evidence_content_embedding_idx
ON evidence USING hnsw (content_embedding vector_cosine_ops);
```

## 📊 Services and Ports

| Service        | Port | Purpose   | Environment  |
| -------------- | ---- | --------- | ------------ |
| SvelteKit      | 5173 | Web App   | All          |
| PostgreSQL     | 5432 | Database  | Testing/Prod |
| Qdrant         | 6333 | Vector DB | Testing/Prod |
| Redis          | 6379 | Cache     | Testing/Prod |
| Drizzle Studio | 4983 | DB Admin  | All          |

## 🔐 Configuration

### Required Environment Variables

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/prosecutor_db

# Vector Search
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your_api_key_here

# Caching
REDIS_URL=redis://localhost:6379

# AI
OPENAI_API_KEY=your_openai_key_here
```

## 🏗️ Architecture

### Database Schema

- **PostgreSQL + pgvector**: Production database with vector capabilities
- **SQLite**: Development database for fast iteration
- **Drizzle ORM**: Type-safe schema management

### Vector Search Stack

- **pgvector**: PostgreSQL extension for vector similarity search
- **Qdrant**: Advanced vector database for complex queries
- **OpenAI Embeddings**: text-embedding-3-small (1536 dimensions)

### Caching Layer

- **Redis**: Production caching for embeddings and search results
- **Memory Cache**: Development fallback

### API Design

- **SvelteKit API Routes**: RESTful endpoints
- **Type Safety**: Full TypeScript coverage
- **Error Handling**: Graceful fallbacks

## 🚀 Performance Features

### Memory Optimization

- Docker containers with resource limits
- Efficient vector index parameters
- Connection pooling
- Cached embeddings

### Search Optimization

- Multiple search strategies
- Automatic fallbacks
- Result caching
- Background processing

### Development Speed

- Hot reloading
- SQLite for fast development
- Type-safe database operations
- Automated migrations

## 🔧 Troubleshooting

### Common Issues

#### Docker not starting

```bash
# Check Docker Desktop is running
docker --version
docker ps

# Start services manually
cd ../..
docker compose up -d
```

#### Vector search not working

```bash
# Check pgvector extension
psql -h localhost -U postgres -d prosecutor_db -c "SELECT * FROM pg_extension WHERE extname = 'vector';"

# Initialize vector search
npm run vector:init
```

#### Embeddings failing

```bash
# Check OpenAI API key
echo $OPENAI_API_KEY

# Test embedding generation
curl -X POST http://localhost:5173/api/search/cases?q=test
```

### Performance Tuning

#### PostgreSQL

```sql
-- Optimize for vector operations
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '512MB';
ALTER SYSTEM SET work_mem = '16MB';
```

#### Qdrant

```yaml
# Memory optimization in qdrant-config.yaml
optimizers:
  max_segment_size: 20000
  indexing_threshold: 20000
  max_optimization_threads: 1
```

## 📝 Development Workflow

1. **Start Development**: `npm run setup:dev`
2. **Make Changes**: Edit schema, API, or frontend
3. **Test Locally**: SQLite for fast iteration
4. **Test Integration**: `npm run setup:test` for full stack
5. **Deploy**: `npm run setup:prod` for production

## 🎯 Next Steps

1. **Configure OpenAI API Key**: Add to environment files
2. **Start Docker Services**: For testing/production environments
3. **Run Migrations**: Push schema to database
4. **Initialize Vector Search**: Set up indexes and collections
5. **Test Search Endpoints**: Verify functionality

## 📚 API Documentation

### Search Response Format

```typescript
{
  results: Array<{
    id: string;
    title: string;
    description: string;
    searchScore?: number;
    matchType: "text" | "semantic" | "hybrid";
    // ... other fields
  }>;
  searchType: string;
  executionTime: number;
  total: number;
  fromCache: boolean;
  query: string;
  filters: object;
}
```

---

🎉 **You're all set!** Your legal case management system now has production-ready vector search capabilities with automatic environment switching and performance optimizations.
