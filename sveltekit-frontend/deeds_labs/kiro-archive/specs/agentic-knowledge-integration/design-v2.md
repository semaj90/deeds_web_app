# Agentic Knowledge Integration V2 - Design Document

**Status:** Draft
**Date:** December 29, 2025
**Framework:** Phase 13 + Phase 76 + AST + Enhanced Qdrant + Multi-DB + CUDA

---

## Overview

This design creates a **self-improving development system** that combines:

1. **Admin UI** with nested route graph visualization
2. **Enhanced Qdrant tagging** with embeddings and AI analysis
3. **Deep AST analysis** via ts-ast-autofixer
4. **Intelligent file editing** with ripgrep + awk + gemma3-legal
5. **K-means clustering** for pattern discovery
6. **Multi-database coordination** (CouchDB, Neo4j, PostgreSQL, Qdrant, Redis)
7. **CUDA tensor analysis** with Redis caching
8. **FastMCP/FastAPI middleware** for agentic function calls
9. **Codebase indexing** with semantic search
10. **AI-powered recommendations** for production-quality code

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SvelteKit Frontend (5173)                                 │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Admin UI: /admin/knowledge-base                                       │  │
│  │ - Nested Route Graph Visualization (D3.js/Cytoscape.js)              │  │
│  │ - Interactive Node Explorer                                           │  │
│  │ - Semantic Search with Highlighting                                   │  │
│  │ - Tag Management & Clustering View                                    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┬──────────────┬──────────────┬──────────────┐
        ▼            ▼            ▼              ▼              ▼              ▼
    ┌────────┐  ┌────────┐  ┌────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ Qdrant │  │ Redis  │  │ Neo4j  │  │PostgreSQL│  │ CouchDB  │  │  MinIO   │
    │ :6333  │  │ :6379  │  │ :7687  │  │  :5432   │  │  :5984   │  │  :9000   │
    └────────┘  └────────┘  └────────┘  └──────────┘  └──────────┘  └──────────┘
        │            │            │              │              │              │
        └────────────┴────────────┴──────────────┴──────────────┴──────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │   FastAPI Middleware      │
                    │   - FastMCP Server        │
                    │   - CUDA Tensor Analysis  │
                    │   - ts-ast-autofixer      │
                    │   - Ripgrep + Awk         │
                    │   - Gemma3-legal          │
                    └───────────────────────────┘
```


### Data Flow

```
File Change Event
    ↓
[File Watcher] → Detect change
    ↓
[AST Analysis] → ts-ast-autofixer extracts structure
    ├─→ Imports/Exports → Neo4j (graph)
    ├─→ Components/Functions → Neo4j (nodes)
    └─→ Errors → PostgreSQL (structured)
    ↓
[Comment Extraction] → Read file comments
    ↓
[Pattern Search] → Ripgrep + Awk find related patterns
    ↓
[AI Analysis] → Gemma3-legal analyzes patterns
    ↓
[Embedding Generation] → CUDA-accelerated embeddinggemma
    ├─→ Embedding → Qdrant (vector)
    └─→ Coordinates → Redis (cache)
    ↓
[Enhanced Tag Creation]
    ├─→ Metadata → PostgreSQL (structured)
    ├─→ Raw Data → CouchDB (document)
    ├─→ Embedding → Qdrant (vector)
    ├─→ Graph → Neo4j (relationships)
    └─→ Cache → Redis (coordinates)
    ↓
[K-means Clustering] → Group similar tags
    ├─→ Cluster Summaries → Gemma3-legal
    └─→ Cluster Metadata → PostgreSQL
    ↓
[Admin UI Update] → Refresh route graph visualization
```


---

## Components and Interfaces

### Enhanced Qdrant Tag

```typescript
interface EnhancedQdrantTag {
  id: string;
  name: string;
  category: 'file' | 'function' | 'component' | 'error' | 'pattern';
  embedding: number[]; // 384-dim vector from embeddinggemma
  summary: string; // AI-generated summary from gemma3-legal
  metadata: {
    filePath: string;
    lineNumber?: number;
    astNodeType?: string;
    imports?: string[];
    exports?: string[];
    dependencies?: string[];
    errorType?: string;
    confidence?: number;
  };
  timestamp: string; // ISO 8601
  clusterId?: string; // K-means cluster assignment
  coordinates?: {
    x: number;
    y: number;
    z: number;
  }; // CUDA-computed tensor coordinates
}
```

### Multi-Database Coordinator

```typescript
interface MultiDBCoordinator {
  // Atomic transaction across all databases
  atomicUpdate(data: IndexedData): Promise<void>;

