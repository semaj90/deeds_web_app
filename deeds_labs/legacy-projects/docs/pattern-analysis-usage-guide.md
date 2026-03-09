# Pattern Analysis System - Usage Guide

This system provides production-ready user pattern analysis using Gemma embeddings, PostgreSQL + pgvector, and MinIO object storage.

## Features

- **Gemma Embeddings**: Generic HTTP endpoint for local/remote Gemma models
- **PostgreSQL + pgvector**: Vector similarity search with nearest-neighbor queries
- **MinIO Integration**: S3-compatible object storage for user files
- **simdjson-wasm**: High-performance JSON parsing for large documents
- **SvelteKit Compatible**: Server-side TypeScript with async/await

## Setup

### 1. Environment Variables

Create a `.env` file with the following configuration:

```bash
# Database (PostgreSQL with pgvector)
DATABASE_URL="postgresql://user:password@localhost:5432/legal_ai"
DATABASE_SSL=false

# Gemma Embedding Service
GEMMA_EMBED_ENDPOINT="http://localhost:8080/embed"
GEMMA_API_KEY=""  # Optional for authenticated endpoints
GEMMA_TIMEOUT=30000
GEMMA_BATCH_SIZE=32
GEMMA_RATE_LIMIT=60

# Fallback embedding providers
GEMMA_FALLBACK_ENDPOINT=""  # Optional fallback Gemma endpoint
GEMMA_FALLBACK_API_KEY=""
OPENAI_API_KEY=""  # Optional OpenAI fallback

# MinIO Object Storage
MINIO_ENDPOINT="http://localhost:9000"
MINIO_REGION="us-east-1"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
```

### 2. Database Migration

Run the pgvector migration to set up the required tables:

```bash
psql -d your_database -f migrations/0001_create_pgvector_and_tables.sql
```

### 3. MinIO Setup

Start MinIO server and create required buckets:

```bash
# Start MinIO
docker run -p 9000:9000 -p 9001:9001 \
  -e "MINIO_ACCESS_KEY=minioadmin" \
  -e "MINIO_SECRET_KEY=minioadmin" \
  minio/minio server /data --console-address ":9001"

# Create buckets (using mc client)
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/user-documents
mc mb local/legal-files
```

### 4. Gemma Embedding Server

Example Gemma embedding server (Python Flask):

```python
from flask import Flask, request, jsonify
import torch
from transformers import AutoTokenizer, AutoModel

app = Flask(__name__)

# Load Gemma model
tokenizer = AutoTokenizer.from_pretrained("google/gemma-7b")
model = AutoModel.from_pretrained("google/gemma-7b")

@app.route('/embed', methods=['POST'])
def embed():
    data = request.json
    texts = data.get('input', [])

    # Tokenize and embed
    inputs = tokenizer(texts, padding=True, truncation=True, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)
        embeddings = outputs.last_hidden_state.mean(dim=1)

    return jsonify({
        "embeddings": embeddings.tolist()
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
```

## Usage Examples

### Basic Pattern Analysis

```typescript
import { PatternAnalyzer } from '$lib/services/pattern-analyzer.js';

// Analyze user patterns
const patterns = await PatternAnalyzer.getUserPatterns('user123', {
  k: 10,                    // Return top 10 similar documents
  refreshEmbeddings: true,  // Compute missing embeddings
  includeMinioFiles: true,  // Load content from MinIO URLs
  useSimdJson: false,       // Use simdjson-wasm for JSON parsing
  clusterResults: false,    // Apply clustering to results
});

console.log('Found patterns:', patterns);
```

### Store Documents for Analysis

```typescript
// Store a text document
const docId = await PatternAnalyzer.storeUserDocument(
  'user123',
  'Legal contract content here...',
  'contract_v1.txt'
);

// Store a document from MinIO
const minioDocId = await PatternAnalyzer.storeMinIODocument(
  'user123',
  'minio://legal-files/contract_2024.json',
  { useSimdJson: true }
);
```

### MinIO File Operations

