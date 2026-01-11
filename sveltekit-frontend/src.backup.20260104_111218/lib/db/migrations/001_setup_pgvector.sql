-- Enable pgvector extension CREATE EXTENSION IF NOT EXISTS vector; -- Create vector operators for distance functions --
These are needed for vector similarity searches -- Set up index method for IVFFlat (Inverted File Flat) -- This provides
fast approximate nearest neighbor search -- Configure pgvector settings for optimal performance SET maintenance_work_mem
= '512MB'; -- For index creation SET max_parallel_workers_per_gather = 4; -- For parallel queries -- Create indexes on
vector columns (handled by Drizzle schema) -- The schema will create IVFFlat indexes automatically -- Function to
normalize vectors (useful for cosine similarity) CREATE OR REPLACE FUNCTION normalize_vector(v vector) RETURNS vector AS
$$ DECLARE norm float; BEGIN norm := sqrt(sum(val * val) FROM unnest(v::float[]) val); IF norm = 0 THEN RETURN v; ELSE
RETURN array_agg(val / norm)::vector FROM unnest(v::float[]) val; END IF; END; $$ LANGUAGE plpgsql IMMUTABLE; --
Function to calculate dot product (for relevance scoring) CREATE OR REPLACE FUNCTION dot_product(v1 vector, v2 vector)
RETURNS float AS $$ SELECT sum(a * b) FROM unnest(v1::float[]) WITH ORDINALITY AS a(val, idx) JOIN unnest(v2::float[])
WITH ORDINALITY AS b(val, idx) ON a.idx = b.idx; $$ LANGUAGE sql IMMUTABLE; -- Function for hybrid search scoring CREATE
OR REPLACE FUNCTION hybrid_score( vector_similarity float, text_relevance float, vector_weight float DEFAULT 0.7 )
RETURNS float AS $$ BEGIN RETURN (vector_similarity * vector_weight) + (text_relevance * (1 - vector_weight)); END; $$
LANGUAGE plpgsql IMMUTABLE; -- Create indexes for better performance -- Note: These will be created by Drizzle, but
included here for reference -- CREATE INDEX document_vectors_embedding_idx ON document_vectors USING ivfflat (embedding
vector_cosine_ops) WITH (lists = 100); -- CREATE INDEX case_summary_vectors_embedding_idx ON case_summary_vectors USING
ivfflat (embedding vector_cosine_ops) WITH (lists = 50); -- CREATE INDEX evidence_vectors_embedding_idx ON
evidence_vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100); -- CREATE INDEX
query_vectors_embedding_idx ON query_vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100); -- CREATE
INDEX knowledge_nodes_embedding_idx ON knowledge_nodes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- Grant necessary permissions GRANT USAGE ON SCHEMA public TO legal_admin; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA
public TO legal_admin; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO legal_admin;
