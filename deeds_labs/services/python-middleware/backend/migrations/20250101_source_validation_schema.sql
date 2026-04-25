-- Source Validation Schema for RAG Human-in-the-Loop
-- Phase: Agentic RAG Source Validation (Task 1.2)
-- References: TASKS_SOURCE_VALIDATION_COUCHDB.md

-- ============================================================================
-- Table 1: case_source_validations
-- Stores which sources user approved/rejected for each query
-- ============================================================================

CREATE TABLE IF NOT EXISTS case_source_validations (
    id SERIAL PRIMARY KEY,
    validation_id VARCHAR(255) UNIQUE NOT NULL,
    case_id VARCHAR(255) NOT NULL,
    query TEXT NOT NULL,
    approved_chunks TEXT[] NOT NULL,  -- Array of chunk_ids
    rejected_chunks TEXT[] DEFAULT '{}',
    validation_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for case_source_validations
CREATE INDEX IF NOT EXISTS idx_validation_id ON case_source_validations(validation_id);
CREATE INDEX IF NOT EXISTS idx_case_id ON case_source_validations(case_id);
CREATE INDEX IF NOT EXISTS idx_created_at_validations ON case_source_validations(created_at);COMMENT ON TABLE case_source_validations IS 'Human validation of KB sources for queries';
COMMENT ON COLUMN case_source_validations.approved_chunks IS 'Qdrant chunk IDs user approved';
COMMENT ON COLUMN case_source_validations.rejected_chunks IS 'Qdrant chunk IDs user rejected';

-- ============================================================================
-- Table 2: kb_answer_citations
-- Maps generated answers to their validated sources
-- ============================================================================

CREATE TABLE IF NOT EXISTS kb_answer_citations (
    id SERIAL PRIMARY KEY,
    validation_id VARCHAR(255) NOT NULL,
    case_id VARCHAR(255) NOT NULL,
    answer_text TEXT NOT NULL,
    citations JSONB NOT NULL,  -- Array of {chunk_id, source_file, snippet, used_in_answer, confidence}
    llm_provider VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key after table creation
ALTER TABLE kb_answer_citations
ADD CONSTRAINT fk_validation_id
FOREIGN KEY (validation_id)
REFERENCES case_source_validations(validation_id)
ON DELETE CASCADE;

-- Indexes for kb_answer_citations
CREATE INDEX IF NOT EXISTS idx_validation_id_citations ON kb_answer_citations(validation_id);
CREATE INDEX IF NOT EXISTS idx_case_id_citations ON kb_answer_citations(case_id);
CREATE INDEX IF NOT EXISTS idx_llm_provider ON kb_answer_citations(llm_provider);
CREATE INDEX IF NOT EXISTS idx_created_at_citations ON kb_answer_citations(created_at);COMMENT ON TABLE kb_answer_citations IS 'LLM-generated answers with full source provenance';
COMMENT ON COLUMN kb_answer_citations.citations IS 'JSONB array of citation metadata';

-- ============================================================================
-- Table 3: kb_provenance_graph
-- Knowledge graph edges extracted from validated answers
-- ============================================================================

CREATE TABLE IF NOT EXISTS kb_provenance_graph (
    id SERIAL PRIMARY KEY,
    validation_id VARCHAR(255) NOT NULL,
    entities TEXT[] NOT NULL,  -- Extracted named entities
    relationships JSONB NOT NULL,  -- Array of {from, to, type} relationships
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key
ALTER TABLE kb_provenance_graph
ADD CONSTRAINT fk_validation_id_graph
FOREIGN KEY (validation_id)
REFERENCES case_source_validations(validation_id)
ON DELETE CASCADE;

-- Indexes for kb_provenance_graph
CREATE INDEX IF NOT EXISTS idx_validation_id_graph ON kb_provenance_graph(validation_id);
CREATE INDEX IF NOT EXISTS idx_created_at_graph ON kb_provenance_graph(created_at);
CREATE INDEX IF NOT EXISTS idx_entities ON kb_provenance_graph USING GIN (entities);COMMENT ON TABLE kb_provenance_graph IS 'Knowledge graph edges from validated sources';
COMMENT ON COLUMN kb_provenance_graph.entities IS 'Named entities (cases, statutes, people)';
COMMENT ON COLUMN kb_provenance_graph.relationships IS 'Graph edges like CITES, REFERENCES, OVERRULES';

-- ============================================================================
-- Table 4: auto_approval_rules
-- Rules for automatically approving high-confidence sources
-- ============================================================================

CREATE TABLE IF NOT EXISTS auto_approval_rules (
    id SERIAL PRIMARY KEY,
    rule_name VARCHAR(255) UNIQUE NOT NULL,
    rule_type VARCHAR(50) NOT NULL,  -- "confidence_threshold", "official_source", "previously_validated"
    criteria JSONB NOT NULL,  -- Rule parameters
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for auto_approval_rules
CREATE INDEX IF NOT EXISTS idx_rule_type ON auto_approval_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_enabled ON auto_approval_rules(enabled);COMMENT ON TABLE auto_approval_rules IS 'Rules for auto-approving sources without human validation';

-- Sample auto-approval rules
INSERT INTO auto_approval_rules (rule_name, rule_type, criteria) VALUES
('high_confidence', 'confidence_threshold', '{"min_score": 0.95, "min_sources": 2}'),
('official_docs', 'official_source', '{"domains": ["docs.python.org", "developer.mozilla.org", "svelte.dev"]}'),
('previously_validated', 'previously_validated', '{"min_validations": 3, "days_lookback": 30}')
ON CONFLICT (rule_name) DO NOTHING;

-- ============================================================================
-- Views for Analytics
-- ============================================================================

-- View: validation_stats
-- Summary of validation activity
CREATE OR REPLACE VIEW validation_stats AS
SELECT
    DATE(created_at) as date,
    COUNT(*) as total_validations,
    AVG(array_length(approved_chunks, 1)) as avg_approved_per_validation,
    AVG(array_length(rejected_chunks, 1)) as avg_rejected_per_validation
FROM case_source_validations
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- View: citation_usage
-- Which sources get cited most frequently
CREATE OR REPLACE VIEW citation_usage AS
SELECT
    citation->>'source_file' as source_file,
    citation->>'chunk_id' as chunk_id,
    COUNT(*) as times_cited,
    AVG((citation->>'confidence')::float) as avg_confidence
FROM kb_answer_citations,
     jsonb_array_elements(citations) as citation
WHERE (citation->>'used_in_answer')::boolean = true
GROUP BY citation->>'source_file', citation->>'chunk_id'
ORDER BY times_cited DESC;

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Full-text search on answers
CREATE INDEX IF NOT EXISTS idx_answer_text_fts ON kb_answer_citations USING GIN (to_tsvector('english', answer_text));

-- Query text search
CREATE INDEX IF NOT EXISTS idx_query_fts ON case_source_validations USING GIN (to_tsvector('english', query));

-- JSONB indexes for citations
CREATE INDEX IF NOT EXISTS idx_citations_gin ON kb_answer_citations USING GIN (citations);

-- JSONB indexes for relationships
CREATE INDEX IF NOT EXISTS idx_relationships_gin ON kb_provenance_graph USING GIN (relationships);

-- ============================================================================
-- Success!
-- ============================================================================

SELECT 'Source validation schema created successfully! ✅' AS status;
