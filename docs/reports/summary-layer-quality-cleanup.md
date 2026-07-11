# Summary Layer Quality Cleanup

- generated_at: 2026-07-11T07:15:54.637Z
- mode: dry-run
- status: PASS
- selected_rows: 581
- packet_summaries_invalidated: 0
- cleaned_reasoning_leaks: 0
- marked_duplicate_superseded: 574
- marked_requires_regeneration: 7

## Before

- atlas_summary_layers:
  - total_rows: 15470
  - summary_text_rows: 4687
  - embedded_rows: 1921
  - leaked_rows: 11
  - distinct_packet_keys: 10494
  - duplicate_rows: 4976
- atlas_packets:
  - total_rows: 58365
  - summary_text_rows: 4180
  - leaked_rows: 10

## After

- atlas_summary_layers:
  - total_rows: 15470
  - summary_text_rows: 4687
  - embedded_rows: 1921
  - leaked_rows: 11
  - distinct_packet_keys: 10494
  - duplicate_rows: 4976
- atlas_packets:
  - total_rows: 58365
  - summary_text_rows: 4180
  - leaked_rows: 10

## Notes

- This script does not delete rows.
- Bad duplicate/unusable summaries are nulled so they are not mirrored as semantic truth.
- Embeddings are cleared when summary text changes or is invalidated.
- Run Gemma4 summary widening and EmbeddingGemma embedding after cleanup.
