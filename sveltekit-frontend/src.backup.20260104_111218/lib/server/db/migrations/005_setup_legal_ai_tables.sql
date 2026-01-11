-- Migration: Setup Legal AI tables with pgvector support -- This migration creates all tables needed for the TensorRT
Legal AI integration -- Enable pgvector extension CREATE EXTENSION IF NOT EXISTS vector; -- Legal queries table - stores
all AI interactions CREATE TABLE IF NOT EXISTS legal_queries ( id SERIAL PRIMARY KEY, prompt TEXT NOT NULL, context
TEXT, response TEXT, tokens_used INTEGER, inference_time REAL, -- milliseconds model_used TEXT DEFAULT 'unknown', status
TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed error_message TEXT, user_ip TEXT,
similar_docs_count INTEGER DEFAULT 0, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMP DEFAULT
CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ); -- Legal documents table with vector embeddings
CREATE TABLE IF NOT EXISTS legal_documents ( id SERIAL PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
document_type TEXT, -- contract, case_law, regulation, brief, etc. jurisdiction TEXT, practice_area TEXT, -- corporate,
litigation, real_estate, etc. source TEXT, -- file_upload, api_import, manual_entry file_path TEXT, file_size INTEGER,
embedding vector(768), -- 768-dimensional embedding for similarity search metadata JSONB, -- JSON metadata for flexible
document properties confidence_score REAL, -- AI confidence in document classification is_active BOOLEAN DEFAULT true,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, indexed_at TIMESTAMP --
when embedding was last updated ); -- Query embeddings table - for similarity search CREATE TABLE IF NOT EXISTS
embeddings ( id SERIAL PRIMARY KEY, query_id INTEGER REFERENCES legal_queries(id), document_id INTEGER REFERENCES
legal_documents(id), embedding vector(768), embedding_type TEXT DEFAULT 'query', -- query, document, chunk created_at
TIMESTAMP DEFAULT CURRENT_TIMESTAMP ); -- Legal cases table - for case law management CREATE TABLE IF NOT EXISTS
legal_cases ( id SERIAL PRIMARY KEY, case_name TEXT NOT NULL, case_number TEXT, court TEXT, jurisdiction TEXT,
decision_date TIMESTAMP, citation TEXT, summary TEXT, holding TEXT, facts TEXT, legal_issues TEXT, embedding
vector(768), metadata JSONB, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT
CURRENT_TIMESTAMP ); -- Legal entities table - parties, companies, individuals CREATE TABLE IF NOT EXISTS legal_entities
( id SERIAL PRIMARY KEY, name TEXT NOT NULL, entity_type TEXT, -- person, corporation, government, court, etc.
description TEXT, contact_info JSONB, aliases TEXT[], metadata JSONB, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ); -- Document-entity relationships CREATE TABLE IF NOT EXISTS
document_entities ( id SERIAL PRIMARY KEY, document_id INTEGER REFERENCES legal_documents(id), entity_id INTEGER
REFERENCES legal_entities(id), relationship_type TEXT, -- plaintiff, defendant, attorney, witness, etc. confidence_score
REAL, extracted_by TEXT DEFAULT 'ai', -- ai, manual, imported created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ); -- Legal
topics/tags for categorization CREATE TABLE IF NOT EXISTS legal_topics ( id SERIAL PRIMARY KEY, name TEXT NOT NULL,
description TEXT, parent_topic_id INTEGER REFERENCES legal_topics(id), topic_level INTEGER DEFAULT 1, -- 1=top level,
2=subcategory, etc. embedding vector(768), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ); -- Document-topic
relationships CREATE TABLE IF NOT EXISTS document_topics ( id SERIAL PRIMARY KEY, document_id INTEGER REFERENCES
legal_documents(id), topic_id INTEGER REFERENCES legal_topics(id), relevance_score REAL DEFAULT 1.0, assigned_by TEXT
DEFAULT 'ai', -- ai, manual created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ); -- AI model performance tracking CREATE
TABLE IF NOT EXISTS model_performance ( id SERIAL PRIMARY KEY, model_name TEXT NOT NULL, model_version TEXT, query_count
INTEGER DEFAULT 0, avg_inference_time REAL, avg_tokens_per_response REAL, success_rate REAL, user_satisfaction REAL, --
if we collect feedback date TIMESTAMP DEFAULT CURRENT_TIMESTAMP, metadata JSONB, created_at TIMESTAMP DEFAULT
CURRENT_TIMESTAMP ); -- User feedback on AI responses CREATE TABLE IF NOT EXISTS query_feedback ( id SERIAL PRIMARY KEY,
query_id INTEGER REFERENCES legal_queries(id), rating INTEGER, -- 1-5 stars feedback_text TEXT, is_helpful BOOLEAN,
user_ip TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ); -- System configuration for AI settings CREATE TABLE IF
NOT EXISTS ai_config ( id SERIAL PRIMARY KEY, config_key TEXT NOT NULL, config_value TEXT, config_type TEXT DEFAULT
'string', -- string, number, boolean, json description TEXT, is_active BOOLEAN DEFAULT true, updated_by TEXT DEFAULT
'system', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ); -- Create
indexes for performance -- Vector similarity search indexes (HNSW for fast approximate search) CREATE INDEX IF NOT
EXISTS idx_legal_documents_embedding ON legal_documents USING hnsw (embedding vector_cosine_ops); CREATE INDEX IF NOT
EXISTS idx_embeddings_embedding ON embeddings USING hnsw (embedding vector_cosine_ops); CREATE INDEX IF NOT EXISTS
idx_legal_cases_embedding ON legal_cases USING hnsw (embedding vector_cosine_ops); CREATE INDEX IF NOT EXISTS
idx_legal_topics_embedding ON legal_topics USING hnsw (embedding vector_cosine_ops); -- Regular indexes for common
queries CREATE INDEX IF NOT EXISTS idx_legal_queries_status ON legal_queries(status); CREATE INDEX IF NOT EXISTS
idx_legal_queries_timestamp ON legal_queries(timestamp DESC); CREATE INDEX IF NOT EXISTS idx_legal_queries_model_used ON
legal_queries(model_used); CREATE INDEX IF NOT EXISTS idx_legal_documents_type ON legal_documents(document_type); CREATE
INDEX IF NOT EXISTS idx_legal_documents_practice_area ON legal_documents(practice_area); CREATE INDEX IF NOT EXISTS
idx_legal_documents_active ON legal_documents(is_active); CREATE INDEX IF NOT EXISTS idx_legal_documents_created ON
legal_documents(created_at DESC); CREATE INDEX IF NOT EXISTS idx_legal_cases_jurisdiction ON legal_cases(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_legal_cases_decision_date ON legal_cases(decision_date DESC); CREATE INDEX IF NOT EXISTS
idx_document_entities_doc_id ON document_entities(document_id); CREATE INDEX IF NOT EXISTS
idx_document_entities_entity_id ON document_entities(entity_id); CREATE INDEX IF NOT EXISTS idx_document_topics_doc_id
ON document_topics(document_id); CREATE INDEX IF NOT EXISTS idx_document_topics_topic_id ON document_topics(topic_id);
CREATE INDEX IF NOT EXISTS idx_model_performance_model ON model_performance(model_name, date DESC); -- Unique
constraints CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_config_key ON ai_config(config_key) WHERE is_active = true; --
Insert default AI configuration INSERT INTO ai_config (config_key, config_value, config_type, description) VALUES
('tensorrt_engine_path', '/home/james/gemma3_engine_production', 'string', 'Path to TensorRT engine files'),
('pytorch_fallback_script', '/mnt/c/Users/james/Videos/deeds-web-app/gemma3_pytorch_kvcache.py', 'string', 'Path to
PyTorch fallback script'), ('max_tokens_default', '256', 'number', 'Default maximum tokens for responses'),
('temperature_default', '0.3', 'number', 'Default temperature for inference'), ('vector_search_enabled', 'true',
'boolean', 'Enable vector similarity search by default'), ('embedding_dimensions', '768', 'number', 'Dimensions for
document embeddings'), ('max_similar_docs', '5', 'number', 'Maximum similar documents to retrieve') ON CONFLICT
(config_key) DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = CURRENT_TIMESTAMP; -- Insert sample legal
topics INSERT INTO legal_topics (name, description, topic_level) VALUES ('Contract Law', 'Legal issues related to
contracts and agreements', 1), ('Corporate Law', 'Business and corporate legal matters', 1), ('Employment Law',
'Employment and labor-related legal issues', 1), ('Intellectual Property', 'Patents, trademarks, copyrights, and trade
secrets', 1), ('Litigation', 'Legal disputes and court proceedings', 1), ('Real Estate Law', 'Property and real estate
transactions', 1), ('Regulatory Compliance', 'Compliance with government regulations', 1), ('Data Privacy', 'Data
protection and privacy regulations', 1) ON CONFLICT DO NOTHING; -- Insert sample legal entities (you can expand this)
INSERT INTO legal_entities (name, entity_type, description) VALUES ('Supreme Court of the United States', 'court',
'Highest court in the United States'), ('Securities and Exchange Commission', 'government', 'Federal agency that
enforces securities laws'), ('Federal Trade Commission', 'government', 'Federal agency that enforces consumer protection
laws'), ('Department of Justice', 'government', 'Federal law enforcement agency') ON CONFLICT DO NOTHING; -- Create a
function to update the updated_at timestamp CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$ language 'plpgsql'; -- Create triggers to automatically
update updated_at CREATE TRIGGER update_legal_queries_updated_at BEFORE UPDATE ON legal_queries FOR EACH ROW EXECUTE
FUNCTION update_updated_at_column(); CREATE TRIGGER update_legal_documents_updated_at BEFORE UPDATE ON legal_documents
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); CREATE TRIGGER update_legal_cases_updated_at BEFORE UPDATE ON
legal_cases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); CREATE TRIGGER update_legal_entities_updated_at
BEFORE UPDATE ON legal_entities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); CREATE TRIGGER
update_ai_config_updated_at BEFORE UPDATE ON ai_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); --
Grant permissions (adjust as needed for your user) -- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO
legal_admin; -- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO legal_admin;