```typescript
import { MinIOService } from '$lib/server/minio-service.js';

// Extract text from a file
const textResult = await MinIOService.getTextContent(
  'minio://user-documents/legal_brief.pdf',
  {
    maxSize: 10 * 1024 * 1024,  // 10MB limit
    extractPlainText: true
  }
);

// Store text content
const minioUrl = await MinIOService.storeTextContent(
  'user-documents',
  'analysis_result.txt',
  'Analysis results here...',
  { userId: 'user123', type: 'analysis' }
);

// Batch process multiple files
const batchResults = await MinIOService.batchExtractText([
  'minio://legal-files/doc1.pdf',
  'minio://legal-files/doc2.json',
  'minio://legal-files/doc3.txt'
], { concurrency: 3 });
```

### Embedding Service Usage

```typescript
import { gemmaEmbeddingService } from '$lib/services/gemma-embedding-service.js';

// Embed single text
const [embedding] = await gemmaEmbeddingService.embed([
  'Legal document content to embed'
], {
  dimensions: 1536,
  normalize: true,
  useCache: true
});

// Batch embedding with different providers
const embeddings = await gemmaEmbeddingService.embed([
  'Document 1 content',
  'Document 2 content',
  'Document 3 content'
], {
  preferredProvider: 'gemma-primary',
  useCache: true
});

// Get service health and metrics
const health = await gemmaEmbeddingService.healthCheck();
const metrics = gemmaEmbeddingService.getMetrics();
```

### SvelteKit API Route Example

```typescript
// src/routes/api/patterns/+server.ts
import { json } from '@sveltejs/kit';
import { PatternAnalyzer } from '$lib/services/pattern-analyzer.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const { userId, query, options } = await request.json();

    // Validate user session
    if (!locals.user || locals.user.id !== userId) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const patterns = await PatternAnalyzer.getUserPatterns(userId, options);

    return json({
      success: true,
      patterns,
      count: patterns.length
    });

  } catch (error) {
    console.error('Pattern analysis error:', error);
    return json(
      { error: 'Pattern analysis failed' },
      { status: 500 }
    );
  }
};

export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    const userId = url.searchParams.get('userId');
    const timeframe = url.searchParams.get('timeframe') as 'day' | 'week' | 'month';

    if (!userId || !locals.user || locals.user.id !== userId) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const trends = await PatternAnalyzer.getPatternTrends(userId, timeframe);
    const health = await PatternAnalyzer.getServiceHealth();

    return json({
      trends,
      health,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Pattern trends error:', error);
    return json(
      { error: 'Failed to get trends' },
      { status: 500 }
    );
  }
};
```

### Frontend Integration

```svelte
<!-- src/routes/dashboard/patterns/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

  let patterns = [];
  let trends = [];
  let loading = false;

  async function analyzePatterns() {
    loading = true;
    try {
      const response = await fetch('/api/patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: $page.data.user.id,
          options: {
            k: 10,
            refreshEmbeddings: true,
            includeMinioFiles: true,
            clusterResults: true
          }
        })
      });

      const data = await response.json();
      if (data.success) {
        patterns = data.patterns;
      }
    } catch (error) {
      console.error('Pattern analysis failed:', error);
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    // Load trends on component mount
    const response = await fetch(`/api/patterns?userId=${$page.data.user.id}&timeframe=week`);
    const data = await response.json();
    trends = data.trends;
  });
</script>

<div class="patterns-dashboard">
  <h1>Document Pattern Analysis</h1>

  <button on:click={analyzePatterns} disabled={loading}>
    {loading ? 'Analyzing...' : 'Analyze Patterns'}
  </button>

  {#if patterns.length > 0}
    <div class="patterns-grid">
      {#each patterns as pattern}
        <div class="pattern-card">
          <h3>Pattern {pattern.id}</h3>
          <p>Type: {pattern.pattern_type}</p>
          <p>Confidence: {(pattern.confidence * 100).toFixed(1)}%</p>
          <p>Source: {pattern.source || 'Direct input'}</p>
          <div class="content-preview">
            {pattern.content.substring(0, 200)}...
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if trends.length > 0}
    <div class="trends-section">
      <h2>Pattern Trends</h2>
      {#each trends as trend}
        <div class="trend-item">
          <span>{trend.period}</span>
          <span>{trend.pattern_count} documents</span>
          <span>{(trend.avg_confidence * 100).toFixed(1)}% avg confidence</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .patterns-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
    margin-top: 2rem;
  }

  .pattern-card {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1rem;
    background: white;
  }

  .content-preview {
    font-size: 0.9em;
    color: #666;
    margin-top: 0.5rem;
  }

  .trends-section {
    margin-top: 2rem;
  }

  .trend-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem;
    border-bottom: 1px solid #eee;
  }
</style>
```

