-- Enhanced Legal AI Schema Migration
-- This migration deploys the complete case management system
-- Run this after ensuring pgvector extension is enabled

BEGIN;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Cases Table - Core case management
CREATE TABLE IF NOT EXISTS cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_number TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'pending', 'archived', 'investigation')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent', 'critical')),
    
    -- Case metadata
    case_type TEXT, -- civil, criminal, administrative, etc.
    jurisdiction TEXT,
    court TEXT,
    judge TEXT,
    
    -- Parties involved
    plaintiff TEXT,
    defendant TEXT,
    attorney TEXT,
    
    -- Dates and timeline
    date_created TIMESTAMP NOT NULL DEFAULT NOW(),
    date_modified TIMESTAMP NOT NULL DEFAULT NOW(),
    date_filed TIMESTAMP,
    date_resolved TIMESTAMP,
    
    -- Detective mode and analysis
    detective_mode BOOLEAN NOT NULL DEFAULT false,
    analysis_depth TEXT NOT NULL DEFAULT 'standard' CHECK (analysis_depth IN ('basic', 'standard', 'comprehensive', 'forensic')),
    
    -- Metadata and custom fields
    metadata JSONB DEFAULT '{}'::jsonb,
    tags TEXT[] DEFAULT ARRAY[]::text[],
    
    -- Workflow and collaboration
    assigned_to UUID,
    collaborators UUID[] DEFAULT ARRAY[]::uuid[],
    
    -- Archive and retention
    archived BOOLEAN NOT NULL DEFAULT false,
    retention_date TIMESTAMP,
    
    -- Audit fields
    created_by UUID,
    modified_by UUID,
    version INTEGER NOT NULL DEFAULT 1
);

-- Evidence Table - Enhanced evidence management
CREATE TABLE IF NOT EXISTS evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    
    -- Evidence identification
    evidence_number TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    
    -- Evidence type and classification
    evidence_type TEXT NOT NULL CHECK (evidence_type IN (
        'document', 'photo', 'video', 'audio', 'physical', 
        'digital', 'testimony', 'expert_report', 'contract',
        'correspondence', 'financial', 'forensic', 'other'
    )),
    
    -- File and storage information
    file_name TEXT,
    file_path TEXT,
    file_size INTEGER,
    mime_type TEXT,
    checksum TEXT, -- SHA-256 for integrity verification
    
    -- Chain of custody
    source TEXT, -- where/who provided the evidence
    custody_chain JSONB DEFAULT '[]'::jsonb,
    authenticated BOOLEAN NOT NULL DEFAULT false,
    
    -- Analysis and processing
    analyzed BOOLEAN NOT NULL DEFAULT false,
    analysis_results JSONB DEFAULT '{}'::jsonb,
    ocr_text TEXT, -- extracted text for documents
    
    -- Detective mode enhancements
    detective_notes TEXT,
    suspicious_indicators TEXT[] DEFAULT ARRAY[]::text[],
    cross_references UUID[] DEFAULT ARRAY[]::uuid[],
    
    -- Relationships and connections
    related_evidence UUID[] DEFAULT ARRAY[]::uuid[],
    mentioned_entities JSONB DEFAULT '[]'::jsonb,
    
    -- Classification and tags
    confidentiality_level TEXT NOT NULL DEFAULT 'public' CHECK (confidentiality_level IN ('public', 'confidential', 'restricted', 'top_secret')),
    tags TEXT[] DEFAULT ARRAY[]::text[],
    
    -- Timeline and dates
    date_created TIMESTAMP NOT NULL DEFAULT NOW(),
    date_modified TIMESTAMP NOT NULL DEFAULT NOW(),
    date_received TIMESTAMP,
    date_analyzed TIMESTAMP,
    
    -- Metadata and custom fields
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Archive status
    archived BOOLEAN NOT NULL DEFAULT false,
    
    -- Audit fields
    created_by UUID,
    modified_by UUID
);

-- Case Timeline Table - Event tracking
CREATE TABLE IF NOT EXISTS case_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    
    -- Event details
    event_type TEXT NOT NULL CHECK (event_type IN (
        'case_created', 'evidence_added', 'evidence_analyzed', 
        'hearing_scheduled', 'document_filed', 'meeting_held',
        'deadline_set', 'status_changed', 'note_added',
        'assignment_changed', 'custom_event'
    )),
    
    title TEXT NOT NULL,
    description TEXT,
    
    -- Related entities
    evidence_id UUID REFERENCES evidence(id),
    related_entity_id UUID, -- flexible reference
    related_entity_type TEXT, -- 'evidence', 'person', 'document', etc.
    
    -- Event metadata
    event_data JSONB DEFAULT '{}'::jsonb,
    importance TEXT NOT NULL DEFAULT 'medium' CHECK (importance IN ('low', 'medium', 'high', 'critical')),
    
    -- Timestamps
    event_date TIMESTAMP NOT NULL,
    date_created TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Audit
    created_by UUID,
    automated BOOLEAN NOT NULL DEFAULT false -- system-generated vs manual
);

