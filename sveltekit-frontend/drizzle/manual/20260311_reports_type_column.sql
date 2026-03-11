-- Add type column to reports table
-- Stores report type (e.g. 'analysis', 'summary', 'legal_memo', 'custom')
-- Previously stored only in metadata.reportType jsonb field
ALTER TABLE reports ADD COLUMN IF NOT EXISTS type varchar(64);
