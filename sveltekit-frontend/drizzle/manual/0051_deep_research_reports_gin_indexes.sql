-- Deep Research Reports GIN indexes for JSONB + Full-Text Search
-- These are created manually (not via Drizzle) because .using() is not supported in drizzle v0.44

-- GIN index for metadata JSONB search
CREATE INDEX IF NOT EXISTS idx_deep_research_reports_metadata_gin
ON deep_research_reports
USING gin (metadata);

-- Full-text search index on markdown_content
CREATE INDEX IF NOT EXISTS idx_deep_research_reports_markdown_fts
ON deep_research_reports
USING gin (to_tsvector('english', COALESCE(markdown_content, '')));

-- GIN index for citations JSONB
CREATE INDEX IF NOT EXISTS idx_deep_research_reports_citations_gin
ON deep_research_reports
USING gin (citations);

-- GIN index for recommendations JSONB
CREATE INDEX IF NOT EXISTS idx_deep_research_reports_recommendations_gin
ON deep_research_reports
USING gin (recommendations);