-- Citations Table - Legal references
CREATE TABLE IF NOT EXISTS citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    
    -- Citation details
    citation_type TEXT NOT NULL CHECK (citation_type IN (
        'case_law', 'statute', 'regulation', 'secondary_authority',
        'legal_brief', 'court_document', 'expert_report', 
        'news_article', 'academic_paper', 'other'
    )),
    
    title TEXT NOT NULL,
    author TEXT,
    source TEXT,
    
    -- Legal citation format
    citation TEXT, -- proper legal citation format
    url TEXT,
    doi TEXT,
    
    -- Content and context
    abstract TEXT,
    relevant_quote TEXT,
    context_notes TEXT,
    
    -- Relationship to case
    relevance_score INTEGER DEFAULT 5, -- 1-10 scale
    citation_purpose TEXT NOT NULL DEFAULT 'support' CHECK (citation_purpose IN ('support', 'distinguish', 'authority', 'background', 'counter_argument')),
    
    -- Publication details
    publication_date TIMESTAMP,
    jurisdiction TEXT,
    court TEXT,
    
    -- Verification and status
    verified BOOLEAN NOT NULL DEFAULT false,
    verified_date TIMESTAMP,
    
    -- Timestamps
    date_created TIMESTAMP NOT NULL DEFAULT NOW(),
    date_modified TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    tags TEXT[] DEFAULT ARRAY[]::text[],
    
    -- Audit
    created_by UUID,
    modified_by UUID
);

-- Case Notes Table - Rich text notes with detective insights
CREATE TABLE IF NOT EXISTS case_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    
    -- Note details
    note_type TEXT NOT NULL DEFAULT 'general' CHECK (note_type IN (
        'general', 'strategy', 'observation', 'hypothesis',
        'follow_up', 'reminder', 'analysis', 'meeting_notes',
        'detective_insight', 'pattern_analysis'
    )),
    
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    
    -- Rich text editor content
    content_html TEXT, -- rendered HTML
    content_markdown TEXT, -- markdown source
    
    -- Detective mode features
    confidence_level INTEGER DEFAULT 5, -- 1-10
    evidence_support UUID[] DEFAULT ARRAY[]::uuid[],
    cross_references UUID[] DEFAULT ARRAY[]::uuid[],
    
    -- Organization
    category TEXT,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    
    -- Status and workflow
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'archived')),
    
    -- Timestamps
    date_created TIMESTAMP NOT NULL DEFAULT NOW(),
    date_modified TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Metadata and tags
    metadata JSONB DEFAULT '{}'::jsonb,
    tags TEXT[] DEFAULT ARRAY[]::text[],
    
    -- Collaboration
    shared_with UUID[] DEFAULT ARRAY[]::uuid[],
    
    -- Audit
    created_by UUID,
    modified_by UUID
);

-- Persons of Interest Relationships Table
CREATE TABLE IF NOT EXISTS poi_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person1_id UUID NOT NULL,
    person2_id UUID NOT NULL,
    relationship_type TEXT NOT NULL,
    relationship_context TEXT,
    confidence_score REAL DEFAULT 0.5,
    case_id UUID REFERENCES cases(id),
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    date_created TIMESTAMP NOT NULL DEFAULT NOW(),
    date_modified TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Audit
    created_by UUID,
    verified BOOLEAN DEFAULT false,
    
    -- Constraints
    CONSTRAINT poi_relationships_not_self CHECK (person1_id != person2_id),
    CONSTRAINT poi_relationships_unique UNIQUE (person1_id, person2_id, relationship_type)
);

-- Detective Insights Table - AI-powered pattern detection
CREATE TABLE IF NOT EXISTS detective_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    
    -- Insight details
    insight_type TEXT NOT NULL CHECK (insight_type IN (
        'pattern_detection', 'anomaly_detection', 'connection_analysis',
        'timeline_gap', 'inconsistency', 'risk_assessment', 'recommendation'
    )),
    
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    
    -- AI analysis
    confidence_score REAL NOT NULL,
    supporting_evidence UUID[] DEFAULT ARRAY[]::uuid[],
    related_entities JSONB DEFAULT '[]'::jsonb,
    
    -- Classification
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'accepted', 'rejected')),
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    ai_model_version TEXT,
    
    -- Timestamps
    date_created TIMESTAMP NOT NULL DEFAULT NOW(),
    date_reviewed TIMESTAMP,
    
    -- Audit
    created_by UUID,
    reviewed_by UUID
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS cases_case_number_idx ON cases(case_number);
CREATE INDEX IF NOT EXISTS cases_status_idx ON cases(status);
CREATE INDEX IF NOT EXISTS cases_priority_idx ON cases(priority);
CREATE INDEX IF NOT EXISTS cases_detective_mode_idx ON cases(detective_mode);
CREATE INDEX IF NOT EXISTS cases_date_created_idx ON cases(date_created);
CREATE INDEX IF NOT EXISTS cases_assigned_to_idx ON cases(assigned_to);
CREATE INDEX IF NOT EXISTS cases_metadata_idx ON cases USING gin(metadata);

