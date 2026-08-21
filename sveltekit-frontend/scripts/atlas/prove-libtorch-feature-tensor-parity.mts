#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { batchCosineSimilarity, isCudaAvailable } from '../../src/lib/server/gpu/libtorch-bridge.js';

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function digestStrings(values: readonly string[]): string {
  const hash = createHash('sha256');
  for (const value of values) hash.update(`${Buffer.byteLength(value, 'utf8')}:`, 'utf8').update(value, 'utf8');
  return hash.digest('hex');
}

function decodeFloat32LittleEndian(bytes: Uint8Array): Float32Array {
  if (bytes.byteLength % 4 !== 0) throw new Error('FEATURE_BYTE_LENGTH_NOT_MULTIPLE_OF_4');
  const out = new Float32Array(bytes.byteLength / 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < out.length; i += 1) out[i] = view.getFloat32(i * 4, true);
  return out;
}

function cpuReference(query: readonly number[], corpus: readonly (readonly number[])[]): number[] {
  let qNormSq = 0;
  for (const q of query) qNormSq += q * q;
  const qNorm = Math.sqrt(qNormSq) || 1e-12;
  return corpus.map((row) => {
    let dot = 0;
    let rowNormSq = 0;
    for (let i = 0; i < query.length; i += 1) {
      dot += query[i] * row[i];
      rowNormSq += row[i] * row[i];
    }
    return dot / (qNorm * (Math.sqrt(rowNormSq) || 1e-12));
  });
}

const fixtureArg = process.argv.find((arg) => arg.startsWith('--fixture='));
if (!fixtureArg) throw new Error('--fixture=<path> is required');
const fixturePath = path.resolve(fixtureArg.slice('--fixture='.length));
const requireGpu = process.argv.includes('--require-gpu');
const atolArg = process.argv.find((arg) => arg.startsWith('--atol='));
const atol = Number(atolArg?.slice('--atol='.length) ?? '0.000001');
if (!Number.isFinite(atol) || atol < 0) throw new Error('INVALID_ATOL');

const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as {
  rowCount: number;
  columnCount: number;
  rowKeys: string[];
  tensorRevision: string;
  featureBytesBase64: string;
  presenceMaskBytesBase64: string;
  featureBytesSha256: string;
  presenceMaskBytesSha256: string;
  rowKeysSha256: string;
};

if (fixture.columnCount !== 25) throw new Error('TORCH03_COLUMN_COUNT_MISMATCH');
if (fixture.rowKeys.length !== fixture.rowCount) throw new Error('TORCH03_ROW_KEY_COUNT_MISMATCH');
const featureBytes = Buffer.from(fixture.featureBytesBase64, 'base64');
const maskBytes = Buffer.from(fixture.presenceMaskBytesBase64, 'base64');
if (sha256(featureBytes) !== fixture.featureBytesSha256) throw new Error('TORCH03_FEATURE_BYTES_CHECKSUM_MISMATCH');
if (sha256(maskBytes) !== fixture.presenceMaskBytesSha256) throw new Error('TORCH03_MASK_BYTES_CHECKSUM_MISMATCH');
if (digestStrings(fixture.rowKeys) !== fixture.rowKeysSha256) throw new Error('TORCH03_ROW_KEYS_CHECKSUM_MISMATCH');
if (featureBytes.length !== fixture.rowCount * fixture.columnCount * 4) throw new Error('TORCH03_FEATURE_BYTE_LENGTH_MISMATCH');
if (maskBytes.length !== fixture.rowCount * fixture.columnCount) throw new Error('TORCH03_MASK_BYTE_LENGTH_MISMATCH');

const flat = decodeFloat32LittleEndian(featureBytes);
for (let i = 0; i < flat.length; i += 1) {
  if (!Number.isFinite(flat[i])) throw new Error(`TORCH03_NON_FINITE:${i}`);
  const mask = maskBytes[i];
  if (mask !== 0 && mask !== 1) throw new Error(`TORCH03_MASK_INVALID:${i}`);
  if (mask === 0 && flat[i] !== 0) throw new Error(`TORCH03_MISSING_VALUE_NOT_ZERO:${i}`);
}
const rows: number[][] = [];
for (let row = 0; row < fixture.rowCount; row += 1) {
  rows.push(Array.from(flat.subarray(row * fixture.columnCount, (row + 1) * fixture.columnCount)));
}
const query = rows[0] ?? [];
const reference = cpuReference(query, rows);
const cudaAdvertised = isCudaAvailable();
if (requireGpu && !cudaAdvertised) throw new Error('TORCH03_LIBTORCH_CUDA_REQUIRED_BUT_UNAVAILABLE');
const result = await batchCosineSimilarity(query, rows);
if (result.scores.length !== reference.length) throw new Error('TORCH03_SCORE_COUNT_MISMATCH');
let maxAbsoluteDelta = 0;
for (let i = 0; i < reference.length; i += 1) {
  if (!Number.isFinite(result.scores[i])) throw new Error(`TORCH03_LIBTORCH_NON_FINITE:${i}`);
  maxAbsoluteDelta = Math.max(maxAbsoluteDelta, Math.abs(reference[i] - result.scores[i]));
}
if (maxAbsoluteDelta > atol) throw new Error(`TORCH03_LIBTORCH_PARITY_MISMATCH:${maxAbsoluteDelta}`);
if (requireGpu && result.source !== 'gpu') throw new Error('TORCH03_LIBTORCH_GPU_NOT_USED');

console.log(JSON.stringify({
  schema: 'atlas.libtorch-feature-tensor-parity-receipt.v1',
  fixture: fixturePath,
  tensorRevision: fixture.tensorRevision,
  rowCount: fixture.rowCount,
  columnCount: fixture.columnCount,
  featureBytesSha256: fixture.featureBytesSha256,
  presenceMaskBytesSha256: fixture.presenceMaskBytesSha256,
  rowKeysSha256: fixture.rowKeysSha256,
  cudaAdvertised,
  executorSource: result.source,
  maxAbsoluteDeltaVsReference: maxAbsoluteDelta,
  atol,
  canonicalOwnerChanged: false,
  evidenceAuthority: false,
}, null, 2));
