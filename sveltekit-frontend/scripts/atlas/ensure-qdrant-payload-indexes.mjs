#!/usr/bin/env node
/**
 * ensure-qdrant-payload-indexes — Idempotently creates Qdrant field indexes.
 *
 * Only indexes retrieval-routing fields. Large text, summaries, AST JSON,
 * and feature arrays are NOT indexed — they live in Postgres.
 *
 * Usage:
 *   node scripts/atlas/ensure-qdrant-payload-indexes.mjs
 *   node scripts/atlas/ensure-qdrant-payload-indexes.mjs --dry-run
 */

const QDRANT_URL  = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION  = 'codebase_chunks_384_hybrid';
const DRY_RUN     = process.argv.includes('--dry-run');

// Only index filtering/routing fields — not large content
const INDEXES = [
  { field_name: 'packet_key',       field_schema: 'keyword' },
  { field_name: 'source_ref',       field_schema: 'keyword' },
  { field_name: 'content_hash',     field_schema: 'keyword' },
  { field_name: 'language',         field_schema: 'keyword' },
  { field_name: 'domain_class',     field_schema: 'keyword' },
  { field_name: 'concepts',         field_schema: 'keyword' },  // array of strings
  { field_name: 'som_cluster',      field_schema: 'integer' },
  { field_name: 'kmeans_cluster',   field_schema: 'integer' },
  { field_name: 'metadata_version', field_schema: 'integer' },
];

console.log('=== Ensure Qdrant Payload Indexes ===');
console.log(`Collection : ${COLLECTION}`);
console.log(`Mode       : ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
console.log(`Indexes    : ${INDEXES.length}`);
console.log('');

// Fetch existing indexes
const infoRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
if (!infoRes.ok) {
  console.error(`Collection info failed: ${infoRes.status} ${await infoRes.text()}`);
  process.exit(1);
}
const info = await infoRes.json();
const existingIndexes = new Set(
  Object.keys(info.result?.payload_schema ?? {})
);

console.log(`Existing indexed fields: ${[...existingIndexes].join(', ') || '(none)'}`);
console.log('');

let created = 0;
let skipped = 0;

for (const { field_name, field_schema } of INDEXES) {
  if (existingIndexes.has(field_name)) {
    console.log(`  ✓ ${field_name.padEnd(20)} (already indexed)`);
    skipped++;
    continue;
  }

  if (DRY_RUN) {
    console.log(`  → ${field_name.padEnd(20)} [${field_schema}] (dry-run)`);
    continue;
  }

  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/index`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field_name, field_schema }),
  });

  if (res.ok) {
    console.log(`  ✓ ${field_name.padEnd(20)} [${field_schema}] created`);
    created++;
  } else {
    const text = await res.text();
    console.error(`  ✗ ${field_name.padEnd(20)} FAILED: ${text.slice(0, 100)}`);
  }
}

console.log('');
console.log(`Created: ${created}  Skipped: ${skipped}${DRY_RUN ? '  (DRY-RUN)' : ''}`);
