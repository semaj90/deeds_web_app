#!/usr/bin/env node

/**
 * Read-only adapter from the revision-qualified tree/registry proof to the
 * existing AST symbol-version materializer input contract.
 *
 * It emits CANONICAL only for exact active registry-key matches. It never
 * creates aliases, symbol versions, edges, or other durable state.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env') });
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env.local'), override: true });

const inputPath = path.resolve(root, '.tmp/atlas/current-graphify-symbol-nominations-v1.jsonl');
const treeResolutionPath = path.resolve(root, '.tmp/atlas/current-structural-symbol-resolution-v1.ndjson');
const outputPath = path.resolve(root, '.tmp/atlas/current-materializer-symbol-resolution-v1.ndjson');
const reportPath = path.resolve(root, 'docs/reports/current-materializer-symbol-resolution-adapter-v1.json');
const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const readJsonl = async (file) => (await fs.readFile(file, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const hashText = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const canonicalSourceRef = (value) => String(value ?? '').replaceAll('\\', '/').replace(/^sveltekit-frontend\//, '');
const digest = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

const [nominations, treeResolutions] = await Promise.all([readJsonl(inputPath), readJsonl(treeResolutionPath)]);
const treeBound = new Map(treeResolutions.filter((row) => row.resolution?.startsWith('EXACT')).map((row) => [row.nominationId, row]));
const pool = new pg.Pool({ connectionString });
let registryRows;
try {
  const result = await pool.query(`
    SELECT stable_symbol_id, canonical_key
    FROM atlas_symbol_registry
    WHERE status = 'active'
    ORDER BY canonical_key, stable_symbol_id
  `);
  registryRows = result.rows;
} finally {
  await pool.end();
}

const registryByKey = new Map(registryRows.map((row) => [row.canonical_key, row]));
const output = [];
const counts = { input: nominations.length, treeBound: 0, canonical: 0, unresolved: 0, fuzzy: 0, aliases: 0 };
for (const nomination of nominations) {
  const tree = treeBound.get(nomination.nomination_id);
  if (tree) counts.treeBound += 1;
  const sourceRef = canonicalSourceRef(nomination.source_ref);
  const keyMaterial = JSON.stringify({
    sourceRef,
    sourceRevision: nomination.source_revision,
    kind: nomination.kind,
    name: nomination.name,
    startByte: nomination.byte_start,
    endByte: nomination.byte_end,
  });
  const canonicalKey = `symbol-key:${hashText(keyMaterial).slice(0, 40)}`;
  const registry = tree ? registryByKey.get(canonicalKey) : null;
  const status = registry ? 'CANONICAL' : 'UNRESOLVED';
  if (registry) counts.canonical += 1; else counts.unresolved += 1;
  output.push({
    schema: 'atlas.ast-symbol-resolution-dry-run-row.v1',
    nomination_id: nomination.nomination_id,
    stable_symbol_id: registry?.stable_symbol_id ?? null,
    status,
    resolution_basis: registry ? 'exact_symbol_key' : 'unresolved',
    ast_resolution: tree?.resolution ?? 'NO_AST_MATCH',
    tree_node_id: tree?.treeNodeId ?? null,
    canonical_key: canonicalKey,
    source_ref: sourceRef,
    source_revision: nomination.source_revision ?? null,
    workspace_revision: nomination.workspace_revision ?? null,
    source_content_hash: nomination.source_content_hash ?? null,
    byte_start: nomination.byte_start ?? null,
    byte_end: nomination.byte_end ?? null,
    declaration_hash: nomination.declaration_hash ?? null,
    upstream_node_id: nomination.upstream_node_id ?? null,
    upstream_symbol_id: nomination.upstream_symbol_id ?? null,
    upstream_chunk_id: nomination.upstream_chunk_id ?? null,
    qualified_name: nomination.qualified_name ?? null,
    name: nomination.name ?? null,
    kind: nomination.kind ?? null,
    language: nomination.language ?? null,
    signature_normalized: nomination.signature_normalized ?? null,
    parent_route: nomination.parent_route ?? [],
    canonicalAuthority: false,
    canonicalWrites: false,
  });
}

const raw = output.map((row) => JSON.stringify(row)).join('\n') + (output.length ? '\n' : '');
await fs.writeFile(outputPath, raw, 'utf8');
const report = {
  schema: 'atlas.current-materializer-symbol-resolution-adapter.v1',
  status: counts.canonical > 0 ? 'READ_ONLY_ADAPTER_READY' : 'READ_ONLY_NO_CANONICAL_MATCHES',
  inputPath: path.relative(root, inputPath).replaceAll('\\', '/'),
  treeResolutionPath: path.relative(root, treeResolutionPath).replaceAll('\\', '/'),
  outputPath: path.relative(root, outputPath).replaceAll('\\', '/'),
  counts,
  outputChecksum: digest(raw),
  registryRowsRead: registryRows.length,
  fuzzyMatches: 0,
  aliasMatches: 0,
  canonicalWrites: 0,
  databaseWrites: 0,
  readOnly: true,
  nextGate: counts.canonical > 0 ? 'MATERIALIZER_DRY_RUN' : 'REGISTRY_RECONCILIATION_REQUIRED',
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
