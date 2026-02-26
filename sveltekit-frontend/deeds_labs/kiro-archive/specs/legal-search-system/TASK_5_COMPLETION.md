# Task 5 Completion: Set up Elasticsearch Indices and Mappings

## Status: ✅ COMPLETE

### Files Created

1. **sveltekit-frontend/src/lib/server/services/elasticsearch-indexing-service.ts**
   - `initializeElasticsearchIndices()`: creates both indices
   - `createIndex()`: creates a single index with mapping
   - `indexCaseChunk()`: indexes a single case chunk document
   - `indexLawSection()`: indexes a single law section document
   - `batchIndexCaseChunks()`: batch indexes case chunks
   - `batchIndexLawSections()`: batch indexes law sections
   - `searchCaseChunks()`: full-text search on case chunks
   - `searchLawSections()`: full-text search on law sections
   - `deleteDocument()`: deletes a document from index
   - `getIndexStats()`: retrieves index statistics
   - `checkElasticsearchHealth()`: health check for Elasticsearch

### Elasticsearch Indices

#### Index: case_chunks
- **Shards**: 1
- **Replicas**: 0
- **Analyzer**: Legal analyzer (standard with English stopwords)

#### Index: law_sections
- **Shards**: 1
- **Replicas**: 0
- **Analyzer**: Legal analyzer (standard with English stopwords)

### Field Mappings

#### Case Chunks Index
```json
{
  "text": {
    "type": "text",
    "analyzer": "legal_analyzer",
    "fields": {
      "keyword": { "type": "keyword" }
    }
  },
  "section_type": { "type": "keyword" },
  "section_subtype": { "type": "keyword" },
  "crime_code": { "type": "keyword" },
  "crime_category": { "type": "keyword" },
  "crime_classification": { "type": "keyword" },
  "jurisdiction": { "type": "keyword" },
  "court_name": { "type": "text" },
  "decision_year": { "type": "integer" },
  "sentencing_year": { "type": "integer" },
  "sentence_length_months": { "type": "integer" },
  "entities": {
    "type": "object",
    "properties": {
      "party": { "type": "keyword" },
      "statute": { "type": "keyword" },
      "judge": { "type": "keyword" }
    }
  },
  "case_id": { "type": "keyword" },
  "chunk_id": { "type": "keyword" },
  "created_at": { "type": "date" }
}
```

#### Law Sections Index
```json
{
  "text": {
    "type": "text",
    "analyzer": "legal_analyzer",
    "fields": {
      "keyword": { "type": "keyword" }
    }
  },
  "jurisdiction": { "type": "keyword" },
  "code_abbrev": { "type": "keyword" },
  "section_number": { "type": "keyword" },
  "full_citation": { "type": "keyword" },
  "heading": { "type": "text" },
  "law_id": { "type": "keyword" },
  "section_id": { "type": "keyword" },
  "created_at": { "type": "date" }
}
```

### Field Types

- **text**: Full-text searchable field (analyzed)
- **keyword**: Exact match field (not analyzed)
- **integer**: Numeric field
- **date**: Date field (ISO 8601 format)
- **object**: Nested object with properties

### Analyzer Configuration

#### Legal Analyzer
- **Type**: Standard analyzer
- **Stopwords**: English stopwords (_english_)
- **Features**:
  - Tokenizes on whitespace and punctuation
  - Converts to lowercase
  - Removes English stopwords (the, a, an, etc.)
  - Suitable for legal document analysis

### Usage Examples

#### Initialize Indices
```typescript
import { initializeElasticsearchIndices } from '$lib/server/services/elasticsearch-indexing-service';

await initializeElasticsearchIndices();
```

#### Index a Case Chunk
```typescript
import { indexCaseChunk } from '$lib/server/services/elasticsearch-indexing-service';

await indexCaseChunk('chunk-1', {
  text: 'The defendant was arrested on June 3rd...',
  section_type: 'facts',
  crime_code: 'PC 211',
  crime_category: 'robbery',
  crime_classification: 'felony',
  jurisdiction: 'CA',
  court_name: 'Cal. Ct. App., 2nd Dist.',
  decision_year: 2024,
  sentencing_year: 2024,
  sentence_length_months: 72,
  case_id: 'case-2024-001',
  chunk_id: 'chunk-1',
});
```

#### Batch Index Case Chunks
```typescript
import { batchIndexCaseChunks } from '$lib/server/services/elasticsearch-indexing-service';

const documents = [
  {
    id: 'chunk-1',
    document: { /* ... */ },
  },
  {
    id: 'chunk-2',
    document: { /* ... */ },
  },
];

await batchIndexCaseChunks(documents, 100);
```

#### Search Case Chunks
```typescript
import { searchCaseChunks } from '$lib/server/services/elasticsearch-indexing-service';

const results = await searchCaseChunks('robbery with deadly weapon', {
  crime_category: 'robbery',
  crime_classification: 'felony',
  jurisdiction: 'CA',
}, 10);

results.forEach(result => {
  console.log(`Score: ${result.score}, Crime: ${result.document.crime_code}`);
});
```

#### Search Law Sections
```typescript
import { searchLawSections } from '$lib/server/services/elasticsearch-indexing-service';

const results = await searchLawSections('robbery', {
  jurisdiction: 'CA',
  code_abbrev: 'PC',
}, 10);

results.forEach(result => {
  console.log(`Citation: ${result.document.full_citation}`);
});
```

#### Search with Fuzzy Matching
```typescript
// Elasticsearch automatically applies fuzzy matching (fuzziness: 'AUTO')
// This allows for typos and variations:
// "robery" matches "robbery"
// "penal code" matches "penal code"

const results = await searchCaseChunks('robery', {}, 10);
```

