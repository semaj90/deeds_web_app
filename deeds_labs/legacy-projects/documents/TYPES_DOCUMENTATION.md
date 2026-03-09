# Search Types Documentation

## Overview

The `src/lib/types/search.ts` file contains all TypeScript interfaces used for:
- **pgvector semantic search**
- **RAG (Retrieval-Augmented Generation) operations**
- **GPU processing and streaming**
- **System status monitoring**

This document explains each type and how it's used in your legal AI platform.

---

## 🔍 Core Search Types

### SearchResult
```typescript
export interface SearchResult {
  id: string;              // Document UUID
  title: string;           // Document title
  content: string;         // Document content preview
  similarity: number;       // Similarity score (0-1)
  metadata?: Record<string, any>;  // Document metadata
}
```

**Used In**:
- `/api/search-pgvector` response
- `/api/search-pgvector-optimized` response
- RAG search results display

**Example**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Employment Contract Template",
  "content": "This employment contract outlines...",
  "similarity": 0.92,
  "metadata": {
    "documentType": "contract",
    "jurisdiction": "California",
    "riskLevel": "medium"
  }
}
```

**Similarity Score Interpretation**:
- `0.95-1.0` - Excellent match (identical or very similar)
- `0.80-0.95` - Very good match (highly relevant)
- `0.60-0.80` - Good match (relevant)
- `0.40-0.60` - Moderate match (somewhat relevant)
- `0.0-0.40` - Poor match (not relevant)

---

### VectorSearchQueryResult
```typescript
export interface VectorSearchQueryResult {
  success: true;
  results: SearchResult[];      // Array of search results
  query: string;                // Original search query
  topK: number;                 // Number of results requested
  responseTime: number;         // Time in milliseconds
  timestamp: string;            // ISO timestamp
  metadata?: {
    modelUsed?: string;         // "embeddinggemma:latest"
    indexType?: string;         // "pgvector", "HNSW", "IVFFlat"
  };
}
```

**Used In**:
- Complete search response from pgvector endpoints
- RAG service search results

**Example Response**:
```json
{
  "success": true,
  "results": [
    { "id": "...", "title": "...", "similarity": 0.92 },
    { "id": "...", "title": "...", "similarity": 0.87 }
  ],
  "query": "employment contract termination",
  "topK": 10,
  "responseTime": 23,
  "timestamp": "2025-10-25T12:00:00Z",
  "metadata": {
    "modelUsed": "embeddinggemma:latest",
    "indexType": "IVFFlat"
  }
}
```

---

## 📝 RAG (Retrieval-Augmented Generation) Types

### SummaryResponse
```typescript
export interface SummaryResponse {
  summary: string;              // Generated summary text
  keyPoints: string[];          // Array of key points extracted
  metadata: {
    documentsProcessed: number; // How many documents were used
    processingTime: number;     // Time in milliseconds
    lambda: number;             // MMR diversity parameter (0-1)
    sentenceCount?: number;     // Sentences in summary
  };
  sources?: string[];           // Document IDs used (optional)
}
```

**Used In**:
- RAG summarization endpoint
- Document summary generation

**What is lambda?**
- Lambda controls diversity in Maximal Marginal Relevance (MMR)
- `lambda = 1.0`: Pure relevance (may be repetitive)
- `lambda = 0.5`: Balanced (default, recommended)
- `lambda = 0.0`: Pure diversity (may miss important info)

**Example**:
```json
{
  "summary": "This employment contract outlines the terms of employment including salary, benefits, and termination conditions. The contract specifies a 30-day notice period for termination and includes provisions for severance packages.",
  "keyPoints": [
    "Salary range: $50,000-$100,000 annually",
    "Termination notice: 30 days",
    "Severance: 1 month per year of service",
    "Benefits: Health, dental, vision"
  ],
  "metadata": {
    "documentsProcessed": 3,
    "processingTime": 1250,
    "lambda": 0.5,
    "sentenceCount": 4
  },
  "sources": ["doc1", "doc2", "doc3"]
}
```

---

### SummaryRequest
```typescript
export interface SummaryRequest {
  documents: any[];     // Documents to summarize
  maxSentences?: number;  // Maximum sentences in summary (default: 5)
  lambda?: number;      // MMR diversity parameter (default: 0.5)
  type?: string;        // Summary type ("general", "legal", etc.)
}
```

**Used In**:
- RAG summarization request
- Document processing endpoints

**Example**:
```json
{
  "documents": [
    { "id": "1", "content": "..." },
    { "id": "2", "content": "..." }
  ],
  "maxSentences": 5,
  "lambda": 0.5,
  "type": "legal"
}
```

---

### LegalDocument
```typescript
export interface LegalDocument {
  id: string;                          // Document UUID
  title: string;                       // Document title
  content: string;                     // Full document content
  type?: string;                       // "contract", "brief", "case", etc.
  metadata?: { [key: string]: any };  // Flexible metadata object
}
```

**Used In**:
- Document storage
- RAG document processing
- Internal document representation

**Example**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Sample Employment Contract",
  "content": "EMPLOYMENT AGREEMENT...",
  "type": "contract",
  "metadata": {
    "documentType": "contract",
    "jurisdiction": "California",
    "dateCreated": "2025-10-25",
    "confidentiality": "confidential",
    "riskLevel": "medium"
  }
}
```

