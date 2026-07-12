# EmbeddingGemma Batch Worker

- status: PASS
- mode: dry-run
- model: embeddinggemma:latest
- endpoint: http://127.0.0.1:11434/v1/embeddings
- transport: openai_compatible
- expected_dim: 768
- selected_rows: 0
- embedded_rows: 0
- updated_rows: 0
- batches: 0
- batch_size: 5
- concurrency: 1
- elapsed_ms: 44
- schema_failures: 0
- schema_hints: 1
- report_json: C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\docs\reports\embeddinggemma-batch-worker.json

## Schema Hints

- atlas_summary_layers does not own canonical_source_ref as a scalar column; derive provenance from source_ref/source_ref_key/file_path or JSONB metadata/payload, and keep canonical_source_ref on the owning packet/envelope table.

## Schema Failures

- none

This worker embeds summary rows only. It does not mutate packet identity fields.
