-- Court Opinions table
-- Stores court opinions from external datasets (CourtListener, CaseHOLD,
-- HuggingFace pile-of-law, DOJ press releases, etc.)
-- jurisdiction_level: 'local' | 'state' | 'federal' | 'supreme'

CREATE TABLE IF NOT EXISTS court_opinions (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title              TEXT        NOT NULL,
  citation           VARCHAR(400),
  docket_number      VARCHAR(150),
  court              VARCHAR(250),
  -- Jurisdiction classification
  jurisdiction_level VARCHAR(20) CHECK (jurisdiction_level IN ('local','state','federal','supreme','international')),
  jurisdiction_state VARCHAR(80),        -- 'California', 'New York', null for federal
  circuit            VARCHAR(80),        -- '9th Circuit', 'S.D.N.Y.', etc.
  -- Content
  case_date          DATE,
  judges             TEXT,               -- comma-separated names or JSON string
  opinion_text       TEXT,               -- full opinion text (may be large)
  summary            TEXT,               -- AI-generated or excerpted summary
  holding            TEXT,               -- the actual holding / ruling
  headnotes          TEXT[],             -- key headnotes as array
  -- Classification
  practice_area      VARCHAR(100),       -- 'criminal', 'civil', 'constitutional', etc.
  outcome            VARCHAR(60),        -- 'affirmed', 'reversed', 'remanded', 'dismissed'
  -- Source provenance
  source             VARCHAR(100),       -- 'courtlistener', 'casehold', 'cap', 'huggingface', 'doj', 'manual'
  source_url         TEXT,
  source_id          VARCHAR(200),       -- external dataset ID (CourtListener cluster ID, etc.)
  -- Vector embedding for semantic search
  embedding          VECTOR(768),
  -- Audit
  metadata           JSONB DEFAULT '{}'::jsonb,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for filtering by jurisdiction
CREATE INDEX IF NOT EXISTS court_opinions_jurisdiction_level_idx
  ON court_opinions (jurisdiction_level);

CREATE INDEX IF NOT EXISTS court_opinions_jurisdiction_state_idx
  ON court_opinions (jurisdiction_state)
  WHERE jurisdiction_state IS NOT NULL;

CREATE INDEX IF NOT EXISTS court_opinions_circuit_idx
  ON court_opinions (circuit)
  WHERE circuit IS NOT NULL;

CREATE INDEX IF NOT EXISTS court_opinions_practice_area_idx
  ON court_opinions (practice_area)
  WHERE practice_area IS NOT NULL;

CREATE INDEX IF NOT EXISTS court_opinions_case_date_idx
  ON court_opinions (case_date DESC)
  WHERE case_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS court_opinions_source_idx
  ON court_opinions (source);

-- IVFFlat vector index for semantic search (pgvector)
-- Run AFTER loading at least a few thousand rows for optimal list tuning
CREATE INDEX IF NOT EXISTS court_opinions_embedding_idx
  ON court_opinions USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- FTS index on title + summary + holding
CREATE INDEX IF NOT EXISTS court_opinions_fts_idx
  ON court_opinions USING gin(
    to_tsvector('english',
      coalesce(title,'') || ' ' ||
      coalesce(summary,'') || ' ' ||
      coalesce(holding,'')
    )
  );

COMMENT ON TABLE court_opinions IS
  'Court opinions ingested from external datasets (CourtListener, CaseHOLD, HuggingFace). '
  'jurisdiction_level classifies local/state/federal/supreme. '
  'Embedding enables semantic similarity search via pgvector.';
