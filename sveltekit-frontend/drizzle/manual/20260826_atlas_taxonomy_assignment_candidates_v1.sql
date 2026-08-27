-- KAG taxonomy-assignment review surface (step 2 of the taxonomy -> hyperedge
-- wiring roadmap). Durable Postgres store for TaxonomyAssignmentCandidateV1
-- (sveltekit-frontend/src/lib/server/atlas/taxonomy/entity-concept-taxonomy-v1.ts).
--
-- Before this table, TaxonomyAssignmentCandidateV1 had a schema and a
-- constructor but nowhere to persist a candidate for review, and no way to
-- transition its `status` from 'proposed'/'review_required' to
-- 'promoted'/'rejected' -- the exact gap that made the KAG-HYP-01-sibling
-- gate in promoteTaxonomyAssignmentV1() (added 2026-08-26) previously
-- unreachable from any live caller.
--
-- promoted_hyperedge_id links a promoted row to the atlas_hyperedges row it
-- produced (contract_hyperedge_id, not the internal uuid PK) -- nullable,
-- and intentionally NOT a foreign key: a candidate can be marked 'promoted'
-- (status committed first) even if the hyperedge write that should follow it
-- fails, and that degraded state must stay visible/queryable rather than be
-- blocked by a constraint. See decideTaxonomyAssignmentCandidateV1() in
-- kag-taxonomy-candidate-postgres.ts.

CREATE TABLE IF NOT EXISTS atlas_taxonomy_assignment_candidates (
  candidate_id            text        PRIMARY KEY,
  entity_id               text        NOT NULL,
  concept_id              text        NOT NULL,
  taxonomy_revision       text        NOT NULL,
  semantic_revision       text        NOT NULL,
  graph_revision          text        NOT NULL,
  semantic_neighbor_refs  text[]      NOT NULL DEFAULT '{}',
  community_refs          text[]      NOT NULL DEFAULT '{}',
  graph_evidence_refs     text[]      NOT NULL DEFAULT '{}',
  lexical_evidence_refs   text[]      NOT NULL DEFAULT '{}',
  nlp_evidence_refs       text[]      NOT NULL DEFAULT '{}',
  evidence_refs           text[]      NOT NULL DEFAULT '{}',
  semantic_score          real,
  community_affinity      real,
  graph_support           real,
  lexical_support         real,
  nlp_support             real,
  status                  text        NOT NULL DEFAULT 'proposed',
  producer_revision       text        NOT NULL,
  reviewed_by             text,
  reviewed_at             timestamptz,
  promoted_hyperedge_id   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atlas_taxonomy_assignment_candidates_status_check
    CHECK (status IN ('proposed', 'review_required', 'promoted', 'rejected')),
  CONSTRAINT atlas_taxonomy_assignment_candidates_evidence_check
    CHECK (array_length(evidence_refs, 1) > 0)
);

CREATE INDEX IF NOT EXISTS idx_atlas_taxonomy_candidates_status
  ON atlas_taxonomy_assignment_candidates (status, created_at);
CREATE INDEX IF NOT EXISTS idx_atlas_taxonomy_candidates_entity
  ON atlas_taxonomy_assignment_candidates (entity_id);
CREATE INDEX IF NOT EXISTS idx_atlas_taxonomy_candidates_concept
  ON atlas_taxonomy_assignment_candidates (concept_id);
CREATE INDEX IF NOT EXISTS idx_atlas_taxonomy_candidates_hyperedge
  ON atlas_taxonomy_assignment_candidates (promoted_hyperedge_id)
  WHERE promoted_hyperedge_id IS NOT NULL;
