import 'dotenv/config';
import { Pool } from 'pg';
import { getNeo4jDriver } from './src/lib/server/neo4j-driver.js';
import { classifyGraphPacketPath, resolveCodebaseFilePacketKeys, lookupPacketKey } from './src/lib/server/graph/graph-packet-key-resolver.js';

const db = new Pool({
  host: process.env.POSTGRES_HOST ?? '127.0.0.1',
  port: Number(process.env.POSTGRES_PORT ?? 5434),
  user: process.env.POSTGRES_USER ?? 'legal_admin',
  password: process.env.POSTGRES_PASSWORD ?? '123456',
  database: process.env.POSTGRES_DB ?? 'legal_ai_db',
});

const session = getNeo4jDriver().session();
const rowsResult = await session.run(`
  MATCH (n:CodebaseFile)
  WHERE n.louvainCommunity IS NOT NULL AND n.path IS NOT NULL
  RETURN n.path AS path, toString(n.louvainCommunity) AS community_id
`);
const rows = rowsResult.records
  .map((record) => ({ path: String(record.get('path') ?? ''), community_id: String(record.get('community_id') ?? '') }))
  .filter((row) => row.path.length > 0 && row.community_id.length > 0);

const resolved = await resolveCodebaseFilePacketKeys(db, rows.map((r) => r.path));
const unresolved = [];
const unresolvedCounts = new Map();
const excludedCounts = new Map();
let resolvedCount = 0;

for (const row of rows) {
  const classification = classifyGraphPacketPath(row.path);
  if (classification.kind === 'excluded') {
    const reason = classification.reason ?? 'excluded';
    excludedCounts.set(reason, (excludedCounts.get(reason) ?? 0) + 1);
    continue;
  }
  const packetKey = lookupPacketKey(resolved, row.path);
  if (packetKey) {
    resolvedCount++;
    continue;
  }
  const key = classification.reason ?? (classification.normalizedPath || 'unknown');
  unresolved.push({ path: row.path, normalizedPath: classification.normalizedPath, reason: classification.reason ?? null, kind: classification.kind });
  unresolvedCounts.set(key, (unresolvedCounts.get(key) ?? 0) + 1);
}

console.log(JSON.stringify({
  totalRows: rows.length,
  resolvedCount,
  unresolvedCount: unresolved.length,
  excludedCount: [...excludedCounts.values()].reduce((a, b) => a + b, 0),
  excludedCounts: Object.fromEntries(excludedCounts),
  unresolvedCounts: Object.fromEntries([...unresolvedCounts.entries()].sort((a, b) => b[1] - a[1])),
  sample: unresolved.slice(0, 71),
}, null, 2));

await session.close();
await db.end();
