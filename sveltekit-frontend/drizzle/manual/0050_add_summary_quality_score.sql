-- Add summary_quality_score column to codebase_chunk_index
-- Stage 2: GPU Quality Reranking integration

ALTER TABLE codebase_chunk_index
ADD COLUMN IF NOT EXISTS summary_quality_score real DEFAULT 0;

-- Index for filtering low-quality summaries (<0.6)
CREATE INDEX IF NOT EXISTS idx_codebase_chunk_low_quality
ON codebase_chunk_index (summary_quality_score)
WHERE summary_quality_score IS NOT NULL AND summary_quality_score > 0;

-- Index for sorting by quality (highest first)
CREATE INDEX IF NOT EXISTS idx_codebase_chunk_quality_desc
ON codebase_chunk_index (summary_quality_score DESC NULLS LAST)
WHERE summary IS NOT NULL;
