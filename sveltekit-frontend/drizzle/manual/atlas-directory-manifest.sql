-- ============================================================================
-- ATLAS Directory Manifest — Replayable Repository State
-- ============================================================================
-- The root object for all extracted knowledge.
-- Directory → SourceRef → Feature → Packet → Embedding → Storage Location
-- Every extracted artifact hangs off this manifest as the stable root.

-- LAYER 1: Directory Manifest (canonical root)
CREATE TABLE IF NOT EXISTS atlas_directory_manifest (
  id bigserial PRIMARY KEY,

  -- Directory identity
  directory_path text NOT NULL UNIQUE,
  canonical_key text NOT NULL UNIQUE,  -- SHA-256(directory_path)

  -- Content inventory
  source_ref_count integer DEFAULT 0,
  feature_id_count integer DEFAULT 0,
  packet_id_count integer DEFAULT 0,
  symbol_count integer DEFAULT 0,

  -- Topology tracking
  parent_directory text,
  depth integer NOT NULL DEFAULT 0,
  community_id integer,
  som_bmu_row integer,
  som_bmu_col integer,

  -- Knowledge summary
  summary_text text,
  summary_embedding vector(768),
  centroid vector(768),

  -- State flags
  is_complete boolean DEFAULT false,
  last_rebuilt_at timestamptz,
  extraction_version text,  -- git commit or timestamp

  -- Replayability tracking
  manifest_hash text,  -- SHA-256 of this manifest object
  qdrant_collection_id text,
  redis_key text,
  seaweedfs_path text,

  -- Metadata
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for fast directory lookups and topology traversal
CREATE INDEX IF NOT EXISTS atlas_dir_manifest_path_idx ON atlas_directory_manifest(directory_path);
CREATE INDEX IF NOT EXISTS atlas_dir_manifest_key_idx ON atlas_directory_manifest(canonical_key);
CREATE INDEX IF NOT EXISTS atlas_dir_manifest_parent_idx ON atlas_directory_manifest(parent_directory);
CREATE INDEX IF NOT EXISTS atlas_dir_manifest_community_idx ON atlas_directory_manifest(community_id);
CREATE INDEX IF NOT EXISTS atlas_dir_manifest_som_idx ON atlas_directory_manifest(som_bmu_row, som_bmu_col);
CREATE INDEX IF NOT EXISTS atlas_dir_manifest_complete_idx ON atlas_directory_manifest(is_complete);

-- Vector search on summaries and centroids
CREATE INDEX IF NOT EXISTS atlas_dir_manifest_summary_vec ON atlas_directory_manifest USING ivfflat (summary_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS atlas_dir_manifest_centroid_vec ON atlas_directory_manifest USING ivfflat (centroid vector_cosine_ops) WITH (lists = 100);

-- ============================================================================

-- LAYER 2: Manifest → SourceRef Mapping (join table)
CREATE TABLE IF NOT EXISTS atlas_manifest_source_refs (
  manifest_id bigint NOT NULL REFERENCES atlas_directory_manifest(id) ON DELETE CASCADE,
  source_ref text NOT NULL,
  feature_id text,
  packet_key text,
  symbol_count integer DEFAULT 0,
  is_extracted boolean DEFAULT false,

  PRIMARY KEY (manifest_id, source_ref),
  UNIQUE (source_ref)
);

CREATE INDEX IF NOT EXISTS atlas_manifest_src_source_ref_idx ON atlas_manifest_source_refs(source_ref);
CREATE INDEX IF NOT EXISTS atlas_manifest_src_feature_idx ON atlas_manifest_source_refs(feature_id);
CREATE INDEX IF NOT EXISTS atlas_manifest_src_packet_idx ON atlas_manifest_source_refs(packet_key);

-- ============================================================================

-- LAYER 3: Hidden Card/Packet Discovery
-- Tracks artifacts that exist in storage (Qdrant, Redis, NDJSON) but aren't linked to manifests
CREATE TABLE IF NOT EXISTS atlas_hidden_artifacts (
  id bigserial PRIMARY KEY,

  -- Artifact identity
  artifact_type text NOT NULL,  -- 'nes_card', 'ace_packet', 'ndjson_export', 'summary_chunk'
  artifact_key text NOT NULL UNIQUE,
  artifact_hash text,  -- SHA-256 for dedup

  -- Potential parent (if detectable)
  inferred_directory text,
  inferred_source_ref text,
  inferred_feature_id text,
  match_confidence real DEFAULT 0.0,  -- 0.0-1.0

  -- Storage location
  storage_backend text,  -- 'qdrant', 'redis', 'seaweedfs', 'couchdb'
  storage_path text,
  storage_url text,

  -- Content summary
  summary_preview text,
  embedding vector(768),

  -- Replayability
  can_restore boolean DEFAULT false,
  restore_manifest jsonb DEFAULT '{}',

  -- Metadata
  discovered_at timestamptz DEFAULT now(),
  matched_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_hidden_artifact_type_idx ON atlas_hidden_artifacts(artifact_type);
CREATE INDEX IF NOT EXISTS atlas_hidden_artifact_key_idx ON atlas_hidden_artifacts(artifact_key);
CREATE INDEX IF NOT EXISTS atlas_hidden_artifact_dir_idx ON atlas_hidden_artifacts(inferred_directory);
CREATE INDEX IF NOT EXISTS atlas_hidden_artifact_matched_idx ON atlas_hidden_artifacts(matched_at);
CREATE INDEX IF NOT EXISTS atlas_hidden_artifact_unmatched_idx ON atlas_hidden_artifacts(artifact_key) WHERE matched_at IS NULL;

-- ============================================================================

-- LAYER 4: Cold Storage Manifest (Tier 2)
-- Tracks what has been archived to SeaweedFS and what is needed for restore
CREATE TABLE IF NOT EXISTS atlas_cold_storage_manifest (
  id bigserial PRIMARY KEY,

  -- Cold object identity
  cold_object_key text NOT NULL UNIQUE,
  cold_object_hash text,  -- SHA-256

  -- Reference back to hot manifest
  directory_manifest_id bigint REFERENCES atlas_directory_manifest(id),
  source_ref text,
  feature_id text,
  packet_key text,

  -- What was archived
  archived_content_type text,  -- 'summary', 'embedding', 'metadata', 'full_artifact'
  archived_size_bytes bigint,
  compressed_size_bytes bigint,

  -- SeaweedFS location
  seaweedfs_volume integer,
  seaweedfs_file_id text,
  seaweedfs_path text,

  -- Restore metadata
  restore_manifest jsonb NOT NULL DEFAULT '{}',  -- contains directory_path, source_refs, feature_ids, centroid, etc.
  required_for_restore boolean DEFAULT true,

  -- Lifecycle
  archived_at timestamptz NOT NULL DEFAULT now(),
  accessed_at timestamptz,
  ttl_days integer DEFAULT 2555,  -- ~7 years
  expires_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_cold_manifest_key_idx ON atlas_cold_storage_manifest(cold_object_key);
CREATE INDEX IF NOT EXISTS atlas_cold_manifest_dir_manifest_idx ON atlas_cold_storage_manifest(directory_manifest_id);
CREATE INDEX IF NOT EXISTS atlas_cold_manifest_seaweedfs_idx ON atlas_cold_storage_manifest(seaweedfs_file_id);
CREATE INDEX IF NOT EXISTS atlas_cold_manifest_expires_idx ON atlas_cold_storage_manifest(expires_at);

-- ============================================================================

-- COMMENTS: Architecture Philosophy

COMMENT ON TABLE atlas_directory_manifest IS
'Root object for replayable repository state.
Directory → SourceRef → Feature → Packet → Embedding → Storage Location.

Every extracted artifact hangs off this manifest as the stable root.
Enables knowledge reconstruction without re-running the entire ingestion pipeline.

Key invariant: directory_path + canonical_key uniquely identify the manifest.
Any rebuild process can reconstruct repository state by replaying from this table.

Manifest hash allows change detection: if manifest_hash changes, topology changed.';

COMMENT ON TABLE atlas_manifest_source_refs IS
'Join layer: manifests → source references.
Each source_ref belongs to exactly one directory manifest.

Tracks extraction state per file:
- is_extracted: whether symbols have been pulled
- feature_id/packet_key: links to ATLAS-3A symbol map and ACE packets
- symbol_count: total symbols extracted from this file';

COMMENT ON TABLE atlas_hidden_artifacts IS
'Discovery layer for orphaned artifacts.
Tracks cards/packets that exist in storage but are not linked to hot manifests.

Current gap (from audit): 114,172 unmatched cards out of 123,921 total.
This table inventories them and attempts to infer parent manifests.

match_confidence rises as we correlate with directories/features.
can_restore indicates whether we could restore this artifact if needed.';

COMMENT ON TABLE atlas_cold_storage_manifest IS
'Tier 2 cold storage tracking.
Mirrors hot manifests to SeaweedFS for long-term archival.

restore_manifest contains everything needed to reconstruct hot state:
- directory_path, source_refs, feature_ids
- centroid vector, summary text
- links to Qdrant and Redis caches

Design preserves knowledge (summaries, embeddings, centroids), not raw code.';

-- ============================================================================

-- ANALYSIS VIEWS: Help with discovery and replay

CREATE OR REPLACE VIEW atlas_manifest_coverage AS
SELECT
  COUNT(*) as total_manifests,
  COUNT(CASE WHEN is_complete THEN 1 END) as complete,
  COUNT(CASE WHEN is_complete THEN 1 END)::real / COUNT(*) * 100 as completion_pct,
  COUNT(CASE WHEN source_ref_count > 0 THEN 1 END) as with_sources,
  COUNT(CASE WHEN feature_id_count > 0 THEN 1 END) as with_features,
  COUNT(CASE WHEN packet_id_count > 0 THEN 1 END) as with_packets,
  COUNT(CASE WHEN summary_embedding IS NOT NULL THEN 1 END) as with_summaries,
  COUNT(CASE WHEN seaweedfs_path IS NOT NULL THEN 1 END) as archived_to_cold
FROM atlas_directory_manifest;

CREATE OR REPLACE VIEW atlas_orphaned_artifacts_summary AS
SELECT
  artifact_type,
  COUNT(*) as count,
  COUNT(CASE WHEN matched_at IS NOT NULL THEN 1 END) as matched,
  COUNT(CASE WHEN matched_at IS NULL THEN 1 END) as unmatched,
  COUNT(CASE WHEN match_confidence >= 0.8 THEN 1 END) as high_confidence,
  COUNT(CASE WHEN can_restore THEN 1 END) as restorable
FROM atlas_hidden_artifacts
GROUP BY artifact_type
ORDER BY count DESC;

CREATE OR REPLACE VIEW atlas_cold_storage_stats AS
SELECT
  COUNT(*) as total_archived,
  SUM(archived_size_bytes) as total_original_bytes,
  SUM(compressed_size_bytes) as total_compressed_bytes,
  COUNT(CASE WHEN accessed_at IS NOT NULL THEN 1 END) as accessed_once,
  COUNT(CASE WHEN expires_at < now() THEN 1 END) as expired
FROM atlas_cold_storage_manifest;

-- ============================================================================
