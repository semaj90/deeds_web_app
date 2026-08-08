-- Parent Atlas persisted context manifests.
-- Canonical run/evidence state stays in Postgres; Bitfrost/KV remain derived/ephemeral.

CREATE TABLE IF NOT EXISTS atlas_context_manifests (
  manifest_id text PRIMARY KEY,
  request_id text NOT NULL,
  feature_id text,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,

  retrieved_candidates integer NOT NULL CHECK (retrieved_candidates >= 0),
  warmed_candidates integer NOT NULL CHECK (warmed_candidates >= 0),
  cache_hits integer NOT NULL CHECK (cache_hits >= 0),

  selected_packet_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejected_packet_keys jsonb NOT NULL DEFAULT '[]'::jsonb,

  token_budget integer NOT NULL CHECK (token_budget > 0),
  reserved_tokens integer NOT NULL DEFAULT 0 CHECK (reserved_tokens >= 0),
  usable_token_budget integer NOT NULL CHECK (usable_token_budget >= 0),
  selected_tokens integer NOT NULL CHECK (selected_tokens >= 0),
  rejected_tokens integer NOT NULL CHECK (rejected_tokens >= 0),

  selection_policy_version text NOT NULL,
  spec_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  lane_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  selected_lane_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  warming_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_context_manifests_request_idx
  ON atlas_context_manifests (request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS atlas_context_manifests_feature_idx
  ON atlas_context_manifests (feature_id, created_at DESC)
  WHERE feature_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS atlas_context_manifests_policy_idx
  ON atlas_context_manifests (selection_policy_version, created_at DESC);
