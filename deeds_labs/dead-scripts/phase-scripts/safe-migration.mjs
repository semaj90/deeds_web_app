// Safe additive migration script - DOES NOT DROP anything
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db');

async function runSafeMigration() {
    console.log('🔧 Running safe additive migrations...');

    // 1. Add user_id to evidence table if not exists
    try {
        await sql`ALTER TABLE evidence ADD COLUMN IF NOT EXISTS user_id uuid`;
        console.log('✅ evidence.user_id column ensured');
    } catch (e) {
        console.log('⚠️ evidence.user_id:', e.message);
    }

    // 2. Create audit_log table if not exists
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS audit_log (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id uuid NOT NULL,
                action varchar(100) NOT NULL,
                resource_type varchar(100) NOT NULL,
                resource_id varchar(255) NOT NULL,
                details jsonb,
                created_at timestamptz DEFAULT now() NOT NULL
            )
        `;
        console.log('✅ audit_log table ensured');
    } catch (e) {
        console.log('⚠️ audit_log:', e.message);
    }

    // 3. Create criminals table if not exists (with minimal columns)
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS criminals (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                first_name varchar(100) NOT NULL,
                last_name varchar(100) NOT NULL,
                middle_name varchar(100),
                aliases jsonb DEFAULT '[]'::jsonb NOT NULL,
                date_of_birth timestamptz,
                threat_level varchar(20) DEFAULT 'low' NOT NULL,
                status varchar(20) DEFAULT 'active' NOT NULL,
                notes text,
                created_by uuid,
                created_at timestamptz DEFAULT now() NOT NULL,
                updated_at timestamptz DEFAULT now() NOT NULL
            )
        `;
        console.log('✅ criminals table ensured');
    } catch (e) {
        console.log('⚠️ criminals:', e.message);
    }

    await sql.end();
    console.log('✅ Safe migration complete!');
}

runSafeMigration().catch(console.error);