CREATE INDEX IF NOT EXISTS evidence_case_id_idx ON evidence(case_id);
CREATE INDEX IF NOT EXISTS evidence_number_idx ON evidence(evidence_number);
CREATE INDEX IF NOT EXISTS evidence_type_idx ON evidence(evidence_type);
CREATE INDEX IF NOT EXISTS evidence_analyzed_idx ON evidence(analyzed);
CREATE INDEX IF NOT EXISTS evidence_date_created_idx ON evidence(date_created);
CREATE INDEX IF NOT EXISTS evidence_confidentiality_idx ON evidence(confidentiality_level);
CREATE INDEX IF NOT EXISTS evidence_checksum_idx ON evidence(checksum);
CREATE INDEX IF NOT EXISTS evidence_metadata_idx ON evidence USING gin(metadata);

CREATE INDEX IF NOT EXISTS timeline_case_id_idx ON case_timeline(case_id);
CREATE INDEX IF NOT EXISTS timeline_event_date_idx ON case_timeline(event_date);
CREATE INDEX IF NOT EXISTS timeline_event_type_idx ON case_timeline(event_type);
CREATE INDEX IF NOT EXISTS timeline_importance_idx ON case_timeline(importance);

CREATE INDEX IF NOT EXISTS citations_case_id_idx ON citations(case_id);
CREATE INDEX IF NOT EXISTS citations_type_idx ON citations(citation_type);
CREATE INDEX IF NOT EXISTS citations_relevance_idx ON citations(relevance_score);
CREATE INDEX IF NOT EXISTS citations_verified_idx ON citations(verified);
CREATE INDEX IF NOT EXISTS citations_pub_date_idx ON citations(publication_date);

CREATE INDEX IF NOT EXISTS notes_case_id_idx ON case_notes(case_id);
CREATE INDEX IF NOT EXISTS notes_type_idx ON case_notes(note_type);
CREATE INDEX IF NOT EXISTS notes_status_idx ON case_notes(status);
CREATE INDEX IF NOT EXISTS notes_priority_idx ON case_notes(priority);
CREATE INDEX IF NOT EXISTS notes_date_created_idx ON case_notes(date_created);

CREATE INDEX IF NOT EXISTS poi_relationships_person1_idx ON poi_relationships(person1_id);
CREATE INDEX IF NOT EXISTS poi_relationships_person2_idx ON poi_relationships(person2_id);
CREATE INDEX IF NOT EXISTS poi_relationships_case_idx ON poi_relationships(case_id);

CREATE INDEX IF NOT EXISTS detective_insights_case_id_idx ON detective_insights(case_id);
CREATE INDEX IF NOT EXISTS detective_insights_type_idx ON detective_insights(insight_type);
CREATE INDEX IF NOT EXISTS detective_insights_confidence_idx ON detective_insights(confidence_score);
CREATE INDEX IF NOT EXISTS detective_insights_status_idx ON detective_insights(status);

-- Full-text search indexes for better search performance
CREATE INDEX IF NOT EXISTS cases_title_fts_idx ON cases USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS cases_description_fts_idx ON cases USING gin(to_tsvector('english', description));
CREATE INDEX IF NOT EXISTS evidence_title_fts_idx ON evidence USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS evidence_description_fts_idx ON evidence USING gin(to_tsvector('english', description));
CREATE INDEX IF NOT EXISTS evidence_ocr_fts_idx ON evidence USING gin(to_tsvector('english', ocr_text));

-- Auto-timestamp triggers
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.date_modified = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_cases_modtime BEFORE UPDATE ON cases FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_evidence_modtime BEFORE UPDATE ON evidence FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_citations_modtime BEFORE UPDATE ON citations FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_case_notes_modtime BEFORE UPDATE ON case_notes FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_poi_relationships_modtime BEFORE UPDATE ON poi_relationships FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Vector similarity indexes (if not already created)
-- These may need to be created separately depending on your pgvector setup
CREATE INDEX IF NOT EXISTS legal_embeddings_embedding_hnsw_idx ON legal_embeddings 
USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

COMMIT;