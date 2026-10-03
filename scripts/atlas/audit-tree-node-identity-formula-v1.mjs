import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = path.join(ROOT, 'scripts', 'atlas', 'atlas-ast-backfill-receipt-v1.mjs');
const OUTPUT = path.join(ROOT, 'docs', 'reports', 'graph-tree-node-identity-formula-audit-v1.json');

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function auditTreeNodeIdentityFormula(root = ROOT) {
  const sourcePath = path.join(root, 'scripts', 'atlas', 'atlas-ast-backfill-receipt-v1.mjs');
  const sourceText = fs.readFileSync(sourcePath, 'utf8');
  const lines = sourceText.split(/\r?\n/);
  const start = lines.findIndex((line) => /^function treeNodeId\(/.test(line)) + 1;
  const end = start > 0 ? lines.findIndex((line, index) => index >= start && /^\}/.test(line)) + 1 : 0;
  const formulaText = start > 0 && end > 0 ? lines.slice(start - 1, end).join('\n') : '';
  const checks = {
    functionPresent: start > 0 && end > start,
    sevenInputComponents: /\[repoId, normalizedPath, language, nodeKind, qualifiedSymbol, parentKey \?\? '', normalizedSig \?\? ''\]/.test(formulaText),
    nulDelimited: /\.join\('\\x00'\)/.test(formulaText),
    sha256Digest: /createHash\('sha256'\).*digest\('hex'\)/s.test(formulaText),
    explicitUtf8Encoding: /update\(input, 'utf8'\)/.test(formulaText),
    noWorkspaceRevisionInference: !formulaText.includes('workspaceRevision'),
  };
  const sourceRevision = sha256(fs.readFileSync(sourcePath));
  const passed = Object.values(checks).every(Boolean);
  const sourceRef = path.relative(root, sourcePath).replaceAll(path.sep, '/');
  const unsigned = {
    schema: 'atlas.graph-tree-node-identity-formula-audit.v1',
    generatedAt: new Date().toISOString(),
    status: passed ? 'STATIC_FORMULA_PROVEN_LIVE_POPULATION_UNPROVEN' : 'STATIC_FORMULA_NOT_PROVEN',
    proofLevel: passed ? 'STATIC_SOURCE_PROVEN' : 'STATIC_SOURCE_FAILED',
    source: {
      sourceRef,
      sourceRevision,
      lineStart: start,
      lineEnd: end,
      function: 'treeNodeId',
      role: 'revision-bound parse-occurrence identity derivation',
      canonicalAuthority: false,
    },
    formula: {
      inputComponents: ['repoId', 'normalizedPath', 'language', 'nodeKind', 'qualifiedSymbol', 'parentKey', 'normalizedSig'],
      delimiter: '\\x00',
      digest: 'sha256 hex',
      nullNormalization: "parentKey ?? '' and normalizedSig ?? ''",
    },
    checks,
    sideEffects: { sourceFilesMutated: false, persistentStoresMutated: false },
    nextGate: 'LIVE_ATLAS_TREE_NODES_POPULATION_AND_CROSS_REVISION_READBACK',
    likely_cause: 'The task ledger named the parse-occurrence formula but had no revision-bound static receipt for the current writer implementation.',
    evidence: [sourceRef, `${sourceRef}#L${start}-L${end}`, 'sha256 formula source revision'],
    patch_targets: ['scripts/atlas/audit-tree-node-identity-formula-v1.mjs', 'scripts/atlas/record-tree-node-identity-formula-receipt-v1.mjs'],
    safe_next_command: 'node scripts/atlas/audit-tree-node-identity-formula-v1.mjs',
    smoke_command: 'node --check scripts/atlas/audit-tree-node-identity-formula-v1.mjs',
    report_path: 'docs/reports/graph-tree-node-identity-formula-audit-v1.json',
  };
  return { ...unsigned, checksum: sha256(canonicalJson(unsigned)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const report = auditTreeNodeIdentityFormula();
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, proofLevel: report.proofLevel, source: report.source, reportPath: OUTPUT }, null, 2));
}
