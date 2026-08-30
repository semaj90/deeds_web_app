#!/usr/bin/env node

/** Read-only plan for reconciling tree-bound nominations with symbol authority. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const resolve = path.resolve;
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(root, 'sveltekit-frontend/.env.local'), override: true });
const resolutionPath = resolve(root, '.tmp/atlas/current-structural-symbol-resolution-v1.ndjson');
const nominationsPath = resolve(root, '.tmp/atlas/current-graphify-symbol-nominations-v1.jsonl');
const reportPath = resolve(root, 'docs/reports/tree-bound-symbol-registry-reconciliation-plan-v1.json');
const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const digest = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const clean = (value) => String(value ?? '').replaceAll('\\', '/');
const sourceRef = (value) => clean(value).replace(/^sveltekit-frontend\//, '');
const kind = (value) => value === 'method' ? 'function' : String(value ?? '');
const readJsonl = async (file) => (await fs.readFile(file, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);

const [resolutions, nominations] = await Promise.all([readJsonl(resolutionPath), readJsonl(nominationsPath)]);
const nominationById = new Map(nominations.map((row) => [row.nomination_id, row]));
const treeBound = resolutions.filter((row) => row.resolution?.startsWith('EXACT'));
const pool = new pg.Pool({ connectionString });
let registryRows;
try {
  registryRows = (await pool.query(`
    SELECT stable_symbol_id, canonical_key, language, symbol_kind,
           canonical_name, canonical_qualified_name,
           created_from_source_ref, created_from_source_revision
    FROM atlas_symbol_registry WHERE status = 'active'
    ORDER BY canonical_key, stable_symbol_id
  `)).rows;
} finally { await pool.end(); }

const byKey = new Map(registryRows.map((row) => [row.canonical_key, [row]]));
const byMetadata = new Map();
for (const row of registryRows) {
  const key = `${sourceRef(row.created_from_source_ref)}|${kind(row.symbol_kind)}|${clean(row.canonical_name)}`;
  const list = byMetadata.get(key) ?? [];
  list.push(row);
  byMetadata.set(key, list);
}
const counts = { treeBound: treeBound.length, exactCurrent: 0, legacyNamespaceExactReviewOnly: 0, ambiguous: 0, contentOrRevisionConflict: 0, unresolved: 0 };
const entries = [];
for (const bound of treeBound) {
  const nomination = nominationById.get(bound.nominationId);
  const keyMaterial = JSON.stringify({ sourceRef: sourceRef(nomination.source_ref), sourceRevision: nomination.source_revision, kind: nomination.kind, name: nomination.name, startByte: nomination.byte_start, endByte: nomination.byte_end });
  const canonicalKey = `symbol-key:${createHash('sha256').update(keyMaterial, 'utf8').digest('hex').slice(0, 40)}`;
  const keyRows = byKey.get(canonicalKey) ?? [];
  const metadataRows = byMetadata.get(`${sourceRef(nomination.source_ref)}|${kind(nomination.kind)}|${clean(nomination.name)}`) ?? [];
  let classification;
  let candidates = keyRows;
  if (keyRows.length === 1) { classification = 'EXACT_CURRENT'; counts.exactCurrent += 1; }
  else if (keyRows.length > 1) { classification = 'AMBIGUOUS'; counts.ambiguous += 1; }
  else if (metadataRows.length === 1) { classification = 'LEGACY_NAMESPACE_EXACT_REVIEW_ONLY'; candidates = metadataRows; counts.legacyNamespaceExactReviewOnly += 1; }
  else if (metadataRows.length > 1) { classification = 'AMBIGUOUS'; candidates = metadataRows; counts.ambiguous += 1; }
  else { classification = 'UNRESOLVED'; counts.unresolved += 1; }
  const revisionConflict = candidates.length > 0 && candidates.some((row) => String(row.created_from_source_revision ?? '') !== String(nomination.source_revision ?? ''));
  if (revisionConflict && classification === 'LEGACY_NAMESPACE_EXACT_REVIEW_ONLY') { counts.legacyNamespaceExactReviewOnly -= 1; counts.contentOrRevisionConflict += 1; classification = 'CONTENT_OR_REVISION_CONFLICT'; }
  entries.push({
    schema: 'atlas.tree-bound-symbol-registry-reconciliation-entry.v1',
    nominationId: bound.nominationId,
    treeNodeId: bound.treeNodeId,
    sourceRef: nomination.source_ref,
    canonicalSourceRef: sourceRef(nomination.source_ref),
    sourceRevision: nomination.source_revision,
    canonicalKeyAttempted: canonicalKey,
    classification,
    candidateStableSymbolIds: candidates.map((row) => row.stable_symbol_id),
    candidateCanonicalKeys: candidates.map((row) => row.canonical_key),
    canonicalAuthority: false,
    writes: false,
  });
}
const entryText = entries.map((row) => JSON.stringify(row)).join('\n') + (entries.length ? '\n' : '');
const report = {
  schema: 'atlas.tree-bound-symbol-registry-reconciliation-plan.v1',
  gate: 'GRAPH-RESOLVE-06B.3',
  status: counts.ambiguous === 0 && counts.exactCurrent === counts.treeBound ? 'EXACT_CURRENT_READY_REVIEW' : 'RECONCILIATION_REQUIRED',
  resolutionPath: path.relative(root, resolutionPath).replaceAll('\\', '/'),
  nominationsPath: path.relative(root, nominationsPath).replaceAll('\\', '/'),
  registryRowsRead: registryRows.length,
  counts,
  policy: ['exact canonical key first', 'explicit source namespace normalization only', 'legacy metadata matches are review-only', 'source revision mismatch is not promotion', 'no aliases or fuzzy matching'],
  planChecksum: digest(entryText),
  outputPath: '.tmp/atlas/tree-bound-symbol-registry-reconciliation-plan-v1.ndjson',
  canonicalWrites: 0,
  databaseWrites: 0,
  readOnly: true,
  nextGate: counts.exactCurrent > 0 ? 'SYMBOL_VERSION_EXACT_REVISION_REVIEW' : 'REVIEW_LEGACY_NAMESPACE_OR_REBUILD_CURRENT_REGISTRY_INPUT',
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.mkdir(path.dirname(resolve(root, report.outputPath)), { recursive: true });
await fs.writeFile(resolve(root, report.outputPath), entryText, 'utf8');
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
