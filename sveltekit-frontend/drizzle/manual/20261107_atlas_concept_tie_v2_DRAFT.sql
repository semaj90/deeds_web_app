-- DRAFT — NOT APPLIED. Test in a transaction that ends in ROLLBACK; COMMIT only after explicit approval.
-- Pre-image: public.atlas_concept_tie_v2 does not exist (checked 2026-11-07).
-- Scope: a non-canonical staging table for concept-tie v2 lanes. canonical_authority is fixed false.
-- Nothing writes to atlas_ontology_concepts, atlas_domain_ontology, or any canonical packet table.

BEGIN;

CREATE TABLE IF NOT EXISTS public.atlas_concept_tie_v2 (
  id                 bigserial PRIMARY KEY,
  task_id            text        NOT NULL,                -- file#Lline locator (task identity)
  change_id          text        NOT NULL,
  rank               integer,
  concept_id         text,                                -- NULL for UNKNOWN / GENERIC_ALIAS_EXCLUDED
  tie_lane           text        NOT NULL
                     CHECK (tie_lane IN ('EXACT_CANONICAL','EXACT_ALIAS','COARSE_DOMAIN_LEXICAL','GENERIC_ALIAS_EXCLUDED','UNKNOWN')),
  score              numeric(6,4) NOT NULL DEFAULT 0,
  matched_term       text,
  unknown_reason     jsonb,                               -- structured reason for UNKNOWN / excluded rows
  proposal           jsonb,                               -- classifier proposals only; never canonical
  canonical_authority boolean    NOT NULL DEFAULT false CHECK (canonical_authority = false),
  catalog_status     text        NOT NULL DEFAULT 'DRY_SEED_NOT_CANONICAL',
  generated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (task_id, concept_id, tie_lane)
);

CREATE INDEX IF NOT EXISTS atlas_concept_tie_v2_concept_idx ON public.atlas_concept_tie_v2 (concept_id);
CREATE INDEX IF NOT EXISTS atlas_concept_tie_v2_lane_idx    ON public.atlas_concept_tie_v2 (tie_lane);
CREATE INDEX IF NOT EXISTS atlas_concept_tie_v2_change_idx  ON public.atlas_concept_tie_v2 (change_id);
CREATE INDEX IF NOT EXISTS atlas_concept_tie_v2_unknown_gin ON public.atlas_concept_tie_v2 USING gin (unknown_reason jsonb_path_ops);
CREATE INDEX IF NOT EXISTS atlas_concept_tie_v2_proposal_gin ON public.atlas_concept_tie_v2 USING gin (proposal jsonb_path_ops);

-- Post-check (read in the same transaction)
SELECT to_regclass('public.atlas_concept_tie_v2') AS created,
       (SELECT count(*) FROM public.atlas_concept_tie_v2) AS rows_after;

-- Dry run: discard everything. Replace with COMMIT only after explicit approval.
ROLLBACK;
