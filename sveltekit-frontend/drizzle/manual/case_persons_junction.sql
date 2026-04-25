-- Adds case_persons junction table linking cases ↔ persons_of_interest.
-- This table was defined in schema/persons.ts but was missing from the
-- Drizzle migration barrel (schema.ts), so it was never auto-generated.
-- Added to schema.ts barrel in April 2026 schema consolidation.

CREATE TABLE IF NOT EXISTS "case_persons" (
    "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "case_id"           uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
    "person_id"         uuid NOT NULL REFERENCES "persons_of_interest"("id") ON DELETE CASCADE,
    "relationship_type" varchar(64),
    "is_primary"        varchar(5) DEFAULT 'false',
    "created_at"        timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "case_persons_case_id_idx" ON "case_persons"("case_id");
CREATE INDEX IF NOT EXISTS "case_persons_person_id_idx" ON "case_persons"("person_id");
CREATE UNIQUE INDEX IF NOT EXISTS "case_persons_unique_idx" ON "case_persons"("case_id", "person_id");