-- APPLIED 2026-11-07 after explicit operator approval ("yes apply the table").
-- Pre-image: public.atlas_concept_tie_v2 did not exist (checked immediately before apply).
-- Scope: non-canonical staging table for concept-tie v2 lanes. canonical_authority is fixed false.
-- Writes nothing to atlas_ontology_concepts, atlas_domain_ontology, or any canonical packet table.
-- Rehearsal of this exact DDL passed earlier inside a transaction that rolled back (see 20261107_atlas_concept_tie_v2_DRAFT.sql).

BEGIN;

CREATE TABLE IF NOT EXISTS public.atlas_concept_tie_v2 (
  id                  bigserial PRIMARY KEY,
  task_id             text         NOT NULL,
  change_id           text         NOT NULL,
  rank                integer,
  concept_id          text,
  tie_lane            text         NOT NULL
                      CHECK (tie_lane IN ('EXACT_CANONICAL','EXACT_ALIAS','GENERIC_ALIAS_EXCLUDED','UNKNOWN')),
  score               numeric(6,4) NOT NULL DEFAULT 0,
  matched_term        text,
  unknown_reason      jsonb,
  proposal            jsonb,
  canonical_authority boolean      NOT NULL DEFAULT false CHECK (canonical_authority = false),
  catalog_status      text         NOT NULL DEFAULT 'DRY_SEED_NOT_CANONICAL',
  generated_at        timestamptz  NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (task_id, concept_id, tie_lane)
);

CREATE INDEX IF NOT EXISTS atlas_concept_tie_v2_concept_idx  ON public.atlas_concept_tie_v2 (concept_id);
CREATE INDEX IF NOT EXISTS atlas_concept_tie_v2_lane_idx     ON public.atlas_concept_tie_v2 (tie_lane);
CREATE INDEX IF NOT EXISTS atlas_concept_tie_v2_change_idx   ON public.atlas_concept_tie_v2 (change_id);
CREATE INDEX IF NOT EXISTS atlas_concept_tie_v2_unknown_gin  ON public.atlas_concept_tie_v2 USING gin (unknown_reason jsonb_path_ops);
CREATE INDEX IF NOT EXISTS atlas_concept_tie_v2_proposal_gin ON public.atlas_concept_tie_v2 USING gin (proposal jsonb_path_ops);

COMMIT;
