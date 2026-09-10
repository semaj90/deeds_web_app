# Embedding Backfill Usage Guide

**Updated:** 2026-09-10

## Current rule

Do not use the historical full-corpus writer to populate
`content_embedding_768`. The canonical Parent Atlas dense owner is:

```text
public.codebase_chunk_index.content_embedding
halfvec(768)
representation semantic_768
```

## Read-only status

```bash
node scripts/atlas/backfill-codebase-chunk-embeddings.mjs
```

The compatibility command now reports canonical/alternate coverage only and
refuses `--apply`.

## Canonical revision-qualified writer

From `sveltekit-frontend/`:

```bash
node ../scripts/atlas/backfill-graphify-file-embeddings-768.mjs
```

Default mode is dry-run. Do not add `--apply` until its explicit authorization,
workspace revision, source revision, and runtime-provenance requirements are
satisfied.

## Verify storage

```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE content_embedding IS NOT NULL) AS canonical_768,
  COUNT(*) FILTER (WHERE content_embedding_768 IS NOT NULL) AS alternate_768
FROM public.codebase_chunk_index;
```

Verify physical type:

```sql
SELECT format_type(a.atttypid,a.atttypmod)
FROM pg_attribute a
JOIN pg_class c ON c.oid=a.attrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname='codebase_chunk_index'
  AND a.attname='content_embedding'
  AND a.attnum>0
  AND NOT a.attisdropped;
```

Expected: `halfvec(768)`.

## Verify model width

```bash
curl -s http://127.0.0.1:11434/api/embed \
  -H 'Content-Type: application/json' \
  -d '{"model":"embeddinggemma:latest","input":["test"]}' \
  | jq '.embeddings[0] | length'
```

Expected: `768`.

Do not reinterpret the local ONNX export's `max_sequence_length=512` as a vector
dimension. It is an input-capacity limit for that executor artifact.
