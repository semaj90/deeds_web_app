-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Cases table
CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE,
  case_name TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  court_name TEXT,
  decision_date TIMESTAMP WITH TIME ZONE,
  raw_doc_minio_key TEXT,
  langextract_json_minio_key TEXT,
  langextract_html_minio_key TEXT,
  langextract_summary JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crimes table
CREATE TABLE IF NOT EXISTS crimes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  crime_code TEXT NOT NULL,
  crime_category TEXT NOT NULL,
  crime_classification TEXT NOT NULL,
  attempted BOOLEAN DEFAULT FALSE,
  sentencing_year INTEGER,
  sentence_length_months INTEGER,
  enhancements JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Case chunks table
CREATE TABLE IF NOT EXISTS case_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  section_type TEXT NOT NULL,
  section_subtype TEXT,
  text TEXT NOT NULL,
  embedding vector(768),
  token_start INTEGER,
  token_end INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Laws table
CREATE TABLE IF NOT EXISTS laws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction TEXT NOT NULL,
  code_title TEXT NOT NULL,
  code_abbrev TEXT NOT NULL,
  code_edition TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Law sections table
CREATE TABLE IF NOT EXISTS law_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  law_id UUID NOT NULL REFERENCES laws(id) ON DELETE CASCADE,
  section_number TEXT NOT NULL,
  full_citation TEXT NOT NULL,
  heading TEXT,
  text TEXT NOT NULL,
  embedding vector(768),
  langextract_summary JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cases_jurisdiction ON cases(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_cases_external_id ON cases(external_id);
CREATE INDEX IF NOT EXISTS idx_crimes_case_id ON crimes(case_id);
CREATE INDEX IF NOT EXISTS idx_crimes_crime_code ON crimes(crime_code);
CREATE INDEX IF NOT EXISTS idx_crimes_crime_category ON crimes(crime_category);
CREATE INDEX IF NOT EXISTS idx_crimes_crime_classification ON crimes(crime_classification);
CREATE INDEX IF NOT EXISTS idx_case_chunks_case_id ON case_chunks(case_id);
CREATE INDEX IF NOT EXISTS idx_case_chunks_section_type ON case_chunks(section_type);
CREATE INDEX IF NOT EXISTS idx_case_chunks_embedding ON case_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_laws_jurisdiction ON laws(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_laws_code_abbrev ON laws(code_abbrev);
CREATE INDEX IF NOT EXISTS idx_law_sections_law_id ON law_sections(law_id);
CREATE INDEX IF NOT EXISTS idx_law_sections_section_number ON law_sections(section_number);
CREATE INDEX IF NOT EXISTS idx_law_sections_full_citation ON law_sections(full_citation);
CREATE INDEX IF NOT EXISTS idx_law_sections_embedding ON law_sections USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