---

## 🏥 System Health Types

### SystemStatus
```typescript
export interface SystemStatus {
  database: boolean;        // PostgreSQL connection status
  qdrant: boolean;         // Qdrant vector DB status
  embeddings: boolean;     // Embedding service status
  vectorSearch: boolean;   // Vector search capability
  redis?: boolean;         // Redis cache status
  ollama?: boolean;        // Ollama service status
  gpu?: boolean;           // GPU availability
  cuda?: boolean;          // CUDA support
  minio?: boolean;         // MinIO object storage
  neo4j?: boolean;         // Neo4j graph DB
  rabbitmq?: boolean;      // RabbitMQ message queue
  elasticsearch?: boolean; // Elasticsearch index
  langchain?: boolean;     // LangChain framework
}
```

**Used In**:
- System health check endpoints
- Startup verification
- Monitoring dashboards

**Example**:
```json
{
  "database": true,
  "qdrant": true,
  "embeddings": true,
  "vectorSearch": true,
  "redis": true,
  "ollama": true,
  "gpu": false,
  "cuda": false,
  "minio": true
}
```

---

### TestResults
```typescript
export interface TestResults {
  query: string;                    // Test query used
  results: any[];                   // Results array
  timestamp: Date;                  // When test was run
  performance: {
    duration: number;               // Time in milliseconds
    documentsSearched: number;       // Number of documents checked
  };
  error?: unknown;                  // Error if test failed
}
```

**Used In**:
- Search performance testing
- Endpoint validation
- Performance monitoring

---

## 🧠 GPU & Streaming Types

### GPUChatMessage
```typescript
export interface GPUChatMessage {
  id: string;                  // Message UUID
  role: 'user' | 'assistant' | 'system';  // Message source
  content: string;             // Message text
  timestamp: Date;             // When message was created
  embedding?: number[];        // Cached embedding (optional)
  metadata?: {
    model?: string;            // LLM model used
    processingTime?: number;   // GPU processing time
    gpuUsed?: boolean;         // Whether GPU was used
    tokenCount?: number;       // Tokens in message
  };
}
```

**Used In**:
- GPU-accelerated chat
- Message history with embeddings
- LLM response generation

---

### GPUProcessingStatus
```typescript
export interface GPUProcessingStatus {
  gpuAvailable: boolean;       // Is GPU available?
  cudaVersion?: string;        // CUDA version (e.g., "12.0")
  gpuMemory?: {
    total: number;             // Total GPU memory in MB
    used: number;              // Used GPU memory in MB
    free: number;              // Free GPU memory in MB
  };
  activeJobs: number;          // Currently processing tasks
  queueLength: number;         // Waiting tasks
}
```

**Used In**:
- GPU availability checks
- Resource monitoring
- Job queue status

**Example**:
```json
{
  "gpuAvailable": true,
  "cudaVersion": "12.0",
  "gpuMemory": {
    "total": 24576,
    "used": 12288,
    "free": 12288
  },
  "activeJobs": 2,
  "queueLength": 5
}
```

---

### StreamingResponse
```typescript
export interface StreamingResponse {
  type: 'chunk' | 'complete' | 'error';  // Response type
  content?: string;                       // Text chunk
  error?: string;                         // Error message
  metadata?: {
    tokensGenerated?: number;             // Tokens in chunk
    processingTimeMs?: number;            // Generation time
  };
}
```

**Used In**:
- Server-sent events (SSE) streaming
- Real-time LLM response generation
- Chat streaming

