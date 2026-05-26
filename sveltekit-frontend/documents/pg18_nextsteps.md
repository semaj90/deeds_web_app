# PostgreSQL 18 Evaluation: pg_textsearch (BM25) Extension

This document outlines next steps for evaluating the Timescale [pg_textsearch](https://github.com/timescale/pg_textsearch) extension to replace or augment our current hybrid search architecture when upgrading database infrastructure.

## Context
During the pgvector + FTS Reciprocal Rank Fusion (RRF) hybrid search implementation, the Timescale `pg_textsearch` extension was investigated for native BM25 relevance ranking inside PostgreSQL.
However, it is not currently packaged with the active `pgvector/pgvector:pg17` Docker image.

## Why Evaluate `pg_textsearch`?
1. **True BM25 vs. ts_rank_cd**: Standard Postgres FTS uses term frequency density (`ts_rank_cd`), which does not adjust for document length normalization or Inverse Document Frequency (IDF) like BM25 does.
2. **Simplified Hybrid Search Queries**: By using a single BM25 index on text columns, we can query lexical search via the `<@>` operator, making it easier to integrate with pgvector in unified queries.
3. **Performance**: Provides LSM-style memtable indexing optimized for large-scale document collections using Block-Max WAND optimization.

---

## Installation & Server Setup
Since `pg_textsearch` must be preloaded into the shared memory buffers of PostgreSQL, follow these steps during the DB upgrade:

### 1. Configuration (`postgresql.conf`)
Add `pg_textsearch` to the `shared_preload_libraries` option and restart PostgreSQL:
```ini
shared_preload_libraries = 'pg_textsearch'
```

### 2. Compilation or Binary Download
- **Pre-built Binaries**: Download matching OS/Arch packages directly from [GitHub Releases](https://github.com/timescale/pg_textsearch/releases).
- **Compilation from Source**:
  ```sh
  cd /tmp
  git clone https://github.com/timescale/pg_textsearch
  cd pg_textsearch
  make
  make install
  ```

### 3. Extension Activation
Inside the database:
```sql
CREATE EXTENSION pg_textsearch;
```

---

## Extension Usage & Syntax Blueprint

### 1. Index Creation
To create a BM25 index on the `content` column of our `code_retrieval_chunks` table:
```sql
CREATE INDEX crc_bm25_idx ON code_retrieval_chunks 
USING bm25(content) 
WITH (text_config='english', k1=1.5, b=0.75);
```
*Note: Parameters like `k1` (term frequency saturation) and `b` (document length normalization) can be customized inside the `WITH` clause.*

### 2. Lexical Querying
Querying BM25 relevance rankings is done via the `<@>` operator:
```sql
SELECT *, (content <@> 'GRAPH_SIM_MAX_N') AS neg_bm25_score
FROM code_retrieval_chunks
ORDER BY content <@> 'GRAPH_SIM_MAX_N'
LIMIT 10;
```
> [!IMPORTANT]
> **Negative BM25 Scores**: The `<@>` operator returns the *negative* BM25 score. This is because PostgreSQL only supports `ASC` order index scans on operators. Therefore, lower (more negative) scores represent better matches.

To target a specific index explicitly (e.g. if a table has multiple BM25 indexes or when querying partial indexes):
```sql
SELECT * FROM code_retrieval_chunks
ORDER BY content <@> to_bm25query('GRAPH_SIM_MAX_N', 'crc_bm25_idx')
LIMIT 10;
```

### 3. Filtering Tradeoffs (Pre- vs. Post-Filtering)
- **Pre-Filtering**: Uses a separate index (B-tree / UUID) to filter rows *before* scoring. Best for highly selective conditions (matching <10% of rows).
  ```sql
  SELECT * FROM code_retrieval_chunks
  WHERE file_path LIKE 'src/lib/server/%'
  ORDER BY content <@> 'network error'
  LIMIT 10;
  ```
- **Post-Filtering**: Evaluates the BM25 top-k first, then filters results. Can return fewer rows than `LIMIT` specifies if filters prune too aggressively.
- **pgvector Similarity**: The behavior aligns closely with pgvector's HNSW pre- and post-filtering constraints.

---

## Evaluation Testing Playbook (PostgreSQL 18+)

We will run evaluations comparing retrieval accuracy and performance of `pg_textsearch` against Qdrant's BM25/Dense layers.

### 1. Retrieval Accuracy Metrics
We will compile NDCG@10 (Normalized Discounted Cumulative Gain) and MRR (Mean Reciprocal Rank) on the `labeled_queries.json` dataset.

### 2. Benchmarking Script Blueprint
To automate evaluation, the existing `scripts/eval-retrieval-harness.mjs` can be extended with a PostgreSQL BM25 candidate generator leg. Below is the blueprint to integrate:

```javascript
import pg from 'pg';
const { Client } = pg;

// Establish database connection to the PostgreSQL container
const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:pwd@localhost:5434/legal_ai_db'
});
await client.connect();

// PostgreSQL BM25 query leg
async function searchPostgresBM25(queryText, limit) {
  // Query using the pg_textsearch BM25 operator
  const res = await client.query(
    `SELECT stable_key, file_path, content,
            (content <@> $1) AS neg_score
     FROM code_retrieval_chunks
     ORDER BY neg_score ASC
     LIMIT $2`,
    [queryText, limit]
  );
  return res.rows.map(row => ({
    id: row.stable_key,
    payload: {
      chunk_id: row.stable_key,
      file_path: row.file_path,
      content: row.content
    },
    score: -parseFloat(row.neg_score) // Invert negative score to represent higher as better
  }));
}
```

---

## RRF Integration Blueprint
The fused query in `search_code_hybrid_pg` should be updated to query the BM25 index directly:
```sql
WITH lex AS (
  SELECT stable_key,
         ROW_NUMBER() OVER (ORDER BY content <@> query_text) AS lex_rank
  FROM code_retrieval_chunks
  ORDER BY content <@> query_text
  LIMIT match_limit
),
sem AS (
  -- pgvector query leg remains the same
  SELECT stable_key,
         ROW_NUMBER() OVER (ORDER BY embedding <=> query_emb) AS sem_rank
  FROM code_retrieval_chunks
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> query_emb
  LIMIT match_limit
)
SELECT 
  c.stable_key,
  c.content,
  c.file_path,
  coalesce(1.0 / (60.0 + l.lex_rank), 0.0) + coalesce(1.0 / (60.0 + s.sem_rank), 0.0) AS hybrid_score
FROM lex l
FULL OUTER JOIN sem s ON l.stable_key = s.stable_key
JOIN code_retrieval_chunks c ON c.stable_key = coalesce(l.stable_key, s.stable_key)
ORDER BY hybrid_score DESC
LIMIT match_limit;
```
