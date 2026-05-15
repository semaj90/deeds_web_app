-- Custom migration to match app requirements
-- This fixes the mismatch between existing basic tables and what the app expects

BEGIN;

-- Add missing columns to existing tables
ALTER TABLE cases ADD COLUMN IF NOT EXISTS detective_mode BOOLEAN DEFAULT false;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE cases ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::text[];

ALTER TABLE evidence ADD COLUMN IF NOT EXISTS evidence_type TEXT DEFAULT 'document';
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::text[];
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS analyzed BOOLEAN DEFAULT false;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS summary TEXT;

-- Create missing tables that the app expects
CREATE TABLE IF NOT EXISTS evidence_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES cases(id),
    filename TEXT NOT NULL,
    file_path TEXT,
    mime_type TEXT,
    size INTEGER,
    embeddings vector(768),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence_vectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID REFERENCES evidence(id),
    embedding vector(768),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES cases(id),
    title TEXT NOT NULL,
    description TEXT,
    relevance_score REAL DEFAULT 0.5,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS legal_documents_processed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID,
    title TEXT,
    content TEXT,
    summary TEXT,
    metadata JSONB DEFAULT '{}',
    embeddings vector(768),
    processed_at TIMESTAMP DEFAULT NOW()
);

-- Add legal_documents improvements
ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS jurisdiction TEXT;
ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT ARRAY[]::text[];

-- Create document chunks table for pgvector optimization
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID,
    content TEXT,
    chunk_index INTEGER,
    embedding vector(768),
    document_type TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_ai_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    embedding vector(768),
    results JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add missing API endpoint tables
CREATE TABLE IF NOT EXISTS case_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  importance VARCHAR(20) DEFAULT 'medium',
  evidence_id UUID,
  related_entity_id UUID,
  related_entity_type VARCHAR(50),
  event_data JSONB DEFAULT '{}',
  automated BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  reasoning TEXT,
  priority VARCHAR(20) DEFAULT 'medium',
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  ai_model VARCHAR(100),
  supporting_evidence JSONB DEFAULT '[]',
  suggested_actions JSONB DEFAULT '[]',
  estimated_impact TEXT,
  timeframe VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',
  tags JSONB DEFAULT '[]',
  created_by VARCHAR(50) DEFAULT 'ai-system',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recommendation_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES ai_recommendations(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  implemented BOOLEAN DEFAULT false,
  user_id UUID,
  rated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS detective_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  analysis_type VARCHAR(50) NOT NULL,
  query_data JSONB NOT NULL,
  results JSONB NOT NULL,
  confidence_score DECIMAL(3,2),
  ai_model VARCHAR(100),
  processing_time INTEGER, -- milliseconds
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create essential indexes
CREATE INDEX IF NOT EXISTS idx_evidence_files_case_id ON evidence_files(case_id);
CREATE INDEX IF NOT EXISTS idx_evidence_vectors_evidence_id ON evidence_vectors(evidence_id);
CREATE INDEX IF NOT EXISTS idx_evidence_items_case_id ON evidence_items(case_id);
CREATE INDEX IF NOT EXISTS idx_legal_documents_processed_document_id ON legal_documents_processed(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_case_timeline_case_id ON case_timeline(case_id);
CREATE INDEX IF NOT EXISTS idx_case_timeline_event_date ON case_timeline(event_date);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_case_id ON ai_recommendations(case_id);
CREATE INDEX IF NOT EXISTS idx_detective_analysis_case_id ON detective_analysis(case_id);

-- Vector indexes (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_evidence_files_embeddings ON evidence_files USING hnsw (embeddings vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_legal_documents_embedding ON legal_documents USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- Add full text search indexes
CREATE INDEX IF NOT EXISTS idx_legal_documents_content_search
ON legal_documents USING gin(to_tsvector('english', content));

COMMIT;
