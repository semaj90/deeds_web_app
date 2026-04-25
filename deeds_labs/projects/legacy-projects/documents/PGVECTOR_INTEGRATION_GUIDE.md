# Integrate pgvector Optimized Search into RAG Service

## Quick Integration (5 minutes)

### Step 1: Import the wrapper in your RAG service

**File**: `src/lib/ai/langchain-rag.ts` (or your RAG service)

```typescript
import { pgvectorSearch, pgvectorSearchHealth } from '$lib/services/pgvector-search-wrapper';
```

### Step 2: Replace old search calls

**Before (SLOW - Python subprocess):**
```typescript
// Old approach using subprocess
const results = await fetch('/api/similarity-search', {
  method: 'POST',
  body: JSON.stringify({ query })
});
```

**After (FAST - pgvector direct):**
```typescript
// New approach using pgvector directly
const response = await pgvectorSearch({
  query: query,
  limit: 10,
  threshold: 0.5,
  filters: {
    documentType: 'contract',
    jurisdiction: 'NY'
  }
});

const results = response.results;
```

### Step 3: Update RAG query method

If your RAG service has a `query()` method, update it:

**Before:**
```typescript
async query(question: string, options?: RAGQueryOptions) {
  // ... old implementation with Python fallback
  const searchResults = await this.vectorStore.similaritySearch(question, options?.maxRetrievedDocs ?? 5);
  // ...
}
```

**After:**
```typescript
async query(question: string, options?: RAGQueryOptions) {
  // Use pgvector directly
  const response = await pgvectorSearch({
    query: question,
    limit: options?.maxRetrievedDocs ?? 5,
    threshold: options?.confidenceThreshold ?? 0.5,
    useContentEmbedding: true,
    filters: {
      documentType: options?.documentType,
      jurisdiction: options?.jurisdiction,
      practiceArea: options?.practiceArea,
    }
  });

  if (!response.success) {
    throw new Error(`RAG search failed: ${response.error}`);
  }

  // Convert to LangChain document format if needed
  const sourceDocuments = response.results.map(result => ({
    pageContent: result.content,
    metadata: {
      title: result.title,
      score: result.similarity,
      ...result.metadata
    }
  }));

  // Rest of your RAG logic
  const answer = await this.generateAnswer(sourceDocuments, question);

  return {
    answer,
    sourceDocuments,
    confidence: Math.max(...response.results.map(r => r.similarity)),
    metadata: {
      retrievedChunks: response.results.length,
      processingTime: response.stats.timings.totalMs,
      usedThinkingMode: options?.thinkingMode ?? false,
      usedCompression: false,
      enhancedSemanticSearch: true,
    }
  };
}
```

---

## Common Integration Patterns

### Pattern 1: Health Check on Startup

Add this to your RAG service initialization:

```typescript
export class LegalRAGService {
  async initialize() {
    // Check if pgvector search is available
    const health = await pgvectorSearchHealth();

    if (!health.healthy) {
      console.warn('pgvector search unavailable:', health.error);
      // Fall back to alternative search method if needed
    } else {
      console.log('pgvector search ready:', health.stats);
    }
  }
}
```

### Pattern 2: Intelligent Threshold Selection

Use different thresholds based on query type:

```typescript
async function pgvectorSearchAdaptive(query: string, documentType?: string) {
  let threshold = 0.5; // Default

  // Adjust threshold based on query characteristics
  if (query.length < 5) {
    threshold = 0.7; // Stricter for short queries
  } else if (query.length > 200) {
    threshold = 0.3; // More lenient for long queries
  }

  // Adjust based on document type
  if (documentType === 'contract') {
    threshold = 0.6; // Contracts need higher precision
  } else if (documentType === 'evidence') {
    threshold = 0.4; // Evidence can be more loose
  }

  return pgvectorSearch({
    query,
    threshold,
    filters: { documentType }
  });
}
```

### Pattern 3: Caching Search Results

Add caching layer for frequently searched queries:

```typescript
import { redis } from '$lib/server/redis-client';

async function pgvectorSearchWithCache(request: PgvectorSearchRequest) {
  const cacheKey = `pgvector:search:${request.query}:${JSON.stringify(request.filters ?? {})}`;

  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log('Cache hit for:', request.query);
    return JSON.parse(cached) as PgvectorSearchResponse;
  }

  // Fetch from pgvector
  const response = await pgvectorSearch(request);

  // Cache for 1 hour
  if (response.success) {
    await redis.setex(cacheKey, 3600, JSON.stringify(response));
  }

  return response;
}
```

### Pattern 4: Batch Document Analysis

