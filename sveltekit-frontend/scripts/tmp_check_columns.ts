import { db } from '../src/lib/server/db/client.js';
import { sql } from 'drizzle-orm';

async function run() {
  const res = await db.execute(sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'documents_atlas_entries' 
    ORDER BY ordinal_position;
  `);
  console.log(JSON.stringify(res.rows || res, null, 2));
  process.exit(0);
}
run().catch(console.error);
