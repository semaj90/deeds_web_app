#!/usr/bin/env node
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { Client } from 'pg';
import Redis from 'ioredis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function argValue(flag) {
  const i = args.indexOf(flag);
  if (i >= 0 && i + 1 < args.length) return args[i+1];
  return null;
}
function hasFlag(flag) { return args.indexOf(flag) >= 0; }

const graphArg = argValue('--graph');
const seedRedis = hasFlag('--seed-redis');
const dryRun = hasFlag('--dry') || false;
const batchSize = Number(argValue('--batch') || 250);

const candidatePaths = [];
if (graphArg) candidatePaths.push(resolve(process.cwd(), graphArg));
candidatePaths.push(resolve(__dirname, '../../docs/graph/codebase-graph.json'));
candidatePaths.push(resolve(__dirname, '../../.tmp/codebase-graph.json'));
candidatePaths.push(resolve(__dirname, '../../.tmp/ingest/parent-atlas-hypergraph.with-clusters.jsonl'));
candidatePaths.push(resolve(__dirname, '../../.tmp/ingest/codebase-graph.json'));

let graphPath = null;
for (const p of candidatePaths) {
  if (fs.existsSync(p)) { graphPath = p; break; }
}
if (!graphPath) {
  console.error('No graph file found. Tried:', candidatePaths.join('\n'));
  process.exit(2);
}

console.log('Using graph file:', graphPath);

function normalizeNode(n) {
  // heuristics for file and cluster fields
  const file = n.file || n.path || n.name || (n.meta && n.meta.path) || null;
  const clusterId = n.clusterId || n.somCluster || n.cluster || (n.meta && n.meta.clusterId) || null;
  const somBmuRow = n.somBmuRow || (n.meta && n.meta.somBmuRow) || null;
  const somBmuCol = n.somBmuCol || (n.meta && n.meta.somBmuCol) || null;
  return { file, clusterId, somBmuRow, somBmuCol };
}

async function main() {
  let raw = fs.readFileSync(graphPath, 'utf8');
  let root;
  try {
    root = JSON.parse(raw);
  } catch (e) {
    // if JSONL-like file, try to read lines and parse into array
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const arr = lines.map(l=>{ try { return JSON.parse(l); } catch(e){ return null; } }).filter(Boolean);
    if (arr.length) root = { nodes: arr };
    else { console.error('Failed to parse graph file as JSON or JSONL:', e.message); process.exit(2); }
  }

  const nodes = root.nodes || root.files || root.nodesList || (Array.isArray(root) ? root : []);
  if (!Array.isArray(nodes) || nodes.length === 0) {
    console.error('Graph file contains no nodes. Exiting.');
    process.exit(2);
  }

  const mapped = [];
  for (const n of nodes) {
    const m = normalizeNode(n);
    if (m.file && m.clusterId != null) mapped.push(m);
  }

  console.log('Found', mapped.length, 'nodes with cluster info');
  if (mapped.length === 0) process.exit(0);

  if (dryRun) {
    console.log('Dry run — showing first 10 entries:');
    console.log(mapped.slice(0,10));
    process.exit(0);
  }

  const DATABASE_URL = process.env.DATABASE_URL || process.env.PGDATABASE || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  let totalUpdated = 0;
  for (let i = 0; i < mapped.length; i += batchSize) {
    const batch = mapped.slice(i, i + batchSize);
    await client.query('BEGIN');
    try {
      for (const item of batch) {
        // avoid overwriting existing clusterId
        const vals = [item.clusterId, item.somBmuRow ?? null, item.somBmuCol ?? null, item.file];
        const q = `UPDATE parent_atlas_records SET payload = payload || jsonb_build_object('clusterId', $1, 'somBmuRow', $2, 'somBmuCol', $3)
          WHERE payload->>'file' = $4 AND (payload->>'clusterId') IS NULL;`;
        const res = await client.query(q, vals);
        totalUpdated += res.rowCount || 0;
      }
      await client.query('COMMIT');
      console.log('Processed batch', Math.floor(i/batchSize)+1, '->', batch.length, 'items');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('DB error in batch', Math.floor(i/batchSize)+1, e.message);
      // continue on error
    }
  }

  console.log('Total updated rows:', totalUpdated);

  if (seedRedis) {
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    const redis = new Redis(redisUrl);
    let seeded = 0;
    for (const item of mapped) {
      const key = 'cluster:meta:' + Buffer.from(item.file).toString('base64');
      const val = JSON.stringify({ file: item.file, clusterId: item.clusterId, somBmuRow: item.somBmuRow, somBmuCol: item.somBmuCol });
      try {
        await redis.set(key, val);
        seeded++;
      } catch (e) {
        console.error('Redis set error for', item.file, e.message);
      }
    }
    await redis.quit();
    console.log('Seeded', seeded, 'keys into Redis');
  }

  await client.end();
  console.log('Done.');
}

main().catch(e=>{ console.error(e); process.exit(1); });
