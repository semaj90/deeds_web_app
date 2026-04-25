
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

        const res = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);

        console.log("=== DB Tables ===");
        console.info(res.rows.map(r => r.table_name).join('\n'));
        console.log(`Total Tables: ${res.rows.length}`);

        const enums = await client.query(`
            SELECT t.typname as enum_name
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            GROUP BY t.typname
            ORDER BY t.typname;
        `);
        console.log("\n=== Enums ===");
        console.info(enums.rows.map(r => r.enum_name).join('\n'));

    } catch (err) {
        console.error("Error:", err);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
