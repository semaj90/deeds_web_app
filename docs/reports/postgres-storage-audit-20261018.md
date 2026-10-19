# PostgreSQL storage and retrieval audit — 2026-10-18

Scope: read-only live observations and bounded lexical probes. No extension installation,
index DDL, trigger changes, re-embedding, cache writes, training, or routing promotion.

## Reproducible owners

- `scripts/atlas/audit-postgres-index-capability-v1.mjs` now includes
  `postgres-index-storage-observations-v1.mjs`: installed/available extensions,
  exact FTS trigger/filter/function definitions, column types, all index definitions,
  validity/readiness, byte sizes, scan/I/O counters, table maintenance statistics,
  and database statistics reset timestamp. Docker sessions enforce read-only mode,
  30-second statements, 3-second lock deadlines, and psql error stopping.
- `scripts/atlas/benchmark-postgres-fts-vs-pgsearch-bm25-v1.mjs` now enforces
  one repeatable-read, read-only transaction, 10-second statements, and 3-second
  lock deadlines; captures `EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON)`
  for both existing lanes. It does not create an index or infer relevance labels.
- Both accept `--output=<fresh-path>`; explicit output paths use exclusive creation
  rather than overwriting earlier receipts. Legacy default report paths remain compatible.

## Current live results

- PostgreSQL 18.4; installed and available: vector 0.8.3, pg_trgm 1.6,
  pg_search 0.25.1. vectorscale, pg_vectorsearch, pgai/ai, and hll are neither
  installed nor listed as available in this server catalog.
- `search_vector` is native `tsvector`. Valid, ready GIN index:
  `idx_codebase_chunk_bm25_search` (the name does not make it the pg_search BM25 index).
- The enabled search-vector trigger is already `BEFORE INSERT OR UPDATE OF`
  relative_path, symbol, ast_symbols, ast_imports, ast_exports, summary, content,
  semantic_tags. A domain_id-only or embedding-only UPDATE does not select this
  trigger. The audit retains its function definition for dependency review; it
  does not disable triggers or apply the historical broad-trigger migration.
- 48 chunk-table indexes; ten are HNSW, all valid and ready at observation time.
  content_embedding halfvec HNSW: 115,548,160 bytes, m=16, ef_construction=200;
  content_embedding_768 vector HNSW: 805,216,256 bytes, m=16, ef_construction=64.
  The cohorts/recipes differ; these sizes do not isolate a precision advantage.
- Table bytes: 1,924,562,944; index bytes: 1,508,810,752. Statistics report zero
  estimated live tuples, 4,720 dead tuples, and null reset/maintenance timestamps.
  These are not an exact census, proof of an empty table, or measured bloat.
  Zero index scans do not authorize dropping an index. Bloat remains NOT_MEASURED.
- Existing capability contracts also report missing leading-column indexes for
  atlas_symbol_versions.source_revision and qualified_name. Review actual workload
  and existing composite indexes before proposing DDL; this is not an apply request.
- Eight lexical queries completed without errors. FTS first-read latency ranged
  10.08–3,362.81 ms; pg_search BM25 335.46–7,988.10 ms. Top-10 intersection was
  0–9 results. Each query has one FTS-first trial and a second execution for its
  plan: cache/order effects and score ties are uncontrolled. These are descriptive
  observations, not Recall@10, relevance, or a controlled speed comparison.

Raw local receipts, preserved separately from earlier reports:

- `.tmp/atlas-admin-health-20261018/storage-index-audit-v1.json`
- `.tmp/atlas-admin-health-20261018/lexical-benchmark-v1.json`

Validation: six new storage-observation tests passed, including broad-trigger,
disabled-trigger, invalid-index, and failed-catalog negative controls. JavaScript
syntax checks passed. Full application/production semantic qualification is not implied.

## Boundaries and follow-up

NVMe is storage, not a graph algorithm. The Windows host reports an NVMe SSD, but
the PostgreSQL named Docker volume's physical backing path and I/O performance
are not established. StreamingDiskANN is a vector proximity-graph challenger;
typed graph analysis remains with the existing NetworkX/Neo4j/cuGraph owners.
Its statistical binary quantization must not be described as identical to every
DiskANN implementation's PQ layout. Benchmark a version-pinned disposable PG18
environment before any production extension installation; halfvec operator-class
compatibility is a separate gate.

BitNet targets compatible low-bit models; it is not an SSD offload switch for the
current Ornith checkpoint. Any model/embedding experiment needs its own identity,
recipe, held-out evaluation and explicit promotion. Do not reuse semantic_768 tags.

HLL remains approximate telemetry in `atlas-hll-telemetry.ts`; exact identity/dedup
stays with the existing canonical resolution and fusion owners. HOT eligibility
requires suitable free space and indexed-column constraints; fillfactor is not a
guarantee, and this audit does not measure HNSW update amplification.

Kafka/QLoRA owner inventory found the existing PostgreSQL outbox/RabbitMQ path,
process-local work-event inbox, QLoRA readiness gate and adapter registry. An inbox
Map is not durable Kafka delivery; FP16 LoRA configuration does not prove NF4 QLoRA.
Routing policy heads are distinct from transformer attention heads. Training,
GPU execution, adapter admission and deployed readback remain independent gates.

Primary references:
- https://github.com/timescale/pgvectorscale
- https://github.com/timescale/pgvectorscale/issues/106
- https://github.com/microsoft/BitNet
- https://www.postgresql.org/docs/18/sql-createtrigger.html
- https://www.postgresql.org/docs/18/storage-hot.html
