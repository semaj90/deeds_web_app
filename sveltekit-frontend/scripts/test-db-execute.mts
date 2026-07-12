import { db } from '../src/lib/server/db/client.js';
import { sql } from 'drizzle-orm';

const result = await db.execute(
  sql`
    SELECT id, query FROM phase2f_ground_truth LIMIT 1
  `
);

console.log('Result type:', typeof result);
console.log('Is Array:', Array.isArray(result));
console.log('Keys:', Object.keys(result || {}));
console.log('Result:', result);

process.exit(0);