  // Query aggregation
  aggregateQuery(query: SearchQuery): Promise<AggregatedResults>;

  // Change propagation
  propagateChange(change: DataChange): Promise<void>;

  // Retry queue for failed operations
  queueRetry(operation: DBOperation): Promise<void>;
}

interface IndexedData {
  file: FileData;
  ast: ASTData;
  embedding: number[];
  summary: string;
  errors: ErrorData[];
}
```


### AST Analysis Service

```typescript
interface ASTAnalysisService {
  // Analyze file and extract structure
  analyzeFile(filePath: string): Promise<ASTData>;

  // Extract dependencies
  extractDependencies(ast: ASTData): Promise<DependencyGraph>;

  // Store in Neo4j
  storeGraph(graph: DependencyGraph): Promise<void>;

  // Query dependencies
  queryDependencies(nodeId: string): Promise<DependencyGraph>;
}

interface ASTData {
  filePath: string;
  imports: ImportNode[];
  exports: ExportNode[];
  components: ComponentNode[];
  functions: FunctionNode[];
  errors: ASTError[];
}

interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
```

### File Analysis Pipeline

```typescript
interface FileAnalysisPipeline {
  // Extract comments from file
  extractComments(filePath: string): Promise<Comment[]>;

  // Search for patterns using ripgrep + awk
  searchPatterns(comments: Comment[]): Promise<Pattern[]>;

  // Analyze patterns with gemma3-legal
  analyzePatterns(patterns: Pattern[]): Promise<Analysis>;

  // Generate recommendations
  generateRecommendations(analysis: Analysis): Promise<Recommendation[]>;
}

interface Pattern {
  text: string;
  file: string;
  line: number;
  context: string[];
}

interface Recommendation {
  type: 'fix' | 'refactor' | 'optimize';
  description: string;
  confidence: number;
  code?: string;
}
```


### K-means Clustering Service

```typescript
interface KMeansClusteringService {
  // Fetch all enhanced tags
  fetchTags(): Promise<EnhancedQdrantTag[]>;

  // Extract embeddings
  extractEmbeddings(tags: EnhancedQdrantTag[]): number[][];

  // Run k-means clustering
  cluster(embeddings: number[][], k: number): Promise<ClusterResult>;

  // Generate cluster summaries
  generateSummaries(clusters: ClusterResult): Promise<ClusterSummary[]>;

  // Store cluster metadata
  storeMetadata(summaries: ClusterSummary[]): Promise<void>;
}

interface ClusterResult {
  clusters: Cluster[];
  centroids: number[][];
  assignments: number[]; // tag index -> cluster id
}

interface ClusterSummary {
  clusterId: string;
  summary: string;
  tags: string[]; // tag ids
  centroid: number[];
  size: number;
}
```

### CUDA Tensor Analysis

```typescript
interface CUDATensorAnalysis {
  // Generate embeddings on GPU
  generateEmbeddings(texts: string[]): Promise<number[][]>;

  // Compute similarity matrix on GPU
  computeSimilarity(embeddings: number[][]): Promise<number[][]>;

  // Compute tensor coordinates (dimensionality reduction)
  computeCoordinates(embeddings: number[][]): Promise<Coordinates[]>;

  // Cache coordinates in Redis
  cacheCoordinates(coordinates: Coordinates[]): Promise<void>;
}

interface Coordinates {
  tagId: string;
  x: number;
  y: number;
  z: number;
}
```


### FastMCP/FastAPI Middleware

```python
# FastAPI server with FastMCP integration
from fastapi import FastAPI, HTTPException
from fastmcp import FastMCP
from pydantic import BaseModel

app = FastAPI()
mcp = FastMCP()

class AnalyzeFileRequest(BaseModel):
    file_path: str
    include_recommendations: bool = True

class SearchRequest(BaseModel):
    query: str
    top_k: int = 10
    filters: dict = {}

@mcp.tool()
async def analyze_file(request: AnalyzeFileRequest):
    """Analyze a file with AST, comments, and AI recommendations"""
    # AST analysis
    ast_data = await ast_service.analyze_file(request.file_path)

    # Comment extraction and pattern search
    comments = await file_pipeline.extract_comments(request.file_path)
    patterns = await file_pipeline.search_patterns(comments)

    # AI analysis
    analysis = await file_pipeline.analyze_patterns(patterns)

    # Generate recommendations
    if request.include_recommendations:
        recommendations = await file_pipeline.generate_recommendations(analysis)

    return {
        "ast": ast_data,
        "analysis": analysis,
        "recommendations": recommendations if request.include_recommendations else []
    }

