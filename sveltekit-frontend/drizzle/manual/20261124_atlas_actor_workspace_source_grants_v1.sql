-- Parent Atlas explicit user/workspace/repository/source grants v1.
-- Proposal only: do not apply until an admin-only issuer/revoker is deployed
-- and the schema has been rehearsed and independently read back.

CREATE TABLE IF NOT EXISTS public.atlas_actor_workspace_source_grants_v1 (
  grant_id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id              text        NOT NULL,
  actor_type            text        NOT NULL DEFAULT 'USER' CHECK (actor_type = 'USER'),
  tenant_id             text,
  workspace_id          uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  workspace_revision    text        NOT NULL CHECK (workspace_revision ~ '^sha256:[a-f0-9]{64}$'),
  repository_id         text        NOT NULL,
  permitted_source_refs text[]      NOT NULL CHECK (cardinality(permitted_source_refs) > 0),
  grant_revision        text        NOT NULL UNIQUE CHECK (grant_revision ~ '^sha256:[a-f0-9]{64}$'),
  status                text        NOT NULL DEFAULT 'GRANTED' CHECK (status IN ('GRANTED', 'DENIED')),
  issued_by             text        NOT NULL,
  issued_at             timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz,
  revoked_at            timestamptz,
  revoked_by            text,
  revocation_reason     text,
  CHECK ((revoked_at IS NULL AND revoked_by IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL)),
  CHECK (expires_at IS NULL OR expires_at > issued_at)
);

-- One live grant row per principal/repository/workspace snapshot. Re-issuance
-- after revocation creates a new immutable grant_revision.
CREATE UNIQUE INDEX IF NOT EXISTS atlas_actor_workspace_source_grants_v1_live_scope_uq
  ON public.atlas_actor_workspace_source_grants_v1
    (actor_id, workspace_id, repository_id, workspace_revision)
  WHERE status = 'GRANTED' AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS atlas_actor_workspace_source_grants_v1_lookup_idx
  ON public.atlas_actor_workspace_source_grants_v1
    (actor_id, workspace_id, repository_id, issued_at DESC, grant_id DESC);

CREATE INDEX IF NOT EXISTS atlas_actor_workspace_source_grants_v1_revision_idx
  ON public.atlas_actor_workspace_source_grants_v1
    (workspace_id, workspace_revision, status);

CREATE OR REPLACE FUNCTION public.atlas_guard_actor_workspace_source_grant_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'GRANTED' OR NEW.status <> 'DENIED'
     OR NEW.revoked_at IS NULL OR NEW.revoked_by IS NULL
     OR ROW(NEW.actor_id, NEW.actor_type, NEW.tenant_id, NEW.workspace_id,
            NEW.workspace_revision, NEW.repository_id, NEW.permitted_source_refs,
            NEW.grant_revision, NEW.issued_by, NEW.issued_at, NEW.expires_at)
        IS DISTINCT FROM
        ROW(OLD.actor_id, OLD.actor_type, OLD.tenant_id, OLD.workspace_id,
            OLD.workspace_revision, OLD.repository_id, OLD.permitted_source_refs,
            OLD.grant_revision, OLD.issued_by, OLD.issued_at, OLD.expires_at)
  THEN
    RAISE EXCEPTION 'ATLAS_GRANT_IMMUTABLE_FIELDS_OR_INVALID_REVOCATION';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER atlas_actor_workspace_source_grants_v1_immutable
  BEFORE UPDATE ON public.atlas_actor_workspace_source_grants_v1
  FOR EACH ROW EXECUTE FUNCTION public.atlas_guard_actor_workspace_source_grant_v1();

COMMENT ON TABLE public.atlas_actor_workspace_source_grants_v1 IS
  'Explicit, revision-bound user access grants for Parent Atlas source retrieval. Grant rows require an admin-authorized issuer; this table is not an access-control writer by itself.';
