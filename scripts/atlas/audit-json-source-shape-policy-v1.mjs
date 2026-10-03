import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isGraphifySymbolExcludedArtifactV1 } from './lib/graphify-symbol-candidate-selection-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = path.join(ROOT, 'docs/reports/graphify-symbol-baseline-freeze-20260930-v6.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.schema !== 'atlas.graphify-symbol-batch-plan.v1' || !Array.isArray(manifest.rows)) {
  throw new Error('FROZEN_JSON_MANIFEST_INVALID');
}

const rows = manifest.rows;
const seen = new Set();
const invalid = [];
for (const row of rows) {
  const sourceRef = String(row.sourceRef ?? '');
  if (!sourceRef || seen.has(sourceRef) || row.fileKind !== 'json') invalid.push({ sourceRef, reason: 'DUPLICATE_OR_INVALID_MANIFEST_MEMBER' });
  seen.add(sourceRef);
  if (!isGraphifySymbolExcludedArtifactV1(sourceRef)) invalid.push({ sourceRef, reason: 'JSON_ARTIFACT_NOT_EXCLUDED' });
}

const result = {
  schema: 'atlas.graphify-json-source-shape-policy-audit.v1',
  policyOwner: 'scripts/atlas/lib/graphify-symbol-candidate-selection-v1.mjs',
  manifestPath: path.relative(ROOT, manifestPath).replaceAll('\\', '/'),
  manifestRowCount: rows.length,
  uniqueRows: seen.size,
  excludedRows: rows.length - invalid.filter((row) => row.reason === 'JSON_ARTIFACT_NOT_EXCLUDED').length,
  includedRows: invalid.filter((row) => row.reason === 'JSON_ARTIFACT_NOT_EXCLUDED').length,
  invalidRows: invalid,
  readOnly: true,
  writesPerformed: false,
  status: rows.length === 270 && seen.size === 270 && invalid.length === 0 ? 'PASS' : 'FAIL',
};
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'PASS') process.exitCode = 1;