**Example Chunks**:
```json
{"type": "chunk", "content": "The employment contract"}
{"type": "chunk", "content": " specifies"}
{"type": "chunk", "content": " a 30-day notice period"}
{"type": "complete", "metadata": {"tokensGenerated": 12}}
```

---

## 📊 Data & Metric Types

### TensorOperation
```typescript
export interface TensorOperation {
  type: string;        // Operation type ("matmul", "conv", etc.)
  data: any;          // Operation data
  shape?: number[];   // Tensor shape (e.g., [384] for embeddings)
}
```

**Used In**:
- WebGPU tensor operations
- Embedding calculations
- Matrix operations

---

### MetricData
```typescript
export interface MetricData {
  name: string;                           // Metric name
  value: number;                          // Metric value
  timestamp: Date;                        // When measured
  labels?: Record<string, string>;        // Metadata labels
}
```

**Used In**:
- Performance metrics
- Monitoring dashboards
- Analytics tracking

**Example**:
```json
{
  "name": "search_latency_ms",
  "value": 23,
  "timestamp": "2025-10-25T12:00:00Z",
  "labels": {
    "endpoint": "pgvector-optimized",
    "cached": "false"
  }
}
```

---

## 🔗 Type Relationships

### Search Flow
```
User Query
    ↓
SearchRequest (not defined, use raw JSON)
    ↓
pgvector Endpoint
    ↓
VectorSearchQueryResult
    ↓
SearchResult[] array
    ↓
RAG System (optional)
    ↓
SummaryResponse
    ↓
User Gets Answer
```

### Data Model
```
LegalDocument
├── id: UUID
├── title: string
├── content: string
├── type: string
└── metadata: {
    documentType, jurisdiction, riskLevel, etc.
}
    ↓
(Stored in PostgreSQL with pgvector)
    ↓
SearchResult (returned from search)
├── id: (from LegalDocument)
├── title: (from LegalDocument)
├── content: (from LegalDocument)
├── similarity: (from cosine distance)
└── metadata: (from LegalDocument)
```

---

## 💡 How to Use These Types

### In Your Search Components

```typescript
import type {
  SearchResult,
  VectorSearchQueryResult,
  LegalDocument
} from '$lib/types/search';

// Type-safe search
async function search(query: string): Promise<VectorSearchQueryResult> {
  const response = await fetch('/api/search-pgvector-optimized', {
    method: 'POST',
    body: JSON.stringify({ query, limit: 10 })
  });
  return await response.json();
}

// Type-safe result handling
function displayResults(results: SearchResult[]): void {
  results.forEach((result) => {
    console.log(`${result.title} (${result.similarity})`);
  });
}
```

### In Your API Handlers

```typescript
import type { VectorSearchQueryResult } from '$lib/types/search';

export const POST: RequestHandler = async ({ request }) => {
  // ... search logic ...

  const response: VectorSearchQueryResult = {
    success: true,
    results: foundResults,
    query: searchQuery,
    topK: limit,
    responseTime: endTime - startTime,
    timestamp: new Date().toISOString(),
    metadata: {
      modelUsed: 'embeddinggemma:latest',
      indexType: 'IVFFlat'
    }
  };

  return json(response);
};
```

---

## 🔍 Type Safety Benefits

By using these types throughout your codebase, you get:

1. **Compile-time checking** - TypeScript catches errors before runtime
2. **IDE autocompletion** - IntelliSense suggests correct fields
3. **Documentation** - Types serve as self-documenting code
4. **Refactoring** - Change types once, update everywhere
5. **API contracts** - Frontend/backend agreement on data structure

---

## 📚 Summary Table

| Type | Purpose | Key Fields |
|------|---------|-----------|
| **SearchResult** | Individual search result | id, title, similarity |
| **VectorSearchQueryResult** | Complete search response | success, results, responseTime |
| **SummaryResponse** | RAG summary output | summary, keyPoints, metadata |
| **LegalDocument** | Document in storage | id, title, content, metadata |
| **SystemStatus** | Health check | database, ollama, redis, gpu |
| **GPUChatMessage** | GPU-accelerated chat | id, role, content, embedding |
| **StreamingResponse** | Real-time response | type, content, metadata |

---

## 🎯 Next Steps

1. **Review** - Understand how these types flow through your system
2. **Use** - Apply these types to your components
3. **Extend** - Add new types as needed for features
4. **Validate** - Use types to ensure API contracts

---

**These types are the backbone of your type-safe legal AI platform!** 🚀
