ALTER TABLE reports
ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'custom';

UPDATE reports
SET type = COALESCE(NULLIF(metadata->>'reportType', ''), NULLIF(metadata->>'type', ''), 'custom')
WHERE type IS NULL
   OR type = ''
   OR type = 'custom';