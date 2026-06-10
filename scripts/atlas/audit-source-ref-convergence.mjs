#!/usr/bin/env node
/**
 * audit-source-ref-convergence.mjs
 *
 * Phase 7B baseline audit: measures how well sourceRefHash joins work
 * across Neo4j ↔ Qdrant ↔ Atlas ↔ Karpathy for a sample of known files.
 *
 * Outputs:
 *   docs/reports/source-ref-convergence-report.json
 *   docs/reports/source-ref-convergence-report.md
 *
 * Usage:
 *   node scripts/atlas/audit-source-ref-convergence.mjs
 *   node scripts/atlas/audit-source-ref-convergence.mjs --sample 50
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Redis from 'ioredis';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');
dotenv.config({ path: resolve(REPO, '.env') });

const { normalizeSourceRef, sourceRefHash } =
  await import(pathToFileURL(resolve(__dirname, '../lib/canonical-source-ref.mjs')).href);

const args = process.argv.slice(2);
const SAMPLE_SIZE = parseInt(args.find(a => a.startsWith('--sample='))?.split('=')[1]
  ?? (args.includes('--sample') ? args[args.indexOf('--sample') + 1] : '100'), 10);

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';
const NEO4J_URL = (process.env.NEO4J_HTTP_URL
  ?? (process.env.NEO4J_URL ?? process.env.NEO4J_URI ?? 'http://localhost:7474')
    .replace(/^bolt:\/\/|^neo4j:\/\//, 'http://')
    .replace(':7687', ':7474'));
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const REDIS_PASS = process.env.REDIS_PASSWORD ?? 'redis';
const DB_URL = process.env.DATABASE_URL;

console.log('[convergence-audit] Starting Phase 7B source-ref convergence audit');
console.log(`[convergence-audit] Sample size: ${SAMPLE_SIZE} files`);

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  if (!res.ok) throw new Error(`Neo4j HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(`Neo4j: ${JSON.stringify(data.errors)}`);
  return data.results?.[0]?.data ?? [];
}

async function qdrantHashLookup(hash) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/count`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filter: { must: [{ key: 'sourceRefHash', match: { value: hash } }] },
      exact: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return -1;
  const d = await res.json();
  return d.result?.count ?? 0;
}

// ── 1. Get sample files from Neo4j (top by PageRank, has filePath) ────────────

console.log('\n[1/5] Fetching sample files from Neo4j...');
let sampleFiles = [];
try {
  const rows = await neo4jQuery(`
    MATCH (n:CodebaseFile)
    WHERE n.filePath IS NOT NULL
      AND NOT n.filePath CONTAINS 'api-cleanup'
      AND NOT n.filePath CONTAINS '.venv'
      AND NOT n.filePath CONTAINS 'node_modules'
      AND NOT n.filePath CONTAINS 'backup'
    RETURN n.filePath AS filePath, coalesce(n.graphPageRank, 0) AS pr, n.canonicalSourceRef AS canonical, n.sourceRefHash AS hash
    ORDER BY coalesce(n.graphPageRank, 0) DESC
    LIMIT ${SAMPLE_SIZE}
  `);
  sampleFiles = rows.map(r => {
    const row = r.row ?? r;
    return { filePath: row[0] ?? r.filePath, pr: row[1] ?? r.pr, neo4jCanonical: row[2] ?? r.canonical, neo4jHash: row[3] ?? r.hash };
  }).filter(f => f.filePath);
  console.log(`[1/5] Got ${sampleFiles.length} sample files`);
} catch (err) {
  console.error(`[1/5] Neo4j failed: ${err.message}`);
  process.exit(1);
}

// ── 2. Compute canonical forms for each sample ────────────────────────────────

console.log('\n[2/5] Computing canonical forms...');
const sample = sampleFiles.map(f => {
  const canonical = normalizeSourceRef(f.filePath);
  const hash = canonical ? sourceRefHash(f.filePath) : null;
  return { ...f, canonical, hash };
}).filter(f => f.canonical && f.hash);
console.log(`[2/5] ${sample.length} files have resolvable canonical form`);

// ── Disk existence check (used to classify Qdrant misses) ────────────────────

const REPO_ROOT = REPO;
const SVELTE_ROOT = resolve(REPO, 'sveltekit-frontend');

function fileExistsOnDisk(canonical) {
  if (!canonical) return false;
  // Check under repo root and sveltekit-frontend
  return existsSync(resolve(REPO_ROOT, canonical))
    || existsSync(resolve(SVELTE_ROOT, canonical));
}

// ── 3. Check Qdrant for each hash ─────────────────────────────────────────────

console.log('\n[3/5] Checking Qdrant hits per hash...');
let qdrantHits = 0, qdrantMisses = 0;
let diskDeletedCount = 0, notYetIndexedCount = 0;
const qdrantResults = [];
for (let i = 0; i < sample.length; i++) {
  const f = sample[i];
  const count = await qdrantHashLookup(f.hash);
  const hit = count > 0;
  if (hit) {
    qdrantHits++;
    qdrantResults.push({ ...f, qdrantChunks: count, missClass: 'qdrant_hit' });
  } else {
    qdrantMisses++;
    const onDisk = fileExistsOnDisk(f.canonical);
    const missClass = onDisk ? 'not_yet_indexed' : 'deleted_from_disk';
    if (onDisk) notYetIndexedCount++; else diskDeletedCount++;
    qdrantResults.push({ ...f, qdrantChunks: count, missClass });
  }
  if ((i + 1) % 20 === 0) process.stdout.write(`  [${i + 1}/${sample.length}]\r`);
}
const indexableCount = sample.length - diskDeletedCount;
const adjustedHitRate = indexableCount > 0 ? ((qdrantHits / indexableCount) * 100).toFixed(1) : '0.0';
console.log(`\n[3/5] Qdrant: ${qdrantHits} hits / ${qdrantMisses} misses (${((qdrantHits/sample.length)*100).toFixed(1)}% raw, ${adjustedHitRate}% excluding deleted)`);
console.log(`       deleted_from_disk: ${diskDeletedCount}  |  not_yet_indexed: ${notYetIndexedCount}`);

// ── 4. Check Karpathy Redis ───────────────────────────────────────────────────

console.log('\n[4/5] Checking Karpathy Redis scores...');
const redis = new Redis(REDIS_URL, {
  password: REDIS_PASS || undefined,
  lazyConnect: true, maxRetriesPerRequest: 1,
  enableOfflineQueue: false, retryStrategy: () => null,
});
redis.on('error', () => {});
await redis.connect().catch(() => {});

let karpHits = 0, karpMisses = 0;
const results = [];
for (const f of qdrantResults) {
  const score = await redis.hget('gpu:karpathy:scores', f.canonical).catch(() => null);
  const karpHit = score !== null;
  if (karpHit) karpHits++; else karpMisses++;
  results.push({ ...f, karpathyScore: karpHit ? JSON.parse(score) : null });
}
await redis.quit().catch(() => {});
console.log(`[4/5] Karpathy: ${karpHits} hits / ${karpMisses} misses (${((karpHits/sample.length)*100).toFixed(1)}%)`);

// ── 5. Check Atlas (task_semantic_packets) ────────────────────────────────────

console.log('\n[5/5] Checking Atlas task_semantic_packets...');
let atlasHits = 0, atlasMisses = 0;
const finalResults = [];
if (DB_URL) {
  const pool = new pg.Pool({ connectionString: DB_URL, max: 3 });
  const hashes = results.map(f => f.hash);
  try {
    const { rows: atlasRows } = await pool.query(
      'SELECT source_ref_hash, canonical_source_ref FROM task_semantic_packets WHERE source_ref_hash = ANY($1::text[])',
      [hashes]
    );
    const atlasHashSet = new Set(atlasRows.map(r => r.source_ref_hash));
    for (const f of results) {
      const atlasHit = atlasHashSet.has(f.hash);
      if (atlasHit) atlasHits++; else atlasMisses++;
      finalResults.push({ ...f, atlasHit });
    }
  } catch (err) {
    console.warn(`[5/5] Atlas query failed: ${err.message}`);
    results.forEach(f => finalResults.push({ ...f, atlasHit: null }));
  }
  await pool.end();
} else {
  console.warn('[5/5] DATABASE_URL not set, skipping Atlas check');
  results.forEach(f => finalResults.push({ ...f, atlasHit: null }));
}
console.log(`[5/5] Atlas: ${atlasHits} hits / ${atlasMisses} misses (Atlas packets use task refs not file refs — low hit rate is expected)`);

// ── Report ────────────────────────────────────────────────────────────────────

const neo4jHashed = sample.filter(f => f.neo4jHash).length;
const neo4jCanonicalMatch = sample.filter(f => f.neo4jCanonical === f.canonical).length;

// Files that miss Qdrant but have karpathy (should be re-indexed)
const needsReindex = finalResults.filter(f => f.qdrantChunks === 0 && f.karpathyScore !== null);
// Files deleted from disk (phantom Neo4j nodes — not a real miss)
const deletedFromDisk = finalResults.filter(f => f.missClass === 'deleted_from_disk');
// Files on disk but missing from both Qdrant and karpathy (truly never indexed)
const notYetIndexed = finalResults.filter(f => f.missClass === 'not_yet_indexed' && f.karpathyScore === null);
// All-systems-hit
const fullyAligned = finalResults.filter(f => f.qdrantChunks > 0 && f.karpathyScore !== null);

const indexable = finalResults.filter(f => f.missClass !== 'deleted_from_disk');
const adjustedQdrantHitRate = indexable.length > 0
  ? `${((qdrantHits / indexable.length) * 100).toFixed(1)}%`
  : '0.0%';

const report = {
  generatedAt: new Date().toISOString(),
  sampleSize: sample.length,
  systems: {
    neo4j: {
      withCanonicalSourceRef: neo4jHashed,
      canonicalMatchRate: `${((neo4jCanonicalMatch / sample.length) * 100).toFixed(1)}%`,
    },
    qdrant: {
      hits: qdrantHits,
      misses: qdrantMisses,
      hitRate: `${((qdrantHits / sample.length) * 100).toFixed(1)}%`,
      hitRateExcludingDeleted: adjustedQdrantHitRate,
      deletedFromDisk: deletedFromDisk.length,
      notYetIndexed: notYetIndexed.length,
      collectionSizeAfterPrune: 54195,
    },
    karpathy: {
      hits: karpHits,
      misses: karpMisses,
      hitRate: `${((karpHits / sample.length) * 100).toFixed(1)}%`,
    },
    atlas: {
      hits: atlasHits,
      misses: atlasMisses,
      note: 'Atlas packets use task refs; file-path hits are incidental',
    },
  },
  convergence: {
    fullyAligned: fullyAligned.length,
    fullyAlignedPct: `${((fullyAligned.length / sample.length) * 100).toFixed(1)}%`,
    needsReindex: needsReindex.length,
    deletedFromDisk: deletedFromDisk.length,
    notYetIndexed: notYetIndexed.length,
  },
  needsReindexSample: needsReindex.slice(0, 20).map(f => ({ canonical: f.canonical, pr: f.pr })),
  deletedFromDiskSample: deletedFromDisk.slice(0, 20).map(f => ({ canonical: f.canonical, pr: f.pr })),
  notYetIndexedSample: notYetIndexed.slice(0, 20).map(f => ({ canonical: f.canonical, pr: f.pr })),
};

const md = [
  `# Source-Ref Convergence Report`,
  ``,
  `Generated: ${report.generatedAt}`,
  `Sample: ${sample.length} files (top-${SAMPLE_SIZE} Neo4j PageRank)`,
  ``,
  `## System Coverage`,
  ``,
  `| System | Hits | Misses | Hit Rate |`,
  `|--------|------|--------|----------|`,
  `| Neo4j (canonical assigned) | ${neo4jHashed} | ${sample.length - neo4jHashed} | ${((neo4jHashed/sample.length)*100).toFixed(1)}% |`,
  `| Qdrant (chunks by hash) | ${qdrantHits} | ${qdrantMisses} | ${report.systems.qdrant.hitRate} raw / ${report.systems.qdrant.hitRateExcludingDeleted} excl. deleted |`,
  `| Karpathy (Redis blend score) | ${karpHits} | ${karpMisses} | ${report.systems.karpathy.hitRate} |`,
  `| Atlas (task_semantic_packets) | ${atlasHits} | ${atlasMisses} | task refs, not file refs |`,
  ``,
  `## Convergence`,
  ``,
  `| Metric | Count | % |`,
  `|--------|-------|---|`,
  `| Fully aligned (Neo4j + Qdrant + Karpathy) | ${fullyAligned.length} | ${report.convergence.fullyAlignedPct} |`,
  `| In Karpathy, missing from Qdrant (needs re-index) | ${needsReindex.length} | ${((needsReindex.length/sample.length)*100).toFixed(1)}% |`,
  `| Deleted from disk (phantom Neo4j nodes) | ${deletedFromDisk.length} | ${((deletedFromDisk.length/sample.length)*100).toFixed(1)}% |`,
  `| On disk but not yet indexed | ${notYetIndexed.length} | ${((notYetIndexed.length/sample.length)*100).toFixed(1)}% |`,
  ``,
  `> **Adjusted Qdrant hit rate** (excluding deleted-from-disk phantoms): **${adjustedQdrantHitRate}**`,
  ``,
  `## Files Needing Re-index (top ${Math.min(needsReindex.length, 20)})`,
  ``,
  ...needsReindex.slice(0, 20).map(f => `- \`${f.canonical}\` (PR: ${f.pr?.toFixed?.(3) ?? 'n/a'})`),
  ``,
  `## Deleted From Disk — Phantom Neo4j Nodes (top ${Math.min(deletedFromDisk.length, 20)})`,
  ``,
  ...deletedFromDisk.slice(0, 20).map(f => `- \`${f.canonical}\` (PR: ${f.pr?.toFixed?.(3) ?? 'n/a'})`),
  ``,
  `## Not Yet Indexed — On Disk but Missing (top ${Math.min(notYetIndexed.length, 20)})`,
  ``,
  ...notYetIndexed.slice(0, 20).map(f => `- \`${f.canonical}\` (PR: ${f.pr?.toFixed?.(3) ?? 'n/a'})`),
].join('\n');

const reportDir = resolve(REPO, 'docs/reports');
mkdirSync(reportDir, { recursive: true });
writeFileSync(resolve(reportDir, 'source-ref-convergence-report.json'), JSON.stringify(report, null, 2));
writeFileSync(resolve(reportDir, 'source-ref-convergence-report.md'), md);

console.log('\n[convergence-audit] === Summary ===');
console.log(`  Sample            : ${sample.length} files`);
console.log(`  Qdrant hit rate   : ${report.systems.qdrant.hitRate} raw`);
console.log(`  Qdrant hit rate   : ${adjustedQdrantHitRate} (excl. ${diskDeletedCount} deleted-from-disk)`);
console.log(`  Karpathy hit rate : ${report.systems.karpathy.hitRate}`);
console.log(`  Fully aligned     : ${fullyAligned.length}/${sample.length} (${report.convergence.fullyAlignedPct})`);
console.log(`  Needs re-index    : ${needsReindex.length}`);
console.log(`  Deleted from disk : ${deletedFromDisk.length}`);
console.log(`  Not yet indexed   : ${notYetIndexed.length}`);
console.log(`\n  Report → docs/reports/source-ref-convergence-report.md`);
