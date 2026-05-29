# Glyph Training Notes

Smoke run summary (scripts/atlas/smoke-glyph-schema.mjs):

- `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` exports `glyphRecords` and `loraTrainingRuns` — OK.
- Missing manual SQL file: `20260416_glyph_records.sql` (expected by smoke script) — not found in `sveltekit-frontend/drizzle/manual/`.
- `20260529_glyph_records.sql` found and contains `CREATE TABLE IF NOT EXISTS` plus expected index mentions.
- `20260529_lora_training_runs.sql` found but does not mention `source_ref`/`card_id` index (this is optional but recommended).

Next steps recommended:

1. Locate or recreate `20260416_glyph_records.sql` if it is required by audit history; otherwise remove it from the smoke script's expected list.
2. Add an index on `source_ref` or `card_id` in `20260529_lora_training_runs.sql` if lookups by source are expected.
3. Re-run `node scripts/atlas/smoke-glyph-schema.mjs` and confirm all checks pass before attempting any DB writes.

Policy reminder: DO NOT apply migrations or manual SQL without operator approval. Ingestion scripts default to dry-run; use explicit `--write` to apply.
