#!/usr/bin/env node
/** AST-EXPLORE-01 — audit the existing rebuildable symbols.jsonl seed. */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const inputPath = path.join(root, 'sveltekit-frontend', 'memory', 'index', 'symbols.jsonl');
const reportPath = path.join(root, 'docs', 'reports', 'ast-explore-seed-audit-v1.json');

if (!fs.existsSync(inputPath)) throw new Error(`AST_EXPLORE_SEED_MISSING:${inputPath}`);

const raw = fs.readFileSync(inputPath, 'utf8');
const rows = raw.split(/\r?\n/).filter(Boolean).map((line, lineNumber) => {
  try { return { ...JSON.parse(line), lineNumber }; }
  catch { return { invalid: true, lineNumber }; }
});

const valid = rows.filter((row) => !row.invalid);
const parserCounts = Object.fromEntries(
  [...new Set(valid.map((row) => String(row.parser ?? 'MISSING')))].sort()
    .map((parser) => [parser, valid.filter((row) => String(row.parser ?? 'MISSING') === parser).length]),
);
const requiredIdentity = ['sourceRef', 'sourceRevision', 'workspaceRevision', 'startByte', 'endByte'];
const identityReady = valid.filter((row) => requiredIdentity.every((key) => {
  const snake = key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
  return row[key] != null || row[snake] != null;
}));
const duplicateKeys = new Map();
for (const row of valid) {
  const key = `${row.file ?? ''}|${row.kind ?? ''}|${row.symbol ?? ''}|${row.line ?? ''}`;
  duplicateKeys.set(key, (duplicateKeys.get(key) ?? 0) + 1);
}
const duplicateKeyCount = [...duplicateKeys.values()].filter((count) => count > 1).length;
const report = {
  schema: 'atlas.ast-explore-seed-audit.v1',
  generatedAt: new Date().toISOString(),
  input: {
    path: path.relative(root, inputPath).replaceAll(path.sep, '/'),
    byteLength: Buffer.byteLength(raw, 'utf8'),
    contentHash: `sha256:${crypto.createHash('sha256').update(raw, 'utf8').digest('hex')}`,
  },
  readOnly: true,
  canonicalWrites: false,
  datastoreWrites: false,
  modelCalls: false,
  counts: {
    totalLines: rows.length,
    validRows: valid.length,
    invalidRows: rows.length - valid.length,
    identityReadyRows: identityReady.length,
    duplicateIdentityLikeKeys: duplicateKeyCount,
  },
  parserCounts,
  requiredIdentity,
  status: identityReady.length === valid.length && valid.length > 0
    ? 'SEED_IDENTITY_READY_FOR_ADAPTER_REVIEW'
    : 'SEED_NOT_IDENTITY_READY',
  blockers: [
    ...(valid.some((row) => String(row.parser ?? '').includes('regex')) ? ['REGEX_DERIVED_ROWS_PRESENT'] : []),
    ...(identityReady.length !== valid.length ? ['REVISION_OR_BYTE_SPAN_FIELDS_MISSING'] : []),
    ...(duplicateKeyCount ? ['DUPLICATE_SEED_KEYS_PRESENT'] : []),
  ],
  nextGate: 'AST-EXPLORE-02',
  nextAction: 'Join only revision-qualified observations to atlas_ast_nodes or atlas_symbol_versions before retrieval projection.',
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report.counts, status: report.status, reportPath: path.relative(root, reportPath).replaceAll(path.sep, '/'), readOnly: true }, null, 2));
