#!/usr/bin/env node
/**
 * align-neo4j-canonical-source-refs.mjs
 *
 * Step 4 of identity alignment: add `canonicalSourceRef` and `sourceRefHash`
 * properties to Neo4j CodebaseFile nodes so all systems can join on the same
 * normalised path form.
 *
 * Reads each node's existing filePath / relativePath / stableKey / path,
 * normalises via canonical-source-ref.mjs, and writes back:
 *   n.canonicalSourceRef = "src/lib/server/db/client.ts"
 *   n.sourceRefHash      = "aeb538efe950"  (12-char sha256 prefix)
 *
 * Usage:
 *   node scripts/atlas/align-neo4j-canonical-source-refs.mjs          # dry-run
 *   node scripts/atlas/align-neo4j-canonical-source-refs.mjs --apply
 *   node scripts/atlas/align-neo4j-canonical-source-refs.mjs --report-only
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');

const _helperPath = resolve(__dirname, '../lib/canonical-source-ref.mjs');
const { normalizeSourceRef, sourceRefHash } =
  await import(pathToFileURL(_helperPath).href);

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const REPORT_ONLY = args.includes('--report-only');

const NEO4J_URL = (process.env.NEO4J_HTTP_URL
  ?? (process.env.NEO4J_URL ?? process.env.NEO4J_URI ?? 'http://localhost:7474')
    .replace(/^bolt:\/\/|^neo4j:\/\//, 'http://')
    .replace(':7687', ':7474'));
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123';

console.log(`[neo4j-align] mode=${REPORT_ONLY ? 'REPORT-ONLY' : APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`[neo4j-align] Neo4j: ${NEO4J_URL}`);

async function neo4jQuery(cypher, params = {}) {
  const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64')}`,
    },
    body: JSON.stringify({ statements: [{ statement: cypher, parameters: params }] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Neo4j HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(`Neo4j error: ${JSON.stringify(data.errors)}`);
  return data.results?.[0]?.data ?? [];
}

// ── 1. Fetch all CodebaseFile nodes ─────────────────────────────────────────

console.log('[neo4j-align] Fetching CodebaseFile nodes...');
let rows;
try {
  rows = await neo4jQuery(`
    MATCH (n:CodebaseFile)
    RETURN id(n) AS nodeId,
           coalesce(n.filePath, n.relativePath, n.stableKey, n.path, n.id) AS rawPath,
           n.canonicalSourceRef AS existing,
           n.sourceRefHash AS existingHash
  `);
} catch (err) {
  console.error(`[neo4j-align] Failed to fetch nodes: ${err.message}`);
  process.exit(1);
}

console.log(`[neo4j-align] Found ${rows.length} CodebaseFile nodes`);

// ── 2. Compute canonical form for each node ──────────────────────────────────

const updates = [];
let alreadySet = 0;
let noPath = 0;

for (const row of rows) {
  const r = row.row ?? row;
  const nodeId = r[0] ?? r.nodeId;
  const rawPath = r[1] ?? r.rawPath;
  const existing = r[2] ?? r.existing;
  const existingHash = r[3] ?? r.existingHash;
  if (!rawPath) { noPath++; continue; }

  const canonical = normalizeSourceRef(rawPath);
  const hash = sourceRefHash(rawPath);

  if (!canonical) { noPath++; continue; }

  if (existing === canonical && existingHash === hash) {
    alreadySet++;
    continue;
  }

  updates.push({ nodeId, rawPath, canonical, hash });
}

console.log(`[neo4j-align] ${alreadySet} already aligned, ${updates.length} need update, ${noPath} have no path`);

if (REPORT_ONLY) {
  // Just report, don't write
  const sample = updates.slice(0, 5).map(u => `  ${u.rawPath} → ${u.canonical} (${u.hash})`).join('\n');
  if (sample) console.log(`[neo4j-align] Sample updates:\n${sample}`);
  writeReport(rows, updates, alreadySet, noPath);
  process.exit(0);
}

// ── 3. Batch SET in Neo4j ────────────────────────────────────────────────────

const BATCH = 200;
let updated = 0;

if (APPLY && updates.length > 0) {
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH);
    try {
      await neo4jQuery(`
        UNWIND $rows AS row
        MATCH (n:CodebaseFile) WHERE id(n) = row.nodeId
        SET n.canonicalSourceRef = row.canonical,
            n.sourceRefHash = row.hash
      `, { rows: chunk.map(u => ({ nodeId: u.nodeId, canonical: u.canonical, hash: u.hash })) });
      updated += chunk.length;
    } catch (err) {
      console.warn(`[neo4j-align] Batch SET failed: ${err.message}`);
    }
    if ((i / BATCH) % 5 === 0) {
      process.stdout.write(`  [${i + chunk.length}/${updates.length}]\r`);
    }
  }
  console.log(`\n[neo4j-align] SET canonicalSourceRef + sourceRefHash on ${updated} nodes`);
} else if (!APPLY) {
  console.log('[neo4j-align] DRY-RUN: no writes. Re-run with --apply to write.');
}

// ── 4. Coverage report ───────────────────────────────────────────────────────

writeReport(rows, updates, alreadySet, noPath);

function writeReport(rows, updates, alreadySet, noPath) {
  const total = rows.length;
  const aligned = alreadySet + (APPLY ? updates.length : 0);
  const coveragePct = total > 0 ? ((aligned / total) * 100).toFixed(1) : '0.0';

  const lines = [
    `# Neo4j ↔ Qdrant Identity Coverage`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `Mode: ${REPORT_ONLY ? 'report-only' : APPLY ? 'apply' : 'dry-run'}`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total CodebaseFile nodes | ${total} |`,
    `| Already aligned (pre-run) | ${alreadySet} |`,
    `| Updated this run | ${APPLY ? updates.length : 0} |`,
    `| No parseable path | ${noPath} |`,
    `| Coverage after run | ${aligned}/${total} (${coveragePct}%) |`,
    ``,
    `## Path Format Distribution (sample)`,
    ``,
  ];

  // Analyze prefix distribution
  const prefixCounts = {};
  for (const row of rows) {
    const r = row.row ?? row;
    const rawPath = r[1] ?? r.rawPath ?? '';
    if (!rawPath) continue;
    const prefix = rawPath.startsWith('sveltekit-frontend/') ? 'sveltekit-frontend/'
      : rawPath.startsWith('src/') ? 'src/'
      : rawPath.startsWith('scripts/') ? 'scripts/'
      : rawPath.startsWith('file:') ? 'file:'
      : 'other';
    prefixCounts[prefix] = (prefixCounts[prefix] ?? 0) + 1;
  }
  for (const [prefix, count] of Object.entries(prefixCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`- \`${prefix}\`: ${count} nodes (${((count / total) * 100).toFixed(1)}%)`);
  }

  const reportDir = resolve(REPO, 'memory/exports');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = resolve(reportDir, 'neo4j-qdrant-identity-coverage.md');
  writeFileSync(reportPath, lines.join('\n') + '\n');
  console.log(`\n[neo4j-align] Report → ${reportPath}`);
  console.log(`[neo4j-align] Coverage: ${aligned}/${total} (${coveragePct}%)`);
}
