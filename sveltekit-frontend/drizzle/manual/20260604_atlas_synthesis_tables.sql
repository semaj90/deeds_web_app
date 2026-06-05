-- Atlas feature synthesis tables
-- Join key: feature_id (coarse feature domains: auth, cache, database, etc.)
-- NOT source_ref (mostly empty) or file_path (also empty)

-- ── atlas_feature_synthesis ──────────────────────────────────────────────────
-- Aggregated feature-level intelligence built from task_semantic_packets
-- Refreshed by scripts/atlas/build-synthesized-map.mjs
CREATE TABLE IF NOT EXISTS atlas_feature_synthesis (
  id                    serial PRIMARY KEY,
  feature_id            text NOT NULL UNIQUE,
  -- Counts derived from task_semantic_packets
  packet_count          integer NOT NULL DEFAULT 0,
  atlas_file_count      integer NOT NULL DEFAULT 0,
  qdrant_point_count    integer NOT NULL DEFAULT 0,
  -- Quality signals
  avg_confidence        real,
  max_confidence        real,
  semantic_confidence   real,
  behavior_score        real,
  -- Cluster affinity (top cluster_id by packet frequency)
  primary_cluster_id    text,
  primary_centroid_id   text,
  cluster_ids           jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- File lineage (union of related_file_paths from packets)
  top_file_paths        jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_refs           jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Summary synthesized from all packet summaries for this feature
  synthesized_summary   text,
  next_actions          jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Status roll-up
  dominant_status       text NOT NULL DEFAULT 'todo',
  has_blocked           boolean NOT NULL DEFAULT false,
  -- Atlas metadata
  atlas_version         text,
  synthesized_at        timestamp with time zone NOT NULL DEFAULT now(),
  updated_at            timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_synthesis_feature_id
  ON atlas_feature_synthesis (feature_id);
CREATE INDEX IF NOT EXISTS idx_atlas_feature_synthesis_cluster_id
  ON atlas_feature_synthesis (primary_cluster_id)
  WHERE primary_cluster_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_atlas_feature_synthesis_synthesized_at
  ON atlas_feature_synthesis (synthesized_at DESC);

-- ── atlas_source_ref_synthesis ───────────────────────────────────────────────
-- Source-ref-centric view built from atlas + graphify + routes + tests
-- NOT derived from task_semantic_packets (too sparse); built from Qdrant + Neo4j
CREATE TABLE IF NOT EXISTS atlas_source_ref_synthesis (
  id                    serial PRIMARY KEY,
  source_ref            text NOT NULL UNIQUE,
  source_kind           text NOT NULL DEFAULT 'file',  -- file|dir|task|cluster|doc
  feature_id            text,
  -- Provenance
  atlas_rank            real,
  atlas_authority       real,
  karpathy_blend        real,
  pagerank_score        real,
  attention_score       real,
  -- Content signals
  qdrant_point_ids      jsonb NOT NULL DEFAULT '[]'::jsonb,
  cluster_ids           jsonb NOT NULL DEFAULT '[]'::jsonb,
  som_cluster           text,
  -- Synthesis
  synthesized_summary   text,
  synthesized_at        timestamp with time zone NOT NULL DEFAULT now(),
  updated_at            timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_source_ref_synthesis_source_ref
  ON atlas_source_ref_synthesis (source_ref);
CREATE INDEX IF NOT EXISTS idx_atlas_source_ref_synthesis_feature_id
  ON atlas_source_ref_synthesis (feature_id)
  WHERE feature_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_atlas_source_ref_synthesis_karpathy
  ON atlas_source_ref_synthesis (karpathy_blend DESC NULLS LAST);

-- Ensure valid_to and other columns exist on the history table if it was pre-existing
-- Run these ALTER statements BEFORE creating indexes that reference valid_to or doing insert/select operations.
ALTER TABLE atlas_feature_map_history ADD COLUMN IF NOT EXISTS valid_from timestamp with time zone NOT NULL DEFAULT now();
ALTER TABLE atlas_feature_map_history ADD COLUMN IF NOT EXISTS valid_to timestamp with time zone;
ALTER TABLE atlas_feature_map_history ADD COLUMN IF NOT EXISTS packet_count integer NOT NULL DEFAULT 0;
ALTER TABLE atlas_feature_map_history ADD COLUMN IF NOT EXISTS avg_confidence real;
ALTER TABLE atlas_feature_map_history ADD COLUMN IF NOT EXISTS primary_cluster_id text;
ALTER TABLE atlas_feature_map_history ADD COLUMN IF NOT EXISTS synthesized_summary text;

-- ── atlas_feature_map_history ────────────────────────────────────────────────
-- Temporal versioning: each graphify:semantic run produces a new snapshot row
CREATE TABLE IF NOT EXISTS atlas_feature_map_history (
  id                    serial PRIMARY KEY,
  feature_id            text NOT NULL,
  atlas_version         text NOT NULL,
  valid_from            timestamp with time zone NOT NULL DEFAULT now(),
  valid_to              timestamp with time zone,
  packet_count          integer NOT NULL DEFAULT 0,
  avg_confidence        real,
  primary_cluster_id    text,
  synthesized_summary   text,
  created_at            timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_feature_map_history_feature_version
  ON atlas_feature_map_history (feature_id, atlas_version);
CREATE INDEX IF NOT EXISTS idx_atlas_feature_map_history_valid
  ON atlas_feature_map_history (feature_id, valid_from DESC)
  WHERE valid_to IS NULL;

-- Comments distinguishing feature:* from real file references
COMMENT ON COLUMN atlas_feature_synthesis.source_refs IS
  'JSON array of source references. NOTE: References matching ''feature:*'' are coarse feature-bucket aggregations, not actual physical file paths.';
COMMENT ON COLUMN atlas_source_ref_synthesis.source_ref IS
  'Lineage source identifier. References starting with ''feature:*'' are feature-bucket aggregates, and must not be treated as file system paths. Do not treat feature:* as physical file paths.';

-- ── Populate atlas_feature_synthesis from existing packets ──────────────────
INSERT INTO atlas_feature_synthesis (
  feature_id,
  packet_count,
  avg_confidence,
  max_confidence,
  primary_cluster_id,
  primary_centroid_id,
  cluster_ids,
  top_file_paths,
  source_refs,
  dominant_status,
  has_blocked,
  synthesized_at,
  updated_at
)
SELECT
  tsp.feature_id,
  COUNT(*)                                               AS packet_count,
  AVG(CAST(tsp.confidence AS real))                      AS avg_confidence,
  MAX(CAST(tsp.confidence AS real))                      AS max_confidence,
  -- Mode of cluster_id (most frequent non-null)
  (
    SELECT cluster_id FROM task_semantic_packets t2
    WHERE t2.feature_id = tsp.feature_id AND t2.cluster_id IS NOT NULL
    GROUP BY cluster_id ORDER BY COUNT(*) DESC LIMIT 1
  )                                                      AS primary_cluster_id,
  (
    SELECT centroid_id FROM task_semantic_packets t3
    WHERE t3.feature_id = tsp.feature_id AND t3.centroid_id IS NOT NULL
    GROUP BY centroid_id ORDER BY COUNT(*) DESC LIMIT 1
  )                                                      AS primary_centroid_id,
  COALESCE(
    jsonb_agg(DISTINCT tsp.cluster_id) FILTER (WHERE tsp.cluster_id IS NOT NULL),
    '[]'::jsonb
  )                                                      AS cluster_ids,
  -- Union of related_file_paths (top 20 across all packets for this feature)
  -- Uses COALESCE both inside the aggregation and outside the subquery to guarantee it is never NULL
  COALESCE(
    (
      SELECT COALESCE(jsonb_agg(DISTINCT fp ORDER BY fp), '[]'::jsonb) FROM (
        SELECT jsonb_array_elements_text(COALESCE(t4.related_file_paths, '[]'::jsonb)) AS fp
        FROM task_semantic_packets t4
        WHERE t4.feature_id = tsp.feature_id
        LIMIT 200
      ) sub
    ),
    '[]'::jsonb
  )                                                      AS top_file_paths,
  -- Source references associated with this feature aggregation.
  -- WARNING: feature:* references represent bucket/coarse metadata aggregations, not real file paths.
  COALESCE(
    jsonb_agg(DISTINCT tsp.source_ref) FILTER (WHERE tsp.source_ref IS NOT NULL AND tsp.source_ref != ''),
    '[]'::jsonb
  )                                                      AS source_refs,
  (
    SELECT status FROM task_semantic_packets t5
    WHERE t5.feature_id = tsp.feature_id
    GROUP BY status ORDER BY COUNT(*) DESC LIMIT 1
  )                                                      AS dominant_status,
  BOOL_OR(tsp.status = 'blocked')                        AS has_blocked,
  now()                                                  AS synthesized_at,
  now()                                                  AS updated_at
FROM task_semantic_packets tsp
WHERE tsp.feature_id IS NOT NULL
GROUP BY tsp.feature_id
ON CONFLICT (feature_id) DO UPDATE SET
  packet_count       = EXCLUDED.packet_count,
  avg_confidence     = EXCLUDED.avg_confidence,
  max_confidence     = EXCLUDED.max_confidence,
  primary_cluster_id = EXCLUDED.primary_cluster_id,
  primary_centroid_id= EXCLUDED.primary_centroid_id,
  cluster_ids        = EXCLUDED.cluster_ids,
  top_file_paths     = EXCLUDED.top_file_paths,
  source_refs        = EXCLUDED.source_refs,
  dominant_status    = EXCLUDED.dominant_status,
  has_blocked        = EXCLUDED.has_blocked,
  updated_at         = now();

-- Verify synthesis
SELECT feature_id, packet_count, avg_confidence, dominant_status, has_blocked
FROM atlas_feature_synthesis
ORDER BY packet_count DESC;