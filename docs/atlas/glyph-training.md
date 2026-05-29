# Atlas: Glyphs As Training Data

Status: Phase 0 complete — documentation and dry-run tooling added. Do NOT apply DB migrations without operator approval.

## Background / History

- Earlier manual migration: `20260416_glyph_records.sql` introduced an initial `glyph_records` layout (archival attempt).
- Recent manual migration: `20260529_glyph_records.sql` and `20260529_lora_training_runs.sql` were authored as sidecars. The ingestion attempt failed because the live `glyph_records` table had a NOT NULL `summary` column while the generated INSERT only included `record_json`.

## Drizzle mapping (planned)

Add to `src/lib/server/db/schema-postgres.ts` (proposed):

```ts
export const glyphRecords = pgTable('glyph_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceRef: text('source_ref').notNull(),
  glyphKind: text('glyph_kind').notNull(),
  section: text('section').notNull(),
  recordJson: jsonb('record_json').notNull().$type<SerializedGlyphRecord>(),
  centroidId: integer('centroid_id'),
  grpoRewardScore: real('grpo_reward_score'),
  somCluster: integer('som_cluster'),
  embeddingModel: text('embedding_model').notNull().default('embeddinggemma:latest'),
  batchId: text('batch_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const loraTrainingRuns = pgTable('lora_training_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  batchId: text('batch_id').notNull().unique(),
  adapterPath: text('adapter_path'),
  baseModel: text('base_model').notNull(),
  loraRank: integer('lora_rank').notNull().default(64),
  glyphCount: integer('glyph_count').notNull(),
  meanReward: real('mean_reward'),
  status: text('status').notNull().default('pending'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

## Manual SQL migration order

1. Review live `glyph_records` schema: `docker exec -it legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\d+ glyph_records"`
2. If the table does not exist, apply `20260529_glyph_records.sql`.
3. Apply `20260529_lora_training_runs.sql`.

Rollback notes:
- To rollback a manual migration, use `DROP TABLE` or `ALTER TABLE` reversions only after operator approval. Keep sidecar SQL files backed up.

No-DB-write policy:
- DO NOT run these SQLs or `drizzle-kit migrate` until the schema has been agreed and a rollback plan documented.

Smoke commands (local):

```bash
# Verify Drizzle exports
node -e "require('./sveltekit-frontend/src/lib/server/db/schema-postgres.js'); console.log('schema loaded')"

# Run the smoke checker
node scripts/atlas/smoke-glyph-schema.mjs

# Repo-level smoke
npm run smoke:opencode
npm run smoke:tool-schema
```
