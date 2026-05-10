-- Evidence audit log table (chain of custody compliance)
-- Mirrors evidenceAuditLog in schema-postgres.ts.
-- Run: psql "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db" -f drizzle/manual/20260510_evidence_audit_log.sql

CREATE TABLE IF NOT EXISTS "evidence_audit_log" (
    "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "evidence_id"  UUID NOT NULL REFERENCES "evidence"("id") ON DELETE CASCADE,
    "user_id"      UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "action"       VARCHAR(50) NOT NULL,
    "changes"      JSONB,
    "ip_address"   VARCHAR(45),
    "user_agent"   TEXT,
    "timestamp"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "evidence_audit_log_evidence_id_idx" ON "evidence_audit_log" ("evidence_id");
CREATE INDEX IF NOT EXISTS "evidence_audit_log_user_id_idx"     ON "evidence_audit_log" ("user_id");
CREATE INDEX IF NOT EXISTS "evidence_audit_log_timestamp_idx"   ON "evidence_audit_log" ("timestamp");
CREATE INDEX IF NOT EXISTS "evidence_audit_log_action_idx"      ON "evidence_audit_log" ("action");
