-- PROPOSED MIGRATION — DO NOT APPLY WITHOUT OPERATOR APPROVAL
--
-- Source: .tmp/owner-column-drift-report.md (2026-05-30)
-- Risk: 🟢 NONE — all 5 affected tables have 0 rows as of 2026-05-30
-- Effect: ratifies Path A (all integer user_id/owner_id), unlocks operator-only gate
--
-- Verified safe:
--   case_reports                   0 rows
--   vector_outbox                  0 rows
--   admin_ai_chat_sessions         0 rows
--   saved_citation_annotations     0 rows
--   saved_citations                0 rows

BEGIN;

-- Type unifications
ALTER TABLE case_reports
  ALTER COLUMN created_by TYPE integer USING NULL;

ALTER TABLE vector_outbox
  ALTER COLUMN owner_id TYPE integer USING NULL;

ALTER TABLE admin_ai_chat_sessions
  ALTER COLUMN user_id TYPE integer USING NULL;

ALTER TABLE saved_citation_annotations
  ALTER COLUMN user_id TYPE integer USING NULL;

ALTER TABLE saved_citations
  ALTER COLUMN user_id TYPE integer USING NULL;

-- Foreign key constraints (skip if undesired)
ALTER TABLE case_reports
  ADD CONSTRAINT case_reports_created_by_fk
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE vector_outbox
  ADD CONSTRAINT vector_outbox_owner_id_fk
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE admin_ai_chat_sessions
  ADD CONSTRAINT admin_ai_chat_sessions_user_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE saved_citation_annotations
  ADD CONSTRAINT saved_citation_annotations_user_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE saved_citations
  ADD CONSTRAINT saved_citations_user_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

COMMIT;

-- POST-MIGRATION: update Drizzle schema files
--   sveltekit-frontend/src/lib/server/db/schema-postgres.ts:2879
--     createdBy: varchar('created_by', { length: 255 }) → integer('created_by').references(() => users.id)
--   sveltekit-frontend/src/lib/server/db/schema-postgres.ts:768
--     ownerId: varchar('owner_id', { length: 256 }).notNull() → integer('owner_id').references(() => users.id).notNull()
--   sveltekit-frontend/src/lib/server/db/schema/admin-chat.ts:8
--     userId: text('user_id').notNull() → integer('user_id').references(() => users.id).notNull()
--   sveltekit-frontend/src/lib/server/db/schema/citations.ts:5,29
--     userId: text('user_id') → integer('user_id').references(() => users.id)