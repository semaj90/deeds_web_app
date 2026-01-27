
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

        // Check audit_logs columns
        const res = await client.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'audit_logs';
        `);

        if (res.rows.length > 0) {
            console.log("=== audit_logs columns ===");
            console.table(res.rows);
        } else {
            console.log("Table 'audit_logs' not found.");
        }

        // Check if audit_log exists
        const res2 = await client.query(`SELECT to_regclass('public.audit_log') as exists;`);
        console.log("public.audit_log exists:", res2.rows[0].exists);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
