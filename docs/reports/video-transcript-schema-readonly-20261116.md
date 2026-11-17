# Video transcript schema read-only check — 2026-11-16

## Scope and safety

Inspected the configured local PostgreSQL endpoint after forcing the connection database to `legal_ai_live_integration_scratch`. Set `default_transaction_read_only=on`, checked the returned database name and PostgreSQL version before reading `information_schema.columns` and `pg_indexes`, and issued only `SELECT`/session-setting statements. Result identity: PostgreSQL 18.4, database `legal_ai_live_integration_scratch`, user `legal_admin`. No migration or row write was performed. `legal_ai_db` was not queried.

## Live schema observed

Present tables: `analysis_jobs`, `audio_transcripts`, and `whisper_segments`. `evidence_transcript_segments` and `evidence_frames` were absent in this database.

- `audio_transcripts`: `id`, `evidence_id`, nullable `case_id`, `language`, `duration`, `full_text`, `segment_count`, `whisper_model`, JSONB `metadata`, `created_at`.
- `whisper_segments`: `id`, `transcript_id`, `evidence_id`, `segment_index`, `start_ms`, `end_ms`, `text`, nullable `language`, nullable pgvector `embedding`, `embedding_model`, `qdrant_point_id`, `speaker`, `confidence`, JSONB `metadata`, `created_at`.
- Run/source revisions and word-level intervals are stored in JSONB metadata by the current worker, not dedicated columns. Segment timing is integer milliseconds; preserve source PTS in revision-bound metadata when adding new consumers.

## Live indexes observed

- `audio_transcripts`: primary key only.
- `whisper_segments`: primary key only.
- `analysis_jobs`: primary key, plus B-tree indexes on `evidence_id`, `status`, and `job_type`.

This differs from the checked-in Drizzle declarations, which include evidence/case and evidence/time segment indexes, and from `drizzle/manual/20261116_video_analysis_read_indexes_v1.sql`. The ledger records that draft as unapplied. Do not infer the live schema from Drizzle or apply that draft to a canonical database based on this scratch-only observation. Reconcile migration history and inspect representative scratch query plans before deciding whether an index change is needed.

## Existing application path

The durable video worker writes `audio_transcripts` and `whisper_segments`; the authorized `GET /api/video/analysis/[evidenceId]` read joins these rows and scopes them to the current evidence, case, transcript/job ID, source revision, and analysis revision. It orders by segment start and ordinal. The evidence detail page displays the original media, transcript, detections, and analysis progress. It does not expose a re-analysis submission action, so a new confirmation modal must not imply that it can enqueue work until an authorized queue route exists.

## Product and data guidance

Keep the original object and hash immutable. “Under 100 MB” is a transport ceiling, not permission to buffer a whole video in Node memory. Use bounded upload/worker streams and disk-backed scratch for FFmpeg. Split only processing inputs that need bounded windows (for example long-form ASR), with original PTS retained; never split or replace the admitted original. Extracted PCM/FLAC, transcripts, diarization, EmbeddingGemma audio vectors, denoised audio, frame observations, depth maps, masks, and 2.5D meshes are separate source/run-bound outputs. Audio vectors are for retrieval and do not denoise or transcribe audio.

## Reproduction query pattern

Use the app's configured local connection but replace the database path with the named scratch database. First verify `current_database()` and `server_version`; only continue when they are `legal_ai_live_integration_scratch` and PostgreSQL 18.x. Set the session default to read-only and query only `information_schema.columns` and `pg_indexes`. Never use the query below as a migration command, and do not point it at `legal_ai_db` for this report.

```sql
SET default_transaction_read_only = on;
SELECT current_database(), current_setting('server_version'), current_user, inet_server_addr();
SELECT table_name, column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('analysis_jobs', 'audio_transcripts', 'whisper_segments',
                     'evidence_transcript_segments', 'evidence_frames')
ORDER BY table_name, ordinal_position;
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('analysis_jobs', 'audio_transcripts', 'whisper_segments',
                    'evidence_transcript_segments', 'evidence_frames')
ORDER BY tablename, indexname;
```

```yaml
likely_cause: The schema declarations and live scratch database have drifted, leaving transcript indexes and newer evidence child tables absent from the checked scratch schema.
evidence: [sveltekit-frontend/src/lib/server/db/schema-postgres.ts, sveltekit-frontend/src/lib/server/db/schema/evidence-multi-modal.ts, sveltekit-frontend/src/routes/api/video/analysis/[evidenceId]/+server.ts, sveltekit-frontend/drizzle/manual/20261116_video_analysis_read_indexes_v1.sql, live read-only identity legal_ai_live_integration_scratch/PostgreSQL 18.4]
patch_targets: [openspec/changes/evidence-analysis-bdd-pipeline/tasks.md, docs/reports/video-transcript-schema-readonly-20261116.md]
safe_next_command: "Review drizzle/_journal.json and drizzle/sidecar-migrations.json against the scratch database migration history; no migration apply."
smoke_command: "Repeat guarded read-only schema inspection against legal_ai_live_integration_scratch and capture EXPLAIN (ANALYZE, BUFFERS, SETTINGS) for the authorized transcript read query."
report_path: docs/reports/video-transcript-schema-readonly-20261116.md
```
