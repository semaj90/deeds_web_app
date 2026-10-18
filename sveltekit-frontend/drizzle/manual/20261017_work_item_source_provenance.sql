-- DRAFT (not applied). Additive, nullable, no backfill, no defaults. Lets error_logs and kanban_tasks carry the same
-- source identity the chunk/packet tables already have, so recommendations, the kanban board, daily graphify and
-- agentic error fixing can join work items to source without parsing messages.
--   workspace_id    -> atlas_packets.workspace_id (varchar)
--   source_url      -> external docs: atlas_external_doc_pages.url / library_documents.official_url (firecrawl / BeautifulSoup fetches)
--   source_revision -> sha256:<64 hex> of exact source bytes; stays NULL until the source_revision deferral (after P20) lifts
-- file_path / source_ref already exist on error_logs; kanban_tasks keeps source_refs (jsonb).
-- Rollback: the DROP COLUMN block at the bottom (safe: columns are new and empty).
ALTER TABLE error_logs   ADD COLUMN IF NOT EXISTS workspace_id    varchar;
ALTER TABLE error_logs   ADD COLUMN IF NOT EXISTS source_url      text;
ALTER TABLE error_logs   ADD COLUMN IF NOT EXISTS source_revision text;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS workspace_id    varchar;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS source_url      text;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS source_revision text;
CREATE INDEX IF NOT EXISTS idx_error_logs_workspace_id   ON error_logs   (workspace_id)  WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kanban_tasks_workspace_id ON kanban_tasks (workspace_id)  WHERE workspace_id IS NOT NULL;

-- ROLLBACK (run manually if needed):
-- DROP INDEX IF EXISTS idx_error_logs_workspace_id; DROP INDEX IF EXISTS idx_kanban_tasks_workspace_id;
-- ALTER TABLE error_logs   DROP COLUMN IF EXISTS workspace_id, DROP COLUMN IF EXISTS source_url, DROP COLUMN IF EXISTS source_revision;
-- ALTER TABLE kanban_tasks DROP COLUMN IF EXISTS workspace_id, DROP COLUMN IF EXISTS source_url, DROP COLUMN IF EXISTS source_revision;
