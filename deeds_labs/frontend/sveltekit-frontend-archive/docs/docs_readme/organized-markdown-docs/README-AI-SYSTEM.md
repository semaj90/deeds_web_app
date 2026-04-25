# Neo4j AI Microservice - Complete Native Windows Setup

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend (SvelteKit)                   │
├─────────────────────────────────────────────────────────┤
│              Go AI Microservice (Port 8081)              │
│  ┌──────────┬──────────┬──────────┬──────────────────┐ │
│  │   CUDA   │   SIMD   │Filesystem│    Streaming     │ │
│  │   GPU    │  Parser  │ Indexer  │    Manager       │ │
│  └──────────┴──────────┴──────────┴──────────────────┘ │
├─────────────────────────────────────────────────────────┤
│                    Data Layer                            │
│  ┌──────────┬──────────┬──────────┬──────────────────┐ │
│  │  Neo4j   │PostgreSQL│  Redis   │     Ollama       │ │
│  │  Graph   │ pgvector │  Cache   │   Local LLM      │ │
│  └──────────┴──────────┴──────────┴──────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Run as Administrator
START-NATIVE-WINDOWS.bat
```

This starts all services natively on Windows without Docker.

## Installation Prerequisites

### Required Software

1. **Neo4j Desktop** (4.4+ or 5.x)
   - Download: https://neo4j.com/download/
   - Install and create a local database
   - Default credentials: neo4j/password

2. **PostgreSQL with pgvector**
   ```powershell
   # Install PostgreSQL 16
   winget install PostgreSQL.PostgreSQL
   
   # Install pgvector
   git clone https://github.com/pgvector/pgvector.git
   cd pgvector
   nmake /f Makefile.win
   nmake /f Makefile.win install
   ```

3. **Redis for Windows (Memurai)**
   ```powershell
   # Install Memurai (Windows Redis)
   winget install Memurai.Memurai
   ```

4. **Ollama**
   ```powershell
   # Download from https://ollama.com/download/windows
   # Install and pull models
   ollama pull nomic-embed-text
   ollama pull llama3
   ollama pull codellama:13b  # Optional for code analysis
   ```

5. **CUDA Toolkit** (if using GPU)
   - Version 12.6: https://developer.nvidia.com/cuda-downloads
   - Ensure CUDA_PATH environment variable is set

6. **Go 1.23+**
   ```powershell
   winget install GoLang.Go
   ```

## Manual Service Startup

If the batch file fails, start services manually:

### 1. PostgreSQL
```powershell
# Start PostgreSQL
net start postgresql-x64-16

# Create database
psql -U postgres -c "CREATE DATABASE legal_ai_db;"
psql -U postgres -d legal_ai_db -f sql\init-pgvector.sql
```

### 2. Neo4j
```powershell
# From Neo4j Desktop, start your database
# Or via command line:
neo4j console
```

### 3. Redis/Memurai
```powershell
# Start Memurai service
net start Memurai
# Or manually:
"C:\Program Files\Memurai\memurai.exe"
```

### 4. Ollama
```powershell
# Start Ollama service
ollama serve

# In another terminal, verify models
ollama list
```

### 5. Go Microservice
```powershell
cd go-microservice
go mod tidy
go build -o ai-microservice.exe
.\ai-microservice.exe
```

## Using the Filesystem Indexer

### Index Your Codebase

```bash
# Index the entire SvelteKit frontend
curl -X POST http://localhost:8081/index \
  -H "Content-Type: application/json" \
  -d '{
    "rootPath": "./sveltekit-frontend",
    "patterns": [".ts", ".tsx", ".svelte", ".js"],
    "exclude": ["node_modules", ".svelte-kit", "dist"]
  }'
```

### Analyze TypeScript Errors

```bash
# First, get your TypeScript errors
npm run check 2> errors.txt

# Send to analyzer
curl -X POST http://localhost:8081/analyze-errors \
  -H "Content-Type: application/json" \
  -d '{
    "errors": ["TS2322: Type mismatch...", "TS2305: Module has no exported member..."]
  }'
```

### Query the Index

```bash
# Search for files
curl "http://localhost:8081/query?q=XState"

# Get dependency graph
curl "http://localhost:8081/dependencies?file=src/index.ts"

# Find type definitions
curl "http://localhost:8081/types?name=RAGSource"
```

## API Endpoints

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | System health check |
| `/index` | POST | Index filesystem |
| `/analyze-errors` | POST | Analyze TypeScript errors |
| `/query` | GET | Query indexed files |

### GPU Compute

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/gpu/compute` | POST | GPU matrix operations |
| `/gpu/metrics` | GET | GPU utilization metrics |
| `/cuda-infer` | POST | CUDA inference |

### Streaming

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/stream/ws` | WS | WebSocket streaming |
| `/stream/sse` | GET | Server-sent events |
| `/stream/chunked` | POST | Chunked transfer |

### Cache & Queue

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/cache/set` | POST | Set cache value |
| `/cache/get/:key` | GET | Get cache value |
| `/queue/job` | POST | Enqueue job |
| `/batch-inference` | POST | Batch AI inference |

## Practical Workflows

### 1. Fix TypeScript Errors Systematically

```javascript
// 1. Index your project
await fetch('http://localhost:8081/index', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rootPath: './src' })
});

// 2. Get current errors
const { stdout } = await exec('npm run check');
const errors = stdout.split('\n').filter(line => line.includes('error'));

// 3. Analyze errors
const analysis = await fetch('http://localhost:8081/analyze-errors', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ errors })
}).then(r => r.json());

// 4. Get AI recommendations
const prompt = `Given these error patterns: ${JSON.stringify(analysis)}, 
                generate specific fixes for a SvelteKit application`;

const aiResponse = await fetch('http://localhost:11434/api/generate', {
  method: 'POST',
  body: JSON.stringify({
    model: 'codellama:13b',
    prompt: prompt,
    stream: false
  })
}).then(r => r.json());
```

