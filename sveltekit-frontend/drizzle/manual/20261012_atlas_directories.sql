-- atlas_directories: directory tree nodes for per-directory LUT / contextual retrieval.
-- Sidecar migration (not in drizzle/meta/_journal.json). Additive only; IF NOT EXISTS.
-- Mirrors src/lib/server/db/schema/atlas-ast-nodes.ts (atlasDirectories).

BEGIN;

CREATE TABLE IF NOT EXISTS atlas_directories (
  id                     text PRIMARY KEY,
  repo_id                text NOT NULL DEFAULT 'deeds-web-app',
  directory_path         text NOT NULL,
  parent_directory_path  text,
  depth                  integer NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS atlas_directories_repo_path_uq
  ON atlas_directories (repo_id, directory_path);

CREATE INDEX IF NOT EXISTS atlas_directories_parent_idx
  ON atlas_directories (repo_id, parent_directory_path);

COMMIT;
