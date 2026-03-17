-- Legal citations (cross-references between legal nodes)
-- and case ↔ library corpus links
-- Run with: psql $DATABASE_URL -f drizzle/manual/20260317_legal_citations_case_links.sql

-- ============================================
-- 1. citation_type enum
-- ============================================
DO $$ BEGIN
  CREATE TYPE citation_type AS ENUM (
    'statutory', 'constitutional', 'regulatory', 'judicial', 'other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- 2. legal_citations table
-- ============================================
CREATE TABLE IF NOT EXISTS legal_citations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node_id UUID NOT NULL REFERENCES legal_nodes(id) ON DELETE CASCADE,
  to_node_id   UUID           REFERENCES legal_nodes(id) ON DELETE SET NULL,
  citation_text TEXT NOT NULL,
  citation_type citation_type NOT NULL DEFAULT 'other',
  normalized_target TEXT,
  confidence    REAL DEFAULT 1.0,
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_legal_citations_from   ON legal_citations(from_node_id);
CREATE INDEX IF NOT EXISTS idx_legal_citations_to     ON legal_citations(to_node_id);
CREATE INDEX IF NOT EXISTS idx_legal_citations_target ON legal_citations(normalized_target);

-- ============================================
-- 3. case_link_category enum
-- ============================================
DO $$ BEGIN
  CREATE TYPE case_link_category AS ENUM (
    'charged_under',
    'cited_authority',
    'defense_authority',
    'court_ruling',
    'related_regulation',
    'constitutional_basis',
    'sentencing_guideline'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- 4. case_library_links table
-- ============================================
CREATE TABLE IF NOT EXISTS case_library_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  document_id   UUID          REFERENCES library_documents(id) ON DELETE CASCADE,
  node_id       UUID          REFERENCES legal_nodes(id)       ON DELETE SET NULL,
  category      case_link_category NOT NULL DEFAULT 'cited_authority',
  relevance_score REAL,
  citation_text TEXT,
  notes         TEXT,
  added_by      UUID,
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS case_lib_links_case_idx ON case_library_links(case_id);
CREATE INDEX IF NOT EXISTS case_lib_links_doc_idx  ON case_library_links(document_id);
CREATE INDEX IF NOT EXISTS case_lib_links_node_idx ON case_library_links(node_id);

-- ============================================
-- 5. Add parent_id to jurisdictions if missing
-- ============================================
DO $$ BEGIN
  ALTER TABLE jurisdictions ADD COLUMN IF NOT EXISTS parent_id BIGINT;
EXCEPTION WHEN others THEN null;
END $$;