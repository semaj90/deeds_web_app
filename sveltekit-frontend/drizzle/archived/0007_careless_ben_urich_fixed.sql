-- 0007_careless_ben_urich.sql
-- Fix ai_reports.created_by type and add FK to users.id (integer)

-- 1) Drop any old FK if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints
    WHERE  constraint_type = 'FOREIGN KEY'
      AND  table_name = 'ai_reports'
      AND  constraint_name IN (
        'ai_reports_created_by_users_id_fk',
        'ai_reports_created_by_users_id_fkey'
      )
  ) THEN
    ALTER TABLE "ai_reports"
      DROP CONSTRAINT IF EXISTS "ai_reports_created_by_users_id_fk",
      DROP CONSTRAINT IF EXISTS "ai_reports_created_by_users_id_fkey";
  END IF;
END $$;

-- 2) Make sure created_by is an integer, not uuid
DO $$
BEGIN
  -- If created_by exists and is uuid, drop it
  IF EXISTS (
    SELECT 1
    FROM   information_schema.columns
    WHERE  table_name = 'ai_reports'
      AND  column_name = 'created_by'
      AND  data_type = 'uuid'
  ) THEN
    ALTER TABLE "ai_reports" DROP COLUMN "created_by";
  END IF;

  -- If created_by does not exist, add it as integer
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.columns
    WHERE  table_name = 'ai_reports'
      AND  column_name = 'created_by'
  ) THEN
    ALTER TABLE "ai_reports"
      ADD COLUMN "created_by" integer;
  END IF;
END $$;

-- 3) Add the FK from ai_reports.created_by -> users.id
DO $$
BEGIN
  ALTER TABLE "ai_reports"
    ADD CONSTRAINT "ai_reports_created_by_users_id_fk"
    FOREIGN KEY ("created_by")
      REFERENCES "public"."users"("id")
      ON DELETE NO ACTION
      ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;