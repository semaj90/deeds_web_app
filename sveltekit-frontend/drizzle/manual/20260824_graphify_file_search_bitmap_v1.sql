-- Rebuildable PostgreSQL 18 search projection for Graphify file packets.
-- Manual sidecar: do not apply until the read-only export and schema audit pass.
-- PostgreSQL bitmap heap scans are planner behavior; this table stores the
-- explicit candidate bitmap and the GIN/array inputs used by the planner.

CREATE TABLE IF NOT EXISTS atlas_file_search_index_v1 (
  candidate_ordinal bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  packet_key text NOT NULL UNIQUE,
  source_ref text NOT NULL,
  source_ref_hash char(64) NOT NULL,
  file_url text,
  feature_id text,
  feature_label text,
  title_id text,
  tree_node_id uuid,
  source_revision text,
  workspace_revision bigint,
  representation_revision text,
  content_hash text,
  embedding_digest text,
  embedding_dimension integer,
  embedding vector(768),
  domain_class text,
  primary_domain text,
  concept_ids text[] NOT NULL DEFAULT '{}',
  domain_memberships text[] NOT NULL DEFAULT '{}',
  ontology jsonb NOT NULL DEFAULT '{}'::jsonb,
  packet_ontology jsonb NOT NULL DEFAULT '{}'::jsonb,
  tokens text[] NOT NULL DEFAULT '{}',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  routing jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  feature_bitmap bit(16) NOT NULL DEFAULT B'0000000000000000',
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(source_ref, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(feature_label, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(feature_id, '')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(tokens, ' ')), 'B')
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_file_search_index_v1_search_gin ON atlas_file_search_index_v1 USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS atlas_file_search_index_v1_concepts_gin ON atlas_file_search_index_v1 USING GIN (concept_ids);
CREATE INDEX IF NOT EXISTS atlas_file_search_index_v1_domains_gin ON atlas_file_search_index_v1 USING GIN (domain_memberships);
CREATE INDEX IF NOT EXISTS atlas_file_search_index_v1_payload_gin ON atlas_file_search_index_v1 USING GIN (payload jsonb_path_ops);
CREATE INDEX IF NOT EXISTS atlas_file_search_index_v1_metadata_gin ON atlas_file_search_index_v1 USING GIN (metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS atlas_file_search_index_v1_ordinal_btree ON atlas_file_search_index_v1 (candidate_ordinal);
CREATE INDEX IF NOT EXISTS atlas_file_search_index_v1_embedding_hnsw ON atlas_file_search_index_v1 USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64) WHERE embedding IS NOT NULL;

CREATE TABLE IF NOT EXISTS atlas_file_search_concept_links_v1 (
  candidate_ordinal bigint NOT NULL REFERENCES atlas_file_search_index_v1(candidate_ordinal) ON DELETE CASCADE,
  subject_ref text NOT NULL,
  predicate text NOT NULL,
  object_ref text NOT NULL,
  evidence_refs text[] NOT NULL DEFAULT '{}',
  source_revision text,
  PRIMARY KEY (candidate_ordinal, subject_ref, predicate, object_ref)
);
CREATE INDEX IF NOT EXISTS atlas_file_search_concept_links_v1_evidence_gin ON atlas_file_search_concept_links_v1 USING GIN (evidence_refs);
CREATE INDEX IF NOT EXISTS atlas_file_search_concept_links_v1_tuple_btree ON atlas_file_search_concept_links_v1 (subject_ref, predicate, object_ref);