## Performance Optimization

### 1. Embedding Caching

The system automatically caches embeddings to avoid recomputing for the same text:

```typescript
// Clear cache if needed
gemmaEmbeddingService.clearCache();

// Check cache statistics
const metrics = gemmaEmbeddingService.getMetrics();
console.log('Cache hit rate:', metrics[0].cacheHitRate);
```

### 2. Batch Processing

Process multiple documents efficiently:

```typescript
// Batch embed multiple documents
const texts = documents.map(doc => doc.content);
const embeddings = await gemmaEmbeddingService.embed(texts, {
  useCache: true,
  dimensions: 1536
});

// Store in database efficiently
await Promise.all(
  documents.map(async (doc, i) => {
    await db.insert(userDocuments).values({
      userId: doc.userId,
      content: doc.content,
      embedding: sql`${JSON.stringify(embeddings[i])}::vector`
    });
  })
);
```

### 3. Vector Index Optimization

For large datasets, tune the pgvector index:

```sql
-- Rebuild index with optimal list count
DROP INDEX IF EXISTS idx_user_documents_embedding;
CREATE INDEX idx_user_documents_embedding
  ON user_documents USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 1000);  -- Adjust based on data size

-- Analyze for query optimization
ANALYZE user_documents;
```

## Production Deployment

### 1. Docker Compose Setup

```yaml
version: '3.8'
services:
  postgres:
    image: pgvector/pgvector:pg15
    environment:
      POSTGRES_DB: legal_ai
      POSTGRES_USER: legal_user
      POSTGRES_PASSWORD: secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ACCESS_KEY: legal_access_key
      MINIO_SECRET_KEY: secure_secret_key
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"

  gemma-server:
    build: ./gemma-server
    ports:
      - "8080:8080"
    environment:
      MODEL_PATH: /models/gemma-7b
    volumes:
      - gemma_models:/models

volumes:
  postgres_data:
  minio_data:
  gemma_models:
```

### 2. Environment-Specific Configuration

Production `.env`:
```bash
DATABASE_URL="postgresql://legal_user:secure_password@postgres:5432/legal_ai"
GEMMA_EMBED_ENDPOINT="http://gemma-server:8080/embed"
MINIO_ENDPOINT="http://minio:9000"
```

### 3. Monitoring and Health Checks

```typescript
// Add to your monitoring setup
import { PatternAnalyzer } from '$lib/services/pattern-analyzer.js';

setInterval(async () => {
  try {
    const health = await PatternAnalyzer.getServiceHealth();
    console.log('Service health:', health);

    // Send to monitoring service
    await sendMetrics('pattern_analysis_health', health);
  } catch (error) {
    console.error('Health check failed:', error);
  }
}, 30000); // Check every 30 seconds
```

## Troubleshooting

### Common Issues

1. **Embedding endpoint connection failed**
   - Check GEMMA_EMBED_ENDPOINT is accessible
   - Verify API key if authentication required
   - Test with curl: `curl -X POST http://localhost:8080/embed -d '{"input":["test"]}'`

2. **pgvector index performance**
   - Increase `lists` parameter for larger datasets
   - Run `ANALYZE user_documents` after bulk inserts
   - Consider partitioning by user_id for multi-tenant setups

3. **MinIO access issues**
   - Verify endpoint URL and credentials
   - Check bucket permissions
   - Test with MinIO client: `mc ls local/`

4. **Memory usage with large documents**
   - Adjust batch sizes in embedding service
   - Implement document chunking for very large files
   - Use streaming for file processing

This completes the production-ready pattern analysis system with comprehensive documentation and examples.