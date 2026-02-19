-- Person of Interest (POI) Schema for legal_ai_db
-- PostgreSQL 17 + pgvector
-- Date: December 14, 2025

-- Ensure extensions are enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Persons of Interest Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS persons_of_interest (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    date_of_birth DATE,
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    status VARCHAR(50) NOT NULL CHECK (status IN ('person_of_interest', 'witness', 'suspect', 'victim', 'informant')),
    priority VARCHAR(50) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    threat_level VARCHAR(50) NOT NULL CHECK (threat_level IN ('low', 'medium', 'high', 'extreme')),
    occupation VARCHAR(255),
    last_known_location TEXT,
    physical_description TEXT,
    embedding VECTOR(384),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Known Associates Table (Relationship Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS known_associates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poi_id UUID NOT NULL REFERENCES persons_of_interest(id) ON DELETE CASCADE,
    associate_id UUID NOT NULL REFERENCES persons_of_interest(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL CHECK (relationship_type IN ('family', 'colleague', 'friend', 'suspect', 'unknown')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT no_self_association CHECK (poi_id != associate_id),
    CONSTRAINT unique_association UNIQUE (poi_id, associate_id)
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- POI table indexes
CREATE INDEX IF NOT EXISTS idx_poi_case_id
    ON persons_of_interest(case_id);

CREATE INDEX IF NOT EXISTS idx_poi_status
    ON persons_of_interest(status);

CREATE INDEX IF NOT EXISTS idx_poi_priority
    ON persons_of_interest(priority);

CREATE INDEX IF NOT EXISTS idx_poi_threat_level
    ON persons_of_interest(threat_level);

CREATE INDEX IF NOT EXISTS idx_poi_name
    ON persons_of_interest(name);

-- Vector similarity index (IVFFlat for fast approximate search)
-- Note: This index requires data to exist first
-- Uncomment after initial data load:
-- CREATE INDEX IF NOT EXISTS idx_poi_embedding_ivf
--     ON persons_of_interest
--     USING ivfflat (embedding vector_cosine_ops)
--     WITH (lists = 100);

-- Known associates indexes
CREATE INDEX IF NOT EXISTS idx_associates_poi_id
    ON known_associates(poi_id);

CREATE INDEX IF NOT EXISTS idx_associates_associate_id
    ON known_associates(associate_id);

CREATE INDEX IF NOT EXISTS idx_associates_relationship_type
    ON known_associates(relationship_type);

-- ============================================================================
-- Aliases Table (for tracking alternate names)
-- ============================================================================

CREATE TABLE IF NOT EXISTS poi_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poi_id UUID NOT NULL REFERENCES persons_of_interest(id) ON DELETE CASCADE,
    alias_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poi_aliases_poi_id
    ON poi_aliases(poi_id);

CREATE INDEX IF NOT EXISTS idx_poi_aliases_name
    ON poi_aliases(alias_name);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_poi_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER poi_update_timestamp
BEFORE UPDATE ON persons_of_interest
FOR EACH ROW
EXECUTE FUNCTION update_poi_timestamp();

-- ============================================================================
-- Grants (if needed for specific roles)
-- ============================================================================

-- Uncomment and modify as needed for your security model:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON persons_of_interest TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON known_associates TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON poi_aliases TO app_user;
