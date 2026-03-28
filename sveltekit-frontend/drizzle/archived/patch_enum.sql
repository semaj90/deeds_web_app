-- Patch evidence_type enum with new values
-- Needed because legacy schema has different values
DO $$ BEGIN
    ALTER TYPE evidence_type ADD VALUE IF NOT EXISTS 'video';
    ALTER TYPE evidence_type ADD VALUE IF NOT EXISTS 'document';
    ALTER TYPE evidence_type ADD VALUE IF NOT EXISTS 'photo';
    ALTER TYPE evidence_type ADD VALUE IF NOT EXISTS 'note';
    ALTER TYPE evidence_type ADD VALUE IF NOT EXISTS 'audio';
    ALTER TYPE evidence_type ADD VALUE IF NOT EXISTS 'forensic';
EXCEPTION
    WHEN duplicate_object THEN null; -- Standard catch
END $$;
