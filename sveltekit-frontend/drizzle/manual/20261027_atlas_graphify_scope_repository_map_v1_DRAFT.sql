-- Supplemental DRAFT ONLY; apply only after the base packet identity registry draft.
-- No scope mappings are seeded. This file does not authorize production DDL or data writes.

CREATE TABLE IF NOT EXISTS public.atlas_graphify_scope_repository_map_v1 (
  membership_repository_scope TEXT PRIMARY KEY
    CHECK (membership_repository_scope <> '' AND membership_repository_scope = btrim(membership_repository_scope)
      AND membership_repository_scope !~ '[[:cntrl:]]'),
  repository_id UUID NOT NULL REFERENCES public.atlas_repository_identity(repository_id) ON DELETE RESTRICT,
  source_authority_repo_id TEXT NOT NULL CHECK (source_authority_repo_id <> '' AND source_authority_repo_id = btrim(source_authority_repo_id)),
  mapping_kind TEXT NOT NULL CHECK (mapping_kind IN ('ROOT_SCOPE', 'NESTED_REPOSITORY', 'LOGICAL_SUBSCOPE')),
  evidence_ref TEXT NOT NULL CHECK (evidence_ref <> '' AND evidence_ref = btrim(evidence_ref)),
  evidence_digest TEXT NOT NULL CHECK (evidence_digest ~ '^sha256:[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT atlas_graphify_scope_repository_map_v1_root_scope_kind_check
    CHECK ((membership_repository_scope = 'repo:root') = (mapping_kind = 'ROOT_SCOPE')),
  CONSTRAINT atlas_graphify_scope_repository_map_v1_scope_repository_key
    UNIQUE (membership_repository_scope, repository_id)
);

CREATE OR REPLACE FUNCTION public.atlas_graphify_scope_repository_map_v1_guard_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actual_kind TEXT; actual_parent UUID; actual_source_authority_repo_id TEXT;
BEGIN
  SELECT repository_kind, parent_repository_id, source_authority_repo_id
    INTO actual_kind, actual_parent, actual_source_authority_repo_id
    FROM public.atlas_repository_identity WHERE repository_id = NEW.repository_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCOPE_MAPPING_REPOSITORY_IDENTITY_MISSING' USING ERRCODE = '23503';
  END IF;
  IF NEW.source_authority_repo_id <> actual_source_authority_repo_id THEN
    RAISE EXCEPTION 'SCOPE_MAPPING_SOURCE_AUTHORITY_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF NEW.mapping_kind = 'ROOT_SCOPE' AND (actual_kind <> 'ROOT' OR actual_parent IS NOT NULL) THEN
    RAISE EXCEPTION 'ROOT_SCOPE_REQUIRES_PERSISTED_ROOT_IDENTITY' USING ERRCODE = '23514';
  ELSIF NEW.mapping_kind = 'NESTED_REPOSITORY' AND (actual_kind <> 'NESTED_GIT_REPOSITORY' OR actual_parent IS NULL) THEN
    RAISE EXCEPTION 'NESTED_SCOPE_REQUIRES_PERSISTED_NESTED_REPOSITORY' USING ERRCODE = '23514';
  ELSIF NEW.mapping_kind = 'LOGICAL_SUBSCOPE' AND (actual_kind <> 'ROOT' OR actual_parent IS NOT NULL OR NEW.membership_repository_scope = 'repo:root') THEN
    RAISE EXCEPTION 'LOGICAL_SUBSCOPE_REQUIRES_EXPLICIT_ROOT_OWNERSHIP' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_atlas_graphify_scope_repository_map_v1_guard
  BEFORE INSERT OR UPDATE ON public.atlas_graphify_scope_repository_map_v1
  FOR EACH ROW EXECUTE FUNCTION public.atlas_graphify_scope_repository_map_v1_guard_fn();

ALTER TABLE public.atlas_packet_identity_registry_v1
  ADD CONSTRAINT atlas_packet_identity_registry_v1_scope_repository_fk
  FOREIGN KEY (membership_repository_scope, repository_id)
  REFERENCES public.atlas_graphify_scope_repository_map_v1(membership_repository_scope, repository_id)
  ON DELETE RESTRICT;
