-- Revision-qualified successor to 20260824_graphify_file_search_bitmap_v1.sql.
-- Unapplied manual sidecar: requires baseline review and explicit authorization.
-- workspace_revision is text because current Parent Atlas workspace frames are
-- checksum identities (sha256:<64-hex>), not sortable integers.

CREATE OR REPLACE FUNCTION atlas_immutable_array_to_string(items text[], delimiter text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$ SELECT array_to_string(items, delimiter) $$;

CREATE TABLE IF NOT EXISTS atlas_file_search_index_v2 (
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
  workspace_revision text,
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
    setweight(to_tsvector('simple', atlas_immutable_array_to_string(tokens, ' ')), 'B')
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_file_search_index_v2_search_gin ON atlas_file_search_index_v2 USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS atlas_file_search_index_v2_source_revision_btree ON atlas_file_search_index_v2 (source_revision);
CREATE INDEX IF NOT EXISTS atlas_file_search_index_v2_workspace_revision_btree ON atlas_file_search_index_v2 (workspace_revision);
CREATE INDEX IF NOT EXISTS atlas_file_search_index_v2_concepts_gin ON atlas_file_search_index_v2 USING GIN (concept_ids);
CREATE INDEX IF NOT EXISTS atlas_file_search_index_v2_domains_gin ON atlas_file_search_index_v2 USING GIN (domain_memberships);
CREATE INDEX IF NOT EXISTS atlas_file_search_index_v2_payload_gin ON atlas_file_search_index_v2 USING GIN (payload jsonb_path_ops);
CREATE INDEX IF NOT EXISTS atlas_file_search_index_v2_metadata_gin ON atlas_file_search_index_v2 USING GIN (metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS atlas_file_search_index_v2_embedding_hnsw ON atlas_file_search_index_v2 USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64) WHERE embedding IS NOT NULL;

CREATE TABLE IF NOT EXISTS atlas_file_search_concept_links_v2 (
  candidate_ordinal bigint NOT NULL REFERENCES atlas_file_search_index_v2(candidate_ordinal) ON DELETE CASCADE,
  subject_ref text NOT NULL,
  predicate text NOT NULL,
  object_ref text NOT NULL,
  evidence_refs text[] NOT NULL DEFAULT '{}',
  source_revision text,
  PRIMARY KEY (candidate_ordinal, subject_ref, predicate, object_ref)
);
CREATE INDEX IF NOT EXISTS atlas_file_search_concept_links_v2_evidence_gin ON atlas_file_search_concept_links_v2 USING GIN (evidence_refs);
CREATE INDEX IF NOT EXISTS atlas_file_search_concept_links_v2_tuple_btree ON atlas_file_search_concept_links_v2 (subject_ref, predicate, object_ref);
