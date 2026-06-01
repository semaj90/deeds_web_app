#!/usr/bin/env node
/**
 * mapreduce-path-join.mjs
 *
 * Joins mapreduce-full-v4.ndjson (3,270 files with feature, importErrorCount,
 * stableKey, path) against the atlas DuckDB (card_enriched, parent_atlas_full)
 * to produce:
 *
 *   .tmp/path-map.json           — compact {stableKey → {filePath, feature, importErrorCount}} index
 *   .tmp/path-map.ndjson         — full enriched records (one per mapreduce entry)
 *   .tmp/missing-sourceref.ndjson — atlas entries with empty sourceRef that now have a match
 *   .tmp/feature-todo-queue.ndjson — deduped list of missing/partial features for RabbitMQ
 *   .tmp/path-join-report.md     — human-readable summary
 *
 * Writes to RabbitMQ queue "atlas.feature.todo" if RABBITMQ_URL is set.
 *
 * Usage:
 *   node scripts/atlas/mapreduce-path-join.mjs [--dry-run] [--limit=500]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const TMP = resolve(ROOT, '.tmp');
mkdirSync(TMP, { recursive: true });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '999999', 10);
const RABBITMQ_URL = process.env.RABBITMQ_URL;

console.log('\n🔗 Mapreduce Path Join');
console.log('══════════════════════════════════════════');
console.log(`Dry-run: ${DRY_RUN} | Limit: ${LIMIT} | RabbitMQ: ${RABBITMQ_URL ? 'YES' : 'no'}\n`);

// ── 1. Load mapreduce v4 ──────────────────────────────────────────────────────

const MR_PATH = resolve(TMP, 'mapreduce-full-v4.ndjson');
if (!existsSync(MR_PATH)) {
  console.error('❌ mapreduce-full-v4.ndjson not found — run: node scripts/atlas/mapreduce-consolidated-index.mjs "--output=.tmp/mapreduce-full-v4.ndjson"');
  process.exit(1);
}

const mrLines = readFileSync(MR_PATH, 'utf8').split('\n').filter(Boolean).slice(0, LIMIT);
const mrDocs = mrLines.map(l => JSON.parse(l));
console.log(`Mapreduce entries: ${mrDocs.length}`);

// Build path → doc index (normalise to forward slashes, lowercase for lookup)
const pathIndex = new Map(); // normalised path → doc
const stableIndex = new Map(); // stableKey → doc
for (const doc of mrDocs) {
  const norm = doc.filePath.replace(/\\/g, '/').toLowerCase();
  pathIndex.set(norm, doc);
  pathIndex.set(doc.filePath.replace(/\\/g, '/'), doc); // also case-sensitive
  if (doc.stableKey) stableIndex.set(doc.stableKey, doc);
}

// ── 2. Read atlas DuckDB card_enriched via CLI ────────────────────────────────

const DUCKDB = resolve(TMP, 'ingest', 'atlas.duckdb');
let cardEnriched = [];
if (existsSync(DUCKDB)) {
  try {
    const sql = `COPY (SELECT card_id, title, sourceRef, som_row, som_col, som_index, reward_avg, reward_count FROM card_enriched) TO '/dev/stdout' (FORMAT JSON, ARRAY true)`;
    const out = execSync(`duckdb "${DUCKDB}" "${sql.replace(/"/g, '\\"')}"`, { timeout: 15000, maxBuffer: 50*1024*1024 }).toString();
    cardEnriched = JSON.parse(out);
    console.log(`DuckDB card_enriched rows: ${cardEnriched.length}`);
  } catch (e) {
    console.warn('DuckDB read failed (continuing without it):', e.message?.slice(0, 100));
  }
} else {
  console.warn('atlas.duckdb not found — skipping DuckDB join');
}

// ── 3. Read parent_atlas_index for sourceRef mapping ─────────────────────────

const ATLAS_INDEX = resolve(ROOT, 'memory', 'exports', 'parent-atlas', 'parent_atlas_index.json');
let atlasEntries = [];
if (existsSync(ATLAS_INDEX)) {
  const atlas = JSON.parse(readFileSync(ATLAS_INDEX, 'utf8'));
  atlasEntries = atlas.entries || [];
  console.log(`Parent atlas entries: ${atlasEntries.length}`);
}

// ── 4. Build path map ─────────────────────────────────────────────────────────

const pathMap = {};
const enrichedRecords = [];
const featureCounts = {};

for (const doc of mrDocs) {
  const norm = doc.filePath.replace(/\\/g, '/');
  const entry = {
    stableKey: doc.stableKey,
    filePath: norm,
    feature: doc.feature,
    importErrorCount: doc.importErrorCount,
    lines: doc.lines,
    extension: doc.extension,
    directory: doc.directory?.replace(/\\/g, '/'),
    staticImportCount: doc.staticImports?.length ?? 0,
    resolvedCount: doc.resolvedStaticImports?.filter(i => i.exists).length ?? 0,
  };
  pathMap[doc.stableKey] = entry;
  enrichedRecords.push(entry);
  featureCounts[doc.feature] = (featureCounts[doc.feature] || 0) + 1;
}

console.log(`\nPath map built: ${Object.keys(pathMap).length} entries`);
console.log('Feature distribution:', JSON.stringify(featureCounts));

// ── 5. Match atlas entries to mapreduce paths ─────────────────────────────────

let matchedCount = 0;
const missingSourceRef = [];

for (const entry of atlasEntries) {
  const raw = entry.sourceRef || (entry.payload && entry.payload.source) || '';
  if (!raw) continue;

  // Normalise the atlas sourceRef to a comparable path
  const norm = raw.replace(/\\/g, '/').replace(/^sveltekit-frontend\//, '').replace(/^src\//, '').toLowerCase();
  const direct = pathIndex.get(norm) || pathIndex.get(raw.replace(/\\/g, '/'));
  if (direct) {
    matchedCount++;
    missingSourceRef.push({
      atlas_id: entry.card_id || entry.id,
      sourceRef: raw,
      matched_filePath: direct.filePath.replace(/\\/g, '/'),
      feature: direct.feature,
      stableKey: direct.stableKey,
      importErrorCount: direct.importErrorCount,
      som_bmu_row: entry.som_bmu_row,
      som_bmu_col: entry.som_bmu_col,
    });
  }
}

console.log(`Atlas → mapreduce matches: ${matchedCount} / ${atlasEntries.length}`);

// ── 6. Build feature TODO queue ───────────────────────────────────────────────

// Identify features with high import errors (≥2), unclassified, or missing from atlas
const todoQueue = [];
const seenFeaturePaths = new Set();

for (const doc of mrDocs) {
  if (doc.importErrorCount >= 2 && !seenFeaturePaths.has(doc.filePath)) {
    seenFeaturePaths.add(doc.filePath);
    todoQueue.push({
      type: 'missing_imports',
      feature: doc.feature,
      filePath: doc.filePath.replace(/\\/g, '/'),
      stableKey: doc.stableKey,
      importErrorCount: doc.importErrorCount,
      priority: doc.importErrorCount >= 5 ? 'high' : 'medium',
    });
  }
}

// Add unclassified files with imports (likely need feature labeling)
const unclassified = mrDocs.filter(d => d.feature === 'unclassified' && d.staticImports?.length > 3);
for (const doc of unclassified.slice(0, 100)) {
  todoQueue.push({
    type: 'unclassified_feature',
    feature: 'unclassified',
    filePath: doc.filePath.replace(/\\/g, '/'),
    stableKey: doc.stableKey,
    importCount: doc.staticImports?.length ?? 0,
    priority: 'low',
  });
}

// Sort by priority
const priorityOrder = { high: 0, medium: 1, low: 2 };
todoQueue.sort((a, b) => (priorityOrder[a.priority] - priorityOrder[b.priority]) || (b.importErrorCount ?? 0) - (a.importErrorCount ?? 0));

console.log(`\nFeature TODO queue: ${todoQueue.length} items (${todoQueue.filter(t => t.priority === 'high').length} high, ${todoQueue.filter(t => t.priority === 'medium').length} medium, ${todoQueue.filter(t => t.priority === 'low').length} low)`);

// ── 7. RabbitMQ enqueue ───────────────────────────────────────────────────────

if (RABBITMQ_URL && !DRY_RUN && todoQueue.length > 0) {
  // Use amqplib via dynamic import
  try {
    const amqp = await import('amqplib');
    const conn = await amqp.connect(RABBITMQ_URL);
    const ch = await conn.createChannel();
    const QUEUE = 'atlas.feature.todo';
    await ch.assertQueue(QUEUE, { durable: true });

    let published = 0;
    for (const item of todoQueue.slice(0, 200)) { // cap at 200 per run
      ch.sendToQueue(QUEUE, Buffer.from(JSON.stringify(item)), { persistent: true, priority: item.priority === 'high' ? 10 : item.priority === 'medium' ? 5 : 1 });
      published++;
    }
    await ch.close();
    await conn.close();
    console.log(`✅ Published ${published} items to RabbitMQ queue "${QUEUE}"`);
  } catch (e) {
    console.warn('RabbitMQ publish failed (continuing):', e.message?.slice(0, 100));
  }
} else if (!RABBITMQ_URL) {
  console.log('ℹ️  Set RABBITMQ_URL to enable queue publishing');
}

// ── 8. Write outputs ──────────────────────────────────────────────────────────

if (!DRY_RUN) {
  writeFileSync(resolve(TMP, 'path-map.json'), JSON.stringify(pathMap, null, 2), 'utf8');
  writeFileSync(resolve(TMP, 'path-map.ndjson'), enrichedRecords.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  writeFileSync(resolve(TMP, 'missing-sourceref.ndjson'), missingSourceRef.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  writeFileSync(resolve(TMP, 'feature-todo-queue.ndjson'), todoQueue.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  console.log('\n✅ Outputs written:');
  console.log('   .tmp/path-map.json              —', Object.keys(pathMap).length, 'entries');
  console.log('   .tmp/path-map.ndjson            —', enrichedRecords.length, 'rows');
  console.log('   .tmp/missing-sourceref.ndjson   —', missingSourceRef.length, 'matched atlas entries');
  console.log('   .tmp/feature-todo-queue.ndjson  —', todoQueue.length, 'todo items');
}

// ── 9. DuckDB update: patch sourceRef in card_enriched ───────────────────────

if (existsSync(DUCKDB) && missingSourceRef.length > 0 && !DRY_RUN) {
  // Write a temp CSV and COPY into a staging table, then UPDATE card_enriched
  const csvRows = missingSourceRef.map(r =>
    `${r.atlas_id.replace(/,/g, '')},${r.matched_filePath.replace(/,/g, '')},${r.feature},${r.importErrorCount ?? 0}`
  ).join('\n');
  const csvPath = resolve(TMP, 'sourceref-patch.csv');
  writeFileSync(csvPath, 'atlas_id,filePath,feature,import_errors\n' + csvRows, 'utf8');

  const patchSql = [
    `CREATE OR REPLACE TABLE sourceref_patch AS SELECT * FROM read_csv('${csvPath.replace(/\\/g, '/')}', columns={'atlas_id':'VARCHAR','filePath':'VARCHAR','feature':'VARCHAR','import_errors':'INTEGER'});`,
    `UPDATE card_enriched SET sourceRef = sp.filePath FROM sourceref_patch sp WHERE card_enriched.card_id = sp.atlas_id AND (card_enriched.sourceRef IS NULL OR card_enriched.sourceRef = '');`,
  ].join('\n');

  try {
    execSync(`duckdb "${DUCKDB}" "${patchSql.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { timeout: 15000 });
    console.log(`✅ DuckDB card_enriched patched: ${missingSourceRef.length} sourceRef values updated`);
  } catch (e) {
    console.warn('DuckDB patch failed:', e.message?.slice(0, 150));
  }
}

// ── 10. Report ────────────────────────────────────────────────────────────────

const topErrors = mrDocs.filter(d => d.importErrorCount > 0).sort((a, b) => b.importErrorCount - a.importErrorCount).slice(0, 10);

const report = [
  '# Mapreduce Path Join Report',
  '',
  `**Generated:** ${new Date().toISOString()}`,
  `**Mode:** ${DRY_RUN ? 'dry-run' : 'live'}`,
  '',
  '## Path Map Summary',
  '',
  `- Total files mapped: **${Object.keys(pathMap).length}**`,
  `- Atlas entries matched: **${matchedCount}** / ${atlasEntries.length}`,
  `- DuckDB sourceRef patches: **${missingSourceRef.length}**`,
  `- Feature TODO queue items: **${todoQueue.length}**`,
  '',
  '## Feature Distribution',
  '',
  ...Object.entries(featureCounts).sort((a, b) => b[1] - a[1]).map(([f, c]) => `- ${f}: ${c}`),
  '',
  '## Remaining Import Errors (Top 10)',
  '',
  '| File | Errors | Feature |',
  '|------|--------|---------|',
  ...topErrors.map(d => `| \`${d.filePath.replace(/\\/g, '/')}\` | ${d.importErrorCount} | ${d.feature} |`),
  '',
  '## Feature TODO Queue (Top 20 high-priority)',
  '',
  '| Type | File | Errors | Priority |',
  '|------|------|--------|----------|',
  ...todoQueue.filter(t => t.priority !== 'low').slice(0, 20).map(t =>
    `| ${t.type} | \`${t.filePath}\` | ${t.importErrorCount ?? '-'} | ${t.priority} |`
  ),
  '',
  '## Next Steps',
  '',
  '1. Run `node scripts/ingest/retrieval-pass.mjs` — Qdrant dense search + Neo4j neighbor expansion',
  '2. Run `npm run promotion:queue:one knowledge-card-validation` — card integrity gate',
  '3. Apply alias_id migration: `ALTER TABLE task_semantic_packets ADD COLUMN IF NOT EXISTS alias_id TEXT;`',
  '4. Run `node scripts/atlas/qdrant-postgres-mirror-reconciliation.mjs` — mirror drift check',
  '',
];

if (!DRY_RUN) {
  writeFileSync(resolve(TMP, 'path-join-report.md'), report.join('\n'), 'utf8');
  console.log('   .tmp/path-join-report.md');
}

console.log('\n' + report.slice(0, 30).join('\n'));
console.log('\n✅ Done');
