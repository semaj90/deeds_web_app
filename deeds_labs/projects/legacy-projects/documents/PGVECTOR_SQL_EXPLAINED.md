# pgvector SQL Query Explained

## The Core Query You've Selected

```sql
SELECT
  id,
  title,
  content,
  (1 - (embedding <=> $1::vector)) as similarity,
  metadata::text
FROM legal_documents
WHERE (1 - (embedding <=> $1::vector)) >= $2
ORDER BY embedding <=> $1::vector
LIMIT $3
```

---

## 🔍 Breaking Down the Query

### 1. **The Distance Operator: `<=>`**

```sql
embedding <=> $1::vector
```

**What it does**: Computes the **cosine distance** between two vectors.

**Cosine distance formula**:
```
distance = 1 - cosine_similarity
Range: 0 to 2
  0 = identical vectors
  1 = orthogonal (completely different)
  2 = opposite direction
```

**Examples**:
```
Vector A: [0.5, 0.5]
Vector B: [0.5, 0.5]  → distance = 0 (perfect match!)
Vector C: [0.3, 0.7]  → distance = 0.08 (very similar)
Vector D: [-0.5, -0.5] → distance = 2 (opposite)
```

---

### 2. **Converting Distance to Similarity**

```sql
(1 - (embedding <=> $1::vector)) as similarity
```

**Why subtract from 1?**
- pgvector `<=>` gives us **distance** (smaller = better)
- Users expect **similarity** (larger = better)
- Conversion: `similarity = 1 - distance`

**Examples**:
```
Distance 0.00 → Similarity 1.00 (perfect match)
Distance 0.10 → Similarity 0.90 (excellent match)
Distance 0.50 → Similarity 0.50 (moderate match)
Distance 1.00 → Similarity 0.00 (no similarity)
```

---

### 3. **The Threshold Filter**

```sql
WHERE (1 - (embedding <=> $1::vector)) >= $2
```

**Filters results** to only include documents with similarity ≥ threshold

**Example: threshold = 0.5**
```
Document 1: similarity 0.95 ✅ (included)
Document 2: similarity 0.52 ✅ (included)
Document 3: similarity 0.49 ❌ (filtered out)
Document 4: similarity 0.10 ❌ (filtered out)
```

---

### 4. **Ordering by Distance (Not Similarity!)**

```sql
ORDER BY embedding <=> $1::vector
```

**Why order by distance, not similarity?**
- PostgreSQL can use **index** on distance operator
- Ordering by `1 - distance` would require computation
- Result is the same: **smallest distances first = highest similarities first**

**Equivalent to (but faster)**:
```sql
ORDER BY (1 - (embedding <=> $1::vector)) DESC
```

---

### 5. **The LIMIT**

```sql
LIMIT $3
```

**Only returns top K results** (default: 10)

```
$3 = 10 → returns top 10 most similar documents
$3 = 5  → returns top 5 most similar documents
$3 = 100 → returns top 100 most similar documents
```

---

## 📊 Query Execution Flow

### What Happens When You Search

```
INPUT:
  query = "employment contract termination"
  threshold = 0.5
  topK = 10

STEP 1: Generate embedding
  "employment contract termination" → [0.23, 0.45, ..., -0.12] (384-dim)

STEP 2: Execute SQL query
  SELECT id, title, content,
         (1 - (embedding <=> embedding_array)) as similarity,
         metadata::text
  FROM legal_documents
  WHERE (1 - (embedding <=> embedding_array)) >= 0.5
  ORDER BY embedding <=> embedding_array
  LIMIT 10

STEP 3: Return top 10 results with similarity > 0.5
  {
    id: "doc123",
    title: "Employment Contract Template",
    content: "...",
    similarity: 0.92,    ← highest similarity first
    metadata: {...}
  },
  {
    id: "doc456",
    title: "Contract Termination Clause",
    content: "...",
    similarity: 0.87,    ← second highest
    metadata: {...}
  },
  ...
```

---

## ⚡ Performance Characteristics