@mcp.tool()
async def semantic_search(request: SearchRequest):
    """Search knowledge base with semantic similarity"""
    # Generate query embedding
    embedding = await cuda_service.generate_embeddings([request.query])

    # Search Qdrant
    results = await qdrant_client.search(
        collection_name="knowledge_base",
        query_vector=embedding[0],
        limit=request.top_k,
        query_filter=request.filters
    )

    return results

@mcp.tool()
async def cluster_tags(k: int = 10):
    """Run k-means clustering on all tags"""
    result = await clustering_service.cluster(k=k)
    return result
```


### Admin UI Components

```typescript
// Route Graph Visualization Component
interface RouteGraphProps {
  tags: EnhancedQdrantTag[];
  onNodeClick: (tag: EnhancedQdrantTag) => void;
  onNodeHover: (tag: EnhancedQdrantTag) => void;
  searchQuery?: string;
  categoryFilter?: string;
}

// Knowledge Base Search Component
interface KnowledgeSearchProps {
  onSearch: (query: string) => Promise<SearchResult[]>;
  onFilter: (category: string) => void;
  onExport: () => void;
}

// Tag Management Component
interface TagManagementProps {
  tag: EnhancedQdrantTag;
  onRename: (newName: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onCluster: () => Promise<void>;
}

// Cluster Visualization Component
interface ClusterVisualizationProps {
  clusters: ClusterSummary[];
  onClusterClick: (cluster: ClusterSummary) => void;
}
```

---

## Data Models

### Database Schemas

#### PostgreSQL Schema

```sql
-- Enhanced tags metadata
CREATE TABLE enhanced_tags (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    file_path TEXT NOT NULL,
    line_number INTEGER,
    ast_node_type VARCHAR(100),
    error_type VARCHAR(100),
    confidence FLOAT,
    summary TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    cluster_id UUID,
    CONSTRAINT fk_cluster FOREIGN KEY (cluster_id) REFERENCES clusters(id)
);

-- Clusters
CREATE TABLE clusters (
    id UUID PRIMARY KEY,
    summary TEXT NOT NULL,
    centroid FLOAT[] NOT NULL,
    size INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

-- Recommendations
CREATE TABLE recommendations (
    id UUID PRIMARY KEY,
    tag_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    confidence FLOAT NOT NULL,
    code TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_tag FOREIGN KEY (tag_id) REFERENCES enhanced_tags(id)
);

-- Error analysis
CREATE TABLE error_analysis (
    id UUID PRIMARY KEY,
    tag_id UUID NOT NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    ast_context JSONB,
    analysis TEXT,
    fixed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_tag FOREIGN KEY (tag_id) REFERENCES enhanced_tags(id)
);
```


#### Neo4j Schema

```cypher
// File nodes
CREATE (f:File {
    path: string,
    name: string,
    extension: string,
    lastModified: datetime
})

// Component nodes
CREATE (c:Component {
    name: string,
    type: string,
    filePath: string,
    lineNumber: integer
})

// Function nodes
CREATE (fn:Function {
    name: string,
    filePath: string,
    lineNumber: integer,
    parameters: [string],
    returnType: string
})

// Import relationships
CREATE (f1:File)-[:IMPORTS {
    importedSymbols: [string],
    importType: string
}]->(f2:File)

// Dependency relationships
CREATE (c1:Component)-[:DEPENDS_ON]->(c2:Component)
CREATE (fn1:Function)-[:CALLS]->(fn2:Function)

// Tag relationships
CREATE (f:File)-[:HAS_TAG]->(t:Tag {
    tagId: string,
    category: string
})
```

#### Qdrant Collection Schema

```typescript
// Collection configuration
const collectionConfig = {
  name: "knowledge_base_v2",
  vectors: {
    size: 384, // embeddinggemma dimension
    distance: "Cosine"
  },
  payload_schema: {
    tag_id: "keyword",
    name: "text",
    category: "keyword",
    file_path: "text",
    summary: "text",
    timestamp: "datetime",
    cluster_id: "keyword"
  }
};
```

#### CouchDB Document Schema

```json
{
  "_id": "tag_uuid",
  "type": "enhanced_tag",
  "name": "ComponentName",
  "category": "component",
  "raw_content": "// Full file content or code snippet",
  "comments": [
    {
      "line": 10,
      "text": "// TODO: Refactor this"
    }
  ],
  "patterns": [
    {
      "pattern": "useState",
      "occurrences": 5,
      "context": ["line 15", "line 23"]
    }
  ],
  "timestamp": "2025-12-29T10:00:00Z"
}
```


#### Redis Cache Schema

```typescript
// Tensor coordinates cache
const coordinatesKey = `coordinates:${tagId}`;
const coordinatesValue = JSON.stringify({
  x: 0.123,
  y: 0.456,
  z: 0.789,
  timestamp: Date.now()
});
// TTL: 24 hours

// Embedding cache
const embeddingKey = `embedding:${textHash}`;
const embeddingValue = JSON.stringify([0.1, 0.2, ...]); // 384-dim vector
// TTL: 7 days

// Cluster cache
const clusterKey = `cluster:${clusterId}`;
const clusterValue = JSON.stringify({
  summary: "...",
  tags: ["tag1", "tag2"],
  centroid: [0.1, 0.2, ...]
});
// TTL: 12 hours
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Enhanced Tag Completeness
*For any* indexed file, the system SHALL create an enhanced Qdrant tag with embedding, summary, and timestamp.
**Validates: Requirements 2.1, 2.2**

### Property 2: Multi-Database Atomicity
*For any* indexing operation, all database updates SHALL complete atomically or rollback completely.
**Validates: Requirements 6.1**

### Property 3: AST Graph Consistency
*For any* TypeScript/Svelte file, the Neo4j dependency graph SHALL accurately reflect the AST structure.
**Validates: Requirements 3.1, 3.2, 3.3**

### Property 4: Semantic Search Accuracy
*For any* search query, results SHALL be ranked by semantic similarity using cosine distance.
**Validates: Requirements 9.3**

### Property 5: Cluster Coherence
*For any* k-means cluster, all tags in the cluster SHALL have embeddings closer to the centroid than to other centroids.
**Validates: Requirements 5.3**

### Property 6: Cache Consistency
*For any* cached tensor coordinates, the cache SHALL be invalidated when the underlying embedding changes.
**Validates: Requirements 7.3, 7.5**

### Property 7: Tag Rename Atomicity
*For any* tag rename operation, all references SHALL be updated atomically across all databases or rollback completely.
**Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5**

### Property 8: Recommendation Confidence
*For any* generated recommendation, the confidence score SHALL be between 0 and 1.
**Validates: Requirements 9.5, 10.3**

### Property 9: Error Analysis Completeness
*For any* detected error, the system SHALL store it with AST context in PostgreSQL.
**Validates: Requirements 3.5, 10.1**

### Property 10: CUDA Acceleration
*For any* embedding generation, the system SHALL use CUDA for GPU acceleration when available.
**Validates: Requirements 7.1, 7.2**


### Property 11: Pattern Search Completeness
*For any* file with comments, the system SHALL search for related patterns using ripgrep + awk.
**Validates: Requirements 4.1, 4.2**

### Property 12: Admin UI Responsiveness
*For any* node interaction in the admin UI, the system SHALL respond within 100ms for cached data.
**Validates: Requirements 1.2, 1.3, 11.2**

---

## Error Handling

### Multi-Database Transaction Management

```typescript
class MultiDBTransaction {
  private operations: DBOperation[] = [];
  private completed: DBOperation[] = [];

  async execute(): Promise<void> {
    try {
      // Execute all operations
      for (const op of this.operations) {
        await op.execute();
        this.completed.push(op);
      }
    } catch (error) {
      // Rollback all completed operations
      for (const op of this.completed.reverse()) {
        await op.rollback();
      }
      throw error;
    }
  }

  addOperation(op: DBOperation): void {
    this.operations.push(op);
  }
}

interface DBOperation {
  execute(): Promise<void>;
  rollback(): Promise<void>;
}
```

### Retry Queue for Failed Operations

```typescript
class RetryQueue {
  private queue: QueuedOperation[] = [];
  private maxRetries = 3;

  async enqueue(operation: DBOperation, metadata: OperationMetadata): Promise<void> {
    this.queue.push({
      operation,
      metadata,
      attempts: 0,
      lastAttempt: Date.now()
    });

    // Process queue
    await this.processQueue();
  }

  private async processQueue(): Promise<void> {
    for (const item of this.queue) {
      if (item.attempts >= this.maxRetries) {
        // Move to dead letter queue
        await this.moveToDeadLetter(item);
        continue;
      }

      try {
        await item.operation.execute();
        // Remove from queue on success
        this.queue = this.queue.filter(i => i !== item);
      } catch (error) {
        item.attempts++;
        item.lastAttempt = Date.now();
        // Exponential backoff
        await this.sleep(Math.pow(2, item.attempts) * 1000);
      }
    }
  }
}
```


---

## Testing Strategy

### Unit Testing

**Test each component independently:**
- Mock all database connections
- Test AST analysis with sample files
- Test pattern search with sample comments
- Test clustering with sample embeddings
- Test CUDA operations with mock GPU
- Test admin UI components with mock data

**Example:**
```typescript
describe('EnhancedQdrantTag creation', () => {
  it('should create tag with all required fields', async () => {
    const mockFile = createMockFile();
    const tag = await createEnhancedTag(mockFile);

    expect(tag.id).toBeDefined();
    expect(tag.embedding).toHaveLength(384);
    expect(tag.summary).toBeDefined();
    expect(tag.timestamp).toBeDefined();
  });
});
```

### Property-Based Testing

**Test universal properties:**
- Property 1: Enhanced tag completeness
- Property 2: Multi-database atomicity
- Property 3: AST graph consistency
- Property 4: Semantic search accuracy
- Property 5: Cluster coherence
- Property 6: Cache consistency
- Property 7: Tag rename atomicity
- Property 8: Recommendation confidence
- Property 9: Error analysis completeness
- Property 10: CUDA acceleration
- Property 11: Pattern search completeness
- Property 12: Admin UI responsiveness

**Example:**
```typescript
import fc from 'fast-check';

describe('Property 2: Multi-Database Atomicity', () => {
  it('should rollback all operations on failure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          file: fc.string(),
          content: fc.string()
        }),
        async (data) => {
          const transaction = new MultiDBTransaction();

          // Add operations that will fail
          transaction.addOperation(new PostgreSQLOp(data));
          transaction.addOperation(new FailingOp()); // This will fail
          transaction.addOperation(new Neo4jOp(data));

          await expect(transaction.execute()).rejects.toThrow();

          // Verify rollback
          const pgData = await postgres.query('SELECT * FROM enhanced_tags WHERE file_path = $1', [data.file]);
          expect(pgData.rows).toHaveLength(0);
        }
      )
    );
  });
});
```


### Integration Testing

**Test component interactions:**
- File indexing → AST analysis → Multi-DB storage
- Comment extraction → Pattern search → AI analysis
- Embedding generation → CUDA → Redis caching
- Tag creation → Clustering → Summary generation
- Admin UI → FastAPI → Database queries
- Tag rename → Multi-DB update → Rollback

### End-to-End Testing

**Test complete workflows:**
1. Developer saves a TypeScript file
2. File watcher detects change
3. AST analysis extracts structure
4. Comments are extracted and patterns searched
5. Gemma3-legal analyzes patterns
6. CUDA generates embeddings
7. Enhanced tag is created in all databases
8. K-means clustering groups similar tags
9. Admin UI displays updated route graph
10. Developer searches for related code
11. System returns semantically similar results
12. Developer gets AI recommendations

---

## Performance Targets

### Latency

- **File indexing**: < 2s per file
- **AST analysis**: < 500ms per file
- **Pattern search**: < 100ms per file
- **AI analysis**: < 3s per analysis
- **Embedding generation (CUDA)**: < 50ms per text
- **Semantic search**: < 100ms (cached), < 500ms (uncached)
- **K-means clustering**: < 5s for 1000 tags
- **Admin UI rendering**: < 100ms for 1000 nodes
- **Tag rename**: < 1s across all databases

### Throughput

- **Concurrent file indexing**: 10+ files/second
- **Concurrent searches**: 50+ queries/second
- **Database connections**: 20 per database
- **Redis cache hit rate**: > 80%

### Caching

- **Tensor coordinates**: 24 hours
- **Embeddings**: 7 days
- **Cluster summaries**: 12 hours
- **Search results**: 1 hour
- **AST data**: 24 hours

---

## Deployment Considerations

### Docker Compose Configuration

```yaml
version: '3.8'

services:
  fastapi-middleware:
    build: ./backend/fastapi-middleware
    ports:
      - "8000:8000"
    environment:
      - CUDA_VISIBLE_DEVICES=0
      - QDRANT_URL=http://qdrant:6333
      - REDIS_URL=redis://redis:6379
      - NEO4J_URL=bolt://neo4j:7687
      - POSTGRES_URL=postgresql://postgres:5432/legal_ai_db
      - COUCHDB_URL=http://couchdb:5984
    depends_on:
      - qdrant
      - redis
      - neo4j
      - postgres
      - couchdb
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  neo4j:
    image: neo4j:5-community
    ports:
      - "7474:7474"
      - "7687:7687"
    environment:
      - NEO4J_AUTH=neo4j/password
    volumes:
      - neo4j_data:/data

  postgres:
    image: postgres:17
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=legal_ai_db
      - POSTGRES_USER=legal_ai_user
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  couchdb:
    image: couchdb:3
    ports:
      - "5984:5984"
    environment:
      - COUCHDB_USER=admin
      - COUCHDB_PASSWORD=password
    volumes:
      - couchdb_data:/opt/couchdb/data

volumes:
  qdrant_data:
  redis_data:
  neo4j_data:
  postgres_data:
  couchdb_data:
```


### Environment Configuration

```bash
# FastAPI Middleware
FASTAPI_HOST=0.0.0.0
FASTAPI_PORT=8000
FASTMCP_ENABLED=true

# CUDA
CUDA_VISIBLE_DEVICES=0
CUDA_DEVICE_ORDER=PCI_BUS_ID

# Databases
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=knowledge_base_v2
REDIS_URL=redis://localhost:6379
NEO4J_URL=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
POSTGRES_URL=postgresql://legal_ai_user:password@localhost:5432/legal_ai_db
COUCHDB_URL=http://admin:password@localhost:5984

# AI Models
OLLAMA_URL=http://localhost:11434
GEMMA3_MODEL=gemma3-legal:latest
EMBEDDING_MODEL=embeddinggemma:latest

# ts-ast-autofixer
AST_FIXER_URL=http://localhost:3002
AST_FIXER_WS_URL=ws://localhost:8084

# K-means Clustering
KMEANS_DEFAULT_K=10
KMEANS_MAX_ITERATIONS=100

# Caching
REDIS_COORDINATES_TTL=86400  # 24 hours
REDIS_EMBEDDINGS_TTL=604800  # 7 days
REDIS_CLUSTERS_TTL=43200     # 12 hours
```

---

## Security Considerations

### Database Access Control

```typescript
// PostgreSQL: Use parameterized queries
await pool.query(
  'INSERT INTO enhanced_tags (id, name, file_path) VALUES ($1, $2, $3)',
  [id, name, filePath]
);

// Neo4j: Use parameterized Cypher
await session.run(
  'CREATE (f:File {path: $path, name: $name})',
  { path, name }
);

// Qdrant: Validate payload schema
const payload = validatePayload(data, payloadSchema);
await qdrantClient.upsert(collection, { payload });
```

### API Authentication

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    if not verify_jwt(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    return token

@app.post("/api/analyze")
async def analyze_file(request: AnalyzeFileRequest, token: str = Depends(verify_token)):
    # Protected endpoint
    pass
```

### Input Validation

```typescript
import { z } from 'zod';

const EnhancedTagSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.enum(['file', 'function', 'component', 'error', 'pattern']),
  filePath: z.string().min(1),
  embedding: z.array(z.number()).length(384),
  summary: z.string().optional(),
  timestamp: z.string().datetime()
});

// Validate before database insertion
const validatedTag = EnhancedTagSchema.parse(rawTag);
```

---

## Summary

This design provides a **comprehensive self-improving development system** that:

1. **Visualizes knowledge** with interactive admin UI route graphs
2. **Enhances Qdrant tags** with embeddings, summaries, and AI analysis
3. **Performs deep AST analysis** for code structure understanding
4. **Provides intelligent file editing** with pattern search and AI recommendations
5. **Clusters indexed tags** using k-means for pattern discovery
6. **Coordinates multiple databases** atomically (CouchDB, Neo4j, PostgreSQL, Qdrant, Redis)
7. **Accelerates analysis** with CUDA tensor operations and Redis caching
8. **Exposes agentic APIs** via FastMCP/FastAPI middleware
9. **Indexes codebases** automatically with semantic search
10. **Generates AI recommendations** for production-quality code

**Status:** Ready for Implementation
**Next Step:** Create tasks-v2.md with actionable coding tasks

