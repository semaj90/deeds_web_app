-- Parent Atlas feature intelligence canonical storage (PostgreSQL 18 + pgvector)
-- Canonical authority: PostgreSQL rows. Vector/graph indexes are rebuildable projections.
-- Canonical IDs are TEXT: callers may use semantic stable IDs; uuidv7() is only the
-- generated default when no semantic ID is supplied.
-- This migration is intentionally isolated under drizzle/manual because the repository
-- already uses manual migrations for Atlas sidecar surfaces.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS atlas_fi_features (
  feature_id text PRIMARY KEY DEFAULT (uuidv7()::text),
  feature_key text NOT NULL UNIQUE,
  feature_label text NOT NULL,
  domain text NOT NULL,
  parent_feature_id text REFERENCES atlas_fi_features(feature_id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'superseded')),
  feature_revision text NOT NULL,
  producer_revision text NOT NULL,
  source_revision text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atlas_fi_features_domain_status_idx ON atlas_fi_features(domain, status);
CREATE INDEX IF NOT EXISTS atlas_fi_features_revision_idx ON atlas_fi_features(feature_revision);
CREATE INDEX IF NOT EXISTS atlas_fi_features_metadata_gin_idx ON atlas_fi_features USING gin(metadata jsonb_path_ops);

CREATE TABLE IF NOT EXISTS atlas_feature_aliases (
  feature_id text NOT NULL REFERENCES atlas_fi_features(feature_id) ON DELETE CASCADE,
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  source_ref text,
  source_revision text,
  PRIMARY KEY (feature_id, normalized_alias)
);
CREATE INDEX IF NOT EXISTS atlas_feature_aliases_normalized_idx ON atlas_feature_aliases(normalized_alias);

CREATE TABLE IF NOT EXISTS atlas_evidence (
  evidence_id text PRIMARY KEY DEFAULT (uuidv7()::text),
  evidence_kind text NOT NULL,
  source_ref text NOT NULL,
  source_revision text NOT NULL,
  evidence_revision text NOT NULL,
  producer_revision text NOT NULL,
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  search_text text NOT NULL DEFAULT '',
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atlas_evidence_source_revision_idx ON atlas_evidence(source_ref, source_revision);
CREATE INDEX IF NOT EXISTS atlas_evidence_search_gin_idx ON atlas_evidence USING gin(search_vector);
CREATE INDEX IF NOT EXISTS atlas_evidence_payload_gin_idx ON atlas_evidence USING gin(payload jsonb_path_ops);
CREATE INDEX IF NOT EXISTS atlas_evidence_tags_gin_idx ON atlas_evidence USING gin(tags);

CREATE TABLE IF NOT EXISTS atlas_fi_evidence (
  feature_id text NOT NULL REFERENCES atlas_fi_features(feature_id) ON DELETE CASCADE,
  evidence_id text NOT NULL REFERENCES atlas_evidence(evidence_id) ON DELETE CASCADE,
  relation_type text NOT NULL,
  polarity text NOT NULL DEFAULT 'supports' CHECK (polarity IN ('supports', 'refutes', 'neutral')),
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  relationship_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feature_id, evidence_id, relation_type)
);
CREATE INDEX IF NOT EXISTS atlas_fi_evidence_evidence_idx ON atlas_fi_evidence(evidence_id, feature_id);

