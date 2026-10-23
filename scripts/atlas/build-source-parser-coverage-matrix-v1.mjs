#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSourceParserCoverageMatrixV1, sourceParserCoverageMatrixChecksumV1 } from './lib/source-parser-coverage-matrix-v1.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const arg = (name) => args.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
const required = (name) => {
  const value = arg(name);
  if (!value) throw new Error(`REQUIRED_ARGUMENT_MISSING:${name}`);
  return path.resolve(repoRoot, value);
};
const outputDir = required('--out-dir');
const tmpRoot = path.resolve(repoRoot, '.tmp/atlas');
const relativeOutput = path.relative(tmpRoot, outputDir);
if (!relativeOutput || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
  throw new Error('OUTPUT_DIRECTORY_MUST_BE_UNDER_TMP_ATLAS');
}
if (fs.existsSync(outputDir)) throw new Error('OUTPUT_DIRECTORY_ALREADY_EXISTS');

const inputPaths = {
  snapshot: required('--snapshot'),
  admittedList: required('--admitted'),
  routeReport: required('--route-report'),
  routeRows: required('--route-rows'),
  lineageReport: required('--lineage-report'),
  lineageRows: required('--lineage-rows'),
};
const read = (file) => fs.readFileSync(file, 'utf8');
const parseJsonl = (text, name) => text.split(/\r?\n/).filter(Boolean).map((line, index) => {
  try { return JSON.parse(line); } catch { throw new Error(`${name}_INVALID_JSONL_LINE:${index + 1}`); }
});
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const inputText = Object.fromEntries(Object.entries(inputPaths).map(([name, file]) => [name, read(file)]));
const matrix = buildSourceParserCoverageMatrixV1({
  snapshot: JSON.parse(inputText.snapshot),
  admittedListText: inputText.admittedList,
  routeReport: JSON.parse(inputText.routeReport),
  routeRows: parseJsonl(inputText.routeRows, 'ROUTE_ROWS'),
  lineageReport: JSON.parse(inputText.lineageReport),
  lineageRows: parseJsonl(inputText.lineageRows, 'LINEAGE_ROWS'),
});
matrix.receiptSha256 = sourceParserCoverageMatrixChecksumV1(matrix);

const rowText = `${matrix.rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
if (sha256(rowText) !== matrix.rowsSha256) throw new Error('MATRIX_ROW_EXPORT_CHECKSUM_INTERNAL_MISMATCH');
const matrixText = `${JSON.stringify(matrix, null, 2)}\n`;
const inputs = Object.fromEntries(Object.entries(inputPaths).map(([name, file]) => [name, {
  path: path.relative(repoRoot, file).replaceAll('\\', '/'),
  sha256: sha256(inputText[name]),
}]));
const manifest = {
  schema: 'atlas.source-parser-coverage-matrix-run.v1',
  status: matrix.status,
  canonicalAuthority: false,
  writesPerformed: false,
  generatedAt: new Date().toISOString(),
  inputs,
  outputs: {
    matrix: { path: 'matrix.json', sha256: sha256(matrixText), receiptSha256: matrix.receiptSha256 },
    rows: { path: 'matrix-rows.jsonl', rowCount: matrix.rows.length, sha256: sha256(rowText) },
  },
  scope: matrix.scope,
  totals: matrix.totals,
  limitations: matrix.limitations,
};
manifest.manifestSha256 = sha256(JSON.stringify(manifest));

fs.mkdirSync(outputDir, { recursive: false });
fs.writeFileSync(path.join(outputDir, 'matrix.json'), matrixText, { encoding: 'utf8', flag: 'wx' });
fs.writeFileSync(path.join(outputDir, 'matrix-rows.jsonl'), rowText, { encoding: 'utf8', flag: 'wx' });
fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({ outputDir: path.relative(repoRoot, outputDir).replaceAll('\\', '/'), manifestSha256: manifest.manifestSha256, totals: matrix.totals, scope: matrix.scope }, null, 2));
