-- Typed, explicit mapping from Graphify membership scope strings ('repo:root', 'repo:<submodule path>')
-- to canonical repository identities. DRAFT ONLY: do not apply without schema-owner review and explicit
-- operator approval. No rows are seeded by this file.
--
-- Why: graphify_execution_file_membership_v2.repository_id is TEXT ('repo:*'); atlas_repository_identity.repository_id
-- is a UUID. Nothing relates them, and a scope string must never be cast or inferred from paths.
-- Authority for a mapping: ROOT_REPOSITORY (the single ROOT row) or GITMODULES_PATH (a .gitmodules `path` equal to
-- the scope suffix, backed by an atlas_repository_identity row for that submodule). Seeding the six submodule
-- identity rows is a separate, separately approved write.

CREATE TABLE IF NOT EXISTS public.atlas_graphify_scope_repository_map_v1 (
  scope_key TEXT PRIMARY KEY
    CHECK (scope_key ~ '^repo:[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$' AND substr(scope_key, 6) !~ '(^|/)\.\.?(/|$)'),
  repository_id UUID NOT NULL UNIQUE
    REFERENCES public.atlas_repository_identity(repository_id) ON DELETE RESTRICT,
  mapping_basis TEXT NOT NULL CHECK (mapping_basis IN ('ROOT_REPOSITORY', 'GITMODULES_PATH')),
  evidence_ref TEXT NOT NULL CHECK (evidence_ref <> '' AND evidence_ref = btrim(evidence_ref)),
  evidence_digest TEXT NOT NULL CHECK (evidence_digest ~ '^sha256:[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT atlas_graphify_scope_repository_map_v1_root_basis_check
    CHECK ((scope_key = 'repo:root') = (mapping_basis = 'ROOT_REPOSITORY'))
);

COMMENT ON TABLE public.atlas_graphify_scope_repository_map_v1 IS
  'Explicit Graphify membership scope to repository identity map. Never inferred from source_ref similarity or UUID casting.';
