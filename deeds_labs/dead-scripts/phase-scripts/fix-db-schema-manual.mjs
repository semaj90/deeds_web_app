
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Force port 5432 if not specified or incorrect in env for this specific fix
const connString = process.env.DATABASE_URL?.replace(':5434', ':5432') || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';

const pool = new pg.Pool({
    connectionString: connString,
});

async function run() {
    const client = await pool.connect();
    try {
        console.log(`Connected to ${connString}`);

        // 1. Check if 'cases' table exists
        const resTable = await client.query(`SELECT to_regclass('public.cases') as exists;`);
        if (!resTable.rows[0].exists) {
            console.error("❌ Table 'cases' does not exist!");
            return;
        }

        // 2. Add 'user_id' if missing
        console.log("Checking 'user_id' column...");
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='user_id') THEN
                    ALTER TABLE "cases" ADD COLUMN "user_id" uuid;
                    RAISE NOTICE 'Added user_id column';
                ELSE
                    RAISE NOTICE 'user_id already exists';
                END IF;
            END $$;
        `);

        // 3. Add 'assigned_attorney' if missing
        console.log("Checking 'assigned_attorney' column...");
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='assigned_attorney') THEN
                    ALTER TABLE "cases" ADD COLUMN "assigned_attorney" uuid;
                    RAISE NOTICE 'Added assigned_attorney column';
                ELSE
                    RAISE NOTICE 'assigned_attorney already exists';
                END IF;
            END $$;
        `);

        // 4. Add FK for user_id (safely)
        console.log("Checking FK for user_id...");
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_user_id_users_id_fk') THEN
                    ALTER TABLE "cases" ADD CONSTRAINT "cases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
                    RAISE NOTICE 'Added FK cases_user_id_users_id_fk';
                END IF;
            END $$;
        `);

        console.log("✅ Schema alignment complete for 'cases' table.");

        // Optional: Verify columns now exist
        const cols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='cases';`);
        console.log("Current columns in 'cases':", cols.rows.map(r => r.column_name).filter(c => c === 'user_id' || c === 'assigned_attorney'));

    } catch (err) {
        console.error("❌ Error running schema fix:", err);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
