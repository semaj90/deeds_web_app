-- Add missing timestamp columns
DO $$ BEGIN
    BEGIN
        ALTER TABLE evidence ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;

    BEGIN
        ALTER TABLE evidence ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
END $$;