### Index Usage

The query uses this PostgreSQL feature:

```sql
-- Index created on the embedding column
CREATE INDEX idx_legal_docs_content_embedding
ON legal_documents
USING ivfflat (embedding vector_cosine_ops)
WITH (lists='100');
```

**How IVFFlat index works**:
- Divides vectors into 100 clusters
- Finds K closest clusters
- Searches within those clusters
- Much faster than exhaustive search!

**Performance**:
```
Without index: O(n) - checks all documents
With IVFFlat:  O(log n) - only checks clusters
               ~50-100x faster for large datasets
```

---

## 🔄 Parameter Explanation

### `$1::vector` - The Query Embedding

```typescript
// From your code:
[
  JSON.stringify(embedding),  // $1 - the embedding array as JSON string
  threshold,                   // $2 - minimum similarity (0-1)
  topK,                        // $3 - number of results
]
```

**`::vector` cast**:
- Tells PostgreSQL to interpret the JSON string as a vector
- pgvector automatically handles the conversion

**Example**:
```
$1 = "[0.23, 0.45, 0.12, ..., -0.12]"
::vector conversion → vector(384) type
→ can compare with embedding column
```

---

## 📈 Similarity Score Examples

### Typical Legal Document Search

Query: `"employment contract termination"`

```
Result 1:
  Document: "Employment Contract - Termination Clause"
  Embedding match: Very high on "employment", "contract", "termination"
  Similarity: 0.95 ✅ Excellent

Result 2:
  Document: "End of Employment Agreement"
  Embedding match: High on "employment", "termination" (semantically similar)
  Similarity: 0.82 ✅ Good

Result 3:
  Document: "Severance Package Details"
  Embedding match: Medium on "termination" (related but different focus)
  Similarity: 0.68 ⚠️ Moderate

Result 4:
  Document: "How to Negotiate a Raise"
  Embedding match: Very low (about employment but different meaning)
  Similarity: 0.35 ❌ Not similar
```

---

## 🎯 Threshold Tuning

### Recommended Thresholds by Use Case

```
0.3 - 0.4: Very broad search (high recall, low precision)
           Returns many loosely related documents
           Use: Exploratory research

0.5 - 0.6: Balanced search (good recall and precision)
           Returns relevant documents
           Use: Most searches, RAG retrieval

0.7 - 0.8: Strict search (low recall, high precision)
           Only very similar documents
           Use: Finding exact matches, duplicates

0.9+:      Exact match only
           Almost identical documents only
           Use: Deduplication, exact retrieval
```

---

## 💡 Key Implementation Details

### Metadata Handling

```typescript
metadata::text  // In SQL - cast JSONB to text string

// In TypeScript - parse back to object
metadata: row.metadata ? JSON.parse(row.metadata) : undefined
```

**Why?**
- PostgreSQL returns JSONB as JSON text
- TypeScript needs it back as an object
- `JSON.parse()` converts string → object

### Error Handling

```typescript
} catch (err) {
  console.error('pgvector search error:', err);
  throw new Error('Failed to search vectors');
}
```

**Common errors**:
```
✗ "Invalid vector dimensions"
  → Embedding is wrong size for index

✗ "Type 'text' cannot be cast to type 'vector'"
  → Embedding string is malformed

✗ "Relation legal_documents does not exist"
  → Table name is wrong or permissions issue

✓ "pgvector search error: [details]"
  → Caught and logged for debugging
```

---

## 🔄 How This Compares to the Optimized Version

### Original (What You're Looking At)

```typescript
// Raw SQL execution
const results = await db.execute<SearchResult>(
  `SELECT ... FROM legal_documents WHERE ...`,
  [JSON.stringify(embedding), threshold, topK]
);
```

**Pros**:
- ✅ Direct SQL - complete control
- ✅ Simple - easy to understand
- ✅ Flexible - can modify query easily

**Cons**:
- ❌ String concatenation - SQL injection risk
- ❌ Type unsafe - relies on manual types
- ❌ Uses `legal_documents` table (simpler, but fewer features)
- ❌ No filtering options
- ❌ No caching

