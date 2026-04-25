import pg from 'pg';
const { Client } = pg;
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function check() {
    try {
        await client.connect();
        const res = await client.query(`
            SELECT t.typname, e.enumlabel
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            WHERE t.typname = 'evidence_relationship_type'
        `);
        console.log('Values:', res.rows.map(r => `'${r.enumlabel}'`).join(', '));
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
check();
