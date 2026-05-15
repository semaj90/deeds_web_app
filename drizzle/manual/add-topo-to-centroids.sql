-- Add gpu_cluster_centroids table if not exists and topological columns
-- These allow persisted centroids to carry topological metadata for faster search-lane boosting.

CREATE TABLE IF NOT EXISTS gpu_cluster_centroids (
    cluster_id INTEGER PRIMARY KEY,
    cluster_type TEXT NOT NULL DEFAULT 'gpu',
    centroid_vec REAL[] NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    topo_class TEXT NOT NULL DEFAULT 'unclassified',
    topo_byte SMALLINT NOT NULL DEFAULT 0,
    dominant_tags TEXT[] NOT NULL DEFAULT '{}'::text[],
    purpose TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Ensure columns exist if table already existed (and fix type if needed)
-- We'll drop and recreate if it's wrong type, since it's a cache table.
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gpu_cluster_centroids' AND column_name='cluster_id' AND data_type='uuid') THEN
        DROP TABLE gpu_cluster_centroids;
        CREATE TABLE gpu_cluster_centroids (
            cluster_id INTEGER PRIMARY KEY,
            cluster_type TEXT NOT NULL DEFAULT 'gpu',
            centroid_vec REAL[] NOT NULL,
            chunk_count INTEGER NOT NULL DEFAULT 0,
            topo_class TEXT NOT NULL DEFAULT 'unclassified',
            topo_byte SMALLINT NOT NULL DEFAULT 0,
            dominant_tags TEXT[] NOT NULL DEFAULT '{}'::text[],
            purpose TEXT,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        );
    END IF;
END $$;

-- Ensure columns exist
ALTER TABLE gpu_cluster_centroids ADD COLUMN IF NOT EXISTS topo_class TEXT NOT NULL DEFAULT 'unclassified';
ALTER TABLE gpu_cluster_centroids ADD COLUMN IF NOT EXISTS topo_byte SMALLINT NOT NULL DEFAULT 0;

-- Backfill from embedded_summaries dominant counts
UPDATE gpu_cluster_centroids gcc
SET topo_class = sub.topo_class,
    topo_byte  = sub.topo_byte
FROM (
    SELECT DISTINCT ON (gpu_cluster) gpu_cluster, topo_class, topo_byte, count(*) as cnt
    FROM embedded_summaries
    WHERE gpu_cluster IS NOT NULL
    GROUP BY gpu_cluster, topo_class, topo_byte
    ORDER BY gpu_cluster, cnt DESC
) sub
WHERE gcc.cluster_id = sub.gpu_cluster;
