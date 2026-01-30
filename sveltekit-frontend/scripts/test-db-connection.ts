import 'dotenv/config';
import { db } from '../src/lib/server/db/client';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Testing DB connection...');
    try {
        const result = await db.execute(sql`SELECT current_user, current_database()`);
        console.log('Success!', result.rows[0]);
    } catch (e) {
        console.error('DB Error:', e);
    }
    process.exit(0);
}

main();
