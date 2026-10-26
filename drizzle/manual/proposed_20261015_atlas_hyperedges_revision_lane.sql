-- DO NOT APPLY WITHOUT OPERATOR REVIEW (AGENTS.md Drizzle governance).
-- Status: PROPOSED. Dry-run only. Not in drizzle/meta/_journal.json; not in drizzle/sidecar-migrations.json.
--
-- Adds provenance and lane columns to the existing incidence owner atlas_hyperedges.
-- No new hyperedge table. source_revision is lineage/provenance metadata; it is not part of the
-- hyperedge_id primary key. Existing 62,802 rows carry git:<sha> labels and are classified
-- historical_taxonomy_bridge, which the sha256 check exempts.
--
-- Lane values: historical_taxonomy_bridge | code_structural_ast | semantic_concept.
-- The bridge writes code_structural_ast and records the tool in properties->>'extractor'
-- (for example 'svelte_compiler_ast').
--
-- Dry-run is the default: this file ends in ROLLBACK. Change it to COMMIT only after sign-off.

BEGIN;

ALTER TABLE public.atlas_hyperedges
    ADD COLUMN IF NOT EXISTS confidence_lane text NOT NULL DEFAULT 'historical_taxonomy_bridge',
    ADD COLUMN IF NOT EXISTS canonical_authority boolean NOT NULL DEFAULT false;

ALTER TABLE public.atlas_hyperedges DROP CONSTRAINT IF EXISTS chk_atlas_hyperedges_canonical_false;
ALTER TABLE public.atlas_hyperedges ADD CONSTRAINT chk_atlas_hyperedges_canonical_false
    CHECK (canonical_authority = false);

ALTER TABLE public.atlas_hyperedges DROP CONSTRAINT IF EXISTS chk_atlas_hyperedges_lane_known;
ALTER TABLE public.atlas_hyperedges ADD CONSTRAINT chk_atlas_hyperedges_lane_known
    CHECK (confidence_lane IN ('historical_taxonomy_bridge', 'code_structural_ast', 'semantic_concept'));

-- sha256 gate applies to non-historical lanes only.
ALTER TABLE public.atlas_hyperedges DROP CONSTRAINT IF EXISTS chk_atlas_hyperedges_rev_format;
ALTER TABLE public.atlas_hyperedges ADD CONSTRAINT chk_atlas_hyperedges_rev_format
    CHECK (confidence_lane = 'historical_taxonomy_bridge' OR source_revision ~ '^sha256:[0-9a-f]{64}$');

CREATE INDEX IF NOT EXISTS idx_atlas_hyperedges_lane ON public.atlas_hyperedges (confidence_lane);

ROLLBACK;
