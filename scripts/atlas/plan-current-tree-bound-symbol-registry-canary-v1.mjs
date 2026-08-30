#!/usr/bin/env node

/**
 * Build a bounded, review-only stable-symbol registry canary from the current
 * tree-bound input plan. This adapter deliberately does not write PostgreSQL.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inputPath = path.resolve(root, '.tmp/atlas/current-tree-bound-symbol-registry-input-v1.ndjson');
const outputPath = path.resolve(root, '.tmp/atlas/current-tree-bound-symbol-registry-canary-v1.ndjson');
const reportPath = path.resolve(root, 'docs/reports/current-tree-bound-symbol-registry-canary-v1.json');
const limit = 5;
const remainingOnly = process.argv.includes('--remaining');
const reconciliationPath = path.resolve(root, '.tmp/atlas/tree-bound-symbol-registry-reconciliation-plan-v1.ndjson');
const digest = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

const rows = (await fs.readFile(inputPath, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const reconciliation = remainingOnly
  ? (await fs.readFile(reconciliationPath, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse)
  : [];
const unresolvedIds = new Set(reconciliation.filter((row) => row.classification === 'UNRESOLVED').map((row) => row.nominationId));
const eligible = rows.filter((row) => row.classification === 'REGISTER_NEW_EXACT_REVIEW_ONLY' && (!remainingOnly || unresolvedIds.has(row.nominationId)));
const selected = eligible.slice(0, limit).map((row) => ({
  schema: 'atlas.current-tree-bound-symbol-registry-canary-entry.v1',
  nomination_id: row.nominationId,
  symbol_key: row.canonicalKey,
  stable_symbol_id: row.proposedStableSymbolId,
  language: row.language,
  kind: row.kind,
  name: row.name,
  qualified_name: row.qualifiedName,
  source_ref: row.sourceRef,
  source_revision: row.sourceRevision,
  workspace_revision: row.workspaceRevision,
  source_content_hash: row.sourceContentHash,
  tree_node_id: row.treeNodeId,
  byte_start: row.byteStart,
  byte_end: row.byteEnd,
  declaration_hash: row.declarationHash,
  upstream_node_id: row.upstreamNodeId,
  upstream_symbol_id: row.upstreamSymbolId,
  canonicalAuthority: false,
  promotionAuthorized: false,
  writes: false,
}));

const output = selected.map((row) => JSON.stringify(row)).join('\n') + (selected.length ? '\n' : '');
const report = {
  schema: 'atlas.current-tree-bound-symbol-registry-canary-plan.v1',
  gate: 'GRAPH-RESOLVE-06B.3',
  status: selected.length === limit ? 'REVIEW_ONLY_CANARY_READY' : 'REVIEW_ONLY_CANARY_INCOMPLETE',
  inputPath: path.relative(root, inputPath).replaceAll('\\', '/'),
  outputPath: path.relative(root, outputPath).replaceAll('\\', '/'),
  sourceRowCount: rows.length,
  eligibleRowCount: eligible.length,
  remainingOnly,
  selectedRowCount: selected.length,
  limit,
  selectedNominationIds: selected.map((row) => row.nomination_id),
  outputChecksum: digest(output),
  promotionAuthorized: false,
  canonicalWrites: 0,
  databaseWrites: 0,
  symbolVersionWrites: 0,
  edgeWrites: 0,
  readOnly: true,
  nextGate: 'EXPLICIT_CANARY_AUTHORIZATION_AND_APPLY_ADAPTER',
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(outputPath, output, 'utf8');
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
