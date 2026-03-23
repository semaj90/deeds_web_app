-- POI Relationships table
-- Created: 2026-03-22

CREATE TABLE IF NOT EXISTS poi_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poi_id_1 UUID NOT NULL REFERENCES persons_of_interest(id) ON DELETE CASCADE,
    poi_id_2 UUID NOT NULL REFERENCES persons_of_interest(id) ON DELETE CASCADE,
    relationship_type VARCHAR(100) NOT NULL DEFAULT 'unknown',
    strength NUMERIC(3,2) DEFAULT 0.70,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS poi_relationships_poi1_idx ON poi_relationships(poi_id_1);
CREATE INDEX IF NOT EXISTS poi_relationships_poi2_idx ON poi_relationships(poi_id_2);