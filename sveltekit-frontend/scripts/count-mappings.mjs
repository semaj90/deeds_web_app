import { db } from '../src/lib/server/db/client.js';
import { sql } from 'drizzle-orm';

async function main() {
  const result = await db.execute(sql`SELECT count(*) as count, kind FROM enhanced_graph_mappings GROUP BY kind`);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main();
