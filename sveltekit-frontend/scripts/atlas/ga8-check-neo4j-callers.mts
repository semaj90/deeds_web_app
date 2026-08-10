import 'dotenv/config';
import { getNeo4jDriver } from '../../src/lib/server/neo4j-driver.js';

async function main() {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const raw = await session.run(`MATCH (a:CodebaseFile)-[:IMPORTS]->(b:CodebaseFile) RETURN a, b LIMIT 2`);
    for (const r of raw.records) {
      console.log('a props:', r.get('a').properties);
      console.log('b props:', r.get('b').properties);
    }
  } finally {
    await session.close();
  }
  process.exit(0);
}
main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
