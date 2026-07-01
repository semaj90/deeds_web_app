# Import Gemma4 Summaries

Generated: 2026-07-01T01:01:03.103Z
Mode: dry-run
Input: `C:\Users\james\Desktop\colab_630\upload-parent-atlas\atlas_summary_layers.ndjson`
Accepted rows: 1131
Inserted rows: 0
Duplicate skips: 0
Rejected rows: 6399
Status skips: 0
Parse errors: 0
Summary packet export: `.tmp/gemma4-summary-packets.ndjson`

## Sample

- packet:0003260092b1 | null | 299 chars
- packet:0003260092b1 | null | 458 chars
- packet:0003260092b1 | sveltekit-frontend.llm_synthesis_mapping | 317 chars
- packet:0003260092b1 | sveltekit-frontend.llm_synthesis_mapping | 643 chars
- packet:0003850e84ca | null | 617 chars

## Next Steps

- Run the EmbeddingGemma batch worker over atlas_summary_layers rows without embeddings.
- Mirror canonical feature/source metadata to Qdrant payloads.
- Warm Redis/BitFrost semantic cache from packet and summary rows.
- Materialize chrom97 summary packets from .tmp/gemma4-summary-packets.ndjson.