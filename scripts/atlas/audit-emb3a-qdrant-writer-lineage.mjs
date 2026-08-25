#!/usr/bin/env node

/**
 * Read-only audit of the existing Qdrant payload writers for EMB3A lineage.
 * This does not connect to Qdrant, Postgres, RabbitMQ, or mutate any store.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const reportDir = path.join(root, 'docs', 'reports');
const reportPath = path.join(reportDir, 'emb3a-qdrant-writer-lineage-audit.json');
const markdownPath = path.join(reportDir, 'emb3a-qdrant-writer-lineage-audit.md');

const writers = [
  'sveltekit-frontend/src/lib/server/workers/qdrant-sync-worker.ts',
  'sveltekit-frontend/src/lib/server/retrieval/qdrant-sync-payload.ts',
  'sveltekit-frontend/src/lib/server/retrieval/qdrant-payload-enricher.ts',
  'scripts/atlas/backfill-packets-to-qdrant.mjs',
  'scripts/atlas/backfill-packets-to-qdrant-ollama.mjs',
  'scripts/atlas/qdrant-upsert-worker.mjs',
  'scripts/atlas/backfill-qdrant-payloads-from-postgres.mjs',
  'scripts/atlas/backfill-qdrant-payload-upsert.mjs',
  'scripts/atlas/backfill-qdrant-payload-complete.mjs',
  'scripts/atlas/backfill-qdrant-identity-payload.mts',
];

const required = [
  'packet_key',
  'source_ref',
  'workspace_revision',
  'source_revision',
  'representation_revision',
];

const sharedPayloadBuilders = new Map([
  ['sveltekit-frontend/src/lib/server/workers/qdrant-sync-worker.ts', 'sveltekit-frontend/src/lib/server/retrieval/qdrant-sync-payload.ts'],
]);

const legacyWriterPaths = new Set([
  'scripts/atlas/backfill-packets-to-qdrant.mjs',
  'scripts/atlas/backfill-packets-to-qdrant-ollama.mjs',
  'scripts/atlas/qdrant-upsert-worker.mjs',
  'scripts/atlas/backfill-qdrant-payloads-from-postgres.mjs',
  'scripts/atlas/backfill-qdrant-payload-upsert.mjs',
  'scripts/atlas/backfill-qdrant-payload-complete.mjs',
  'scripts/atlas/backfill-qdrant-identity-payload.mts',
]);

const rows = [];
for (const relativePath of writers) {
  const absolutePath = path.join(root, relativePath);
  let source;
  try {
    source = await fs.readFile(absolutePath, 'utf8');
  } catch {
    rows.push({ file: relativePath, exists: false, fields: {}, status: 'NOT_FOUND' });
    continue;
  }

  const directFields = Object.fromEntries(required.map((field) => [field, new RegExp(`\\b${field}\\b`).test(source)]));
  const delegatedBuilder = sharedPayloadBuilders.get(relativePath);
  const fields = delegatedBuilder
    ? Object.fromEntries(required.map((field) => [field, true]))
    : directFields;
  const payloadLike = /payload\s*[:=]/.test(source) || /setPayload|upsert/.test(source);
  const delegation = delegatedBuilder
    ? { mode: 'SHARED_PAYLOAD_BUILDER', builder: delegatedBuilder, callDetected: /buildQdrantSyncPayload\s*\(/.test(source) }
    : null;
  const delegatedAndVerified = Boolean(delegation?.callDetected);
  rows.push({
    file: relativePath,
    exists: true,
    role: legacyWriterPaths.has(relativePath) ? 'LEGACY_BACKFILL_OR_WORKER' : 'ACTIVE_APPLICATION_SURFACE',
    payloadLike,
    fields,
    directFields,
    delegation,
    promotionBlocked: legacyWriterPaths.has(relativePath),
    status: delegatedAndVerified
      ? 'LINEAGE_COMPLETE_VIA_SHARED_BUILDER'
      : required.every((field) => fields[field])
        ? 'LINEAGE_COMPLETE_CANDIDATE'
        : 'REVISION_FIELDS_MISSING',
  });
}

const existingPayloadWriters = rows.filter((row) => row.exists && row.payloadLike);
const completeStatuses = new Set(['LINEAGE_COMPLETE_CANDIDATE', 'LINEAGE_COMPLETE_VIA_SHARED_BUILDER']);
const complete = existingPayloadWriters.filter((row) => completeStatuses.has(row.status));
const liveOwner = rows.find((row) => row.file === 'sveltekit-frontend/src/lib/server/retrieval/qdrant-sync-payload.ts');
const report = {
  schema: 'atlas.emb3a.qdrant.writer.lineage.audit.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  collection: 'codebase_chunks_768',
  requiredPayloadFields: required,
  canonicalIdentityOwner: 'Parent Atlas / Postgres',
  projectionOwner: 'Qdrant payload writer selected by Graphify retrieval projection',
  writers: rows,
  writerCount: existingPayloadWriters.length,
  completeWriterCount: complete.length,
  liveApplicationOwner: liveOwner?.file ?? null,
  status: liveOwner && completeStatuses.has(liveOwner.status)
    ? 'WRITER_CONTRACT_PRESENT_PROJECTION_POPULATION_OPEN'
    : 'BLOCKED_MULTIPLE_OR_INCOMPLETE_WRITERS',
  conclusion: liveOwner && completeStatuses.has(liveOwner.status)
    ? 'The live SvelteKit writer emits the EMB3A lineage fields directly or through the verified shared payload builder; Qdrant population and non-zero upstream revision values still require proof.'
    : 'No live application writer is proven to emit the complete EMB3A revision lineage contract.',
  canonicalWrites: false,
};

await fs.mkdir(reportDir, { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const lines = [
  '# EMB3A Qdrant writer lineage audit',
  '',
  `- Status: **${report.status}**`,
  '- Read-only: **true**',
  '- Collection: `codebase_chunks_768`',
  `- Payload writers found: **${report.writerCount}**`,
  `- Complete lineage writers: **${report.completeWriterCount}**`,
  '',
  'Required fields:',
  ...required.map((field) => `- \`${field}\``),
  '',
  'Writer findings:',
  ...rows.map((row) => `- \`${row.file}\`: **${row.status}**${row.exists ? ` (${Object.entries(row.fields).filter(([, value]) => value).map(([key]) => key).join(', ') || 'no required fields detected'})` : ''}`),
  '',
  `Conclusion: ${report.conclusion}`,
  '',
  'No Qdrant, Postgres, RabbitMQ, Valkey, or canonical data was modified.',
];
await fs.writeFile(markdownPath, `${lines.join('\n')}\n`, 'utf8');

console.log(JSON.stringify({
  status: report.status,
  writerCount: report.writerCount,
  completeWriterCount: report.completeWriterCount,
  canonicalWrites: false,
  reportPath: path.relative(root, reportPath),
}, null, 2));
