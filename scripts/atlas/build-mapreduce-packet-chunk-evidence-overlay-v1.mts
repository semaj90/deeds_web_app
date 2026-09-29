#!/usr/bin/env node
/**
 * Read-only evidence composition for exact MapReduce packet candidates and
 * their proven packet→chunk lineage. The chunk row's own revision mirrors are
 * reported, never repaired; current file bytes are qualified only by the
 * existing source-binding proof plus exact full-file hash readback.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts';

import { projectCurrentOrdinalMapCoreV1 } from './lib/large-corpus-current-map-rebase-v2.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name: string): string => {
  const value = process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!value) throw new Error(`EXPLICIT_${name.toUpperCase().replaceAll('-', '_')}_REQUIRED`);
  return value;
};
const allowLineageQualifiedSubsetMap = process.argv.includes('--allow-lineage-qualified-subset-map');
const inputPath = (name: string) => {
  const result = path.resolve(ROOT, arg(name));
  if (!result.startsWith(`${ROOT}${path.sep}`)) throw new Error(`INPUT_OUTSIDE_REPOSITORY:${name}`);
  return result;
};
const sha = (value: string | Buffer) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
};
const parseJsonl = (bytes: Buffer, label: string) => bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
  try { return JSON.parse(line); } catch { throw new Error(`${label}_INVALID_JSONL_LINE:${index + 1}`); }
});

const crosswalkManifestPath = inputPath('crosswalk-manifest');
const crosswalkManifest = JSON.parse(fs.readFileSync(crosswalkManifestPath, 'utf8'));
const crosswalkPath = path.resolve(ROOT, crosswalkManifest.output.path);
if (!crosswalkPath.startsWith(`${ROOT}${path.sep}`)) throw new Error('CROSSWALK_OUTPUT_PATH_OUTSIDE_REPOSITORY');
const lineagePath = inputPath('lineage-report');
const candidateMapPath = inputPath('candidate-map');
const outputRoot = path.resolve(ROOT, arg('output-root'));
const allowedRoot = path.resolve(ROOT, allowLineageQualifiedSubsetMap
  ? '.tmp/atlas/mapreduce-packet-chunk-evidence-overlay-v2'
  : '.tmp/atlas/mapreduce-packet-chunk-evidence-overlay-v1');
if (outputRoot !== allowedRoot && !outputRoot.startsWith(`${allowedRoot}${path.sep}`)) throw new Error('OUTPUT_ROOT_OUTSIDE_OVERLAY_ROOT');

const crosswalkBytes = fs.readFileSync(crosswalkPath);
if (sha(crosswalkBytes) !== crosswalkManifest.output.sha256) throw new Error('PACKET_CROSSWALK_DIGEST_MISMATCH');
if (crosswalkManifest.counts?.conserved !== true || crosswalkManifest.writes?.postgres !== 0
  || crosswalkManifest.writes?.qdrant !== 0 || crosswalkManifest.writes?.valkey !== 0
  || crosswalkManifest.writes?.rabbitmq !== 0) {
  throw new Error('PACKET_CROSSWALK_RECEIPT_INVALID');
}
const crosswalkRows = parseJsonl(crosswalkBytes, 'PACKET_CROSSWALK');
const lineageReport = JSON.parse(fs.readFileSync(lineagePath, 'utf8'));
const rawCandidateMap = JSON.parse(fs.readFileSync(candidateMapPath, 'utf8'));
const candidateMap = candidateOrdinalMapV1Schema.parse(allowLineageQualifiedSubsetMap
  ? projectCurrentOrdinalMapCoreV1(rawCandidateMap)
  : rawCandidateMap) as CandidateOrdinalMapV1;
assertCandidateOrdinalMapIntegrityV1(candidateMap);
if (lineageReport.canonicalAuthority !== false || lineageReport.databaseWrites !== 0
  || lineageReport.sourceWorkspaceRevision !== candidateMap.workspaceRevision
  || (allowLineageQualifiedSubsetMap
    ? rawCandidateMap.lineageQualifiedRowCount !== candidateMap.rowCount
      || rawCandidateMap.lineageRequired !== true || rawCandidateMap.canonicalOrderingPolicy !== 'CANONICAL_ID_ASCENDING'
    : candidateMap.rowCount !== 16_151)
  || candidateMap.candidateSnapshotRevision !== crosswalkManifest.authority.candidateSnapshotRevision
  || candidateMap.ordinalMapChecksum !== crosswalkManifest.authority.ordinalMapChecksum
  || candidateMap.candidateSnapshotRevision !== crosswalkManifest.authority.candidateSnapshotRevision
  || candidateMap.ordinalMapChecksum !== crosswalkManifest.authority.ordinalMapChecksum
  || candidateMap.candidates.some((candidate, ordinal) => candidate.candidateOrdinal !== ordinal)) {
  throw new Error('CANDIDATE_LINEAGE_COORDINATE_MISMATCH');
}

const candidateByPacket = new Map(candidateMap.candidates.map((candidate) => [candidate.packetKey, candidate]));
const lineageByPacket = new Map<string, Record<string, any>[]>();
for (const row of lineageReport.lineageEvidence ?? []) {
  const key = JSON.stringify([row.packetKey, row.sourceRef, row.sourceRevision, row.workspaceRevision]);
  (lineageByPacket.get(key) ?? lineageByPacket.set(key, []).get(key)!).push(row);
}
const indexedByChunk = new Map<string, Record<string, any>[]>();
for (const row of lineageReport.indexedChunkEvidence?.rows ?? []) {
  const key = JSON.stringify([row.chunkRowId, row.sourceRef]);
  (indexedByChunk.get(key) ?? indexedByChunk.set(key, []).get(key)!).push(row);
}

const exactPacketRows = crosswalkRows.filter((row) => row.status === 'EXACT_CURRENT_CANDIDATE_MATCH');
const overlayRows: Record<string, unknown>[] = [];
const packetOutcomes: Record<string, number> = {};
for (const packetRow of exactPacketRows) {
  const identity = packetRow.identity;
  const candidate = candidateByPacket.get(identity.packetKey);
  if (!candidate || candidate.candidateOrdinal !== identity.candidateOrdinal
    || candidate.canonicalId !== identity.canonicalId || candidate.sourceRef !== identity.sourceRef
    || candidate.sourceRevision !== identity.sourceRevision || candidate.workspaceRevision !== identity.workspaceRevision
    || identity.candidateSnapshotRevision !== candidateMap.candidateSnapshotRevision
    || identity.ordinalMapChecksum !== candidateMap.ordinalMapChecksum
    || packetRow.contentBindingEvidence?.verifiedCurrentSourceBytes !== true) {
    throw new Error(`CROSSWALK_CANDIDATE_IDENTITY_MISMATCH:${identity.packetKey}`);
  }
  const lineageKey = JSON.stringify([identity.packetKey, identity.sourceRef, identity.sourceRevision, identity.workspaceRevision]);
  const lineageRows = lineageByPacket.get(lineageKey) ?? [];
  const outcome = lineageRows.length === 0 ? 'NO_PROVEN_PACKET_CHUNK_LINEAGE' : 'PACKET_HAS_PROVEN_CHUNK_LINEAGE';
  packetOutcomes[outcome] = (packetOutcomes[outcome] ?? 0) + 1;
  for (const lineage of lineageRows) {
    if (lineage.membershipStatus !== 'EXACT_MULTI_MEMBER' || lineage.revisionStatus !== 'PROVEN'
      || lineage.sourceRef !== identity.sourceRef || lineage.sourceRevision !== identity.sourceRevision
      || lineage.workspaceRevision !== identity.workspaceRevision) throw new Error(`PACKET_CHUNK_LINEAGE_NOT_PROVEN:${lineage.chunkRowId}`);
    const indexedRows = indexedByChunk.get(JSON.stringify([lineage.chunkRowId, identity.sourceRef])) ?? [];
    if (indexedRows.length !== 1) throw new Error(`CHUNK_ROW_LOOKUP_NOT_UNIQUE:${lineage.chunkRowId}`);
    const indexed = indexedRows[0]!;
    if (indexed.indexedChunkId !== lineage.canonicalChunkId || indexed.fileContentHash !== identity.sourceRevision.slice('sha256:'.length)) {
      throw new Error(`CHUNK_FILE_HASH_OR_CANONICAL_ID_MISMATCH:${lineage.chunkRowId}`);
    }
    overlayRows.push({
      schema: 'atlas.mapreduce-packet-chunk-evidence-row.v1',
      candidateOrdinal: candidate.candidateOrdinal,
      candidateSnapshotRevision: candidateMap.candidateSnapshotRevision,
      ordinalMapChecksum: candidateMap.ordinalMapChecksum,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      sourceRevision: candidate.sourceRevision,
      workspaceRevision: candidate.workspaceRevision,
      chunkRowId: lineage.chunkRowId,
      canonicalChunkId: lineage.canonicalChunkId,
      lineageStatus: 'PROVEN',
      indexedChunkSourceRevision: indexed.indexedSourceRevision,
      indexedChunkWorkspaceRevision: indexed.indexedWorkspaceRevision,
      indexedFileContentHash: indexed.fileContentHash,
      currentSourceBytesVerified: true,
      fileContentHashEqualsSourceRevision: true,
      summaryState: !indexed.summaryPresent ? 'MISSING'
        : indexed.summaryAdmissionStatus === 'ADMITTED' ? 'CURRENT_ADMITTED'
          : 'LEGACY_SUMMARY_UNQUALIFIED',
      summaryDigest: indexed.summaryHash ?? null,
      semantic768Present: indexed.semantic768Present === true,
      embeddingEligible: indexed.embeddingEligible === true,
      evidenceRefs: [
        ...packetRow.evidenceRefs,
        `packet-chunk-lineage:${lineage.lineageProducerRevision}:${lineage.chunkRowId}`,
        `codebase-chunk-index:${lineage.chunkRowId}:file_content_hash=${indexed.fileContentHash}`,
      ],
      canonicalAuthority: false,
      featureAdmitted: false,
    });
  }
}
overlayRows.sort((a, b) => Number(a.candidateOrdinal) - Number(b.candidateOrdinal)
  || (String(a.canonicalChunkId) < String(b.canonicalChunkId) ? -1 : String(a.canonicalChunkId) > String(b.canonicalChunkId) ? 1 : 0));
if (new Set(overlayRows.map((row) => row.chunkRowId)).size !== overlayRows.length) throw new Error('DUPLICATE_CHUNK_ROW_IN_OVERLAY');

const grouped = new Map<number, number>();
for (const row of overlayRows) grouped.set(Number(row.candidateOrdinal), (grouped.get(Number(row.candidateOrdinal)) ?? 0) + 1);
const multiplicity = {
  candidateCount: exactPacketRows.length,
  candidatesWithZeroChunks: exactPacketRows.length - grouped.size,
  candidatesWithOneChunk: [...grouped.values()].filter((n) => n === 1).length,
  candidatesWithMultipleChunks: [...grouped.values()].filter((n) => n > 1).length,
  maxChunksPerCandidate: Math.max(0, ...grouped.values()),
};
const body = `${overlayRows.map((row) => JSON.stringify(row)).join('\n')}${overlayRows.length ? '\n' : ''}`;
const stamp = new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(outputRoot, stamp);
fs.mkdirSync(outDir, { recursive: true });
const outputPath = path.join(outDir, 'packet-chunk-evidence.ndjson');
fs.writeFileSync(outputPath, body, { flag: 'wx' });
const receipt: Record<string, any> = {
  schema: 'atlas.mapreduce-packet-chunk-evidence-overlay-manifest.v1',
  generatedAt: new Date().toISOString(),
  status: 'SEALED_NONCANONICAL_PACKET_CHUNK_EVIDENCE',
  inputs: {
    packetCrosswalkManifest: path.relative(ROOT, crosswalkManifestPath).replaceAll('\\', '/'),
    packetCrosswalkSha256: sha(crosswalkBytes),
    lineageReport: path.relative(ROOT, lineagePath).replaceAll('\\', '/'),
    candidateMap: path.relative(ROOT, candidateMapPath).replaceAll('\\', '/'),
  },
  candidateSnapshotRevision: candidateMap.candidateSnapshotRevision,
  ordinalMapChecksum: candidateMap.ordinalMapChecksum,
  candidateMapScope: allowLineageQualifiedSubsetMap ? 'LINEAGE_QUALIFIED_SUBSET' : 'FULL_CANDIDATE_SNAPSHOT',
  counts: {
    exactPacketCandidates: exactPacketRows.length,
    candidatesWithProvenChunkLineage: grouped.size,
    packetOutcomes,
    chunkRows: overlayRows.length,
    uniqueChunkRows: new Set(overlayRows.map((row) => row.chunkRowId)).size,
    fileContentHashExactSourceRevision: overlayRows.filter((row) => row.fileContentHashEqualsSourceRevision).length,
    chunkRowsWithStoredSourceRevisionMirror: overlayRows.filter((row) => row.indexedChunkSourceRevision !== null).length,
    chunkRowsWithStoredWorkspaceRevisionMirror: overlayRows.filter((row) => row.indexedChunkWorkspaceRevision !== null).length,
    chunkRowsWithSummaryText: overlayRows.filter((row) => row.summaryState !== 'MISSING').length,
    chunkRowsWithAdmittedSummary: overlayRows.filter((row) => row.summaryState === 'CURRENT_ADMITTED').length,
    chunkRowsWithSemantic768: overlayRows.filter((row) => row.semantic768Present).length,
    multiplicity,
  },
  output: { path: path.relative(ROOT, outputPath).replaceAll('\\', '/'), rows: overlayRows.length, sha256: sha(body) },
  policy: {
    sourceRevisionAuthority: 'existing byte-verified source binding plus proven packet-chunk lineage plus exact indexed full-file hash readback',
    nullChunkRevisionMirrorsRemainNull: true,
    packetChunkMultiplicityPreserved: true,
    historicalFilePathUsedAsIdentity: false,
    summaryPromoted: false,
    representationPromoted: false,
    canonicalAuthority: false,
    featureAdmitted: false,
  },
  writes: { postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0, neo4j: 0, graphify: 0 },
};
receipt.receiptChecksum = sha(canonicalJson(receipt));
const receiptPath = path.join(outDir, 'manifest.json');
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: receipt.status, counts: receipt.counts, output: receipt.output, receiptPath: path.relative(ROOT, receiptPath).replaceAll('\\', '/') }, null, 2));
