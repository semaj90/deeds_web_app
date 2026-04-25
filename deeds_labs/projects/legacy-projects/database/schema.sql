CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Legal cases table
CREATE TABLE IF NOT EXISTS legal_cases (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    case_number VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    status VARCHAR(100) DEFAULT 'active',
    prosecutor VARCHAR(255),
    defendant VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Legal documents table with vector embeddings
CREATE TABLE IF NOT EXISTS legal_documents (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    content TEXT,
    case_id VARCHAR(255),
    embedding vector(384),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Evidence table
CREATE TABLE IF NOT EXISTS evidence (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    case_id VARCHAR(255),
    evidence_type VARCHAR(100),
    description TEXT,
    file_path VARCHAR(1000),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_legal_documents_case_id ON legal_documents (case_id);
CREATE INDEX IF NOT EXISTS idx_legal_cases_number ON legal_cases (case_number);
CREATE INDEX IF NOT EXISTS idx_evidence_case_id ON evidence (case_id);

-- Sample data
INSERT INTO legal_cases (case_number, title, prosecutor, defendant) VALUES
('CASE-2024-001', 'Contract Dispute Analysis', 'State Attorney', 'TechCorp Inc'),
('CASE-2024-002', 'Employment Law Review', 'Labor Board', 'StartupXYZ')
ON CONFLICT (case_number) DO NOTHING;

INSERT INTO legal_documents (title, content, case_id) VALUES
('Software License Agreement', 'This agreement governs the use of proprietary software...', 'CASE-2024-001'),
('Employee Handbook', 'Comprehensive policies for remote work and employment...', 'CASE-2024-002')
ON CONFLICT DO NOTHING;
