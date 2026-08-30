#!/usr/bin/env node

/** Read-only GRAPH-RESOLVE-06B.3 registry/version resolution proof. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env') });
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env.local'), override: true });
const resolutionPath = path.resolve(root, '.tmp/atlas/current-structural-symbol-resolution-v1.ndjson');
const nominationsPath = path.resolve(root, '.tmp/atlas/current-graphify-symbol-nominations-v1.jsonl');
const reportPath = path.resolve(root, 'docs/reports/tree-bound-symbol-registry-resolution-v1.json');
const outputPath = path.resolve(root, '.tmp/atlas/tree-bound-symbol-registry-resolution-v1.ndjson');
const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const hashText = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const readJsonl = async (file) => (await fs.readFile(file, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const exactSource = (value) => String(value ?? '').replaceAll('\\', '/').replace(/^sveltekit-frontend\//, '');

const [resolutions, nominations] = await Promise.all([readJsonl(resolutionPath), readJsonl(nominationsPath)]);
const nominationById = new Map(nominations.map((row) => [row.nomination_id, row]));
const treeBound = resolutions.filter((row) => row.resolution?.startsWith('EXACT'));
const pool = new pg.Pool({ connectionString });
let registryRows = [];
let versionRows = [];
try {
  const registry = await pool.query(`
    SELECT stable_symbol_id, canonical_key, language, symbol_kind,
           canonical_name, canonical_qualified_name,
           created_from_source_ref, created_from_source_revision
    FROM atlas_symbol_registry
    WHERE status = 'active'
    ORDER BY canonical_key, stable_symbol_id
  `);
  registryRows = registry.rows;
  const versions = await pool.query(`
    SELECT symbol_version_id, stable_symbol_id, source_ref, source_revision,
           workspace_revision, upstream_node_id, upstream_symbol_id,
           declaration_hash, byte_start, byte_end
    FROM atlas_symbol_versions
    WHERE source_ref IS NOT NULL AND source_revision IS NOT NULL
    ORDER BY source_ref, source_revision, symbol_version_id
  `);
  versionRows = versions.rows;
} finally {
  await pool.end();
}

const registryByKey = new Map(registryRows.map((row) => [row.canonical_key, row]));
const versionsByStable = new Map();
for (const row of versionRows) {
  const list = versionsByStable.get(row.stable_symbol_id) ?? [];
  list.push(row);
  versionsByStable.set(row.stable_symbol_id, list);
}
const counts = {
  treeBoundInput: treeBound.length,
  exactCanonicalKey: 0,
  exactMetadataRevision: 0,
  registryMissing: 0,
  registryAmbiguous: 0,
  symbolVersionBound: 0,
  symbolVersionMissing: 0,
  symbolVersionAmbiguous: 0,
  sourceRevisionMismatch: 0,
  fuzzyMatches: 0,
};
const rows = [];
for (const resolution of treeBound) {
  const nomination = nominationById.get(resolution.nominationId);
  const rawKeyMaterial = JSON.stringify({
    // Keep the proof key derivation identical to the review-only input plan.
    // Graphify may carry the frontend namespace prefix; the registry key does
    // not. Diverging here silently turns an applied exact canary into a false
    // REGISTRY_MISSING result.
    sourceRef: exactSource(nomination?.source_ref),
    sourceRevision: nomination?.source_revision,
    kind: nomination?.kind,
    name: nomination?.name,
    startByte: nomination?.byte_start,
    endByte: nomination?.byte_end,
  });
  const canonicalKey = `symbol-key:${hashText(rawKeyMaterial).slice(0, 40)}`;
  const keyMatch = registryByKey.get(canonicalKey) ?? null;
  let registryMatch = keyMatch;
  let registryResolution = keyMatch ? 'EXACT_CANONICAL_KEY' : 'REGISTRY_MISSING';
  if (keyMatch) counts.exactCanonicalKey += 1;
  if (!keyMatch) counts.registryMissing += 1;
  if (registryMatch) {
    const versionsForSymbol = versionsByStable.get(registryMatch.stable_symbol_id) ?? [];
    const exactVersions = versionsForSymbol.filter((version) =>
      String(version.source_ref) === String(nomination.source_ref)
      && String(version.source_revision) === String(nomination.source_revision)
      && Number(version.byte_start) === Number(nomination.byte_start)
      && Number(version.byte_end) === Number(nomination.byte_end)
      && String(version.declaration_hash ?? '') === String(nomination.declaration_hash ?? ''));
    if (exactVersions.length === 1) { counts.symbolVersionBound += 1; }
    else if (exactVersions.length === 0) { counts.symbolVersionMissing += 1; }
    else { counts.symbolVersionAmbiguous += 1; }
    rows.push({
      schema: 'atlas.tree-bound-symbol-registry-resolution.v1',
      nominationId: resolution.nominationId,
      treeNodeId: resolution.treeNodeId,
      registryResolution,
      stableSymbolId: registryMatch.stable_symbol_id,
      symbolVersionResolution: exactVersions.length === 1 ? 'EXACT' : exactVersions.length > 1 ? 'AMBIGUOUS' : 'MISSING',
      symbolVersionIds: exactVersions.map((version) => version.symbol_version_id),
      canonicalAuthority: false,
      canonicalWrites: false,
    });
  } else {
    rows.push({
      schema: 'atlas.tree-bound-symbol-registry-resolution.v1',
      nominationId: resolution.nominationId,
      treeNodeId: resolution.treeNodeId,
      registryResolution,
      attemptedCanonicalKey: canonicalKey,
      stableSymbolId: null,
      symbolVersionResolution: 'NOT_ATTEMPTED',
      symbolVersionIds: [],
      canonicalAuthority: false,
      canonicalWrites: false,
    });
  }
}
const output = rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
const report = {
  schema: 'atlas.tree-bound-symbol-registry-resolution-proof.v1',
  gate: 'GRAPH-RESOLVE-06B.3',
  status: counts.registryAmbiguous === 0 && counts.symbolVersionAmbiguous === 0 ? 'READ_ONLY_PROVEN' : 'READ_ONLY_INCOMPLETE',
  resolutionPath: path.relative(root, resolutionPath).replaceAll('\\', '/'),
  nominationsPath: path.relative(root, nominationsPath).replaceAll('\\', '/'),
  outputPath: path.relative(root, outputPath).replaceAll('\\', '/'),
  counts,
  registryRowsRead: registryRows.length,
  symbolVersionRowsRead: versionRows.length,
  lookupPolicy: ['exact canonical_key', 'exact source_ref/source_revision/byte span/declaration hash for symbol version', 'no fuzzy or name-only lookup'],
  canonicalWrites: 0,
  databaseWrites: 0,
  readOnly: true,
  nextGate: counts.symbolVersionBound > 0 ? 'GRAPH-RESOLVE-06B.4_LIVE_PRODUCER_REPLAY' : 'REGISTRY_NAMESPACE_RECONCILIATION_REQUIRED',
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(outputPath, output, 'utf8');
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
