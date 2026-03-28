-- Convert citations.is_key_authority to boolean if stored as character type -- Safe idempotent migration DO $$ DECLARE
col_type TEXT; BEGIN SELECT data_type INTO col_type FROM information_schema.columns WHERE table_name='citations' AND
column_name='is_key_authority'; IF col_type IS NULL THEN RAISE NOTICE 'Column is_key_authority missing - nothing to do';
ELSIF col_type IN ('boolean') THEN RAISE NOTICE 'Column is_key_authority already boolean'; ELSE -- Add temp column ALTER
TABLE citations ADD COLUMN is_key_authority_bool boolean; -- Copy/convert values (t/true/1/y => true) UPDATE citations
SET is_key_authority_bool = CASE WHEN LOWER(COALESCE(is_key_authority::text,'')) IN ('t','true','1','y','yes') THEN true
ELSE false END; -- Drop old column & rename ALTER TABLE citations DROP COLUMN is_key_authority; ALTER TABLE citations
RENAME COLUMN is_key_authority_bool TO is_key_authority; RAISE NOTICE 'Converted citations.is_key_authority to boolean';
END IF; END$$;
