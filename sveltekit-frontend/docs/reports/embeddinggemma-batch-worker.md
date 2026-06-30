# EmbeddingGemma Batch Worker

- status: PASS
- mode: apply
- model: embeddinggemma:latest
- expected_dim: 768
- selected_rows: 3824
- embedded_rows: 3824
- updated_rows: 3824
- batches: 192
- batch_size: 20
- concurrency: 1
- elapsed_ms: 257955
- report_json: C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\docs\reports\embeddinggemma-batch-worker.json

This worker embeds summary rows only. It does not mutate packet identity fields.
