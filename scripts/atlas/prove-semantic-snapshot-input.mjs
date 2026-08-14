#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const argv = process.argv.slice(2);
function flag(name, fallback) {
  const inline = argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback;
}

const inputPath = path.resolve(repoRoot, flag('--input', '.tmp/atlas-vector-snapshots/vector-snapshot-5k-turbovec-input.ndjson'));
const reportPath = path.resolve(repoRoot, flag('--report', 'docs/reports/semantic-snapshot-input-proof.json'));

function digestRows(rows, fields) {
  const hash = createHash('sha256');
  for (const row of rows) {
    hash.update(JSON.stringify(fields.map((field) => row[field] ?? null)));
    hash.update('\n');
  }
  return hash.digest('hex');
}

const report = {
  schema: 'atlas.semantic-snapshot-input-proof.v1',
  status: 'FAIL',
  generatedAt: new Date().toISOString(),
  inputPath: path.relative(repoRoot, inputPath),
  representation: { id: 'semantic_768', dimension: 768, dtype: 'float32' },
  rows: 0,
  validRows: 0,
  invalidRows: 0,
  duplicatePacketKeys: 0,
  duplicateSourceRefs: 0,
  identityDigest: null,
  vectorDigest: null,
  missingManifestFields: [
    'workspaceRevision',
    'sourceRevision',
    'representationRevision',
    'ordinalMapRevision',
    'artifactPath',
    'artifactChecksum',
  ],
  errors: [],
  gates: {
    INPUT_ROWS_VALID: 'NOT_PROVEN',
    SEMANTIC_768_DIMENSION: 'NOT_PROVEN',
    IDENTITY_UNIQUENESS: 'NOT_PROVEN',
    SNAPSHOT_MANIFEST_COMPLETE: 'NOT_PROVEN',
  },
};

try {
  const text = await readFile(inputPath, 'utf8');
  const rows = [];
  for (const [lineIndex, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    report.rows += 1;
    try {
      const row = JSON.parse(line);
      const embedding = Array.isArray(row.embedding) ? row.embedding : [];
      const valid = row.representation_id === 'semantic_768'
        && typeof row.packet_key === 'string' && row.packet_key.length > 0
        && typeof row.source_ref === 'string' && row.source_ref.length > 0
        && embedding.length === 768
        && embedding.every((value) => typeof value === 'number' && Number.isFinite(value));
      if (!valid) {
        report.invalidRows += 1;
        if (report.errors.length < 20) report.errors.push(`line ${lineIndex + 1}: invalid identity, representation, or 768-dim embedding`);
        continue;
      }
      report.validRows += 1;
      rows.push(row);
    } catch (error) {
      report.invalidRows += 1;
      if (report.errors.length < 20) report.errors.push(`line ${lineIndex + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const packetKeys = rows.map((row) => row.packet_key);
  const sourceRefs = rows.map((row) => row.source_ref);
  report.duplicatePacketKeys = packetKeys.length - new Set(packetKeys).size;
  report.duplicateSourceRefs = sourceRefs.length - new Set(sourceRefs).size;
  report.identityDigest = digestRows(rows, ['packet_key', 'source_ref', 'id']);
  report.vectorDigest = digestRows(rows, ['packet_key', 'embedding']);
  report.gates.INPUT_ROWS_VALID = report.invalidRows === 0 && report.rows > 0 ? 'PASS' : 'FAIL';
  report.gates.SEMANTIC_768_DIMENSION = report.invalidRows === 0 && report.rows > 0 ? 'PASS' : 'FAIL';
  report.gates.IDENTITY_UNIQUENESS = report.duplicatePacketKeys === 0 && report.duplicateSourceRefs === 0 ? 'PASS' : 'FAIL';
  report.gates.SNAPSHOT_MANIFEST_COMPLETE = 'BLOCKED_MISSING_LINEAGE';
  report.status = report.gates.INPUT_ROWS_VALID === 'PASS' && report.gates.IDENTITY_UNIQUENESS === 'PASS'
    ? 'CANDIDATE_VALIDATED_MANIFEST_INCOMPLETE'
    : 'FAIL';
} catch (error) {
  report.errors.push(error instanceof Error ? error.message : String(error));
}

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  inputPath: report.inputPath,
  rows: report.rows,
  validRows: report.validRows,
  invalidRows: report.invalidRows,
  duplicatePacketKeys: report.duplicatePacketKeys,
  duplicateSourceRefs: report.duplicateSourceRefs,
  manifestGate: report.gates.SNAPSHOT_MANIFEST_COMPLETE,
  reportPath: path.relative(repoRoot, reportPath),
}, null, 2));
