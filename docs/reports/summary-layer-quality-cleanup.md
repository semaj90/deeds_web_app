# Summary Layer Quality Cleanup

- generated_at: 2026-07-04T09:47:51.382Z
- mode: dry-run
- status: PASS
- selected_rows: 0
- packet_summaries_invalidated: 0
- cleaned_reasoning_leaks: 0
- marked_duplicate_superseded: 0
- marked_requires_regeneration: 0

## Before

- atlas_summary_layers:
  - total_rows: 12004
  - summary_text_rows: 1221
  - embedded_rows: 1193
  - leaked_rows: 0
  - distinct_packet_keys: 7919
  - duplicate_rows: 4085
- atlas_packets:
  - total_rows: 58304
  - summary_text_rows: 1225
  - leaked_rows: 0

## After

- atlas_summary_layers:
  - total_rows: 12004
  - summary_text_rows: 1221
  - embedded_rows: 1193
  - leaked_rows: 0
  - distinct_packet_keys: 7919
  - duplicate_rows: 4085
- atlas_packets:
  - total_rows: 58304
  - summary_text_rows: 1225
  - leaked_rows: 0

## Notes

- This script does not delete rows.
- Bad duplicate/unusable summaries are nulled so they are not mirrored as semantic truth.
- Embeddings are cleared when summary text changes or is invalidated.
- Run Gemma4 summary widening and EmbeddingGemma embedding after cleanup.
