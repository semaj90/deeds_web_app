# Summary Layer Quality Cleanup

- generated_at: 2026-06-30T19:30:57.196Z
- mode: apply
- status: PASS
- selected_rows: 11
- packet_summaries_invalidated: 0
- cleaned_reasoning_leaks: 0
- marked_duplicate_superseded: 7
- marked_requires_regeneration: 4

## Before

- atlas_summary_layers:
  - total_rows: 9823
  - summary_text_rows: 1141
  - embedded_rows: 1138
  - leaked_rows: 11
  - distinct_packet_keys: 5780
  - duplicate_rows: 4043
- atlas_packets:
  - total_rows: 58304
  - summary_text_rows: 357
  - leaked_rows: 0

## After

- atlas_summary_layers:
  - total_rows: 9823
  - summary_text_rows: 1130
  - embedded_rows: 1130
  - leaked_rows: 0
  - distinct_packet_keys: 5780
  - duplicate_rows: 4043
- atlas_packets:
  - total_rows: 58304
  - summary_text_rows: 357
  - leaked_rows: 0

## Notes

- This script does not delete rows.
- Bad duplicate/unusable summaries are nulled so they are not mirrored as semantic truth.
- Embeddings are cleared when summary text changes or is invalidated.
- Run Gemma4 summary widening and EmbeddingGemma embedding after cleanup.
