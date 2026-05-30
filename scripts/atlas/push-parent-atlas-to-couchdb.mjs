#!/usr/bin/env node
/**
 * push-parent-atlas-to-couchdb.mjs
 *
 * Push parent_atlas_full.parquet + lane/cluster summaries into CouchDB
 * for durable persistence and MapReduce view querying.
 *
 * Reads:
 *   - .tmp/ingest/parent_atlas_full.parquet (via DuckDB CLI extraction)
 *   - .tmp/ingest/lane_summary.parquet
 *   - .tmp/ingest/cluster_summary.parquet
 *
 * Writes to CouchDB databases:
 *   - atlas_parent_nodes  (one doc per node, _id = lane:node_id)
 *   - atlas_lane_summary  (one doc per lane)
 *   - atlas_cluster_summary (one doc per SOM cluster)
 *
 * Idempotent: uses deterministic _id, fetches _rev for updates.
 *
 * Usage:
 *   node scripts/atlas/push-parent-atlas-to-couchdb.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

// Parse .env
function loadEnv() {
  const env = { ...process.env };
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = loadEnv();
const RAW_URL = env.COUCHDB_URL || 'http://admin:deeds123@localhost:5984';

// Split creds from URL (modern fetch rejects creds-in-URL)
function splitCreds(rawUrl) {
  const m = rawUrl.match(/^(https?:\/\/)([^:@\/]+):([^@]+)@(.+)$/);
  if (m) return { url: `${m[1]}${m[4]}`, user: m[2], pass: m[3] };
  return { url: rawUrl, user: env.COUCHDB_USER || null, pass: env.COUCHDB_PASSWORD || env.COUCHDB_PASS || null };
}

const { url: COUCHDB_URL, user: COUCHDB_USER, pass: COUCHDB_PASS } = splitCreds(RAW_URL);
const AUTH_HEADER = COUCHDB_USER && COUCHDB_PASS
  ? 'Basic ' + Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASS}`).toString('base64')
  : null;

// ─── Helpers ─────────────────────────────────────────────────────────────

async function couchRequest(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (AUTH_HEADER) headers.Authorization = AUTH_HEADER;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, json, text };
}

async function ensureDb(dbName) {
  const r = await couchRequest('PUT', `${COUCHDB_URL}/${dbName}`);
  if (r.ok || r.status === 412) return true; // 412 = already exists
  if (r.status === 401) throw new Error(`CouchDB auth failed for ${dbName}`);
  console.warn(`  [warn] ensureDb(${dbName}) status=${r.status}`);
  return r.ok;
}

async function upsertDoc(dbName, docId, doc) {
  const idEnc = encodeURIComponent(docId);
  const url = `${COUCHDB_URL}/${dbName}/${idEnc}`;
  // Check for existing _rev
  const head = await couchRequest('GET', url);
  if (head.ok && head.json?._rev) doc._rev = head.json._rev;
  const r = await couchRequest('PUT', url, { _id: docId, ...doc });
  return r;
}

// Bulk insert (faster for many docs)
async function bulkInsert(dbName, docs) {
  const r = await couchRequest('POST', `${COUCHDB_URL}/${dbName}/_bulk_docs`, { docs });
  return r;
}

// Convert parquet → JSON via DuckDB CLI (always file-based, Windows-safe)
function parquetToJSON(parquetPath) {
  const tmpJson = parquetPath + '.tmp.json';
  const pq = parquetPath.replace(/\\/g, '/');
  const tj = tmpJson.replace(/\\/g, '/');
  const result = spawnSync('duckdb', [
    '-c',
    `COPY (SELECT * FROM read_parquet('${pq}')) TO '${tj}' (FORMAT JSON, ARRAY TRUE);`,
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`duckdb conv failed (status=${result.status}): ${result.stderr || result.stdout}`);
  }
  if (!fs.existsSync(tmpJson)) {
    throw new Error(`duckdb did not produce ${tmpJson}`);
  }
  const data = JSON.parse(fs.readFileSync(tmpJson, 'utf8'));
  fs.unlinkSync(tmpJson);
  return data;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── Push Parent Atlas → CouchDB ────────────────────────');
  console.log(`  CouchDB: ${COUCHDB_URL.replace(/:[^@]+@/, ':***@')}`);
  console.log(`  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  if (!APPLY) {
    console.log('\n  [DRY-RUN] No documents will be written. Use --apply.');
    return;
  }

  // Verify CouchDB is reachable
  console.log('\n  Step 0: Health check...');
  const health = await couchRequest('GET', `${COUCHDB_URL}/`);
  if (!health.ok) {
    console.error(`  ❌ CouchDB unreachable: ${health.status}`);
    process.exit(1);
  }
  console.log(`  ✅ CouchDB ${health.json?.version || 'OK'}`);

  // Step 1: Ensure databases
  console.log('\n  Step 1: Ensure databases...');
  await ensureDb('atlas_parent_nodes');
  await ensureDb('atlas_lane_summary');
  await ensureDb('atlas_cluster_summary');
  console.log('  ✅ Databases ready');

  // Step 2: Convert parquet to JSON
  console.log('\n  Step 2: Read parquet files via DuckDB...');
  const parentNodes = parquetToJSON(path.join(ROOT, '.tmp', 'ingest', 'parent_atlas_full.parquet'));
  const laneSummary = parquetToJSON(path.join(ROOT, '.tmp', 'ingest', 'lane_summary.parquet'));
  const clusterSummary = parquetToJSON(path.join(ROOT, '.tmp', 'ingest', 'cluster_summary.parquet'));
  console.log(`  ✅ parent_atlas_full: ${parentNodes.length} rows`);
  console.log(`  ✅ lane_summary:      ${laneSummary.length} rows`);
  console.log(`  ✅ cluster_summary:   ${clusterSummary.length} rows`);

  // Step 3: Push parent atlas nodes (bulk batches of 500)
  console.log('\n  Step 3: Push parent atlas nodes...');
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < parentNodes.length; i += BATCH) {
    const slice = parentNodes.slice(i, i + BATCH).map((n) => ({
      _id: `${n.lane}:${n.node_id}`,
      ...n,
      archived_at: new Date().toISOString(),
    }));
    const r = await bulkInsert('atlas_parent_nodes', slice);
    if (!r.ok) {
      console.warn(`  [warn] batch ${i} status=${r.status}`);
      continue;
    }
    const okCount = Array.isArray(r.json) ? r.json.filter((x) => x.ok || x.id).length : 0;
    inserted += okCount;
    if (VERBOSE) console.log(`  ... batch ${i / BATCH + 1}: ${okCount}/${slice.length}`);
  }
  console.log(`  ✅ Inserted ${inserted} parent atlas nodes`);

  // Step 4: Push lane summary
  console.log('\n  Step 4: Push lane summaries...');
  for (const lane of laneSummary) {
    await upsertDoc('atlas_lane_summary', lane.lane, { ...lane, archived_at: new Date().toISOString() });
  }
  console.log(`  ✅ Pushed ${laneSummary.length} lane summaries`);

  // Step 5: Push cluster summary
  console.log('\n  Step 5: Push cluster summaries...');
  for (const c of clusterSummary) {
    const id = `som:${c.som_row}:${c.som_col}`;
    await upsertDoc('atlas_cluster_summary', id, { ...c, archived_at: new Date().toISOString() });
  }
  console.log(`  ✅ Pushed ${clusterSummary.length} cluster summaries`);

  // Step 6: Write report
  const report = {
    timestamp: new Date().toISOString(),
    couchdb_url: COUCHDB_URL.replace(/:[^@]+@/, ':***@'),
    databases: {
      atlas_parent_nodes: inserted,
      atlas_lane_summary: laneSummary.length,
      atlas_cluster_summary: clusterSummary.length,
    },
    total_archived: inserted + laneSummary.length + clusterSummary.length,
  };
  const reportPath = path.join(ROOT, 'memory', 'exports', 'parent-atlas-couchdb-archive.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n  ✅ Report → ${reportPath}`);
  console.log(`  ✅ Total archived: ${report.total_archived}`);
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
});
