
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connString = process.env.DATABASE_URL?.replace(':5434', ':5432') || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';

const pool = new pg.Pool({
    connectionString: connString,
});

async function run() {
    const client = await pool.connect();
    try {
        console.log(`Connected to ${connString}`);

        // Create audit_log table
        console.log("Creating 'audit_log' table...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS "audit_log" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "user_id" uuid NOT NULL,
                "action" varchar(100) NOT NULL,
                "resource_type" varchar(100) NOT NULL,
                "resource_id" varchar(255) NOT NULL,
                "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
                "created_at" timestamp with time zone DEFAULT now() NOT NULL
            );
        `);
        console.log("✅ 'audit_log' table created/verified.");

        // Check case_activities as well, just in case
        console.log("Checking 'case_activities'...");
        const res = await client.query(`SELECT to_regclass('public.case_activities') as exists;`);
        if (!res.rows[0].exists) {
            console.log("Creating 'case_activities' table...");
             // Based on likely schema or db:generate output hint
             // db:generate said "case_activities 10 columns 0 indexes 0 fks"
             // I recall seeing it in schema-postgres.ts but didn't read definition.
             // I will skip creating it blindly to avoid divergence.
             console.log("⚠️ 'case_activities' is MISSING. Please check schema.");
        } else {
             console.log("✅ 'case_activities' exists.");
        }

    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