---

### Optimized Version

```typescript
// Drizzle ORM with type safety
const results = await db
  .select({
    id: legalDocumentsJsonb.id,
    title: legalDocumentsJsonb.title,
    similarity: sql`1 - (embedding <=> ${queryEmbedding})`
  })
  .from(legalDocumentsJsonb)
  .where(filters) // Structured filtering
  .orderBy(sql`embedding <=> ${queryEmbedding}`)
  .limit(limit);
```

**Pros**:
- ✅ Drizzle ORM - SQL injection prevention
- ✅ Type safe - TypeScript catches errors
- ✅ Uses `legal_documents_jsonb` (more metadata)
- ✅ Filtering - documentType, jurisdiction, risk level
- ✅ Caching - Redis for speed
- ✅ Better errors - detailed messages

**Cons**:
- ❌ More code - slightly more complex
- ❌ ORM abstraction - less direct control

---

## 🚀 Optimization Tips

### 1. **Index Strategy**

**Current**:
```sql
USING ivfflat (embedding vector_cosine_ops) WITH (lists='100')
```

**If you have MANY documents (1M+)**:
```sql
USING ivfflat (embedding vector_cosine_ops) WITH (lists='500')
-- More clusters = more precise but slower search
```

**If you want MAXIMUM speed**:
```sql
USING hnsw (embedding vector_cosine_ops)
-- Hierarchical navigation - often faster than IVFFlat
```

### 2. **Vector Dimensions**

**Current**: Mixed dimensions (384, 768, 1536)

**Optimized**: Standardized to 384

**Impact**:
- 50% less memory
- Faster comparisons
- Consistent performance

### 3. **Caching (Not in This Query)**

**Original**: No caching
```
Every search hits the database
100 users searching same query = 100 database hits
```

**Optimized**: Redis caching
```
First search: 15-30ms (hits database)
Next 100 searches: < 10ms (hits cache)
Repeat query 101 times = 1 DB hit + 100 cache hits
```

---

## 📚 Related SQL Concepts

### pgvector Operators

```sql
<=>  -- cosine distance (what you're using)
<@>  -- euclidean distance (L2 norm)
<#>  -- inner product distance (negated)
```

**Cosine distance is best for semantic search** because:
- Direction matters, not magnitude
- "employment contract" and "the employment contract" = same vector
- Common in NLP/embeddings

### LIMIT vs OFFSET

```sql
-- Get top 10 (your query)
LIMIT 10

-- Get next 10 (pagination)
LIMIT 10 OFFSET 10

-- Implement in your code:
const page = 1;
const pageSize = 10;
LIMIT $pageSize OFFSET $((page - 1) * pageSize)
```

---

## 🎓 Learning Resources

### Key Concepts
1. **Vector Similarity**: How embeddings measure semantic closeness
2. **Cosine Distance**: The `<=>` operator
3. **Indexing Strategy**: IVFFlat vs HNSW tradeoffs
4. **Query Optimization**: Using indexes effectively

### Test This Yourself

```sql
-- Test cosine distance
SELECT
  '[0.5, 0.5]'::vector <=> '[0.5, 0.5]'::vector as same,
  '[0.5, 0.5]'::vector <=> '[0.6, 0.4]'::vector as similar,
  '[0.5, 0.5]'::vector <=> [-0.5, -0.5]'::vector as opposite;

-- Result:
-- same:     0
-- similar:  0.11 (approx)
-- opposite: 2
```

---

## ✅ Summary

Your selected code demonstrates:
1. **Core pgvector search** - the `<=>` operator for cosine distance
2. **Similarity calculation** - converting distance to user-friendly scores
3. **Threshold filtering** - only returning relevant results
4. **Performance optimization** - using index-friendly ORDER BY

This is the fundamental operation that makes semantic search work. The optimized version wraps this with caching, authentication, and better error handling.

**Next**: Try the optimized endpoint and see the performance difference with caching! 🚀
