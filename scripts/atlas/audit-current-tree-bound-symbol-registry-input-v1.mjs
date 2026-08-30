#!/usr/bin/env node

/** Read-only validation of the current tree-bound symbol registry input plan. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inputPath = path.resolve(root, '.tmp/atlas/current-tree-bound-symbol-registry-input-v1.ndjson');
const reportPath = path.resolve(root, 'docs/reports/current-tree-bound-symbol-registry-input-audit-v1.json');
const allowedKinds = new Set(['function', 'method', 'class', 'interface', 'type', 'enum']);
const rows = (await fs.readFile(inputPath, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const required = ['nominationId', 'sourceRef', 'sourceRevision', 'workspaceRevision', 'sourceContentHash', 'byteStart', 'byteEnd', 'kind', 'canonicalKey', 'proposedStableSymbolId'];
const missing = rows.flatMap((row) => required.filter((field) => row[field] === null || row[field] === undefined || row[field] === '').map((field) => ({ nominationId: row.nominationId, field })));
const duplicateValues = (field) => {
  const seen = new Map();
  for (const row of rows) seen.set(row[field], (seen.get(row[field]) ?? 0) + 1);
  return [...seen].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
};
const invalidSpans = rows.filter((row) => !Number.isInteger(Number(row.byteStart)) || !Number.isInteger(Number(row.byteEnd)) || Number(row.byteEnd) < Number(row.byteStart));
const invalidKinds = rows.filter((row) => !allowedKinds.has(row.kind));
const outputChecksum = `sha256:${createHash('sha256').update(rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8').digest('hex')}`;
const report = {
  schema: 'atlas.current-tree-bound-symbol-registry-input-audit.v1',
  gate: 'GRAPH-RESOLVE-06B.3',
  status: rows.length === 0 ? 'NO_TREE_NODE_INPUT' : missing.length === 0 && invalidSpans.length === 0 && invalidKinds.length === 0 && duplicateValues('canonicalKey').length === 0 && duplicateValues('proposedStableSymbolId').length === 0 ? 'REVIEW_INPUT_VALID' : 'REVIEW_INPUT_INVALID',
  inputPath: '.tmp/atlas/current-tree-bound-symbol-registry-input-v1.ndjson',
  rowCount: rows.length,
  requiredFields: required,
  missingFields: missing,
  invalidSpans: invalidSpans.map((row) => row.nominationId),
  invalidKinds: invalidKinds.map((row) => ({ nominationId: row.nominationId, kind: row.kind })),
  duplicateCanonicalKeys: duplicateValues('canonicalKey'),
  duplicateProposedStableSymbolIds: duplicateValues('proposedStableSymbolId'),
  outputChecksum,
  promotionAuthorized: false,
  canonicalWrites: 0,
  databaseWrites: 0,
  readOnly: true,
  nextGate: 'EXPLICIT_REVIEW_AND_AUTHORIZATION_REQUIRED',
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
