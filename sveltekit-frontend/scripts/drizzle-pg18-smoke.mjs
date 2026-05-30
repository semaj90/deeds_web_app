import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';

const pool = new pg.Pool({
  host: 'localhost',
  port: 5433,
  user: 'legal_admin',
  password: 'test123',
  database: 'legal_ai_pg18_test',
});
const db = drizzle(pool);

console.log('Test 1: Raw SQL via Drizzle');
const v = await db.execute(sql`SELECT version()`);
console.log('  ✅', v.rows[0].version);

console.log('Test 2: pgvector via Drizzle');
const ev = await db.execute(sql`SELECT extversion FROM pg_extension WHERE extname='vector'`);
console.log('  ✅ pgvector', ev.rows[0].extversion);

console.log('Test 3: HNSW query via Drizzle');
const top = await db.execute(sql`
  SELECT id, name FROM smoke_vec
  ORDER BY embedding <=> (SELECT embedding FROM smoke_vec WHERE id=1)
  LIMIT 3
`);
console.log('  ✅ Top 3:', top.rows.map(r => r.name).join(', '));

console.log('Test 4: pg_trgm similarity');
const sim = await db.execute(sql`
  SELECT name, similarity(name, 'item_5') AS sim FROM smoke_vec
  WHERE name % 'item_5' ORDER BY sim DESC LIMIT 3
`);
console.log('  ✅ pg_trgm matches:', sim.rows.length);

await pool.end();
console.log('\n✅ Drizzle ORM 0.44 + node-postgres + pg18 + pgvector 0.8.2: ALL PASS');
