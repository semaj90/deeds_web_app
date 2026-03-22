DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'case_link_category') THEN
    BEGIN
      ALTER TYPE case_link_category ADD VALUE IF NOT EXISTS 'glossary_concept';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'case_link_type') THEN
    BEGIN
      ALTER TYPE case_link_type ADD VALUE IF NOT EXISTS 'glossary_concept';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;