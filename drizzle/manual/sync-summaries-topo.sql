DO $$
BEGIN
    -- Rename stable_key to chunk_id if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'embedded_summaries' AND column_name = 'stable_key') THEN
        ALTER TABLE embedded_summaries RENAME COLUMN stable_key TO chunk_id;
    END IF;

    -- Add missing topological columns
    ALTER TABLE embedded_summaries ADD COLUMN IF NOT EXISTS repo_id UUID;
    ALTER TABLE embedded_summaries ADD COLUMN IF NOT EXISTS gpu_cluster INTEGER;
    ALTER TABLE embedded_summaries ADD COLUMN IF NOT EXISTS topo_byte SMALLINT DEFAULT 0 NOT NULL;
    ALTER TABLE embedded_summaries ADD COLUMN IF NOT EXISTS topo_class TEXT DEFAULT 'unclassified' NOT NULL;
    ALTER TABLE embedded_summaries ADD COLUMN IF NOT EXISTS som_bmu_row INTEGER;
    ALTER TABLE embedded_summaries ADD COLUMN IF NOT EXISTS som_bmu_col INTEGER;

    -- Ensure manifold4 exists and is the right type
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        -- Functional index for vector cast to speed up manifold search using HNSW
        CREATE INDEX IF NOT EXISTS idx_embedded_summaries_manifold_vector ON embedded_summaries USING hnsw ((manifold4::vector(4)) vector_l2_ops);
    END IF;

    -- Add index for cluster-based lookups
    CREATE INDEX IF NOT EXISTS idx_embedded_summaries_gpu_cluster ON embedded_summaries(gpu_cluster);
    
    -- Cleanup unique constraint to match new schema naming
    IF EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE constraint_name = 'embedded_summaries_stable_key_source_hash_summary_type_key') THEN
        ALTER TABLE embedded_summaries RENAME CONSTRAINT embedded_summaries_stable_key_source_hash_summary_type_key TO embedded_summaries_chunk_hash_type_uq;
    END IF;
END
$$;
