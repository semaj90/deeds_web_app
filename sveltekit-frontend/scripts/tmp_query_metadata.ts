import { db } from '../src/lib/server/db/client.js';
import { sql } from 'drizzle-orm';

async function run() {
  const res = await db.execute(sql`
    SELECT metadata 
    FROM documents_atlas_entries 
    LIMIT 1;
  `);
  console.log(JSON.stringify(res.rows || res, null, 2));
  process.exit(0);
}
run().catch(console.error);
