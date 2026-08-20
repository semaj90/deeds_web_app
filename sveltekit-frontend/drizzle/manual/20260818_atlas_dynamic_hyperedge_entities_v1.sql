-- Query-time dynamic hyperedge support for Parent Atlas.
-- Canonical relationship truth remains atlas_relationships + atlas_relationship_members.
-- These rows index evidence events by entities so SQL can form query-scoped N-ary neighborhoods.

CREATE TABLE IF NOT EXISTS atlas_evidence_entities (
  evidence_id text NOT NULL REFERENCES atlas_evidence(evidence_id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9_.-]*$'),
  entity_id text NOT NULL,
  role text NOT NULL DEFAULT 'mentions',
  source_ref text,
  source_revision text,
  extraction_revision text NOT NULL,
  confidence real NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (evidence_id, entity_type, entity_id, role)
);

CREATE INDEX IF NOT EXISTS atlas_evidence_entities_entity_idx
  ON atlas_evidence_entities(entity_type, entity_id, evidence_id);
CREATE INDEX IF NOT EXISTS atlas_evidence_entities_evidence_idx
  ON atlas_evidence_entities(evidence_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS atlas_evidence_entities_source_revision_idx
  ON atlas_evidence_entities(source_ref, source_revision);
CREATE INDEX IF NOT EXISTS atlas_evidence_entities_metadata_gin_idx
  ON atlas_evidence_entities USING gin(metadata jsonb_path_ops);

-- View each evidence event as a latent hyperedge with its indexed entities.
CREATE OR REPLACE VIEW atlas_evidence_event_hyperedges AS
SELECT
  e.evidence_id,
  e.evidence_kind,
  e.source_ref,
  e.source_revision,
  e.evidence_revision,
  e.producer_revision,
  e.confidence AS evidence_confidence,
  jsonb_agg(
    jsonb_build_object(
      'entity_type', ee.entity_type,
      'entity_id', ee.entity_id,
      'role', ee.role,
      'confidence', ee.confidence
    )
    ORDER BY ee.entity_type, ee.entity_id, ee.role
  ) AS participants,
  array_agg(DISTINCT ee.entity_id ORDER BY ee.entity_id) AS entity_ids
FROM atlas_evidence e
JOIN atlas_evidence_entities ee USING (evidence_id)
GROUP BY
  e.evidence_id,
  e.evidence_kind,
  e.source_ref,
  e.source_revision,
  e.evidence_revision,
  e.producer_revision,
  e.confidence;

-- Query-time neighborhood helper. It never writes atlas_relationships.
-- It returns evidence events that either contain a seed entity or share an entity
-- with an event containing a seed entity, bounded by p_limit.
CREATE OR REPLACE FUNCTION atlas_dynamic_hyperedge_neighborhood(
  p_seed_entity_ids text[],
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  evidence_id text,
  evidence_kind text,
  source_ref text,
  source_revision text,
  evidence_revision text,
  participants jsonb,
  shared_entity_ids text[],
  hop integer,
  confidence real
)
LANGUAGE sql
STABLE
AS $$
  WITH seed_events AS (
    SELECT DISTINCT ee.evidence_id
    FROM atlas_evidence_entities ee
    WHERE ee.entity_id = ANY(p_seed_entity_ids)
  ),
  seed_entities AS (
    SELECT DISTINCT ee.entity_id
    FROM atlas_evidence_entities ee
    JOIN seed_events se USING (evidence_id)
  ),
  candidates AS (
    SELECT
      h.evidence_id,
      h.evidence_kind,
      h.source_ref,
      h.source_revision,
      h.evidence_revision,
      h.participants,
      ARRAY(
        SELECT entity_id
        FROM unnest(h.entity_ids) entity_id
        WHERE entity_id = ANY(p_seed_entity_ids)
        ORDER BY entity_id
      ) AS direct_shared,
      ARRAY(
        SELECT entity_id
        FROM unnest(h.entity_ids) entity_id
        WHERE entity_id IN (SELECT seed_entities.entity_id FROM seed_entities)
        ORDER BY entity_id
      ) AS neighborhood_shared,
      h.evidence_confidence
    FROM atlas_evidence_event_hyperedges h
    WHERE h.evidence_id IN (SELECT evidence_id FROM seed_events)
       OR EXISTS (
         SELECT 1
         FROM unnest(h.entity_ids) entity_id
         WHERE entity_id IN (SELECT seed_entities.entity_id FROM seed_entities)
       )
  )
  SELECT
    c.evidence_id,
    c.evidence_kind,
    c.source_ref,
    c.source_revision,
    c.evidence_revision,
    c.participants,
    CASE WHEN cardinality(c.direct_shared) > 0 THEN c.direct_shared ELSE c.neighborhood_shared END,
    CASE WHEN cardinality(c.direct_shared) > 0 THEN 0 ELSE 1 END,
    c.evidence_confidence
  FROM candidates c
  ORDER BY
    CASE WHEN cardinality(c.direct_shared) > 0 THEN 0 ELSE 1 END,
    cardinality(CASE WHEN cardinality(c.direct_shared) > 0 THEN c.direct_shared ELSE c.neighborhood_shared END) DESC,
    c.evidence_confidence DESC,
    c.evidence_id
  LIMIT GREATEST(1, LEAST(p_limit, 500));
$$;
