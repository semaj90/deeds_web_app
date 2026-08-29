/** Build a local Arrow IPC tile artifact from the read-only WebGPU receipt. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { Binary, Float32, Int32, Table, Utf8, tableToIPC, vectorFromArray } from 'apache-arrow';

const root = resolve(import.meta.dirname, '..', '..');
const receiptPath = resolve(root, 'docs/reports/onnx-webgpu-embedding-token-slices-v1.json');
const artifactPath = resolve(root, 'docs/reports/embedding-tile-artifacts/embedding-tiles-v1.arrow');
const manifestPath = resolve(root, 'docs/reports/embedding-tile-artifacts/embedding-tiles-v1.manifest.json');
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const textDigest = (value) => digest(Buffer.from(value, 'utf8'));
const canonicalJson = (value) => JSON.stringify(value, Object.keys(value).sort());

const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
if (receipt.status !== 'WEBGPU_EXACT_TOKEN_SLICES_EXECUTION_PROVEN') throw new Error(`TILE_RECEIPT_NOT_PROVEN:${receipt.status}`);
if (!receipt.tiles.length || receipt.tiles.some((tile) => tile.dimensions !== 768 || !tile.finite || !tile.normalized || tile.canonicalAuthority !== false || !Array.isArray(tile.vector) || tile.vector.length !== 768)) throw new Error('TILE_RECEIPT_VALIDATION_FAILED');

const rows = receipt.tiles;
const bytes = (values) => Buffer.from(Float32Array.from(values).buffer);
const table = new Table({
  candidate_ordinal: vectorFromArray(rows.map((row) => row.candidateOrdinal), new Int32()),
  source_ref: vectorFromArray(rows.map((row) => row.sourceRef), new Utf8()),
  tile_index: vectorFromArray(rows.map((row) => row.tileIndex), new Int32()),
  token_start: vectorFromArray(rows.map((row) => row.tokenStart), new Int32()),
  token_end: vectorFromArray(rows.map((row) => row.tokenEnd), new Int32()),
  token_count: vectorFromArray(rows.map((row) => row.tokenCount), new Int32()),
  byte_start: vectorFromArray(rows.map((row) => row.byteStart), new Int32()),
  byte_end: vectorFromArray(rows.map((row) => row.byteEnd), new Int32()),
  vector_dimensions: vectorFromArray(rows.map((row) => row.dimensions), new Int32()),
  vector_checksum: vectorFromArray(rows.map((row) => row.vectorChecksum), new Utf8()),
  vector_f32: vectorFromArray(rows.map((row) => bytes(row.vector)), new Binary()),
});
const ipc = tableToIPC(table, 'file');
const artifactChecksum = digest(ipc);
const body = {
  schema: 'atlas.tensor-artifact-manifest.v1',
  artifactId: 'embedding-tiles-v1',
  artifactType: 'SEMANTIC_TILE_MATRIX',
  artifactFormat: 'ARROW_IPC',
  artifactUri: `atlas-artifact://${relative(root, artifactPath).replaceAll('\\', '/')}`,
  artifactChecksum,
  candidateSnapshotRevision: receipt.candidateSnapshotRevision ?? null,
  ordinalMapChecksum: receipt.ordinalMapChecksum ?? null,
  representationId: 'semantic_768',
  representationRevision: 'embeddinggemma-onnx-webgpu-local-v1',
  shape: { rows: rows.length, columns: 768 },
  dtype: 'float32',
  rowIdentity: 'CandidateOrdinal + tileIndex',
  rowCount: rows.length,
  columnCount: 768,
  sourceReceipt: relative(root, receiptPath).replaceAll('\\', '/'),
  canonicalAuthority: false,
};
const manifestChecksum = textDigest(JSON.stringify(body));
const manifest = { ...body, manifestChecksum };
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, ipc);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: 'EMBEDDING_TILE_ARTIFACT_MATERIALIZED_READ_ONLY', rowCount: rows.length, dimensions: 768, artifactChecksum, manifestChecksum, artifactPath, manifestPath, writes: { postgres: false, qdrant: false, valkey: false } }, null, 2));
