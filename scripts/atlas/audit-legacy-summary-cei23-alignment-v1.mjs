#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLegacySummaryAlignmentV1 } from './lib/legacy-summary-cei23-alignment-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const matrixReportPath = 'docs/reports/candidate-feature-matrix-draft-v1-20260926T150456Z.json';
const hintDir = '.tmp/atlas/legacy-summary-hint-ordinal-join-v1/20260926T080239Z';
const embeddingDir = '.tmp/atlas/legacy-summary-hint-embedding-full-v1/20260926T063456Z';
const censusPath = '.tmp/atlas/legacy-summary-census-v1/census-20260926T080031Z.ndjson';
const shaBuffer = (buffer) => `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
async function shaFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return `sha256:${hash.digest('hex')}`;
}
function readNdjson(text, code) {
  const rows = [];
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if (!line) continue;
    try { rows.push(JSON.parse(line)); } catch { throw new Error(`${code}:${i + 1}`); }
  }
  return rows;
}

const reportPath = path.join(root, matrixReportPath);
const matrix = JSON.parse(await readFile(reportPath, 'utf8'));
const matrixDir = path.resolve(root, matrix.outDir);
const matrixManifest = JSON.parse(await readFile(path.join(matrixDir, 'descriptor.json'), 'utf8'));
const mapPath = path.join(matrixDir, 'candidate-ordinal-map.ndjson');
const mapBytes = await readFile(mapPath);
const candidateRows = readNdjson(mapBytes.toString('utf8'), 'CEI23_MAP_JSON_INVALID');
const actualMapSha = shaBuffer(mapBytes);
if (candidateRows.length !== 16151 || candidateRows.length !== matrix.candidates
  || actualMapSha !== `sha256:${matrix.files['candidate-ordinal-map.ndjson'].sha256}`
  || matrix.ordinalMapChecksum !== matrixManifest.ordinalMapChecksum) throw new Error('CEI23_MATRIX_ARTIFACT_INTEGRITY_FAILED');
if (candidateRows.some((row, i) => row.candidateOrdinal !== i) || new Set(candidateRows.map((r) => r.candidateOrdinal)).size !== candidateRows.length) throw new Error('CEI23_ORDINAL_SEQUENCE_INVALID');

const hintManifest = JSON.parse(await readFile(path.join(root, hintDir, 'manifest.json'), 'utf8'));
const hintPath = path.join(root, hintDir, hintManifest.output.path);
const hintBytes = await readFile(hintPath);
const hints = readNdjson(hintBytes.toString('utf8'), 'HINT_CROSSWALK_JSON_INVALID');
if (hints.length !== 330 || hints.length !== hintManifest.output.rows || shaBuffer(hintBytes) !== hintManifest.output.sha256) throw new Error('REQUALIFIED_HINT_CROSSWALK_INTEGRITY_FAILED');
if (new Set(hints.map((row) => row.chunkRowId)).size !== 330 || hints.some((row) => row.trust !== 'LEGACY_HINT_LINEAGE_BOUND' || row.canonicalAuthority !== false)) throw new Error('REQUALIFIED_HINT_IDENTITY_OR_TRUST_INVALID');

const embeddingManifest = JSON.parse(await readFile(path.join(root, embeddingDir, 'manifest.json'), 'utf8'));
const vectorIndexPath = path.join(root, embeddingDir, embeddingManifest.files.index.path);
const vectorsPath = path.join(root, embeddingDir, embeddingManifest.files.vectors.path);
if (await shaFile(vectorIndexPath) !== hintManifest.legacyHintCorpus.indexSha256
  || await shaFile(vectorsPath) !== hintManifest.legacyHintCorpus.vectorsSha256) throw new Error('HINT_VECTOR_ARTIFACT_CHECKSUM_MISMATCH');
const vectorIndex = readNdjson(await readFile(vectorIndexPath, 'utf8'), 'VECTOR_INDEX_JSON_INVALID');
const indexByRow = new Map(vectorIndex.map((row) => [row.row, row]));
for (const hint of hints) {
  const vector = indexByRow.get(hint.vectorIndexRow);
  if (!vector || vector.chunkRowId !== hint.chunkRowId || vector.summaryDigest !== hint.summaryDigest
    || vector.row !== hint.vectorIndexRow || hint.vectorByteOffset !== vector.row * embeddingManifest.dim * Float32Array.BYTES_PER_ELEMENT) throw new Error(`HINT_VECTOR_INDEX_COORDINATE_MISMATCH:${hint.chunkRowId}`);
}
const censusManifest = hintManifest.census;
if (await shaFile(path.join(root, censusPath)) !== censusManifest.sha256) throw new Error('QUALITY_CENSUS_CHECKSUM_MISMATCH');

const aligned = buildLegacySummaryAlignmentV1(hints, candidateRows);
if (!aligned.conserved || aligned.rows.length !== 330) throw new Error('ALIGNMENT_ROWS_NOT_CONSERVED');
const packetSourceRevisionWorkspaceMatches = aligned.rows.filter((r) => r.candidateOrdinalCandidate !== null).length;
const rowHasChunkIdentity = candidateRows.every((r) => Object.hasOwn(r, 'chunkRowId') && Object.hasOwn(r, 'canonicalChunkId'));
const rowHasSummaryDigest = candidateRows.every((r) => Object.hasOwn(r, 'summaryDigest'));
const candidateSnapshotRevision = matrix.candidateSnapshotRevision ?? matrixManifest.candidateSnapshotRevision ?? null;
const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('-', '');
const outputDir = path.join(root, `.tmp/atlas/legacy-summary-cei23-alignment-v1/${timestamp}`);
await mkdir(outputDir, { recursive: true });
const detailBody = `${aligned.rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
const detailPath = path.join(outputDir, 'alignment.ndjson');
await writeFile(detailPath, detailBody);
const blocked = aligned.counts.EXACT_CURRENT_CANDIDATE_MATCH !== 330;
const result = {
  schema: 'atlas.legacy-summary-cei23-alignment-receipt.v1',
  status: blocked ? 'LEGACY_SUMMARY_FEATURE_BLOCKED_SNAPSHOT_ALIGNMENT' : 'EXACT_CURRENT_SNAPSHOT_ALIGNMENT_PROVEN',
  generatedAt: new Date().toISOString(),
  inputs: {
    candidateMatrixReport: matrixReportPath,
    candidateMatrixDescriptor: path.relative(root, path.join(matrixDir, 'descriptor.json')).replaceAll('\\', '/'),
    candidateMapRows: candidateRows.length,
    candidateMapFileSha256: actualMapSha,
    ordinalMapChecksum: matrix.ordinalMapChecksum,
    candidateSnapshotRevision,
    candidateSnapshotRevisionStatus: candidateSnapshotRevision ? 'PRESENT' : 'NOT_EXPORTED_BY_CEI23_MATRIX_OWNER',
    workspaceRevision: matrix.workspaceRevision,
    legacyHintCrosswalk: path.relative(root, hintPath).replaceAll('\\', '/'),
    legacyHintRows: hints.length,
    hintCrosswalkSha256: shaBuffer(hintBytes),
    qualityCensus: censusPath,
    qualityCensusSha256: censusManifest.sha256,
    vectorIndexSha256: await shaFile(vectorIndexPath),
    vectorBytesSha256: await shaFile(vectorsPath),
    vectorDimensions: embeddingManifest.dim,
  },
  candidateCoordinates: {
    packetKeySourceRefSourceRevisionWorkspaceRevisionExactMatches: packetSourceRevisionWorkspaceMatches,
    candidateRowsCarryChunkRowId: candidateRows.filter((r) => Object.hasOwn(r, 'chunkRowId')).length,
    candidateRowsCarryCanonicalChunkId: candidateRows.filter((r) => Object.hasOwn(r, 'canonicalChunkId')).length,
    candidateRowsCarrySummaryDigest: candidateRows.filter((r) => Object.hasOwn(r, 'summaryDigest')).length,
    allRowsHaveChunkIdentity: rowHasChunkIdentity,
    allRowsHaveSummaryDigest: rowHasSummaryDigest,
  },
  counts: aligned.counts,
  conservation: { inputRows: hints.length, outputRows: aligned.rows.length, unclassified: 0, conserved: aligned.conserved },
  detail: { path: path.relative(root, detailPath).replaceAll('\\', '/'), rows: aligned.rows.length, sha256: shaBuffer(Buffer.from(detailBody)) },
  producer: { feature: 'legacy_summary_cosine', started: false, queryVectorCreated: false, cosineComputed: false, rf04Admitted: false, rf05Replayed: false },
  writes: { postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0, graphify: 0 },
  canonicalAuthority: false,
  reasons: blocked ? ['CEI23_CANDIDATE_MAP_IS_PACKET_SOURCE_LEVEL_AND_OMITS_CHUNK_IDENTITY_AND_SUMMARY_DIGEST', ...(!candidateSnapshotRevision ? ['CANDIDATE_SNAPSHOT_REVISION_NOT_EXPORTED'] : [])] : [],
};
const summaryPath = path.join(root, `docs/reports/legacy-summary-cei23-alignment-v1-${timestamp}.json`);
await writeFile(summaryPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ status: result.status, counts: result.counts, candidateCoordinates: result.candidateCoordinates,
  candidateSnapshotRevisionStatus: result.inputs.candidateSnapshotRevisionStatus,
  detailPath: result.detail.path, reportPath: path.relative(root, summaryPath).replaceAll('\\', '/') }, null, 2));