### 2. Generate Type Definitions

```javascript
// Find all interfaces and types
const types = await fetch('http://localhost:8081/types').then(r => r.json());

// Generate unified type file
const typeDefinitions = types.map(t => t.definition).join('\n\n');
fs.writeFileSync('src/lib/types/unified.ts', typeDefinitions);
```

### 3. Analyze Dependencies

```javascript
// Get dependency graph
const deps = await fetch('http://localhost:8081/dependencies?file=src/app.ts')
  .then(r => r.json());

// Find circular dependencies
const circular = findCircularDeps(deps);

// Find unused exports
const unused = await fetch('http://localhost:8081/unused-exports')
  .then(r => r.json());
```

## Neo4j Queries

Connect to Neo4j Browser at http://localhost:7474

### Useful Cypher Queries

```cypher
// Find all TypeScript files with errors
MATCH (f:File)
WHERE f.errorCount > 0
RETURN f.path, f.errorCount
ORDER BY f.errorCount DESC

// Find type dependencies
MATCH (f:File)-[:DEFINES]->(t:Type)
WHERE t.name = 'RAGSource'
RETURN f, t

// Find import relationships
MATCH (f1:File)-[:IMPORTS]->(m:Module)<-[:EXPORTS]-(f2:File)
RETURN f1.path, m.name, f2.path

// Find components and their props
MATCH (c:Component)-[:HAS_PROP]->(p:Prop)
RETURN c.name, collect(p.name) as props
```

## PostgreSQL Queries

```sql
-- Find similar files using embeddings
SELECT * FROM search_similar_files(
  (SELECT embedding FROM indexed_files WHERE file_path = '/src/index.ts'),
  10
);

-- Get error statistics
SELECT 
  error_code,
  COUNT(*) as occurrences,
  array_agg(DISTINCT substring(file_path from '[^/]+$')) as files
FROM error_patterns
GROUP BY error_code
ORDER BY occurrences DESC;

-- Find files modified recently
SELECT file_path, modified_at, errors
FROM indexed_files
WHERE modified_at > NOW() - INTERVAL '1 day'
ORDER BY modified_at DESC;
```

## Performance Optimization

### GPU Acceleration

```go
// Use GPU for batch embeddings
POST /gpu/compute
{
  "operation": "matrix_multiply",
  "matrix_a": [[...]], // Document vectors
  "matrix_b": [[...]]  // Query vector
}
```

### SIMD JSON Parsing

```go
// Parse large JSON with SIMD
POST /parse/simd
{
  "data": {...},  // Large JSON payload
  "strategy": "auto"
}
```

### Caching Strategy

```javascript
// Cache embeddings in Redis
await fetch('http://localhost:8081/cache/set', {
  method: 'POST',
  body: JSON.stringify({
    key: `embed:${fileHash}`,
    value: embedding,
    ttl: 3600 // 1 hour
  })
});
```

## Monitoring

### System Metrics
```bash
# Overall health
curl http://localhost:8081/health

# GPU metrics
curl http://localhost:8081/gpu/metrics

# Cache metrics
curl http://localhost:8081/metrics
```

### Neo4j Monitoring
```cypher
// Database statistics
CALL db.stats.retrieve('GRAPH COUNTS')
YIELD data
RETURN data;

// Index usage
SHOW INDEXES;
```

## Troubleshooting

### Common Issues

1. **Neo4j won't start**
   - Check if port 7687 is in use: `netstat -an | findstr 7687`
   - Verify Java is installed: `java -version`

2. **PostgreSQL connection failed**
   - Check service: `sc query postgresql-x64-16`
   - Verify pgvector: `psql -c "SELECT * FROM pg_extension WHERE extname = 'vector'"`

3. **CUDA not detected**
   - Verify installation: `nvidia-smi`
   - Check CUDA_PATH: `echo %CUDA_PATH%`

4. **Ollama models not loading**
   - Check available models: `ollama list`
   - Re-pull if needed: `ollama pull nomic-embed-text`

5. **Go build fails**
   - Update dependencies: `go mod tidy`
   - Clear cache: `go clean -modcache`

## Next Steps

1. **Implement Auto-Fix Pipeline**
   ```javascript
   // Create automated fix workflow
   const pipeline = new FixPipeline({
     indexer: 'http://localhost:8081',
     llm: 'http://localhost:11434',
     target: './src'
   });
   
   await pipeline.analyzeAndFix();
   ```

2. **Set Up Continuous Indexing**
   - Use file watchers to auto-index on changes
   - Implement incremental indexing

3. **Create VSCode Extension**
   - Real-time error analysis
   - Inline AI suggestions
   - Direct Neo4j queries

4. **Build Dashboard**
   - Visualize dependency graph
   - Error heatmap
   - Type coverage metrics

## Production Deployment

For production, use Windows Services:

```powershell
# Register Go microservice as Windows service
sc create "AI-Microservice" binPath= "C:\path\to\ai-microservice.exe"
sc config "AI-Microservice" start= auto
sc start "AI-Microservice"
```

## Support

- Neo4j Documentation: https://neo4j.com/docs/
- pgvector Guide: https://github.com/pgvector/pgvector
- Ollama API: https://github.com/ollama/ollama/blob/main/docs/api.md
- CUDA Programming: https://docs.nvidia.com/cuda/
