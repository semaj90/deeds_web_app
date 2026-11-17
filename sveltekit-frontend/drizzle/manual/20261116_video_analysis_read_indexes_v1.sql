-- Video analysis read-path indexes v1 (PROPOSAL, not applied to any live database).
--
-- Why: GET /api/video/analysis/[evidenceId] filters whisper_segments by evidence_id and
-- transcript_id, orders by start_ms and segment_index, and filters audio_transcripts by
-- evidence_id. Live tables had only primary-key indexes (whisper_segments 320 rows,
-- audio_transcripts 3 rows on 2026-11-16). The cost is small now and grows with each run.
--
-- Plain CREATE INDEX (not CONCURRENTLY) so it can run inside a transaction for rehearsal.
-- On the live database run it CONCURRENTLY, outside a transaction, after approval.
-- Idempotent: IF NOT EXISTS. Pre-check: none of these index names exist.
-- Post-check: three indexes listed in pg_indexes with the definitions below.

CREATE INDEX IF NOT EXISTS whisper_segments_evidence_time_idx
  ON public.whisper_segments (evidence_id, start_ms);

CREATE INDEX IF NOT EXISTS whisper_segments_transcript_order_idx
  ON public.whisper_segments (transcript_id, segment_index);

CREATE INDEX IF NOT EXISTS audio_transcripts_evidence_idx
  ON public.audio_transcripts (evidence_id);
