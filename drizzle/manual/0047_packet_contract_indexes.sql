CREATE INDEX IF NOT EXISTS idx_atlas_packets_community_id
ON atlas_packets (community_id);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_concept_ids
ON atlas_packets USING GIN (concept_ids);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_summary_fts
ON atlas_packets
USING GIN (to_tsvector('english', coalesce(summary, '')));
