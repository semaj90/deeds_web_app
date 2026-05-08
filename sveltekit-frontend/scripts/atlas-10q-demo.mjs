import Redis from 'ioredis';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const r = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', { lazyConnect: true });
await r.connect();
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

const fmt = (label, t0, n, sample) => {
  const ms = (Date.now() - t0).toString().padStart(4);
  console.log(`  ${ms}ms  ${label.padEnd(50)} ${String(n).padStart(5)}  ${sample ?? ''}`);
};

console.log('\n═══ 10 atlas queries against live Redis + Postgres caches ═══\n');

// 1. Redis atlas summary (one-shot context load)
let t = Date.now();
const summary = JSON.parse(await r.get('ace:atlas:latest:summary') ?? '{}');
fmt('Q1  ace:atlas:latest:summary  (atlas metadata)', t, summary.files ?? 0,
    `clusters=${summary.clusters} topo_classes=${summary.topo_classes}`);

// 2. Redis top authority (cached)
t = Date.now();
const authTop = await r.hgetall('ace:authority:top');
const authKeys = Object.keys(authTop);
const top1 = authKeys[0] ? JSON.parse(authTop[authKeys[0]] ?? '{}') : null;
fmt('Q2  ace:authority:top         (top-200 graphAuthority)', t, authKeys.length,
    top1 ? `e.g. ${authKeys[0].slice(0, 40)}` : '');

// 3. Redis Karpathy GPU scores (4-stage CUDA blend)
t = Date.now();
const karpathy = await r.hgetall('gpu:karpathy:scores');
const karKeys = Object.keys(karpathy);
fmt('Q3  gpu:karpathy:scores       (PR + attn + authority blend)', t, karKeys.length,
    karKeys[0] ? karKeys[0].slice(0, 40) : '');

// 4. Redis taxonomy children (one-level drill from root)
t = Date.now();
const taxRoot = JSON.parse(await r.get('taxonomy:children:root') ?? '[]');
fmt('Q4  taxonomy:children:root    (5-level ontology)', t, taxRoot.length,
    taxRoot.slice(0, 3).map(c => c.display_name).join(', '));

// 5. Redis AGENTS.md per-dir mirror (374 keys)
t = Date.now();
const agentKeys = await r.keys('agents:dir:*');
fmt('Q5  agents:dir:*              (AGENTS.md envelope cache)', t, agentKeys.length,
    agentKeys[0]?.replace('agents:dir:', '').slice(0, 40));

// 6. Redis bow tiles (visual fingerprint)
t = Date.now();
const bowKeys = await r.keys('texture:bow:*');
fmt('Q6  texture:bow:*             (BoW chunk tiles)', t, bowKeys.length, '');

// 7. Postgres chunk_hit_log demand signal
t = Date.now();
const { rows: hits } = await p.query(`
  SELECT relative_path, count(*) AS n, max(hit_at) AS last_at
  FROM chunk_hit_log
  GROUP BY relative_path
  ORDER BY n DESC LIMIT 1
`);
fmt('Q7  chunk_hit_log              (demand-weighted, PG)', t, hits[0]?.n ?? 0,
    hits[0]?.relative_path?.slice(0, 40));

// 8. Postgres taxonomy_edges total (5,527 nodes / 62,802 edges)
t = Date.now();
const { rows: tx } = await p.query(`
  SELECT relation, count(*) AS n FROM taxonomy_edges GROUP BY relation ORDER BY n DESC
`);
fmt('Q8  taxonomy_edges              (4D ontology relations)', t,
    tx.reduce((s, r) => s + parseInt(r.n, 10), 0),
    tx.map(r => `${r.relation}=${r.n}`).join(' '));

// 9. Postgres agent_context_relations (after this session's wiring)
t = Date.now();
const { rows: acr } = await p.query(`
  SELECT relation, count(*) AS n FROM agent_context_relations GROUP BY relation ORDER BY n DESC
`);
fmt('Q9  agent_context_relations    (AGENTS.md ↔ atlas edges)', t,
    acr.reduce((s, r) => s + parseInt(r.n, 10), 0),
    acr.map(r => `${r.relation}=${r.n}`).join(' '));

// 10. Postgres context_timeline (RL-replay buffer)
t = Date.now();
const { rows: ct } = await p.query(`
  SELECT event_type, count(*) AS n
  FROM context_timeline
  GROUP BY event_type
  ORDER BY n DESC LIMIT 5
`);
fmt('Q10 context_timeline           (audit / RL replay buffer)', t,
    ct.reduce((s, r) => s + parseInt(r.n, 10), 0),
    ct.map(r => `${r.event_type}=${r.n}`).join(' '));

console.log('\n  ✓ 10 queries done — atlas is live and queryable end-to-end.\n');

await p.end();
await r.quit();
