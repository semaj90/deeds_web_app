-- Canonical logical packet identity, separate from physical atlas_packets storage keys.
-- DRAFT ONLY: do not apply without schema-owner review and explicit operator approval.
-- No identities or aliases are seeded by this migration.

CREATE TABLE IF NOT EXISTS public.atlas_packet_identity_registry_v1 (
  packet_key TEXT PRIMARY KEY
    CHECK (packet_key ~ '^packet:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  repository_id UUID NOT NULL REFERENCES public.atlas_repository_identity(repository_id) ON DELETE RESTRICT,
  membership_repository_scope TEXT NOT NULL
    CHECK (membership_repository_scope ~ '^repo:[^[:cntrl:]]+$'),
  source_ref TEXT NOT NULL
    CHECK (source_ref <> '' AND source_ref = btrim(source_ref)
      AND source_ref !~ E'(^/|\\\\|(^|/)\\.\\.?(/|$)|//)'),
  packet_kind TEXT NOT NULL CHECK (packet_kind = 'SOURCE_FILE'),
  key_recipe_revision TEXT NOT NULL DEFAULT 'PacketKeyV2@1'
    CHECK (key_recipe_revision = 'PacketKeyV2@1'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT atlas_packet_identity_registry_v1_repository_source_kind_key
    UNIQUE (repository_id, source_ref, packet_kind),
  CONSTRAINT atlas_packet_identity_registry_v1_scope_source_kind_key
    UNIQUE (membership_repository_scope, source_ref, packet_kind)
);

CREATE INDEX IF NOT EXISTS idx_atlas_packet_identity_registry_v1_source_ref
  ON public.atlas_packet_identity_registry_v1 (source_ref);

CREATE TABLE IF NOT EXISTS public.atlas_packet_identity_aliases_v1 (
  alias_key TEXT PRIMARY KEY,
  canonical_packet_key TEXT NOT NULL
    REFERENCES public.atlas_packet_identity_registry_v1(packet_key) ON DELETE RESTRICT,
  storage_packet_key TEXT NOT NULL
    REFERENCES public.atlas_packets(packet_key) ON DELETE RESTRICT,
  alias_kind TEXT NOT NULL CHECK (alias_kind = 'PACKET_KEY_V1_STORAGE_TO_V2'),
  evidence_ref TEXT NOT NULL CHECK (evidence_ref <> '' AND evidence_ref = btrim(evidence_ref)),
  evidence_digest TEXT NOT NULL CHECK (evidence_digest ~ '^sha256:[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT atlas_packet_identity_aliases_v1_no_self_check CHECK (alias_key <> canonical_packet_key)
);

CREATE INDEX IF NOT EXISTS idx_atlas_packet_identity_aliases_v1_canonical
  ON public.atlas_packet_identity_aliases_v1 (canonical_packet_key);
