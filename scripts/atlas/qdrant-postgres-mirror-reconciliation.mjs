#!/usr/bin/env node
/**
 * qdrant-postgres-mirror-reconciliation.mjs
 *
 * Audit-only: compares Qdrant codebase_chunks_768 payload metadata against
 * Postgres parent_atlas_documents (if present) and reports drift.
 *
 * Always runs in read-only mode. Pass --dry-run for explicit label (same behavior).
 *
 * Outputs:
 *   .tmp/qdrant-postgres-mirror-reconciliation.json
 *   .tmp/qdrant-postgres-mirror-reconciliation.md
 *
 * Notes:
 *   - DuckDB is validation/mirror only — never authoritative
 *   - CouchDB is disabled — no CouchDB reads attempted
 *   - Qdrant scroll is bounded to 500 points to avoid OOM on large collections
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const TMP_DIR = resolve(ROOT, '.tmp');
mkdirSync(TMP_DIR, { recursive: true });

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const SCROLL_LIMIT = 500;

console.log('\n🔍 Qdrant ↔ Postgres Mirror Reconciliation');
console.log('════════════════════════════════════════════');
console.log(`Qdrant:     ${QDRANT_URL}`);
console.log(`Collection: ${COLLECTION}`);
console.log(`Scroll cap: ${SCROLL_LIMIT} points (bounded)\n`);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchJson(url, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 200) };
    return { ok: true, data: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

function psql(sql) {
  try {
    const out = execSync(
      `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -A -c "${sql.replace(/"/g, '\\"')}"`,
      { timeout: 8000 },
    ).toString().trim();
    return { ok: true, output: out };
  } catch (err) {
    return { ok: false, error: err.message?.slice(0, 200) ?? 'unknown' };
  }
}

// ── Step 1: Qdrant collection info ────────────────────────────────────────────

const collectionInfoResult = await fetchJson(`${QDRANT_URL}/collections/${COLLECTION}`);
const qdrantUp = collectionInfoResult.ok;
let qdrantPointCount = null;
let qdrantVectorSize = null;
let qdrantStatus = null;

if (qdrantUp) {
  const info = collectionInfoResult.data?.result;
  qdrantPointCount = info?.points_count ?? info?.vectors_count ?? null;
  qdrantVectorSize = info?.config?.params?.vectors?.content?.size
    ?? info?.config?.params?.vectors?.size
    ?? null;
  qdrantStatus = info?.status ?? null;
  console.log(`Qdrant collection: ${qdrantStatus} — ${qdrantPointCount?.toLocaleString() ?? '?'} points`);
} else {
  console.log(`Qdrant: ❌ unavailable — ${collectionInfoResult.error ?? collectionInfoResult.status}`);
}

// ── Step 2: Qdrant scroll sample ──────────────────────────────────────────────

let qdrantSample = [];
let qdrantPayloadFields = new Set();

if (qdrantUp) {
  const scrollResult = await fetchJson(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: SCROLL_LIMIT, with_payload: true, with_vector: false }),
  });

  if (scrollResult.ok) {
    qdrantSample = scrollResult.data?.result?.points ?? [];
    for (const pt of qdrantSample) {
      for (const key of Object.keys(pt.payload ?? {})) {
        qdrantPayloadFields.add(key);
      }
    }
    console.log(`Qdrant sample: ${qdrantSample.length} points scrolled`);
    console.log(`Payload fields found: ${[...qdrantPayloadFields].sort().join(', ')}`);
  } else {
    console.log(`Qdrant scroll failed: ${scrollResult.error}`);
  }
}

// ── Step 3: Postgres parent_atlas_documents ───────────────────────────────────

const postgresUp = psql('SELECT 1').ok;
let atlasTableExists = false;
let atlasRowCount = null;
let atlasColumns = [];

console.log(`\nPostgres reachable: ${postgresUp ? '✅' : '❌'}`);

if (postgresUp) {
  const tableCheck = psql(
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='parent_atlas_documents'"
  );
  atlasTableExists = tableCheck.ok && parseInt(tableCheck.output, 10) === 1;
  console.log(`parent_atlas_documents: ${atlasTableExists ? '✅ EXISTS' : '❌ MISSING (not yet promoted)'}`);

  if (atlasTableExists) {
    const countR = psql('SELECT count(*) FROM parent_atlas_documents');
    if (countR.ok) atlasRowCount = parseInt(countR.output, 10);

    const colR = psql(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='parent_atlas_documents' ORDER BY ordinal_position"
    );
    if (colR.ok && colR.output) {
      atlasColumns = colR.output.split('\n').filter(Boolean).map(r => {
        const p = r.split('|');
        return { column: p[0], type: p[1] };
      });
    }
    console.log(`parent_atlas_documents rows: ${atlasRowCount?.toLocaleString() ?? '?'}`);
  }
}

// ── Step 4: Drift analysis ────────────────────────────────────────────────────

const driftNotes = [];

const fieldAliases = {
  file_path: ['file_path'],
  chunk_index: ['chunk_index'],
  content: ['content'],
  cluster_id: ['cluster_id'],
  sourceRef: ['sourceRef', 'source_ref', 'source_refs'],
  feature_id: ['feature_id', 'feature_ids'],
  som_bmu_row: ['som_bmu_row', 'somRow', 'som_row'],
  som_bmu_col: ['som_bmu_col', 'somCol', 'som_col'],
};

const expectedFields = Object.keys(fieldAliases);
const missingExpectedFields = expectedFields.filter((field) => {
  const aliases = fieldAliases[field];
  return !aliases.some((alias) => qdrantPayloadFields.has(alias));
});
const extraFields = [...qdrantPayloadFields].filter((field) => {
  return !Object.values(fieldAliases).some((aliases) => aliases.includes(field));
});

if (missingExpectedFields.length > 0) {
  driftNotes.push(`Qdrant payload missing expected fields: ${missingExpectedFields.join(', ')}`);
}
if (!atlasTableExists && postgresUp) {
  driftNotes.push('parent_atlas_documents table does not exist — Postgres mirror not yet promoted');
}
if (atlasTableExists && qdrantPointCount !== null && atlasRowCount !== null) {
  driftNotes.push(
    `Grain note: Qdrant is chunk-level (${qdrantPointCount.toLocaleString()} points) while parent_atlas_documents is file-level (${atlasRowCount.toLocaleString()} rows); raw row counts are not directly comparable.`,
  );
}

const overallStatus = !qdrantUp ? 'QDRANT_DOWN'
  : !postgresUp ? 'POSTGRES_DOWN'
  : !atlasTableExists ? 'POSTGRES_NOT_PROMOTED'
  : missingExpectedFields.length > 0 ? 'DRIFT_DETECTED'
  : 'IN_SYNC';

console.log(`\n── Overall: ${overallStatus}`);
for (const note of driftNotes) console.log(`   ${note}`);

// ── Write outputs ─────────────────────────────────────────────────────────────

const jsonReport = {
  generated_at: new Date().toISOString(),
  overall_status: overallStatus,
  qdrant: {
    reachable: qdrantUp,
    collection: COLLECTION,
    status: qdrantStatus,
    point_count: qdrantPointCount,
    vector_size: qdrantVectorSize,
    sample_size: qdrantSample.length,
    payload_fields: [...qdrantPayloadFields].sort(),
    missing_expected_fields: missingExpectedFields,
    extra_fields: extraFields,
  },
  postgres: {
    reachable: postgresUp,
    parent_atlas_documents_exists: atlasTableExists,
    row_count: atlasRowCount,
    columns: atlasColumns,
  },
  drift_notes: driftNotes,
  safe_to_apply: overallStatus === 'IN_SYNC' || overallStatus === 'POSTGRES_NOT_PROMOTED',
  notes: [
    'DuckDB is validation/mirror only — never authoritative',
    'CouchDB is disabled — no CouchDB reads attempted',
    'Qdrant chunk counts and Postgres file counts use different grains; compare payload shape and join coverage, not raw row totals',
    `Scroll was bounded to ${SCROLL_LIMIT} points — payload field list may be incomplete for large collections`,
  ],
};

writeFileSync(
  resolve(TMP_DIR, 'qdrant-postgres-mirror-reconciliation.json'),
  JSON.stringify(jsonReport, null, 2) + '\n',
  'utf8',
);

const statusIcon = { IN_SYNC: '✅', POSTGRES_NOT_PROMOTED: '⚠️', DRIFT_DETECTED: '❌', QDRANT_DOWN: '❌', POSTGRES_DOWN: '❌' };
const mdLines = [
  '# Qdrant ↔ Postgres Mirror Reconciliation',
  '',
  `**Generated:** ${jsonReport.generated_at}`,
  `**Overall:** ${statusIcon[overallStatus] ?? '⚠️'} ${overallStatus}`,
  '',
  '## Summary',
  '',
  '| Store | Status | Count |',
  '|-------|--------|-------|',
  `| Qdrant \`${COLLECTION}\` | ${qdrantUp ? '✅' : '❌'} ${qdrantStatus ?? (qdrantUp ? 'ok' : 'down')} | ${qdrantPointCount?.toLocaleString() ?? 'N/A'} |`,
  `| Postgres \`parent_atlas_documents\` | ${atlasTableExists ? '✅ exists' : postgresUp ? '⚠️ not promoted' : '❌ down'} | ${atlasRowCount?.toLocaleString() ?? 'N/A'} |`,
  '',
  '## Payload Fields (Qdrant sample)',
  '',
  `**Present:** ${[...qdrantPayloadFields].sort().join(', ') || 'none'}`,
  `**Missing expected:** ${missingExpectedFields.join(', ') || 'none'}`,
  `**Extra:** ${extraFields.join(', ') || 'none'}`,
  '',
];

if (driftNotes.length > 0) {
  mdLines.push('## Drift Notes', '');
  for (const n of driftNotes) mdLines.push(`- ${n}`);
  mdLines.push('');
}

mdLines.push(
  '## Notes',
  '',
  '- DuckDB is validation/mirror only — never authoritative',
  '- CouchDB is disabled — no CouchDB reads attempted',
  `- Scroll was bounded to ${SCROLL_LIMIT} points`,
  '',
);

writeFileSync(
  resolve(TMP_DIR, 'qdrant-postgres-mirror-reconciliation.md'),
  mdLines.join('\n') + '\n',
  'utf8',
);

console.log('\nReports:');
console.log('  .tmp/qdrant-postgres-mirror-reconciliation.json');
console.log('  .tmp/qdrant-postgres-mirror-reconciliation.md\n');

process.exitCode = 0;
