
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Default to 5434 as per .env and docker setup, but allow override
const DEFAULT_CONN_STRING = 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const connString = process.env.DATABASE_URL || DEFAULT_CONN_STRING;

const pool = new pg.Pool({
    connectionString: connString,
});

async function run() {
    const client = await pool.connect();
    try {
        console.log(`🔌 Connected to database at ${connString.split('@')[1]}`); // Hide credentials

        // --- 1. Fix 'cases' Table ---
        console.log("\n📦 Checking 'cases' table schema...");

        // 1.1 Check 'user_id' column
        const resUserId = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='user_id'`);
        if (resUserId.rowCount === 0) {
            console.log("  ⚠️ 'user_id' MISSING. Adding...");
            await client.query(`ALTER TABLE "cases" ADD COLUMN "user_id" uuid;`);
            console.log("  ✅ Added 'user_id'.");
        } else {
            console.log("  ✅ 'user_id' exists.");
        }

        // 1.2 Check 'assigned_attorney' column
        const resAssigned = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='assigned_attorney'`);
        if (resAssigned.rowCount === 0) {
            console.log("  ⚠️ 'assigned_attorney' MISSING. Adding...");
            await client.query(`ALTER TABLE "cases" ADD COLUMN "assigned_attorney" uuid;`);
            console.log("  ✅ Added 'assigned_attorney'.");
        } else {
            console.log("  ✅ 'assigned_attorney' exists.");
        }

        // 1.3 Add FK safely
        const resFk = await client.query(`SELECT 1 FROM pg_constraint WHERE conname = 'cases_user_id_users_id_fk'`);
        if (resFk.rowCount === 0) {
            console.log("  ⚠️ FK 'cases_user_id_users_id_fk' MISSING. Adding...");
            await client.query(`ALTER TABLE "cases" ADD CONSTRAINT "cases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;`);
            console.log("  ✅ Added FK.");
        } else {
            console.log("  ✅ FK 'cases_user_id_users_id_fk' exists.");
        }


        // --- 2. Fix 'audit_log' Table ---
        console.log("\n📜 Checking 'audit_log' table...");
        const resAudit = await client.query(`SELECT to_regclass('public.audit_log') as exists`);
        if (!resAudit.rows[0].exists) {
            console.log("  ⚠️ 'audit_log' MISSING. Creating...");
            await client.query(`
                CREATE TABLE "audit_log" (
                    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                    "user_id" uuid NOT NULL,
                    "action" varchar(100) NOT NULL,
                    "resource_type" varchar(100) NOT NULL,
                    "resource_id" varchar(255) NOT NULL,
                    "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
                    "created_at" timestamp with time zone DEFAULT now() NOT NULL
                );
            `);
            console.log("  ✅ Created 'audit_log'.");
        } else {
            console.log("  ✅ 'audit_log' table exists.");
        }


        // --- 3. Fix 'warden' Tables ---
        console.log("\n🛡️ Checking Warden tables...");

        // Enums
        const enums = ['audit_table', 'relation_type'];
        for (const enumName of enums) {
            const resEnum = await client.query(`SELECT 1 FROM pg_type WHERE typname = $1`, [enumName]);
            if (resEnum.rowCount === 0) {
                console.log(`  ➕ Creating enum '${enumName}'...`);
                // Create logic here is simplified, copying checks from script
                if (enumName === 'audit_table') {
                    await client.query(`CREATE TYPE "public"."audit_table" AS ENUM('Evidence', 'Tag', 'EvidenceTag', 'RAGIndex');`);
                } else if (enumName === 'relation_type') {
                    await client.query(`CREATE TYPE "public"."relation_type" AS ENUM('supports', 'contradicts', 'same_person', 'timeline', 'chain_of_custody', 'corroborates', 'alibi', 'motive', 'opportunity', 'means', 'witness_statement', 'physical_evidence', 'digital_evidence', 'circumstantial', 'direct_evidence', 'hearsay', 'privileged', 'inadmissible');`);
                }
            } else {
                // console.log(`  ✅ Enum '${enumName}' exists.`);
            }
        }

        // Tables list & simple creation if not exists
        // (Using the exact schema from fix-missing-warden-tables)
        const tables = [
            'warden_users', 'warden_cases', 'warden_evidence', 'warden_audit_log',
            'warden_chunks', 'warden_citation_graph', 'warden_citations',
            'warden_evidence_summaries', 'warden_file_locks', 'warden_hmm_topics',
            'warden_holdings', 'warden_ocr'
        ];

        // Just run the giant SQL block with IF NOT EXISTS, it's safer and easier than checking each
        const wardenSql = `
            CREATE TABLE IF NOT EXISTS "warden_users" (
                "id" uuid PRIMARY KEY NOT NULL,
                "email" varchar(255) NOT NULL,
                "password_hash" varchar(255) NOT NULL,
                "created_at" timestamp DEFAULT now(),
                CONSTRAINT "warden_users_email_unique" UNIQUE("email")
            );

            CREATE TABLE IF NOT EXISTS "warden_cases" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "prosecutor_id" uuid NOT NULL REFERENCES "warden_users"("id"),
                "title" varchar(512) DEFAULT 'Untitled Case',
                "description" text,
                "case_number" varchar(255),
                "created_at" timestamp DEFAULT now(),
                "updated_at" timestamp DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS "warden_evidence" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "case_id" uuid NOT NULL REFERENCES "warden_cases"("id"),
                "prosecutor_id" uuid NOT NULL REFERENCES "warden_users"("id"),
                "file_name" varchar(512) NOT NULL,
                "sha256" varchar(64) NOT NULL,
                "mime_type" varchar(100),
                "file_size" integer,
                "minio_path" varchar(512) NOT NULL,
                "minio_bucket" varchar(100) NOT NULL,
                "document_type" varchar(100),
                "document_subtype" varchar(100),
                "inference_confidence" real,
                "status" varchar(50) DEFAULT 'pending',
                "reviewed_at" timestamp,
                "reviewed_by" uuid REFERENCES "warden_users"("id"),
                "rejection_reason" text,
                "metadata" jsonb,
                "prev_sha256" varchar(64),
                "created_at" timestamp DEFAULT now(),
                CONSTRAINT "warden_evidence_sha256_unique" UNIQUE("sha256")
            );

            CREATE TABLE IF NOT EXISTS "warden_audit_log" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "prosecutor_id" uuid NOT NULL REFERENCES "warden_users"("id"),
                "case_id" uuid REFERENCES "warden_cases"("id"),
                "evidence_id" uuid REFERENCES "warden_evidence"("id"),
                "action" varchar(50) NOT NULL,
                "details" jsonb,
                "sha256" varchar(64),
                "timestamp" timestamp DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS "warden_chunks" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "evidence_id" uuid NOT NULL REFERENCES "warden_evidence"("id"),
                "case_id" uuid NOT NULL REFERENCES "warden_cases"("id"),
                "seq" integer,
                "section" varchar(100),
                "text" text NOT NULL,
                "token_length" integer,
                "embedding" vector(768),
                "latent128" vector(128),
                "created_at" timestamp DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS "warden_citation_graph" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "case_id" varchar(128) NOT NULL,
                "cited_case_id" varchar(128) NOT NULL,
                "weight" real DEFAULT 1,
                "source" varchar(64) DEFAULT 'ai',
                "approved" boolean DEFAULT false,
                "approved_by" uuid REFERENCES "warden_users"("id"),
                "approved_at" timestamp,
                "created_at" timestamp DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS "warden_citations" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "evidence_id" uuid NOT NULL REFERENCES "warden_evidence"("id"),
                "case_id" uuid NOT NULL REFERENCES "warden_cases"("id"),
                "chunk_id" uuid REFERENCES "warden_chunks"("id"),
                "type" varchar(50),
                "citation_text" text,
                "citation_normalized" varchar(255),
                "page" integer,
                "created_at" timestamp DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS "warden_evidence_summaries" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "evidence_id" uuid NOT NULL REFERENCES "warden_evidence"("id"),
                "holding" text NOT NULL,
                "reasoning" text,
                "citations" jsonb,
                "keywords" text[],
                "suggested_at" timestamp DEFAULT now(),
                "approved" boolean DEFAULT false,
                "approved_by" uuid REFERENCES "warden_users"("id"),
                "approved_at" timestamp,
                "created_at" timestamp DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS "warden_file_locks" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "sha256" varchar(64) NOT NULL,
                "locked_at" timestamp DEFAULT now(),
                "expires_at" timestamp,
                "locked_by" uuid NOT NULL REFERENCES "warden_users"("id"),
                CONSTRAINT "warden_file_locks_sha256_unique" UNIQUE("sha256")
            );

            CREATE TABLE IF NOT EXISTS "warden_hmm_topics" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "chunk_id" uuid NOT NULL REFERENCES "warden_chunks"("id"),
                "topic_label" varchar(100),
                "probability" real,
                "sequence" integer,
                "created_at" timestamp DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS "warden_holdings" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "case_id" uuid NOT NULL REFERENCES "warden_cases"("id"),
                "evidence_id" uuid NOT NULL REFERENCES "warden_evidence"("id"),
                "chunk_id" uuid REFERENCES "warden_chunks"("id"),
                "issue" text,
                "holding" text NOT NULL,
                "reasoning" text,
                "references" jsonb,
                "confidence" real,
                "created_at" timestamp DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS "warden_ocr" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "evidence_id" uuid NOT NULL REFERENCES "warden_evidence"("id"),
                "raw_text" text,
                "cleaned_text" text,
                "confidence" real,
                "page_count" integer,
                "extracted_at" timestamp DEFAULT now()
            );
        `;

        await client.query(wardenSql);
        console.log("  ✅ Ensured Warden tables exist (idempotent).");

        // Create Indices
        const indices = [
            `CREATE INDEX IF NOT EXISTS "warden_audit_log_prosecutor_id_idx" ON "warden_audit_log" ("prosecutor_id")`,
            `CREATE INDEX IF NOT EXISTS "warden_audit_log_case_id_idx" ON "warden_audit_log" ("case_id")`,
            `CREATE INDEX IF NOT EXISTS "warden_audit_log_action_idx" ON "warden_audit_log" ("action")`,
            `CREATE INDEX IF NOT EXISTS "warden_chunks_evidence_id_idx" ON "warden_chunks" ("evidence_id")`,
            `CREATE INDEX IF NOT EXISTS "warden_chunks_case_id_idx" ON "warden_chunks" ("case_id")`,
            `CREATE INDEX IF NOT EXISTS "warden_citation_graph_case_id_idx" ON "warden_citation_graph" ("case_id")`,
            `CREATE INDEX IF NOT EXISTS "warden_citation_graph_cited_case_id_idx" ON "warden_citation_graph" ("cited_case_id")`,
            `CREATE INDEX IF NOT EXISTS "warden_citations_evidence_id_idx" ON "warden_citations" ("evidence_id")`,
            `CREATE INDEX IF NOT EXISTS "warden_citations_case_id_idx" ON "warden_citations" ("case_id")`,
            `CREATE INDEX IF NOT EXISTS "warden_evidence_case_id_idx" ON "warden_evidence" ("case_id")`,
            `CREATE INDEX IF NOT EXISTS "warden_evidence_sha256_idx" ON "warden_evidence" ("sha256")`,
            `CREATE INDEX IF NOT EXISTS "warden_evidence_status_idx" ON "warden_evidence" ("status")`
        ];

        for (const idx of indices) {
            await client.query(idx);
        }
        console.log("  ✅ Ensured Warden indices exist.");

        console.log("\n✨ Database Repair Complete.");

    } catch (err) {
        console.error("❌ Error running schema fix:", err);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