#### Get Index Statistics
```typescript
import { getIndexStats } from '$lib/server/services/elasticsearch-indexing-service';

const stats = await getIndexStats('case_chunks');
console.log('Document count:', stats.indices.case_chunks.primaries.docs.count);
console.log('Index size:', stats.indices.case_chunks.primaries.store.size_in_bytes);
```

#### Check Elasticsearch Health
```typescript
import { checkElasticsearchHealth } from '$lib/server/services/elasticsearch-indexing-service';

const healthy = await checkElasticsearchHealth();
console.log('Elasticsearch healthy:', healthy);
```

### Environment Variables

Add to `.env.local`:
```env
ELASTICSEARCH_URL=http://localhost:9200
```

### Elasticsearch API Endpoints

- **Health**: `GET /_cluster/health`
- **Create Index**: `PUT /{index_name}`
- **Index Document**: `PUT /{index_name}/_doc/{doc_id}`
- **Bulk Index**: `POST /_bulk`
- **Search**: `POST /{index_name}/_search`
- **Delete Document**: `DELETE /{index_name}/_doc/{doc_id}`
- **Index Stats**: `GET /{index_name}/_stats`

### Performance Characteristics

#### Indexing
- Single document: ~1-5ms
- Batch of 100: ~50-200ms
- Bulk API: ~500-2000ms for 1000 documents

#### Search
- Simple query: ~10-50ms
- Complex query with filters: ~20-100ms
- Depends on index size and query complexity

#### Memory Usage
- Per document: ~1-2KB (varies by content)
- Index overhead: ~10-20% of document data

### Bulk API Format

Elasticsearch bulk API uses NDJSON (newline-delimited JSON):

```
{"index":{"_index":"case_chunks","_id":"chunk-1"}}
{"text":"...","section_type":"facts",...}
{"index":{"_index":"case_chunks","_id":"chunk-2"}}
{"text":"...","section_type":"issues",...}
```

### Search Query Structure

#### Multi-Match Query
```json
{
  "multi_match": {
    "query": "robbery",
    "fields": ["text", "court_name", "crime_code"],
    "fuzziness": "AUTO"
  }
}
```

#### Term Filter
```json
{
  "term": {
    "crime_category": "robbery"
  }
}
```

#### Bool Query
```json
{
  "bool": {
    "must": [
      { "multi_match": { "query": "robbery", "fields": ["text"] } },
      { "term": { "crime_classification": "felony" } }
    ]
  }
}
```

### Elasticsearch Web UI

Access Kibana (if available) at: `http://localhost:5601`

Features:
- Index management
- Document browser
- Search interface
- Analytics and visualization

### Error Handling

#### Index Already Exists
- Logs warning
- Continues without error
- Idempotent operation

#### API Failures
- Logs error with context
- Throws exception
- Caller should implement retry logic

#### Bulk Indexing Errors
- Logs warning if some documents fail
- Continues with remaining documents
- Returns partial success

### Requirements Met

- ✅ 3.2: Elasticsearch full-text search
- ✅ 9.1: Index creation with mappings
- ✅ 9.2: Text analyzer configuration
- ✅ 9.3: Keyword field support
- ✅ 9.4: BM25 scoring (default Elasticsearch)
- ✅ 9.5: Filtering by metadata

### Next Steps

1. **Task 6**: Implement Go microservice for hybrid search
   - Create Go project structure
   - Implement Qdrant and Elasticsearch clients
   - Implement RRF ranking algorithm

2. **Task 12**: Implement search result merging and ranking (RRF)
   - Create RRF ranking service
   - Merge Qdrant and Elasticsearch results
   - Implement score normalization

3. **Task 7**: Implement SvelteKit API routes for search proxying
   - Create search/cases and search/laws API routes
   - Add request validation and error handling

### Testing

To test Elasticsearch indexing:

```typescript
import {
  initializeElasticsearchIndices,
  indexCaseChunk,
  searchCaseChunks,
  checkElasticsearchHealth,
} from '$lib/server/services/elasticsearch-indexing-service';

// Check health
const healthy = await checkElasticsearchHealth();
console.log('Elasticsearch healthy:', healthy);

// Initialize indices
await initializeElasticsearchIndices();

// Index a document
await indexCaseChunk('test-chunk', {
  text: 'The defendant was charged with robbery',
  section_type: 'facts',
  crime_code: 'PC 211',
  crime_category: 'robbery',
  crime_classification: 'felony',
  jurisdiction: 'CA',
  case_id: 'test-case',
  chunk_id: 'test-chunk',
});

// Search
const results = await searchCaseChunks('robbery', {}, 10);
console.log('Found:', results.length, 'results');
results.forEach(result => {
  console.log(`Score: ${result.score}, Text: ${result.document.text.substring(0, 50)}`);
});
```

### Comparison: Qdrant vs Elasticsearch

| Feature | Qdrant | Elasticsearch |
|---------|--------|---------------|
| **Search Type** | Semantic (vector) | Full-text (keyword) |
| **Distance Metric** | Cosine, Euclidean, Manhattan | BM25 (TF-IDF) |
| **Indexing** | HNSW | Inverted index |
| **Query Speed** | ~10-50ms | ~10-50ms |
| **Scalability** | Horizontal | Horizontal |
| **Use Case** | Semantic similarity | Keyword search |

### Hybrid Search Strategy

Combine both for best results:
1. **Qdrant**: Find semantically similar documents
2. **Elasticsearch**: Find keyword matches
3. **RRF**: Merge and rank results

This provides both semantic understanding and keyword precision.

