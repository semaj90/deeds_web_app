-- =============================================================================
-- BOOTSTRAP ALL TABLES — Legal AI Platform
-- Created: 2026-03-10
-- Matches: schema-postgres.ts (83 tables, 19 enums)
-- Existing: 7 tables (users, sessions, cases, evidence, reports, report_audit_log, phase72_error)
-- Strategy: ALTER existing + CREATE IF NOT EXISTS for missing
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;  -- pgvector

-- =============================================================================
-- 2. MISSING ENUMS (14 of 19)
-- Existing: user_role, case_status, case_priority, evidence_type, report_status
-- =============================================================================
DO $$ BEGIN CREATE TYPE relation_type AS ENUM ('supports','contradicts','same_person','timeline','chain_of_custody','corroborates','alibi','motive','opportunity','means','witness_statement','physical_evidence','digital_evidence','circumstantial','direct_evidence','hearsay','privileged','inadmissible'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE threat_level AS ENUM ('low','medium','high','critical'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE patch_status AS ENUM ('suggested','applied','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE document_status AS ENUM ('queued','processing','completed','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE document_type AS ENUM ('pleading','motion','brief','contract','evidence','correspondence','court_order','transcript','affidavit','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE summary_type AS ENUM ('brief','detailed','executive','technical'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE activity_status AS ENUM ('pending','in_progress','completed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE verification_status AS ENUM ('pending','verified','failed','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE case_risk_level AS ENUM ('low','medium','high','critical'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE case_link_type AS ENUM ('CHARGED_UNDER','CITED_IN','RELATED_TO','OVERRULED_BY','AFFIRMED_BY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE route_health_state AS ENUM ('healthy','degraded','unhealthy'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE error_kind AS ENUM ('runtime','api','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE error_severity AS ENUM ('info','warn','error','critical'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE suggestion_state AS ENUM ('pending','applied','dismissed','snoozed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- 3. ALTER EXISTING TABLES (add missing columns)
-- =============================================================================

-- users: rename password_hash → hashed_password, add first_name, last_name, is_active
ALTER TABLE users RENAME COLUMN password_hash TO hashed_password;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name varchar(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name varchar(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- sessions: needs id as text (Lucia v3), not uuid
-- Drop and recreate since DB is nearly empty
DROP TABLE IF EXISTS sessions CASCADE;
CREATE TABLE sessions (
    id text PRIMARY KEY NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);

-- cases: add missing columns
ALTER TABLE cases ADD COLUMN IF NOT EXISTS practice_area varchar(100);
ALTER TABLE cases ADD COLUMN IF NOT EXISTS jurisdiction varchar(100);
ALTER TABLE cases ADD COLUMN IF NOT EXISTS court varchar(200);
ALTER TABLE cases ADD COLUMN IF NOT EXISTS client_name varchar(200);
ALTER TABLE cases ADD COLUMN IF NOT EXISTS opposing_party varchar(200);
ALTER TABLE cases ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS assigned_attorney uuid;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS filing_date timestamptz;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS due_date timestamptz;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS closed_date timestamptz;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS qdrant_id uuid;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS qdrant_collection varchar(100);
ALTER TABLE cases ADD COLUMN IF NOT EXISTS metadata jsonb;
-- Add indexes
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at);
CREATE INDEX IF NOT EXISTS idx_cases_status_priority ON cases(status, priority);
CREATE INDEX IF NOT EXISTS idx_cases_status_priority_created ON cases(status, priority, created_at);

-- reports: add type column
ALTER TABLE reports ADD COLUMN IF NOT EXISTS type varchar(64);

-- =============================================================================
-- 4. CREATE MISSING TABLES — Group 1: No dependencies beyond existing tables
-- =============================================================================

-- email_verification_codes
CREATE TABLE IF NOT EXISTS email_verification_codes (
    id serial PRIMARY KEY NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email varchar(255) NOT NULL,
    code varchar(8) NOT NULL,
    expires_at timestamptz NOT NULL,
    CONSTRAINT email_verification_codes_user_id_unique UNIQUE (user_id)
);

-- password_reset_tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash varchar(63) PRIMARY KEY NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);

-- criminals
CREATE TABLE IF NOT EXISTS criminals (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    first_name varchar(100) NOT NULL,
    last_name varchar(100) NOT NULL,
    middle_name varchar(100),
    aliases jsonb NOT NULL DEFAULT '[]',
    date_of_birth timestamp,
    place_of_birth varchar(200),
    address text,
    phone varchar(20),
    email varchar(255),
    ssn varchar(11),
    drivers_license varchar(50),
    height integer,
    weight integer,
    eye_color varchar(20),
    hair_color varchar(20),
    distinguishing_marks text,
    photo_url text,
    fingerprints jsonb NOT NULL DEFAULT '{}',
    threat_level threat_level NOT NULL DEFAULT 'low',
    status varchar(20) NOT NULL DEFAULT 'active',
    notes text,
    ai_summary text,
    ai_tags jsonb NOT NULL DEFAULT '[]',
    created_by uuid,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS criminals_first_name_idx ON criminals(first_name);
CREATE INDEX IF NOT EXISTS criminals_last_name_idx ON criminals(last_name);
CREATE INDEX IF NOT EXISTS criminals_threat_level_idx ON criminals(threat_level);
CREATE INDEX IF NOT EXISTS criminals_status_idx ON criminals(status);

-- analysis_jobs
CREATE TABLE IF NOT EXISTS analysis_jobs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    evidence_id uuid NOT NULL,
    case_id uuid,
    job_type varchar(64) NOT NULL,
    status varchar(32) NOT NULL DEFAULT 'queued',
    progress varchar(32) DEFAULT '0',
    result jsonb DEFAULT '{}',
    error text,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analysis_jobs_evidence_idx ON analysis_jobs(evidence_id);
CREATE INDEX IF NOT EXISTS analysis_jobs_status_idx ON analysis_jobs(status);
CREATE INDEX IF NOT EXISTS analysis_jobs_type_idx ON analysis_jobs(job_type);

-- evidence_relationships
CREATE TABLE IF NOT EXISTS evidence_relationships (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    from_evidence_id uuid NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    to_evidence_id uuid NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    relationship_type relation_type NOT NULL,
    label text,
    strength varchar(20) NOT NULL DEFAULT 'medium',
    created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_relationships_case_id_idx ON evidence_relationships(case_id);
CREATE INDEX IF NOT EXISTS evidence_relationships_from_idx ON evidence_relationships(from_evidence_id);
CREATE INDEX IF NOT EXISTS evidence_relationships_to_idx ON evidence_relationships(to_evidence_id);

-- documents
CREATE TABLE IF NOT EXISTS documents (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    case_id uuid,
    title varchar(255) NOT NULL,
    description text,
    file_path varchar(500),
    file_type varchar(100),
    file_size integer,
    content text,
    summary text,
    embedding_id varchar(255),
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    status varchar(50) DEFAULT 'pending',
    s3_key text,
    s3_bucket text DEFAULT 'legal-documents',
    original_name text,
    mime_type text,
    user_id uuid
);

-- legal_documents
CREATE TABLE IF NOT EXISTS legal_documents (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    title text NOT NULL,
    content text,
    s3_key text NOT NULL,
    s3_bucket text NOT NULL DEFAULT 'legal-documents',
    original_name text NOT NULL,
    mime_type text NOT NULL,
    file_size bigint NOT NULL DEFAULT 0,
    case_id uuid REFERENCES cases(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    evidence_id uuid REFERENCES evidence(id) ON DELETE SET NULL,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    status document_status NOT NULL DEFAULT 'queued',
    document_type document_type,
    practice_area varchar(100),
    metadata jsonb,
    content_embedding text,
    qdrant_id uuid,
    qdrant_collection varchar(100),
    last_synced_to_qdrant timestamptz,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_legal_documents_case_id ON legal_documents(case_id);
CREATE INDEX IF NOT EXISTS idx_legal_documents_user_id ON legal_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_legal_documents_status ON legal_documents(status);
CREATE INDEX IF NOT EXISTS idx_legal_documents_qdrant_id ON legal_documents(qdrant_id);

-- storage_files
CREATE TABLE IF NOT EXISTS storage_files (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    key text NOT NULL,
    original_name text,
    bucket text NOT NULL,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    size bigint NOT NULL,
    mime text,
    uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- vector_metadata
CREATE TABLE IF NOT EXISTS vector_metadata (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    document_id text NOT NULL,
    collection_name varchar(100) NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}',
    content_hash text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp DEFAULT now(),
    CONSTRAINT vector_metadata_document_id_unique UNIQUE (document_id)
);

-- case_scores
CREATE TABLE IF NOT EXISTS case_scores (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    calculated_by integer,
    case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    score numeric(5,2) NOT NULL,
    risk_level case_risk_level NOT NULL,
    breakdown jsonb NOT NULL DEFAULT '{}',
    criteria jsonb NOT NULL DEFAULT '{}',
    recommendations jsonb NOT NULL DEFAULT '[]',
    calculated_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
);

-- embedding_cache
CREATE TABLE IF NOT EXISTS embedding_cache (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    text_hash text NOT NULL,
    model varchar(100) NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    embedding text NOT NULL,
    CONSTRAINT embedding_cache_text_hash_unique UNIQUE (text_hash)
);

-- user_ai_queries
CREATE TABLE IF NOT EXISTS user_ai_queries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id uuid REFERENCES cases(id) ON DELETE SET NULL,
    query text NOT NULL,
    response text NOT NULL,
    model varchar(100) NOT NULL,
    query_type varchar(50) NOT NULL,
    confidence numeric(3,2),
    processing_time integer,
    context_used jsonb DEFAULT '[]',
    created_at timestamp NOT NULL DEFAULT now()
);

-- auto_tags
CREATE TABLE IF NOT EXISTS auto_tags (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    entity_id uuid NOT NULL,
    entity_type varchar(50) NOT NULL,
    tag varchar(100) NOT NULL,
    confidence real NOT NULL,
    source varchar(100) NOT NULL,
    model varchar(100),
    is_confirmed boolean NOT NULL DEFAULT false,
    confirmed_by integer,
    confirmed_at timestamp,
    created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_autotags_entity ON auto_tags(entity_id, entity_type);

-- vector_outbox
CREATE TABLE IF NOT EXISTS vector_outbox (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    owner_type varchar(256) NOT NULL,
    owner_id varchar(256) NOT NULL,
    event varchar(256) NOT NULL,
    vector text,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- vector_jobs
CREATE TABLE IF NOT EXISTS vector_jobs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    status varchar NOT NULL,
    progress integer NOT NULL DEFAULT 0,
    result jsonb,
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- case_activities
CREATE TABLE IF NOT EXISTS case_activities (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    case_id uuid,
    assigned_to integer,
    created_by integer,
    activity_type varchar(100),
    description text,
    status activity_status,
    due_date timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- attachment_verifications
CREATE TABLE IF NOT EXISTS attachment_verifications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    attachment_id uuid,
    verified_by integer,
    status verification_status,
    verification_date timestamptz,
    notes text,
    created_at timestamptz DEFAULT now(),
    "updatedAt" timestamptz DEFAULT now()
);

-- canvas_states
CREATE TABLE IF NOT EXISTS canvas_states (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    case_id uuid,
    user_id uuid,
    state_data jsonb NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ai_reports
CREATE TABLE IF NOT EXISTS ai_reports (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    case_id uuid REFERENCES cases(id) ON DELETE CASCADE,
    created_by integer,
    report_type varchar(100) NOT NULL,
    summary text,
    full_report text,
    generated_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb,
    created_at timestamptz DEFAULT now(),
    "updatedAt" timestamptz DEFAULT now()
);

-- citations
CREATE TABLE IF NOT EXISTS citations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    document_id uuid,
    case_id uuid,
    citation_text text NOT NULL,
    source_url text,
    page_number integer,
    confidence real,
    created_by integer,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- statutes
CREATE TABLE IF NOT EXISTS statutes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    title varchar(255) NOT NULL,
    content text NOT NULL,
    jurisdiction varchar(100),
    section varchar(100),
    category varchar(100),
    source_url text,
    effective_date timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- saved_reports
CREATE TABLE IF NOT EXISTS saved_reports (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    user_id integer NOT NULL,
    report_id uuid NOT NULL,
    case_id uuid,
    saved_at timestamptz NOT NULL DEFAULT now(),
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- themes
CREATE TABLE IF NOT EXISTS themes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    user_id integer NOT NULL,
    name varchar(100) NOT NULL,
    config jsonb NOT NULL,
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- persons_of_interest
CREATE TABLE IF NOT EXISTS persons_of_interest (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    name text NOT NULL,
    aliases text[],
    description text DEFAULT '',
    threat_level varchar NOT NULL DEFAULT 'low',
    status varchar NOT NULL DEFAULT 'surveillance',
    relationship text,
    ai_profile jsonb,
    who jsonb,
    what jsonb,
    why jsonb,
    how jsonb,
    risk jsonb,
    confidence real,
    model_version text,
    generated_at timestamptz,
    last_updated timestamptz,
    case_ids text[],
    created_by text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- hash_verifications
CREATE TABLE IF NOT EXISTS hash_verifications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    evidence_id uuid NOT NULL,
    verified_by integer,
    hash_value text NOT NULL,
    algorithm varchar(50) NOT NULL,
    status verification_status NOT NULL DEFAULT 'pending',
    verification_date timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- content_embeddings
CREATE TABLE IF NOT EXISTS content_embeddings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    document_id uuid NOT NULL,
    embedding text NOT NULL,
    model varchar(100) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- user_embeddings
CREATE TABLE IF NOT EXISTS user_embeddings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    user_id integer NOT NULL,
    embedding text NOT NULL,
    model varchar(100) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- evidence_vectors
CREATE TABLE IF NOT EXISTS evidence_vectors (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    evidence_id uuid NOT NULL,
    vector text NOT NULL,
    model varchar(100) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- case_embeddings
CREATE TABLE IF NOT EXISTS case_embeddings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    case_id uuid NOT NULL,
    embedding text NOT NULL,
    model varchar(100) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- rag_sessions
CREATE TABLE IF NOT EXISTS rag_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    user_id integer NOT NULL,
    case_id uuid,
    title varchar(255),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- legal_precedents
CREATE TABLE IF NOT EXISTS legal_precedents (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    case_id uuid,
    title varchar(255) NOT NULL,
    summary text NOT NULL,
    citation varchar(255),
    court varchar(200),
    decision_date timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- legal_analysis_sessions
CREATE TABLE IF NOT EXISTS legal_analysis_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    user_id integer NOT NULL,
    case_id uuid,
    analysis_type varchar(100) NOT NULL,
    input_data jsonb,
    output_summary text,
    status varchar(50) NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- legal_glossary
CREATE TABLE IF NOT EXISTS legal_glossary (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    term varchar(255) NOT NULL,
    definition text NOT NULL,
    category varchar(100),
    jurisdiction varchar(100),
    related_terms jsonb,
    sources jsonb,
    embedding text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- legal_research
CREATE TABLE IF NOT EXISTS legal_research (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    case_id uuid,
    created_by integer NOT NULL,
    query text NOT NULL,
    results jsonb,
    status varchar(50) NOT NULL DEFAULT 'completed',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- document_processing
CREATE TABLE IF NOT EXISTS document_processing (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    document_id uuid NOT NULL,
    status document_status NOT NULL DEFAULT 'queued',
    processor varchar(100),
    metadata jsonb,
    error text,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- evidence_board_connections
CREATE TABLE IF NOT EXISTS evidence_board_connections (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    from_evidence_id uuid NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    to_evidence_id uuid NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    connection_type varchar(50) NOT NULL DEFAULT 'related',
    label varchar(255),
    notes text,
    strength real DEFAULT 1.0,
    is_visible boolean DEFAULT true,
    created_by integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_board_connections_case_id_idx ON evidence_board_connections(case_id);
CREATE INDEX IF NOT EXISTS evidence_board_connections_type_idx ON evidence_board_connections(connection_type);

-- case_notes
CREATE TABLE IF NOT EXISTS case_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    title varchar(255),
    content text NOT NULL,
    is_ai boolean DEFAULT false,
    is_pinned boolean DEFAULT false,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_notes_case_id_idx ON case_notes(case_id);
CREATE INDEX IF NOT EXISTS case_notes_is_pinned_idx ON case_notes(is_pinned);
CREATE INDEX IF NOT EXISTS case_notes_created_at_idx ON case_notes(created_at);

-- case_reports
CREATE TABLE IF NOT EXISTS case_reports (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    case_id uuid NOT NULL,
    version integer NOT NULL,
    is_current boolean NOT NULL DEFAULT true,
    summary_text text NOT NULL,
    citations jsonb NOT NULL DEFAULT '[]',
    holding text,
    created_by varchar(255),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- audit_log
CREATE TABLE IF NOT EXISTS audit_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    user_id uuid NOT NULL,
    action varchar(100) NOT NULL,
    resource_type varchar(100) NOT NULL,
    resource_id varchar(255) NOT NULL,
    details jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 5. CREATE MISSING TABLES — Group 2: Depends on Group 1
-- =============================================================================

-- citation_tags
CREATE TABLE IF NOT EXISTS citation_tags (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    citation_id uuid NOT NULL REFERENCES citations(id) ON DELETE CASCADE,
    tag varchar(100) NOT NULL,
    color varchar(7) DEFAULT '#6b7280',
    created_by integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT citation_tags_unique UNIQUE (citation_id, tag)
);
CREATE INDEX IF NOT EXISTS citation_tags_citation_id_idx ON citation_tags(citation_id);

-- citation_collections
CREATE TABLE IF NOT EXISTS citation_collections (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    description text,
    color varchar(7) DEFAULT '#8B2332',
    is_public boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS citation_collections_user_id_idx ON citation_collections(user_id);

-- rag_messages
CREATE TABLE IF NOT EXISTS rag_messages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    session_id uuid NOT NULL,
    role varchar(50) NOT NULL,
    content text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- canvas_annotations
CREATE TABLE IF NOT EXISTS canvas_annotations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    canvas_state_id uuid,
    created_by integer,
    annotation_data jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    "updatedAt" timestamptz DEFAULT now()
);

-- canvas_autosaves
CREATE TABLE IF NOT EXISTS canvas_autosaves (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    canvas_state_id uuid,
    created_at timestamptz DEFAULT now()
);

-- poi_photos
CREATE TABLE IF NOT EXISTS poi_photos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    poi_id uuid NOT NULL REFERENCES persons_of_interest(id) ON DELETE CASCADE,
    minio_key text NOT NULL,
    thumbnail_key text,
    url text NOT NULL,
    thumbnail_url text,
    original_name text NOT NULL,
    mime_type text NOT NULL,
    size bigint NOT NULL,
    ai_caption text,
    ai_tags jsonb DEFAULT '[]',
    exif_data jsonb,
    forensic_data jsonb,
    face_embedding text,
    uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_poi_photos_poi_id ON poi_photos(poi_id);
CREATE INDEX IF NOT EXISTS idx_poi_photos_uploaded_at ON poi_photos(uploaded_at);

-- document_chunks
CREATE TABLE IF NOT EXISTS document_chunks (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    document_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    embedding text,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- document_summaries
CREATE TABLE IF NOT EXISTS document_summaries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    document_id uuid NOT NULL,
    summary_type summary_type NOT NULL,
    summary_text text NOT NULL,
    model varchar(100),
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- case_note_versions
CREATE TABLE IF NOT EXISTS case_note_versions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    note_id uuid NOT NULL REFERENCES case_notes(id) ON DELETE CASCADE,
    title varchar(255),
    content text NOT NULL,
    version_number integer NOT NULL,
    edited_by uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_note_versions_note_id_idx ON case_note_versions(note_id);
CREATE INDEX IF NOT EXISTS case_note_versions_version_idx ON case_note_versions(note_id, version_number);

-- case_note_evidence_refs
CREATE TABLE IF NOT EXISTS case_note_evidence_refs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    note_id uuid NOT NULL REFERENCES case_notes(id) ON DELETE CASCADE,
    evidence_id uuid NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT case_note_refs_unique UNIQUE (note_id, evidence_id)
);
CREATE INDEX IF NOT EXISTS case_note_refs_note_id_idx ON case_note_evidence_refs(note_id);
CREATE INDEX IF NOT EXISTS case_note_refs_evidence_id_idx ON case_note_evidence_refs(evidence_id);

-- statute_chunks
CREATE TABLE IF NOT EXISTS statute_chunks (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    statute_id uuid NOT NULL REFERENCES statutes(id) ON DELETE CASCADE,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    embedding text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS statute_chunks_statute_id_idx ON statute_chunks(statute_id);
CREATE INDEX IF NOT EXISTS statute_chunks_chunk_index_idx ON statute_chunks(chunk_index);

-- case_statute_links
CREATE TABLE IF NOT EXISTS case_statute_links (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    statute_id uuid REFERENCES statutes(id) ON DELETE SET NULL,
    citation_id uuid REFERENCES citations(id) ON DELETE SET NULL,
    link_type case_link_type NOT NULL DEFAULT 'CITED_IN',
    notes text,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_statute_links_case_id_idx ON case_statute_links(case_id);
CREATE INDEX IF NOT EXISTS case_statute_links_statute_id_idx ON case_statute_links(statute_id);
CREATE INDEX IF NOT EXISTS case_statute_links_citation_id_idx ON case_statute_links(citation_id);

-- =============================================================================
-- 6. CREATE MISSING TABLES — Group 3: Depends on Group 2
-- =============================================================================

-- collection_citations (junction table)
CREATE TABLE IF NOT EXISTS collection_citations (
    collection_id uuid NOT NULL REFERENCES citation_collections(id) ON DELETE CASCADE,
    citation_id uuid NOT NULL REFERENCES citations(id) ON DELETE CASCADE,
    added_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (collection_id, citation_id)
);
CREATE INDEX IF NOT EXISTS collection_citations_collection_id_idx ON collection_citations(collection_id);
CREATE INDEX IF NOT EXISTS collection_citations_citation_id_idx ON collection_citations(citation_id);

-- chat_embeddings
CREATE TABLE IF NOT EXISTS chat_embeddings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    rag_message_id uuid NOT NULL,
    embedding text NOT NULL,
    model varchar(100) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- workspaces
CREATE TABLE IF NOT EXISTS workspaces (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    title text NOT NULL,
    description text,
    case_id uuid REFERENCES cases(id) ON DELETE CASCADE,
    created_by integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspaces_case_id_idx ON workspaces(case_id);
CREATE INDEX IF NOT EXISTS workspaces_created_by_idx ON workspaces(created_by);

-- =============================================================================
-- 7. CREATE MISSING TABLES — Group 4: Workspace sub-tables
-- =============================================================================

-- workspace_sessions
CREATE TABLE IF NOT EXISTS workspace_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    session_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_sessions_workspace_id_idx ON workspace_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_sessions_session_id_idx ON workspace_sessions(session_id);

-- workspace_evidence
CREATE TABLE IF NOT EXISTS workspace_evidence (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    evidence_id uuid NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    relevance_score real DEFAULT 0,
    added_by varchar(50) DEFAULT 'user',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_evidence_workspace_id_idx ON workspace_evidence(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_evidence_evidence_id_idx ON workspace_evidence(evidence_id);

-- workspace_statutes
CREATE TABLE IF NOT EXISTS workspace_statutes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    statute_id uuid REFERENCES statutes(id) ON DELETE CASCADE,
    statute_text text,
    relevance_score real DEFAULT 0,
    source varchar(50) DEFAULT 'user',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_statutes_workspace_id_idx ON workspace_statutes(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_statutes_statute_id_idx ON workspace_statutes(statute_id);

-- workspace_notes
CREATE TABLE IF NOT EXISTS workspace_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    content text NOT NULL,
    is_ai boolean DEFAULT false,
    embedding text,
    created_by integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_notes_workspace_id_idx ON workspace_notes(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_notes_is_ai_idx ON workspace_notes(is_ai);

-- workspace_citations
CREATE TABLE IF NOT EXISTS workspace_citations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    message_id uuid,
    citation_text text NOT NULL,
    citation_url text,
    citation_type varchar(50) DEFAULT 'statute',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_citations_workspace_id_idx ON workspace_citations(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_citations_message_id_idx ON workspace_citations(message_id);

-- =============================================================================
-- 8. YORHA DETECTIVE INTERFACE TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS yorha_cases (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    case_number varchar(100) NOT NULL UNIQUE,
    title varchar(500) NOT NULL,
    description text,
    status varchar(50) NOT NULL DEFAULT 'active',
    priority varchar(20) NOT NULL DEFAULT 'medium',
    case_type varchar(100),
    jurisdiction varchar(200),
    filed_date timestamptz,
    closed_date timestamptz,
    created_by uuid NOT NULL,
    assigned_to uuid,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS yorha_cases_case_number_idx ON yorha_cases(case_number);
CREATE INDEX IF NOT EXISTS yorha_cases_created_by_idx ON yorha_cases(created_by);
CREATE INDEX IF NOT EXISTS yorha_cases_status_idx ON yorha_cases(status);

CREATE TABLE IF NOT EXISTS yorha_evidence_nodes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    case_id uuid NOT NULL,
    title varchar(500) NOT NULL,
    description text,
    evidence_type varchar(100) NOT NULL,
    position_x integer DEFAULT 0,
    position_y integer DEFAULT 0,
    color varchar(20) DEFAULT 'blue',
    icon varchar(100),
    source varchar(500),
    date_collected timestamptz,
    relevance_score integer DEFAULT 0,
    file_path varchar(1000),
    file_type varchar(100),
    file_size integer,
    ai_summary text,
    ai_tags jsonb,
    key_entities jsonb,
    status varchar(50) NOT NULL DEFAULT 'active',
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS yorha_evidence_nodes_case_id_idx ON yorha_evidence_nodes(case_id);
CREATE INDEX IF NOT EXISTS yorha_evidence_nodes_type_idx ON yorha_evidence_nodes(evidence_type);
CREATE INDEX IF NOT EXISTS yorha_evidence_nodes_created_by_idx ON yorha_evidence_nodes(created_by);

CREATE TABLE IF NOT EXISTS yorha_evidence_connections (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    case_id uuid NOT NULL,
    source_node_id uuid NOT NULL,
    target_node_id uuid NOT NULL,
    connection_type varchar(100) NOT NULL,
    strength integer DEFAULT 50,
    description text,
    ai_reasoning text,
    confidence_score integer DEFAULT 0,
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS yorha_evidence_connections_case_id_idx ON yorha_evidence_connections(case_id);
CREATE INDEX IF NOT EXISTS yorha_evidence_connections_source_idx ON yorha_evidence_connections(source_node_id);
CREATE INDEX IF NOT EXISTS yorha_evidence_connections_target_idx ON yorha_evidence_connections(target_node_id);
CREATE INDEX IF NOT EXISTS yorha_evidence_connections_type_idx ON yorha_evidence_connections(connection_type);

CREATE TABLE IF NOT EXISTS yorha_chat_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    case_id uuid NOT NULL,
    user_id uuid NOT NULL,
    title varchar(500),
    context_type varchar(100),
    context_id uuid,
    status varchar(50) NOT NULL DEFAULT 'active',
    message_count integer DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_message_at timestamptz
);
CREATE INDEX IF NOT EXISTS yorha_chat_sessions_case_id_idx ON yorha_chat_sessions(case_id);
CREATE INDEX IF NOT EXISTS yorha_chat_sessions_user_id_idx ON yorha_chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS yorha_chat_sessions_status_idx ON yorha_chat_sessions(status);

CREATE TABLE IF NOT EXISTS yorha_chat_messages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id uuid NOT NULL,
    role varchar(50) NOT NULL,
    content text NOT NULL,
    message_type varchar(50) DEFAULT 'text',
    referenced_evidence jsonb,
    model_used varchar(100),
    tokens_used integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS yorha_chat_messages_session_id_idx ON yorha_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS yorha_chat_messages_role_idx ON yorha_chat_messages(role);
CREATE INDEX IF NOT EXISTS yorha_chat_messages_created_at_idx ON yorha_chat_messages(created_at);

CREATE TABLE IF NOT EXISTS yorha_system_metrics (
    id serial PRIMARY KEY,
    cpu_usage integer,
    cpu_cores integer,
    memory_usage integer,
    memory_total_gb integer,
    memory_used_gb integer,
    gpu_usage integer,
    gpu_memory_usage integer,
    gpu_temperature integer,
    disk_usage integer,
    disk_total_gb integer,
    disk_used_gb integer,
    network_latency_ms integer,
    network_bandwidth_mbps integer,
    system_health varchar(50) DEFAULT 'healthy',
    active_cases integer DEFAULT 0,
    active_sessions integer DEFAULT 0,
    recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS yorha_system_metrics_recorded_at_idx ON yorha_system_metrics(recorded_at);

-- =============================================================================
-- 9. PHASE 78: ERROR BRAIN TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS route_health (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    route_path varchar(255) NOT NULL UNIQUE,
    file varchar(500),
    state route_health_state NOT NULL DEFAULT 'healthy',
    recent_error_count integer NOT NULL DEFAULT 0,
    total_error_count integer NOT NULL DEFAULT 0,
    last_error_at timestamptz,
    last_error_cluster_id uuid,
    last_error_message_short text,
    route_cluster varchar(100),
    route_owner varchar(100),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_route_health_path ON route_health(route_path);
CREATE INDEX IF NOT EXISTS idx_route_health_state ON route_health(state);
CREATE INDEX IF NOT EXISTS idx_route_health_updated ON route_health(updated_at);
CREATE INDEX IF NOT EXISTS idx_route_health_cluster ON route_health(route_cluster);

CREATE TABLE IF NOT EXISTS error_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    route_path varchar(255) NOT NULL,
    file varchar(500),
    kind error_kind NOT NULL DEFAULT 'other',
    severity error_severity NOT NULL DEFAULT 'warn',
    ts_code varchar(50),
    message text NOT NULL,
    stack text,
    line_number integer,
    column_number integer,
    cluster_id uuid,
    collected_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_error_events_route ON error_events(route_path);
CREATE INDEX IF NOT EXISTS idx_error_events_kind ON error_events(kind);
CREATE INDEX IF NOT EXISTS idx_error_events_cluster ON error_events(cluster_id);
CREATE INDEX IF NOT EXISTS idx_error_events_collected ON error_events(collected_at);

CREATE TABLE IF NOT EXISTS error_clusters (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    kind error_kind NOT NULL,
    severity error_severity NOT NULL DEFAULT 'warn',
    pattern text NOT NULL,
    error_count integer NOT NULL DEFAULT 1,
    route_paths text[],
    radius numeric,
    last_updated timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_error_clusters_kind ON error_clusters(kind);
CREATE INDEX IF NOT EXISTS idx_error_clusters_severity ON error_clusters(severity);

CREATE TABLE IF NOT EXISTS error_suggestions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    cluster_id uuid NOT NULL REFERENCES error_clusters(id),
    title varchar(255) NOT NULL,
    explanation text NOT NULL,
    patch text,
    confidence numeric,
    hints text[],
    generated_at timestamptz NOT NULL DEFAULT now(),
    applied_count integer NOT NULL DEFAULT 0,
    success_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_error_suggestions_cluster ON error_suggestions(cluster_id);

CREATE TABLE IF NOT EXISTS route_error_patches (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    route_path varchar(255) NOT NULL,
    route_file varchar(500),
    error_code varchar(64) NOT NULL,
    suggestion_title varchar(255),
    patch_text text NOT NULL,
    patch_explanation text,
    confidence numeric NOT NULL DEFAULT 0.50,
    hints text[],
    status patch_status NOT NULL DEFAULT 'suggested',
    source varchar(64) NOT NULL DEFAULT 'phase78',
    metadata jsonb NOT NULL DEFAULT '{}',
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    applied_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_route_patches_route ON route_error_patches(route_path);
CREATE INDEX IF NOT EXISTS idx_route_patches_status ON route_error_patches(status);
CREATE INDEX IF NOT EXISTS idx_route_patches_error_code ON route_error_patches(error_code);

CREATE TABLE IF NOT EXISTS error_timeline (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    route_path varchar(255) NOT NULL,
    event_type varchar(50) NOT NULL,
    description text,
    metadata jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_error_timeline_route ON error_timeline(route_path);
CREATE INDEX IF NOT EXISTS idx_error_timeline_event ON error_timeline(event_type);

CREATE TABLE IF NOT EXISTS error_suggestion_states (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    suggestion_id uuid NOT NULL REFERENCES error_suggestions(id) ON DELETE CASCADE,
    route_path varchar(255) NOT NULL,
    user_id uuid,
    state suggestion_state NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_error_suggestion_states_suggestion_route_user UNIQUE (suggestion_id, route_path, user_id)
);
CREATE INDEX IF NOT EXISTS idx_error_suggestion_states_suggestion_route ON error_suggestion_states(suggestion_id, route_path);

CREATE TABLE IF NOT EXISTS error_feedback (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    suggestion_id uuid NOT NULL REFERENCES error_suggestions(id),
    route_path varchar(255) NOT NULL,
    helpful boolean,
    accurate boolean,
    works_soon boolean,
    feedback text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_error_feedback_suggestion ON error_feedback(suggestion_id);
CREATE INDEX IF NOT EXISTS idx_error_feedback_route ON error_feedback(route_path);

-- =============================================================================
-- 10. TOPIC MODELING & RECOMMENDATIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS document_topics (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    document_id uuid NOT NULL,
    topic_id integer NOT NULL,
    membership_probability real NOT NULL,
    centroid_distance real NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT document_topics_document_id_topic_id_unique UNIQUE (document_id, topic_id)
);
CREATE INDEX IF NOT EXISTS document_topics_document_id_idx ON document_topics(document_id);
CREATE INDEX IF NOT EXISTS document_topics_topic_id_idx ON document_topics(topic_id);

CREATE TABLE IF NOT EXISTS user_interaction_history (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    user_id uuid NOT NULL,
    recommendation_id uuid,
    document_id uuid,
    case_id uuid,
    interaction_type varchar(50) NOT NULL,
    duration_seconds integer,
    search_context text,
    topic_preferences jsonb NOT NULL DEFAULT '[]',
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_interaction_history_user_id_idx ON user_interaction_history(user_id);
CREATE INDEX IF NOT EXISTS user_interaction_history_document_id_idx ON user_interaction_history(document_id);
CREATE INDEX IF NOT EXISTS user_interaction_history_case_id_idx ON user_interaction_history(case_id);
CREATE INDEX IF NOT EXISTS user_interaction_history_created_at_idx ON user_interaction_history(created_at);

-- =============================================================================
-- 11. EVIDENCE AUDIT & VERSIONING
-- =============================================================================

CREATE TABLE IF NOT EXISTS evidence_audit_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    evidence_id uuid NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    action varchar(50) NOT NULL,
    changes jsonb,
    ip_address varchar(45),
    user_agent text,
    "timestamp" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_audit_log_evidence_id_idx ON evidence_audit_log(evidence_id);
CREATE INDEX IF NOT EXISTS evidence_audit_log_user_id_idx ON evidence_audit_log(user_id);
CREATE INDEX IF NOT EXISTS evidence_audit_log_timestamp_idx ON evidence_audit_log("timestamp");
CREATE INDEX IF NOT EXISTS evidence_audit_log_action_idx ON evidence_audit_log(action);

CREATE TABLE IF NOT EXISTS evidence_versions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    evidence_id uuid NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    version integer NOT NULL,
    title varchar(255),
    description text,
    metadata jsonb,
    changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
    change_reason text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_versions_evidence_id_idx ON evidence_versions(evidence_id);
CREATE INDEX IF NOT EXISTS evidence_versions_version_idx ON evidence_versions(evidence_id, version);

-- =============================================================================
-- 12. PUSH SUBSCRIPTIONS (for Web Push notifications)
-- =============================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint text NOT NULL UNIQUE,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions(user_id);

COMMIT;

-- =============================================================================
-- SUMMARY: This script creates:
-- - 1 extension (pgvector)
-- - 14 new enums
-- - ALTER 4 existing tables (users, sessions, cases, reports)
-- - ~76 new tables
-- - ~100+ indexes
-- Total: matches all 83 tables in schema-postgres.ts
-- =============================================================================
