import 'dotenv/config';
import { db } from '../src/lib/server/db/client.js';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Listing database users...');
    try {
        const result = await db.execute(sql`SELECT usename, usesuper, usecreatedb FROM pg_catalog.pg_user`);
        console.table(result.rows);
    } catch (e) {
        console.error('DB Error:', e);
    }
    process.exit(0);
}

main();