CREATE TABLE IF NOT EXISTS atlas_relationships (
  relationship_id text PRIMARY KEY DEFAULT (uuidv7()::text),
  relationship_key text UNIQUE,
  relationship_type text NOT NULL,
  participant_count integer NOT NULL CHECK (participant_count >= 1),
  relationship_degree integer NOT NULL CHECK (relationship_degree >= 1),
  relationship_degree_kind text NOT NULL CHECK (relationship_degree_kind IN ('unary', 'binary', 'ternary', 'nary')),
  source_ref text NOT NULL,
  source_revision text NOT NULL,
  relationship_revision text NOT NULL,
  producer_revision text NOT NULL,
  confidence real NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  canonical_text text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atlas_relationships_type_degree_idx ON atlas_relationships(relationship_type, relationship_degree);
CREATE INDEX IF NOT EXISTS atlas_relationships_revision_idx ON atlas_relationships(relationship_revision);
CREATE INDEX IF NOT EXISTS atlas_relationships_source_revision_idx ON atlas_relationships(source_ref, source_revision);
CREATE INDEX IF NOT EXISTS atlas_relationships_metadata_gin_idx ON atlas_relationships USING gin(metadata jsonb_path_ops);

ALTER TABLE atlas_fi_evidence
  DROP CONSTRAINT IF EXISTS atlas_fi_evidence_relationship_id_fkey;
ALTER TABLE atlas_fi_evidence
  ADD CONSTRAINT atlas_fi_evidence_relationship_id_fkey
  FOREIGN KEY (relationship_id) REFERENCES atlas_relationships(relationship_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS atlas_relationship_members (
  relationship_id text NOT NULL REFERENCES atlas_relationships(relationship_id) ON DELETE CASCADE,
  member_ordinal integer NOT NULL CHECK (member_ordinal >= 0),
  role text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9_.-]*$'),
  entity_id text NOT NULL,
  entity_revision text,
  source_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (relationship_id, member_ordinal),
  UNIQUE (relationship_id, role, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS atlas_relationship_members_entity_idx ON atlas_relationship_members(entity_type, entity_id, relationship_id);
CREATE INDEX IF NOT EXISTS atlas_relationship_members_relationship_entity_idx ON atlas_relationship_members(relationship_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS atlas_relationship_cardinality (
  relationship_id text NOT NULL REFERENCES atlas_relationships(relationship_id) ON DELETE CASCADE,
  role text NOT NULL,
  minimum_count integer NOT NULL CHECK (minimum_count >= 0),
  maximum_count integer CHECK (maximum_count IS NULL OR maximum_count > 0),
  PRIMARY KEY (relationship_id, role),
  CHECK (maximum_count IS NULL OR minimum_count <= maximum_count)
);

CREATE TABLE IF NOT EXISTS atlas_relationship_evidence (
  relationship_id text NOT NULL REFERENCES atlas_relationships(relationship_id) ON DELETE CASCADE,
  evidence_id text NOT NULL REFERENCES atlas_evidence(evidence_id) ON DELETE CASCADE,
  confidence real NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  PRIMARY KEY (relationship_id, evidence_id)
);

-- Semantic projections are separated from canonical relationship headers so model
-- revisions can coexist without rewriting canonical facts.
CREATE TABLE IF NOT EXISTS atlas_relationship_embeddings (
  relationship_id text NOT NULL REFERENCES atlas_relationships(relationship_id) ON DELETE CASCADE,
  relationship_revision text NOT NULL,
  embedding_model_revision text NOT NULL,
  projection_revision text NOT NULL,
  embedding vector(768) NOT NULL,
  source_checksum text NOT NULL,
  view_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (relationship_id, embedding_model_revision, projection_revision)
);

-- Exact scan remains available without an ANN index. HNSW is the online Postgres ANN
-- projection. IVFFlat should be added only for a benchmarked/frozen bulk snapshot.
CREATE INDEX IF NOT EXISTS atlas_relationship_embeddings_hnsw_cosine_idx
  ON atlas_relationship_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS atlas_feature_embeddings (
  feature_id text NOT NULL REFERENCES atlas_fi_features(feature_id) ON DELETE CASCADE,
  feature_revision text NOT NULL,
  embedding_model_revision text NOT NULL,
  projection_revision text NOT NULL,
  embedding vector(768) NOT NULL,
  source_checksum text NOT NULL,
  view_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feature_id, embedding_model_revision, projection_revision)
);
CREATE INDEX IF NOT EXISTS atlas_feature_embeddings_hnsw_cosine_idx
  ON atlas_feature_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS atlas_feature_state_receipts (
  receipt_id text PRIMARY KEY DEFAULT (uuidv7()::text),
  feature_id text NOT NULL REFERENCES atlas_fi_features(feature_id) ON DELETE CASCADE,
  feature_revision text NOT NULL,
  evidence_snapshot_revision text NOT NULL,
  state_revision text NOT NULL,
  input_evidence_hash text NOT NULL,
  evaluator_revision text NOT NULL,
  state text NOT NULL CHECK (state IN ('EVIDENCE_NEEDED', 'MISSING', 'SPECIFIED', 'IMPLEMENTING', 'VERIFY', 'VERIFIED')),
  completion real NOT NULL CHECK (completion >= 0 AND completion <= 100),
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  priority real NOT NULL CHECK (priority >= 0 AND priority <= 100),
  blockers text[] NOT NULL DEFAULT ARRAY[]::text[],
  recommendations text[] NOT NULL DEFAULT ARRAY[]::text[],
  satisfied_evidence text[] NOT NULL DEFAULT ARRAY[]::text[],
  blocking_evidence text[] NOT NULL DEFAULT ARRAY[]::text[],
  priority_signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  emitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atlas_feature_state_receipts_snapshot_idx
  ON atlas_feature_state_receipts(feature_id, evidence_snapshot_revision, emitted_at DESC);

CREATE OR REPLACE VIEW atlas_feature_state_current AS
SELECT DISTINCT ON (feature_id) *
FROM atlas_feature_state_receipts
ORDER BY feature_id, emitted_at DESC, receipt_id DESC;

-- Dynamic query-scoped hyperedges are evidence candidates, not canonical relationships.
-- They may be cached/persisted for replay but must pass canonical promotion before being
-- copied into atlas_relationships + atlas_relationship_members.
CREATE TABLE IF NOT EXISTS atlas_dynamic_hyperedge_candidates (
  dynamic_relationship_id text PRIMARY KEY,
  query_id text NOT NULL,
  relationship_type text NOT NULL,
  participants jsonb NOT NULL,
  join_keys jsonb NOT NULL,
  source_refs text[] NOT NULL,
  source_revisions text[] NOT NULL,
  evidence_refs text[] NOT NULL,
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source_snapshot_revision text NOT NULL,
  promoted_relationship_id text REFERENCES atlas_relationships(relationship_id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atlas_dynamic_hyperedge_query_idx ON atlas_dynamic_hyperedge_candidates(query_id, relationship_type);
CREATE INDEX IF NOT EXISTS atlas_dynamic_hyperedge_participants_gin_idx ON atlas_dynamic_hyperedge_candidates USING gin(participants jsonb_path_ops);

-- Verification helper: relationship header counts must match member rows. A repository
-- transaction should call this before commit; graph/vector projections must consume only
-- relationships that pass this invariant.
CREATE OR REPLACE FUNCTION atlas_validate_relationship(p_relationship_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    r.participant_count = count(m.*)::integer
    AND r.relationship_degree = count(DISTINCT m.entity_type)::integer
    AND r.relationship_degree_kind = CASE count(DISTINCT m.entity_type)::integer
      WHEN 1 THEN 'unary'
      WHEN 2 THEN 'binary'
      WHEN 3 THEN 'ternary'
      ELSE 'nary'
    END
  FROM atlas_relationships r
  LEFT JOIN atlas_relationship_members m USING (relationship_id)
  WHERE r.relationship_id = p_relationship_id
  GROUP BY r.relationship_id;
$$;
