
import pg from 'pg';
import dotenv from 'dotenv';
import { table } from 'console';

dotenv.config();

// Default to 5434 as per .env and docker setup, allow override
const DEFAULT_CONN_STRING = 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const connString = process.env.DATABASE_URL || DEFAULT_CONN_STRING;

const pool = new pg.Pool({
    connectionString: connString,
});

async function run() {
    const client = await pool.connect();
    try {
        console.log(`🔌 Connected to database at ${connString.split('@')[1]}`);

        // --- 1. Tables & Row Counts ---
        console.log("\n📦 TABLES & ROW COUNTS");
        console.log("----------------------------------------");
        const resTables = await client.query(`
            SELECT
                t.table_name,
                (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name) as cols
            FROM information_schema.tables t
            WHERE t.table_schema = 'public'
            ORDER BY t.table_name;
        `);

        // Fetch row counts (approximate for speed or exact) - let's do exact for safety unless massive
        // For small DB likely fine.
        const tableStats = [];
        for (const row of resTables.rows) {
            try {
                const countRes = await client.query(`SELECT count(*) as c FROM "${row.table_name}"`);
                tableStats.push({
                    Table: row.table_name,
                    Columns: parseInt(row.cols),
                    Rows: parseInt(countRes.rows[0].c)
                });
            } catch (e) {
                tableStats.push({ Table: row.table_name, Columns: row.cols, Rows: 'Error' });
            }
        }
        table(tableStats);

        // --- 2. Enums ---
        console.log("\n🔠 ENUMS");
        console.log("----------------------------------------");
        const resEnums = await client.query(`
            SELECT t.typname as enum_name, array_agg(e.enumlabel ORDER BY e.enumsortorder) as values
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            GROUP BY t.typname
            ORDER BY t.typname;
        `);
        resEnums.rows.forEach(r => {
            console.log(`- ${r.enum_name}: [${(r.values || []).join(', ')}]`);
        });

        // --- 3. Key Table Details (cases, warden_evidence) ---
        const specificTables = ['cases', 'warden_evidence', 'audit_log'];
        console.log("\n🔍 DETAILED SCHEMA (Selected Tables)");

        for (const tbl of specificTables) {
            console.log(`\nTable: "${tbl}"`);
            const resCols = await client.query(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = $1
                ORDER BY ordinal_position
            `, [tbl]);

            if (resCols.rowCount === 0) {
                console.log("  (Table not found)");
                continue;
            }

            // Simple ASCII table for columns
            const colData = resCols.rows.map(c => ({
                Name: c.column_name,
                Type: c.data_type,
                Null: c.is_nullable,
                Default: c.column_default ? (c.column_default.length > 20 ? c.column_default.substring(0,20)+'...' : c.column_default) : 'null'
            }));
            table(colData);
        }

    } catch (err) {
        console.error("❌ Error running inspection:", err);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