Find similar documents for a batch of queries:

```typescript
async function analyzeDocumentRelationships(documentIds: string[]) {
  // Get content for each document
  const documents = await getDocumentsById(documentIds);

  // Find similar documents for each
  const relationships = new Map<string, PgvectorSearchResult[]>();

  const similarDocs = await pgvectorSearchBatch(
    documents.map(d => d.content),
    5
  );

  for (const [docContent, results] of similarDocs) {
    const docId = documents.find(d => d.content === docContent)?.id;
    if (docId) {
      relationships.set(docId, results);
    }
  }

  return relationships;
}
```

### Pattern 5: Enhanced Search with Suggestions

Provide users with search suggestions based on similar queries:

```typescript
async function enhancedSearchWithSuggestions(query: string) {
  // Search using pgvector
  const mainResults = await pgvectorSearch({ query, limit: 5 });

  // Generate related queries for suggestions
  const suggestions = [
    `similar cases to ${query}`,
    `precedents for ${query}`,
    `related documents to ${query}`
  ];

  // Find results for suggestions (in background)
  const suggestionResults = await pgvectorSearchBatch(suggestions, 3);

  return {
    mainResults: mainResults.results,
    suggestions: Array.from(suggestionResults.entries()).map(([query, results]) => ({
      query,
      results
    }))
  };
}
```

---

## Migration Checklist

- [ ] Import `pgvectorSearch` wrapper in your RAG service
- [ ] Update RAG `query()` method to use pgvectorSearch
- [ ] Add health check on service initialization
- [ ] Test with sample queries (should see <50ms response times)
- [ ] Update API response types to match new format
- [ ] Add error handling for pgvector failures
- [ ] Deploy migration script to database
- [ ] Monitor search performance in production
- [ ] Update documentation with new capabilities

---

## Performance Expectations

### Before (Python subprocess + JSON file)
```
Query generation:     5-10ms
Python startup:      50-100ms
JSON file load:      20-30ms
NumPy calculation:   20-50ms
─────────────────────────────
Total:              100-150ms ❌
```

### After (Direct pgvector)
```
Query embedding:     10-15ms
pgvector search:      5-15ms
Result serialization: 0-5ms
─────────────────────────────
Total:               15-30ms ✅ (5-10x faster)
```

---

## Troubleshooting

### Issue: "Failed to generate query embedding"
**Solution**: Ensure Ollama is running:
```bash
ollama list
ollama run embeddinggemma:latest
```

### Issue: Search returns zero results
**Solution**: Try lowering the threshold:
```typescript
await pgvectorSearch({
  query,
  threshold: 0.3  // More lenient
});
```

### Issue: Search takes >50ms
**Solution**: Check indexes exist:
```sql
SELECT indexname FROM pg_indexes
WHERE indexname LIKE '%embedding%';
```

### Issue: High memory usage after migration
**Solution**: Rebuild indexes:
```bash
PGPASSWORD=123456 psql -h localhost -p 5432 \
  -U legal_admin -d legal_ai_db \
  -c "REINDEX TABLE legal_documents_jsonb;"
```

---

## Type Definitions for TypeScript

The wrapper provides full TypeScript support. Here are the key types:

```typescript
// Search request
interface PgvectorSearchRequest {
  query: string;                    // Required search query
  limit?: number;                   // Results to return (1-100, default: 10)
  threshold?: number;               // Min similarity (0-1, default: 0.5)
  useContentEmbedding?: boolean;   // Search content vs title (default: true)
  filters?: {
    documentType?: string;          // Filter by document type
    jurisdiction?: string;          // Filter by jurisdiction
    practiceArea?: string;          // Filter by practice area
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  };
}

// Search result
interface PgvectorSearchResult {
  id: string;                       // Document ID
  title: string;                    // Document title
  content: string;                  // First 500 chars of content
  metadata: Record<string, any>;   // Full document metadata
  similarity: number;               // 0-1 similarity score
  processingTimeMs: number;         // Request processing time
}

// Full response
interface PgvectorSearchResponse {
  success: boolean;
  query: string;
  results: PgvectorSearchResult[];
  stats: {
    totalResults: number;
    limit: number;
    threshold: number;
    timings: {
      embeddingGenerationMs: number;
      pgvectorSearchMs: number;
      totalMs: number;
    };
    filters: number;
  };
  metadata: {
    userId?: string;
    timestamp: string;
    embeddingModel: 'gemma:384';
    indexType: 'HNSW';
  };
  error?: string;
}
```

---

**Ready to integrate?** Start with Step 1 and test with a sample query!

