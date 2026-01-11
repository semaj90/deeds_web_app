-- ============================================================================
-- JSONB Legal Schema Migration
-- Optimized PostgreSQL JSONB schema with GIN indexes for legal metadata
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgvector";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- OPTIMIZED JSONB TABLES
-- ============================================================================

-- Legal Documents with JSONB metadata
CREATE TABLE IF NOT EXISTS legal_documents_jsonb (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    
    -- JSONB metadata column with legal-specific structure
    metadata JSONB NOT NULL,
    
    -- Vector embeddings for semantic search
    title_embedding vector(384),
    content_embedding vector(384),
    
    -- Generated columns for fast access (computed from JSONB)
    document_type TEXT GENERATED ALWAYS AS (metadata->>'documentType') STORED,
    jurisdiction TEXT GENERATED ALWAYS AS (metadata->>'jurisdiction') STORED,
    practice_area TEXT GENERATED ALWAYS AS (metadata->>'practiceArea') STORED,
    confidentiality_level TEXT GENERATED ALWAYS AS (metadata->>'confidentialityLevel') STORED,
    urgency TEXT GENERATED ALWAYS AS (metadata->>'urgency') STORED,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    
    -- Full-text search vector
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english', title || ' ' || content)
    ) STORED
);

-- Cases with JSONB metadata
CREATE TABLE IF NOT EXISTS cases_jsonb (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    
    -- Case-specific JSONB metadata
    metadata JSONB NOT NULL,
    
    -- Generated columns for indexing
    case_number TEXT GENERATED ALWAYS AS (metadata->>'caseNumber') STORED,
    status TEXT GENERATED ALWAYS AS (metadata->>'status') STORED,
    filing_date TIMESTAMP GENERATED ALWAYS AS ((metadata->>'filingDate')::timestamp) STORED,
    
    -- Analytics counters
    total_documents INTEGER DEFAULT 0,
    total_evidence INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Evidence with chain of custody in JSONB
CREATE TABLE IF NOT EXISTS evidence_jsonb (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID REFERENCES cases_jsonb(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    
    -- Evidence-specific metadata with chain of custody
    metadata JSONB NOT NULL,
    
    -- File information
    file_path TEXT,
    file_size INTEGER,
    mime_type TEXT,
    
    -- Vector embeddings
    embedding vector(384),
    
    -- Generated columns for fast queries
    evidence_type TEXT GENERATED ALWAYS AS (metadata->>'evidenceType') STORED,
    authenticated BOOLEAN GENERATED ALWAYS AS ((metadata->'authenticity'->>'verified')::boolean) STORED,
    relevance_score REAL GENERATED ALWAYS AS ((metadata->'relevance'->>'score')::real) STORED,
    admissibility_status TEXT GENERATED ALWAYS AS (metadata->'admissibility'->>'status') STORED,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Document relationships with semantic metadata
CREATE TABLE IF NOT EXISTS document_relationships_jsonb (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL,
    target_id UUID NOT NULL,
    
    -- Relationship metadata in JSONB
    relationship_metadata JSONB NOT NULL,
    
    -- Generated columns for performance
    relationship_type TEXT GENERATED ALWAYS AS (relationship_metadata->>'type') STORED,
    strength REAL GENERATED ALWAYS AS ((relationship_metadata->>'strength')::real) STORED,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    
    -- Ensure no duplicate relationships
    UNIQUE(source_id, target_id, relationship_type)
);

-- ============================================================================
-- OPTIMIZED GIN INDEXES FOR JSONB QUERIES
-- ============================================================================

-- General JSONB indexes for fast metadata queries
CREATE INDEX IF NOT EXISTS idx_legal_docs_metadata_gin 
    ON legal_documents_jsonb USING GIN (metadata);

CREATE INDEX IF NOT EXISTS idx_cases_metadata_gin 
    ON cases_jsonb USING GIN (metadata);

CREATE INDEX IF NOT EXISTS idx_evidence_metadata_gin 
    ON evidence_jsonb USING GIN (metadata);

CREATE INDEX IF NOT EXISTS idx_relationships_metadata_gin 
    ON document_relationships_jsonb USING GIN (relationship_metadata);

-- Specific JSONB path indexes for common queries
CREATE INDEX IF NOT EXISTS idx_legal_docs_document_type 
    ON legal_documents_jsonb (document_type);

CREATE INDEX IF NOT EXISTS idx_legal_docs_practice_area 
    ON legal_documents_jsonb (practice_area);

CREATE INDEX IF NOT EXISTS idx_legal_docs_jurisdiction 
    ON legal_documents_jsonb (jurisdiction);

CREATE INDEX IF NOT EXISTS idx_legal_docs_confidentiality 
    ON legal_documents_jsonb (confidentiality_level);

-- Case-specific indexes
CREATE INDEX IF NOT EXISTS idx_cases_status 
    ON cases_jsonb (status);

CREATE INDEX IF NOT EXISTS idx_cases_case_number 
    ON cases_jsonb (case_number);

CREATE INDEX IF NOT EXISTS idx_cases_filing_date 
    ON cases_jsonb (filing_date);

-- Evidence-specific indexes
CREATE INDEX IF NOT EXISTS idx_evidence_type 
    ON evidence_jsonb (evidence_type);

CREATE INDEX IF NOT EXISTS idx_evidence_authenticated 
    ON evidence_jsonb (authenticated);

CREATE INDEX IF NOT EXISTS idx_evidence_relevance 
    ON evidence_jsonb (relevance_score DESC);

CREATE INDEX IF NOT EXISTS idx_evidence_admissibility 
    ON evidence_jsonb (admissibility_status);

-- Relationship indexes
CREATE INDEX IF NOT EXISTS idx_relationships_type 
    ON document_relationships_jsonb (relationship_type);

CREATE INDEX IF NOT EXISTS idx_relationships_strength 
    ON document_relationships_jsonb (strength DESC);

CREATE INDEX IF NOT EXISTS idx_relationships_source 
    ON document_relationships_jsonb (source_id);

CREATE INDEX IF NOT EXISTS idx_relationships_target 
    ON document_relationships_jsonb (target_id);

-- ============================================================================
-- VECTOR SIMILARITY INDEXES
-- ============================================================================

-- Vector indexes for semantic search
CREATE INDEX IF NOT EXISTS idx_legal_docs_title_embedding 
    ON legal_documents_jsonb USING ivfflat (title_embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_legal_docs_content_embedding 
    ON legal_documents_jsonb USING ivfflat (content_embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_evidence_embedding 
    ON evidence_jsonb USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ============================================================================
-- FULL-TEXT SEARCH INDEXES
-- ============================================================================

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_legal_docs_search_vector 
    ON legal_documents_jsonb USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_cases_title_text 
    ON cases_jsonb USING GIN (to_tsvector('english', title));

CREATE INDEX IF NOT EXISTS idx_evidence_title_text 
    ON evidence_jsonb USING GIN (to_tsvector('english', title));

-- ============================================================================
-- JSONB VALIDATION FUNCTIONS
-- ============================================================================

-- Validate legal document metadata structure
CREATE OR REPLACE FUNCTION validate_legal_document_metadata(metadata_json JSONB)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check required fields
    IF NOT (metadata_json ? 'documentType') THEN
        RAISE EXCEPTION 'documentType is required in metadata';
    END IF;
    
    -- Validate document type enum
    IF NOT (metadata_json->>'documentType' IN ('contract', 'brief', 'motion', 'pleading', 'evidence', 'citation', 'precedent', 'statute')) THEN
        RAISE EXCEPTION 'Invalid documentType: %', metadata_json->>'documentType';
    END IF;
    
    -- Validate practice area if provided
    IF metadata_json ? 'practiceArea' THEN
        IF NOT (metadata_json->>'practiceArea' IN ('corporate', 'litigation', 'criminal', 'intellectual_property', 'real_estate', 'family', 'tax', 'employment')) THEN
            RAISE EXCEPTION 'Invalid practiceArea: %', metadata_json->>'practiceArea';
        END IF;
    END IF;
    
    -- Validate confidentiality level
    IF metadata_json ? 'confidentialityLevel' THEN
        IF NOT (metadata_json->>'confidentialityLevel' IN ('public', 'confidential', 'privileged', 'classified')) THEN
            RAISE EXCEPTION 'Invalid confidentialityLevel: %', metadata_json->>'confidentialityLevel';
        END IF;
    END IF;
    
    -- Validate parties structure if present
    IF metadata_json ? 'parties' THEN
        IF NOT jsonb_typeof(metadata_json->'parties') = 'array' THEN
            RAISE EXCEPTION 'parties must be an array';
        END IF;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Validate case metadata structure
CREATE OR REPLACE FUNCTION validate_case_metadata(metadata_json JSONB)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check required fields
    IF NOT (metadata_json ? 'caseNumber') THEN
        RAISE EXCEPTION 'caseNumber is required in case metadata';
    END IF;
    
    IF NOT (metadata_json ? 'status') THEN
        RAISE EXCEPTION 'status is required in case metadata';
    END IF;
    
    -- Validate status enum
    IF NOT (metadata_json->>'status' IN ('active', 'pending', 'closed', 'on_hold', 'appealed')) THEN
        RAISE EXCEPTION 'Invalid case status: %', metadata_json->>'status';
    END IF;
    
    -- Validate timeline structure if present
    IF metadata_json ? 'timeline' THEN
        IF NOT jsonb_typeof(metadata_json->'timeline') = 'array' THEN
            RAISE EXCEPTION 'timeline must be an array';
        END IF;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Validate evidence metadata structure
CREATE OR REPLACE FUNCTION validate_evidence_metadata(metadata_json JSONB)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check required fields
    IF NOT (metadata_json ? 'evidenceType') THEN
        RAISE EXCEPTION 'evidenceType is required in evidence metadata';
    END IF;
    
    -- Validate evidence type enum
    IF NOT (metadata_json->>'evidenceType' IN ('document', 'physical', 'digital', 'testimony', 'expert_opinion', 'demonstrative')) THEN
        RAISE EXCEPTION 'Invalid evidenceType: %', metadata_json->>'evidenceType';
    END IF;
    
    -- Validate chain of custody structure if present
    IF metadata_json ? 'chainOfCustody' THEN
        IF NOT jsonb_typeof(metadata_json->'chainOfCustody') = 'array' THEN
            RAISE EXCEPTION 'chainOfCustody must be an array';
        END IF;
    END IF;
    
    -- Validate admissibility structure if present
    IF metadata_json ? 'admissibility' THEN
        IF metadata_json->'admissibility' ? 'status' THEN
            IF NOT (metadata_json->'admissibility'->>'status' IN ('admissible', 'inadmissible', 'conditional', 'pending')) THEN
                RAISE EXCEPTION 'Invalid admissibility status: %', metadata_json->'admissibility'->>'status';
            END IF;
        END IF;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS FOR METADATA VALIDATION
-- ============================================================================

-- Trigger function for legal documents
CREATE OR REPLACE FUNCTION trigger_validate_legal_document_metadata()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM validate_legal_document_metadata(NEW.metadata);
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for cases
CREATE OR REPLACE FUNCTION trigger_validate_case_metadata()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM validate_case_metadata(NEW.metadata);
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for evidence
CREATE OR REPLACE FUNCTION trigger_validate_evidence_metadata()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM validate_evidence_metadata(NEW.metadata);
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS trig_validate_legal_document_metadata ON legal_documents_jsonb;
CREATE TRIGGER trig_validate_legal_document_metadata
    BEFORE INSERT OR UPDATE ON legal_documents_jsonb
    FOR EACH ROW EXECUTE FUNCTION trigger_validate_legal_document_metadata();

DROP TRIGGER IF EXISTS trig_validate_case_metadata ON cases_jsonb;
CREATE TRIGGER trig_validate_case_metadata
    BEFORE INSERT OR UPDATE ON cases_jsonb
    FOR EACH ROW EXECUTE FUNCTION trigger_validate_case_metadata();

DROP TRIGGER IF EXISTS trig_validate_evidence_metadata ON evidence_jsonb;
CREATE TRIGGER trig_validate_evidence_metadata
    BEFORE INSERT OR UPDATE ON evidence_jsonb
    FOR EACH ROW EXECUTE FUNCTION trigger_validate_evidence_metadata();

-- ============================================================================
-- ANALYTICS AND REPORTING VIEWS
-- ============================================================================

-- Legal document analytics view
CREATE OR REPLACE VIEW legal_document_analytics AS
SELECT 
    document_type,
    practice_area,
    jurisdiction,
    confidentiality_level,
    COUNT(*) as document_count,
    AVG(CASE 
        WHEN (metadata->'aiMetadata'->>'confidence')::real IS NOT NULL 
        THEN (metadata->'aiMetadata'->>'confidence')::real 
        ELSE NULL 
    END) as avg_ai_confidence,
    COUNT(CASE WHEN (metadata->'aiMetadata'->>'humanVerified')::boolean = true THEN 1 END) as human_verified_count,
    MAX(created_at) as latest_document,
    MIN(created_at) as earliest_document
FROM legal_documents_jsonb
GROUP BY document_type, practice_area, jurisdiction, confidentiality_level;

-- Case status analytics view
CREATE OR REPLACE VIEW case_status_analytics AS
SELECT 
    status,
    COUNT(*) as case_count,
    AVG(total_documents) as avg_documents_per_case,
    AVG(total_evidence) as avg_evidence_per_case,
    AVG(EXTRACT(DAYS FROM NOW() - created_at)) as avg_case_age_days
FROM cases_jsonb
GROUP BY status;

-- Evidence chain integrity view
CREATE OR REPLACE VIEW evidence_chain_integrity AS
SELECT 
    e.id,
    e.title,
    e.evidence_type,
    e.authenticated,
    e.admissibility_status,
    jsonb_array_length(e.metadata->'chainOfCustody') as custody_steps,
    (e.metadata->'chainOfCustody'->0->>'timestamp')::timestamp as first_custody,
    (e.metadata->'chainOfCustody'->-1->>'timestamp')::timestamp as last_custody,
    -- Validate chronological order
    CASE 
        WHEN jsonb_array_length(e.metadata->'chainOfCustody') <= 1 THEN true
        ELSE NOT EXISTS (
            SELECT 1
            FROM (
                SELECT 
                    (custody_step->>'timestamp')::timestamp as step_time,
                    lag((custody_step->>'timestamp')::timestamp) OVER (
                        ORDER BY ordinality
                    ) as prev_time
                FROM jsonb_array_elements(e.metadata->'chainOfCustody') 
                WITH ORDINALITY as custody_step
            ) t
            WHERE prev_time IS NOT NULL AND step_time < prev_time
        )
    END as chronologically_valid
FROM evidence_jsonb e
WHERE metadata->'chainOfCustody' IS NOT NULL;

-- Citation network view
CREATE OR REPLACE VIEW citation_network AS
SELECT 
    d.id as document_id,
    d.title as document_title,
    d.document_type,
    citation->>'type' as citation_type,
    citation->>'citation' as cited_document,
    (citation->>'relevance')::real as relevance_score
FROM legal_documents_jsonb d,
     jsonb_array_elements(d.metadata->'citations') as citation
WHERE d.metadata->'citations' IS NOT NULL;

-- ============================================================================
-- PERFORMANCE MONITORING FUNCTIONS
-- ============================================================================

-- Monitor JSONB query performance
CREATE OR REPLACE FUNCTION analyze_jsonb_performance()
RETURNS TABLE (
    table_name text,
    index_name text,
    index_size text,
    index_scans bigint,
    tuples_read bigint,
    tuples_fetched bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        schemaname||'.'||tablename as table_name,
        indexname as index_name,
        pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size,
        idx_scan as index_scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
      AND (tablename LIKE '%_jsonb' OR indexname LIKE '%metadata%')
    ORDER BY idx_scan DESC;
END;
$$ LANGUAGE plpgsql;

-- Monitor JSONB storage efficiency
CREATE OR REPLACE FUNCTION analyze_jsonb_storage()
RETURNS TABLE (
    table_name text,
    total_size text,
    jsonb_size_estimate text,
    row_count bigint,
    avg_jsonb_size_bytes numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.table_name,
        pg_size_pretty(pg_total_relation_size(t.table_name::regclass)) as total_size,
        pg_size_pretty((pg_total_relation_size(t.table_name::regclass) * 0.6)::bigint) as jsonb_size_estimate,
        t.row_count,
        CASE 
            WHEN t.row_count > 0 
            THEN (pg_total_relation_size(t.table_name::regclass) * 0.6) / t.row_count
            ELSE 0 
        END as avg_jsonb_size_bytes
    FROM (
        SELECT 
            'legal_documents_jsonb' as table_name,
            COUNT(*) as row_count
        FROM legal_documents_jsonb
        UNION ALL
        SELECT 
            'cases_jsonb' as table_name,
            COUNT(*) as row_count
        FROM cases_jsonb
        UNION ALL
        SELECT 
            'evidence_jsonb' as table_name,
            COUNT(*) as row_count
        FROM evidence_jsonb
        UNION ALL
        SELECT 
            'document_relationships_jsonb' as table_name,
            COUNT(*) as row_count
        FROM document_relationships_jsonb
    ) t;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SAMPLE DATA FOR TESTING
-- ============================================================================

-- Insert sample legal document
INSERT INTO legal_documents_jsonb (title, content, metadata, title_embedding, content_embedding)
VALUES (
    'Sample Contract Agreement',
    'This is a sample contract agreement for testing purposes...',
    '{
        "documentType": "contract",
        "practiceArea": "corporate",
        "jurisdiction": "federal",
        "confidentialityLevel": "confidential",
        "urgency": "routine",
        "parties": [
            {
                "name": "Acme Corporation",
                "role": "plaintiff",
                "entityType": "corporation"
            },
            {
                "name": "Beta LLC",
                "role": "defendant",
                "entityType": "corporation"
            }
        ],
        "semantics": {
            "keyTerms": ["indemnification", "liability", "termination"],
            "legalConcepts": ["contract formation", "breach of contract", "damages"],
            "precedentStrength": 0.85
        },
        "aiMetadata": {
            "modelVersion": "gemma3-legal-v1.0",
            "processingTimestamp": "2024-01-15T10:30:00Z",
            "confidence": 0.92,
            "reviewStatus": "pending",
            "humanVerified": false
        }
    }'::jsonb,
    ARRAY[0.1, 0.2, 0.3]::vector(384),
    ARRAY[0.4, 0.5, 0.6]::vector(384)
) ON CONFLICT DO NOTHING;

-- Insert sample case
INSERT INTO cases_jsonb (title, description, metadata)
VALUES (
    'Corporate Acquisition Dispute',
    'Legal dispute regarding corporate acquisition terms and conditions',
    '{
        "caseNumber": "CORP-2024-001",
        "status": "active",
        "filingDate": "2024-01-10T09:00:00Z",
        "timeline": [
            {
                "date": "2024-01-10T09:00:00Z",
                "event": "Case filed",
                "significance": "high"
            },
            {
                "date": "2024-01-15T14:30:00Z",
                "event": "Discovery phase initiated",
                "significance": "medium"
            }
        ],
        "strategy": {
            "approach": "Negotiate settlement while preparing for trial",
            "objectives": ["Minimize damages", "Preserve client relationship", "Establish precedent"],
            "risks": [
                {
                    "description": "Adverse jury verdict",
                    "probability": 0.3,
                    "impact": "high"
                }
            ]
        }
    }'::jsonb
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- MAINTENANCE PROCEDURES
-- ============================================================================

-- Procedure to update document counters for cases
CREATE OR REPLACE FUNCTION update_case_document_counters()
RETURNS void AS $$
BEGIN
    -- Update total_documents count
    UPDATE cases_jsonb 
    SET total_documents = (
        SELECT COUNT(*)
        FROM legal_documents_jsonb ld
        WHERE ld.metadata->>'caseId' = cases_jsonb.id::text
    );
    
    -- Update total_evidence count
    UPDATE cases_jsonb 
    SET total_evidence = (
        SELECT COUNT(*)
        FROM evidence_jsonb e
        WHERE e.case_id = cases_jsonb.id
    );
    
    -- Update updated_at timestamp
    UPDATE cases_jsonb SET updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Schedule the maintenance procedure (requires pg_cron extension)
-- SELECT cron.schedule('update-case-counters', '0 2 * * *', 'SELECT update_case_document_counters();');

COMMIT;