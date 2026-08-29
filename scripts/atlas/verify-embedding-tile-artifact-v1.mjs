/** Independent read-only Arrow IPC readback for the bounded tile artifact. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tableFromIPC } from 'apache-arrow';

const root = resolve(import.meta.dirname, '..', '..');
const artifactPath = resolve(root, 'docs/reports/embedding-tile-artifacts/embedding-tiles-v1.arrow');
const manifestPath = resolve(root, 'docs/reports/embedding-tile-artifacts/embedding-tiles-v1.manifest.json');
const receiptPath = resolve(root, 'docs/reports/onnx-webgpu-embedding-token-slices-v1.json');
const reportPath = resolve(root, 'docs/reports/embedding-tile-artifact-readback-v1.json');
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

const report = { schema: 'atlas.embedding-tile-artifact-readback.v1', readOnly: true, status: 'BLOCKED', rows: 0, checks: {}, errors: [] };
try {
  if (![artifactPath, manifestPath, receiptPath].every(existsSync)) throw new Error('EMBEDDING_TILE_ARTIFACT_INPUT_MISSING');
  const artifactBytes = readFileSync(artifactPath);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  const expectedArtifactChecksum = digest(artifactBytes);
  if (expectedArtifactChecksum !== manifest.artifactChecksum) throw new Error('ARTIFACT_CHECKSUM_MISMATCH');
  const table = tableFromIPC(artifactBytes);
  const expected = new Map(receipt.tiles.map((row) => [`${row.candidateOrdinal}:${row.tileIndex}`, row]));
  const ordinals = table.getChild('candidate_ordinal');
  const tiles = table.getChild('tile_index');
  const vectors = table.getChild('vector_f32');
  const dimensions = table.getChild('vector_dimensions');
  const checksums = table.getChild('vector_checksum');
  if (!ordinals || !tiles || !vectors || !dimensions || !checksums) throw new Error('ARROW_TILE_COLUMN_MISSING');
  report.rows = table.numRows;
  const seen = new Set();
  for (let index = 0; index < table.numRows; index += 1) {
    const candidateOrdinal = Number(ordinals.get(index)); const tileIndex = Number(tiles.get(index)); const key = `${candidateOrdinal}:${tileIndex}`;
    const source = expected.get(key); if (!source || seen.has(key)) throw new Error(`ARROW_TILE_IDENTITY_MISMATCH:${key}`); seen.add(key);
    const raw = Buffer.from(vectors.get(index)); if (Number(dimensions.get(index)) !== 768 || raw.byteLength !== 768 * 4) throw new Error(`ARROW_TILE_VECTOR_SHAPE:${key}`);
    const vector = new Float32Array(768); new Uint8Array(vector.buffer).set(raw); const checksum = digest(Buffer.from(vector.buffer));
    if (checksum !== checksums.get(index) || checksum !== source.vectorChecksum) throw new Error(`ARROW_TILE_VECTOR_CHECKSUM_MISMATCH:${key}`);
  }
  report.checks = { artifactChecksum: expectedArtifactChecksum === manifest.artifactChecksum, rowCount: table.numRows === receipt.tiles.length, uniqueIdentity: seen.size === table.numRows, vectorDimensions: true, vectorChecksums: true, candidateSnapshotRevision: manifest.candidateSnapshotRevision === receipt.candidateSnapshotRevision, ordinalMapChecksum: manifest.ordinalMapChecksum === receipt.ordinalMapChecksum };
  if (!Object.values(report.checks).every(Boolean)) throw new Error('ARROW_TILE_READBACK_CHECK_FAILED');
  report.status = 'EMBEDDING_TILE_ARTIFACT_READBACK_PROVEN';
} catch (error) { report.errors.push(String(error?.message ?? error)); }
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, rows: report.rows, checks: report.checks, errors: report.errors, reportPath }, null, 2));
if (report.status === 'BLOCKED') process.exitCode = 1;
