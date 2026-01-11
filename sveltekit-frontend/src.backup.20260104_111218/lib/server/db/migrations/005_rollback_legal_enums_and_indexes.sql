-- Rollback Migration: Remove Legal Enums and Performance Indexes -- Description: Removes PostgreSQL enums and
performance indexes added in migration 005 -- Drop performance indexes DROP INDEX IF EXISTS idx_cases_status_priority;
DROP INDEX IF EXISTS idx_cases_created_at; DROP INDEX IF EXISTS idx_cases_updated_at; DROP INDEX IF EXISTS
idx_evidence_case_id; DROP INDEX IF EXISTS idx_evidence_type_status; DROP INDEX IF EXISTS idx_evidence_created_at; DROP
INDEX IF EXISTS idx_legal_documents_status; DROP INDEX IF EXISTS idx_legal_documents_created_at; DROP INDEX IF EXISTS
idx_users_role; DROP INDEX IF EXISTS idx_users_email_unique; -- Drop vector indexes DROP INDEX IF EXISTS
idx_legal_documents_embedding_hnsw; DROP INDEX IF EXISTS idx_evidence_embedding_hnsw; -- Drop full-text search indexes
DROP INDEX IF EXISTS idx_cases_title_fts; DROP INDEX IF EXISTS idx_cases_description_fts; DROP INDEX IF EXISTS
idx_legal_documents_title_fts; DROP INDEX IF EXISTS idx_legal_documents_content_fts; DROP INDEX IF EXISTS
idx_evidence_description_fts; -- Drop composite indexes DROP INDEX IF EXISTS idx_cases_user_status; DROP INDEX IF EXISTS
idx_evidence_case_type; DROP INDEX IF EXISTS idx_legal_documents_case_status; -- Drop JSONB indexes DROP INDEX IF EXISTS
idx_legal_documents_metadata_gin; DROP INDEX IF EXISTS idx_evidence_metadata_gin; DROP INDEX IF EXISTS
idx_cases_metadata_gin; -- Remove priority column from cases ALTER TABLE cases DROP COLUMN IF EXISTS priority; --
Convert enum columns back to varchar ALTER TABLE users ADD COLUMN role_varchar VARCHAR(50); UPDATE users SET
role_varchar = role::text; ALTER TABLE users DROP COLUMN role; ALTER TABLE users RENAME COLUMN role_varchar TO role;
ALTER TABLE cases ADD COLUMN status_varchar VARCHAR(50); UPDATE cases SET status_varchar = status::text; ALTER TABLE
cases DROP COLUMN status; ALTER TABLE cases RENAME COLUMN status_varchar TO status; ALTER TABLE evidence ADD COLUMN
type_varchar VARCHAR(50); ALTER TABLE evidence ADD COLUMN status_varchar VARCHAR(50); UPDATE evidence SET type_varchar =
type::text; UPDATE evidence SET status_varchar = status::text; ALTER TABLE evidence DROP COLUMN type; ALTER TABLE
evidence DROP COLUMN status; ALTER TABLE evidence RENAME COLUMN type_varchar TO type; ALTER TABLE evidence RENAME COLUMN
status_varchar TO status; ALTER TABLE legal_documents ADD COLUMN status_varchar VARCHAR(50); UPDATE legal_documents SET
status_varchar = status::text; ALTER TABLE legal_documents DROP COLUMN status; ALTER TABLE legal_documents RENAME COLUMN
status_varchar TO status; -- Drop enums DROP TYPE IF EXISTS user_role; DROP TYPE IF EXISTS case_status; DROP TYPE IF
EXISTS evidence_type; DROP TYPE IF EXISTS evidence_status; DROP TYPE IF EXISTS document_status; DROP TYPE IF EXISTS
priority_level;
