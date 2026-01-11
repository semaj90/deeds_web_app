-- Migration: Add Legal Enums and Performance Indexes -- Description: Adds PostgreSQL enums for legal-specific fields
and performance indexes -- Create enums for legal domain CREATE TYPE user_role AS ENUM ('prosecutor', 'detective',
'admin', 'analyst', 'paralegal'); CREATE TYPE case_status AS ENUM ('open', 'in_progress', 'pending_review', 'closed',
'archived'); CREATE TYPE evidence_type AS ENUM ('physical', 'digital', 'testimonial', 'documentary', 'scientific');
CREATE TYPE evidence_status AS ENUM ('pending', 'verified', 'rejected', 'under_review'); CREATE TYPE document_status AS
ENUM ('draft', 'under_review', 'approved', 'rejected', 'archived'); CREATE TYPE priority_level AS ENUM ('low', 'medium',
'high', 'critical', 'urgent'); -- Update users table to use enum ALTER TABLE users ADD COLUMN role_new user_role DEFAULT
'analyst'; UPDATE users SET role_new = role::user_role WHERE role IS NOT NULL; ALTER TABLE users DROP COLUMN role; ALTER
TABLE users RENAME COLUMN role_new TO role; -- Update cases table to use enum ALTER TABLE cases ADD COLUMN status_new
case_status DEFAULT 'open'; UPDATE cases SET status_new = status::case_status WHERE status IS NOT NULL; ALTER TABLE
cases DROP COLUMN status; ALTER TABLE cases RENAME COLUMN status_new TO status; -- Update evidence table to use enums
ALTER TABLE evidence ADD COLUMN type_new evidence_type DEFAULT 'digital'; ALTER TABLE evidence ADD COLUMN status_new
evidence_status DEFAULT 'pending'; UPDATE evidence SET type_new = type::evidence_type WHERE type IS NOT NULL; UPDATE
evidence SET status_new = status::evidence_status WHERE status IS NOT NULL; ALTER TABLE evidence DROP COLUMN type; ALTER
TABLE evidence DROP COLUMN status; ALTER TABLE evidence RENAME COLUMN type_new TO type; ALTER TABLE evidence RENAME
COLUMN status_new TO status; -- Update legal_documents table to use enums ALTER TABLE legal_documents ADD COLUMN
status_new document_status DEFAULT 'draft'; UPDATE legal_documents SET status_new = status::document_status WHERE status
IS NOT NULL; ALTER TABLE legal_documents DROP COLUMN status; ALTER TABLE legal_documents RENAME COLUMN status_new TO
status; -- Add priority column to cases table ALTER TABLE cases ADD COLUMN priority priority_level DEFAULT 'medium'; --
Performance indexes for legal queries CREATE INDEX idx_cases_status_priority ON cases(status, priority); CREATE INDEX
idx_cases_created_at ON cases(created_at DESC); CREATE INDEX idx_cases_updated_at ON cases(updated_at DESC); CREATE
INDEX idx_evidence_case_id ON evidence(case_id); CREATE INDEX idx_evidence_type_status ON evidence(type, status); CREATE
INDEX idx_evidence_created_at ON evidence(created_at DESC); CREATE INDEX idx_legal_documents_status ON
legal_documents(status); CREATE INDEX idx_legal_documents_created_at ON legal_documents(created_at DESC); CREATE INDEX
idx_users_role ON users(role); CREATE INDEX idx_users_email_unique ON users(email) WHERE email IS NOT NULL; -- Vector
search indexes (if pgvector is enabled) DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
-- Create HNSW indexes for vector similarity search CREATE INDEX CONCURRENTLY IF NOT EXISTS
idx_legal_documents_embedding_hnsw ON legal_documents USING hnsw (embedding vector_cosine_ops); CREATE INDEX
CONCURRENTLY IF NOT EXISTS idx_evidence_embedding_hnsw ON evidence USING hnsw (embedding vector_cosine_ops); END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skipping vector indexes - pgvector extension not available'; END $$; --
Full-text search indexes CREATE INDEX idx_cases_title_fts ON cases USING gin(to_tsvector('english', title)); CREATE
INDEX idx_cases_description_fts ON cases USING gin(to_tsvector('english', description)); CREATE INDEX
idx_legal_documents_title_fts ON legal_documents USING gin(to_tsvector('english', title)); CREATE INDEX
idx_legal_documents_content_fts ON legal_documents USING gin(to_tsvector('english', content)); CREATE INDEX
idx_evidence_description_fts ON evidence USING gin(to_tsvector('english', description)); -- Composite indexes for common
query patterns CREATE INDEX idx_cases_user_status ON cases(user_id, status); CREATE INDEX idx_evidence_case_type ON
evidence(case_id, type); CREATE INDEX idx_legal_documents_case_status ON legal_documents(case_id, status); -- JSONB
indexes for metadata queries (if metadata columns exist) DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns
WHERE table_name = 'legal_documents' AND column_name = 'metadata') THEN CREATE INDEX idx_legal_documents_metadata_gin ON
legal_documents USING gin(metadata); END IF; IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name =
'evidence' AND column_name = 'metadata') THEN CREATE INDEX idx_evidence_metadata_gin ON evidence USING gin(metadata);
END IF; IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cases' AND column_name = 'metadata')
THEN CREATE INDEX idx_cases_metadata_gin ON cases USING gin(metadata); END IF; END $$; -- Update table comments COMMENT
ON TYPE user_role IS 'Legal system user roles'; COMMENT ON TYPE case_status IS 'Legal case status values'; COMMENT ON
TYPE evidence_type IS 'Types of evidence in legal cases'; COMMENT ON TYPE evidence_status IS 'Evidence verification
status'; COMMENT ON TYPE document_status IS 'Legal document review status'; COMMENT ON TYPE priority_level IS 'Priority
levels for cases and tasks'; -- Update column comments COMMENT ON COLUMN users.role IS 'User role in the legal system';
COMMENT ON COLUMN cases.status IS 'Current status of the legal case'; COMMENT ON COLUMN cases.priority IS 'Priority
level of the case'; COMMENT ON COLUMN evidence.type IS 'Type of evidence'; COMMENT ON COLUMN evidence.status IS
'Verification status of evidence'; COMMENT ON COLUMN legal_documents.status IS 'Review status of legal document';
