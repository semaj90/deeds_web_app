-- S01-08H-DDL-FREEZE: frozen, exact, literal DDL for the stable-file identity schema (G1).
-- Additive only. 4 new tables. 0 rows populated. 0 existing tables altered. Not applied by this file's existence.
-- Consumes (never reproduces) the existing admitted source authority: atlas_workspace_source_bindings.

CREATE TABLE atlas_repository_identity (
  repository_id uuid PRIMARY KEY,
  source_authority_repo_id text NOT NULL,
  repository_name text NOT NULL,
  repository_path text NOT NULL,
  repository_kind text NOT NULL CHECK (repository_kind IN ('ROOT', 'NESTED_GIT_REPOSITORY')),
  gitmodule_name text,
  origin_url text,
  parent_repository_id uuid REFERENCES atlas_repository_identity(repository_id),
  known_commit_oids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_authority_repo_id),
  UNIQUE (repository_id, source_authority_repo_id)
);
CREATE INDEX idx_atlas_repository_identity_path ON atlas_repository_identity (repository_path);

CREATE TABLE atlas_stable_file_identity (
  stable_file_id uuid PRIMARY KEY,
  repository_id uuid NOT NULL REFERENCES atlas_repository_identity(repository_id),
  lifecycle_state text NOT NULL DEFAULT 'ACTIVE' CHECK (lifecycle_state IN ('ACTIVE', 'TOMBSTONED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  tombstoned_at timestamptz
);
CREATE INDEX idx_atlas_stable_file_identity_repo_state ON atlas_stable_file_identity (repository_id, lifecycle_state);

CREATE TABLE atlas_stable_file_revision_binding (
  stable_file_id uuid NOT NULL REFERENCES atlas_stable_file_identity(stable_file_id),
  repository_id uuid NOT NULL,
  source_authority_repo_id text NOT NULL,
  canonical_source_ref text NOT NULL,
  workspace_revision text NOT NULL CHECK (workspace_revision ~ '^sha256:[0-9a-f]{64}$'),
  source_revision text NOT NULL CHECK (source_revision ~ '^sha256:[0-9a-f]{64}$'),
  content_digest text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  byte_length bigint NOT NULL CHECK (byte_length >= 0),
  source_identity_key text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  provenance text NOT NULL,
  CHECK (source_revision = 'sha256:' || content_digest),
  FOREIGN KEY (repository_id, source_authority_repo_id)
    REFERENCES atlas_repository_identity (repository_id, source_authority_repo_id),
  FOREIGN KEY (source_authority_repo_id, canonical_source_ref, source_revision, workspace_revision)
    REFERENCES atlas_workspace_source_bindings (repo_id, canonical_source_ref, source_revision, workspace_revision),
  UNIQUE (stable_file_id, workspace_revision)
);
CREATE INDEX idx_atlas_stable_file_revision_binding_scoped_path
  ON atlas_stable_file_revision_binding (repository_id, canonical_source_ref, workspace_revision);
CREATE INDEX idx_atlas_stable_file_revision_binding_identity_key
  ON atlas_stable_file_revision_binding (source_identity_key);

CREATE TABLE atlas_stable_file_alias (
  stable_file_id uuid NOT NULL REFERENCES atlas_stable_file_identity(stable_file_id),
  repository_id uuid NOT NULL REFERENCES atlas_repository_identity(repository_id),
  alias_path text NOT NULL,
  introduced_in_workspace_revision text NOT NULL CHECK (introduced_in_workspace_revision ~ '^sha256:[0-9a-f]{64}$'),
  superseded_in_workspace_revision text CHECK (superseded_in_workspace_revision IS NULL OR superseded_in_workspace_revision ~ '^sha256:[0-9a-f]{64}$'),
  evidence jsonb NOT NULL DEFAULT '{}',
  UNIQUE (stable_file_id, alias_path, introduced_in_workspace_revision)
);
CREATE INDEX idx_atlas_stable_file_alias_path ON atlas_stable_file_alias (alias_path);
