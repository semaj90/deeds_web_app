# EmbeddingGemma Batch Worker

- status: PASS
- mode: apply
- model: embeddinggemma:latest
- endpoint: http://127.0.0.1:11434/v1/embeddings
- transport: openai_compatible
- expected_dim: 768
- selected_rows: 0
- embedded_rows: 0
- updated_rows: 0
- batches: 0
- batch_size: 20
- concurrency: 1
- elapsed_ms: 82
- schema_failures: 0
- schema_hints: 1
- report_json: C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\docs\reports\embeddinggemma-batch-worker.json

## Schema Hints

- canonical_source_ref is not a scalar column in this database; derive it from source_ref/source_ref_key/file_path or JSONB metadata/payload.

## Schema Failures

- none

This worker embeds summary rows only. It does not mutate packet identity fields.
