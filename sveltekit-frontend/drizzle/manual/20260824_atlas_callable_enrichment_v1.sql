-- Parent Atlas callable enrichment v1
-- Additive only. This extends the rebuildable callable projection; it does not
-- mint canonical identities or delete existing rows.

ALTER TABLE IF EXISTS atlas_callable_search
  ADD COLUMN IF NOT EXISTS parent_qualified_name TEXT,
  ADD COLUMN IF NOT EXISTS domain_id TEXT,
  ADD COLUMN IF NOT EXISTS domain_confidence REAL,
  ADD COLUMN IF NOT EXISTS secondary_domains TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS taxonomy_revision TEXT,
  ADD COLUMN IF NOT EXISTS inferred_uses TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS enrichment_metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS atlas_callable_search_enrichment_metadata_gin
  ON atlas_callable_search USING GIN(enrichment_metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS atlas_callable_search_domain_idx
  ON atlas_callable_search(domain_id, domain_confidence);
CREATE INDEX IF NOT EXISTS atlas_callable_search_inferred_uses_gin
  ON atlas_callable_search USING GIN(inferred_uses);
