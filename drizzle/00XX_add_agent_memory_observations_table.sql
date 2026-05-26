-- Migration for missing table: agent_memory_observations
CREATE TABLE agent_memory_observations (
    id SERIAL PRIMARY KEY,
    session_id UUID NOT NULL,
    source TEXT NOT NULL,
    ide TEXT NOT NULL,
    observation_summary TEXT NOT NULL,
    tags TEXT[],
    source_refs JSONB,
    raw_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);