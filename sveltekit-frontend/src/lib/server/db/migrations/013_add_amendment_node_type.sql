-- Add 'amendment' to legal_node_type enum (safe, non-destructive)
-- Required for US Constitution Amendments I-XXVII
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'amendment'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'legal_node_type')
  ) THEN
    ALTER TYPE legal_node_type ADD VALUE 'amendment' AFTER 'article';
  END IF;
END $$;
