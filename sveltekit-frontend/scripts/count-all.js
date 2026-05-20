import pg from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

async function main() {
    console.log("=== Counting Postgres rows ===");
    const pool = new pg.Pool({ connectionString: DATABASE_URL });
    const tables = [
        'statutes',
        'statute_chunks',
        'library_documents',
        'legal_nodes',
        'legal_chunks',
        'legal_definitions'
    ];

    for (const table of tables) {
        try {
            const res = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
            console.log(`Postgres table '${table}': ${res.rows[0].count}`);
        } catch (err) {
            console.log(`Postgres table '${table}': error: ${err.message}`);
        }
    }
    await pool.end();

    console.log("\n=== Counting Qdrant collections ===");
    try {
        const listRes = await fetch(`${QDRANT_URL}/collections`);
        if (!listRes.ok) {
            console.error(`Failed to fetch collections list from Qdrant: HTTP ${listRes.status}`);
        } else {
            const listData = await listRes.json();
            const collections = listData.result?.collections || [];
            for (const col of collections) {
                try {
                    const colRes = await fetch(`${QDRANT_URL}/collections/${col.name}`);
                    const colData = await colRes.json();
                    console.log(`Qdrant collection '${col.name}': ${colData.result?.points_count} points`);
                } catch (err) {
                    console.log(`Qdrant collection '${col.name}': error: ${err.message}`);
                }
            }
        }
    } catch (err) {
        console.error(`Qdrant error: ${err.message}`);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
