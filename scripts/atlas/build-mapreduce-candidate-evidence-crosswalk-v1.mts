#!/usr/bin/env node
/**
 * LARGE_CORPUS_CANONICAL_JOIN_01 evidence-only crosswalk.
 *
 * Joins an existing sealed PRIMARY_METADATA_CORPUS shard to the already
 * byte-verified canonical source-binding receipt, exact packet/source revision
 * evidence, and an explicit CandidateOrdinalMapV1. Content digests are only
 * a bridge into the source-binding owner; this output never promotes identity
 * or metadata. Repeated historical digests are conserved but excluded.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
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
const repoFile = (name: string) => {
  const absolute = path.resolve(ROOT, arg(name));
  if (!absolute.startsWith(`${ROOT}${path.sep}`)) throw new Error(`INPUT_OUTSIDE_REPOSITORY:${name}`);
  return absolute;
};
const digest = (value: string | Buffer) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
};
const tupleKey = (values: unknown[]) => JSON.stringify(values);

const shardDir = repoFile('shard-dir');
const sourceReportPath = repoFile('source-report');
const authorityReportPath = repoFile('authority-report');
const lineageReportPath = repoFile('lineage-report');
const candidateMapPath = repoFile('candidate-map');
const outputRoot = repoFile('output-root');
const allowedOutputRoot = path.resolve(ROOT, allowLineageQualifiedSubsetMap
  ? '.tmp/atlas/mapreduce-candidate-evidence-crosswalk-v2'
  : '.tmp/atlas/mapreduce-candidate-evidence-crosswalk-v1');
if (outputRoot !== allowedOutputRoot && !outputRoot.startsWith(`${allowedOutputRoot}${path.sep}`)) {
  throw new Error('OUTPUT_ROOT_OUTSIDE_MAPREDUCE_CANDIDATE_CROSSWALK');
}

const sourceReport = JSON.parse(fs.readFileSync(sourceReportPath, 'utf8'));
const authorityReport = JSON.parse(fs.readFileSync(authorityReportPath, 'utf8'));
const lineageReport = JSON.parse(fs.readFileSync(lineageReportPath, 'utf8'));
const rawMap = JSON.parse(fs.readFileSync(candidateMapPath, 'utf8'));
const map = candidateOrdinalMapV1Schema.parse(allowLineageQualifiedSubsetMap
  ? projectCurrentOrdinalMapCoreV1(rawMap)
  : rawMap) as CandidateOrdinalMapV1;
assertCandidateOrdinalMapIntegrityV1(map);

const shardManifest = JSON.parse(fs.readFileSync(path.join(shardDir, 'manifest.json'), 'utf8'));
if (shardManifest.schema !== 'atlas.large-corpus-enrichment-shards.v1'
  || shardManifest.canonicalAuthority !== false
  || shardManifest.rootSha256 !== '85712fd9ec1c065857361b2f926cb218b479555f89cd89d28094165e20e3f3ff'
  || !Array.isArray(shardManifest.artifacts)) throw new Error('SEALED_LARGE_CORPUS_SHARD_MANIFEST_REQUIRED');
const metadataArtifacts = shardManifest.artifacts.filter((artifact: any) => artifact.inputPath === '.tmp/mapreduce-full-v5.ndjson');
if (metadataArtifacts.length !== 1 || metadataArtifacts[0].records !== 5_000 || metadataArtifacts[0].shardCount !== 1
  || !Array.isArray(metadataArtifacts[0].shards) || metadataArtifacts[0].shards.length !== 1) throw new Error('ONE_METADATA_SHARD_REQUIRED');
const shardEntry = metadataArtifacts[0].shards[0];
const shardPath = path.resolve(shardDir, shardEntry.path);
if (!shardPath.startsWith(`${shardDir}${path.sep}`)) throw new Error('SHARD_PATH_ESCAPE');
const shardBytes = fs.readFileSync(shardPath);
const shardDigest = crypto.createHash('sha256').update(shardBytes).digest('hex');
if (shardDigest !== shardEntry.sha256 || shardEntry.records !== 5_000) throw new Error('SEALED_METADATA_SHARD_CHECKSUM_OR_COUNT_MISMATCH');

const authorityRevision = authorityReport.workspaceRevision;
if (authorityReport.status !== 'CURRENT_SOURCE_AUTHORITY_PROVEN'
  || !authorityReport.proof?.workspaceAuthorityProven
  || sourceReport.workspaceRevision !== authorityRevision
  || sourceReport.status !== 'READ_ONLY_EXACT_PATH_CROSSWALK_COMPLETE'
  || sourceReport.policy?.databaseTransaction !== 'READ ONLY; ROLLBACK'
  || sourceReport.policy?.databaseWrites !== 0
  || lineageReport.canonicalAuthority !== false
  || lineageReport.databaseWrites !== 0
  || lineageReport.sourceReport !== path.relative(ROOT, sourceReportPath).replaceAll('\\', '/')
  || lineageReport.sourceWorkspaceRevision !== authorityRevision
  || map.workspaceRevision !== authorityRevision
  || (allowLineageQualifiedSubsetMap
    ? map.rowCount < 1 || rawMap.lineageQualifiedRowCount !== map.rowCount
      || rawMap.lineageRequired !== true || rawMap.canonicalOrderingPolicy !== 'CANONICAL_ID_ASCENDING'
    : map.rowCount !== 16_151)
  || map.candidates.some((candidate, index) => candidate.candidateOrdinal !== index)) {
  throw new Error('PINNED_AUTHORITY_LINEAGE_OR_CANDIDATE_SNAPSHOT_MISMATCH');
}

const bindings = sourceReport.contentDigestSourceBinding?.verifiedBindings;
if (!Array.isArray(bindings)) throw new Error('VERIFIED_SOURCE_BINDING_ROWS_REQUIRED');
const bindingByDigest = new Map<string, Record<string, any>>();
for (const binding of bindings) {
  if (binding.currentSourceBytesVerified !== true || binding.canonicalAuthority !== false
    || binding.workspaceRevision !== authorityRevision
    || binding.sourceRevision !== `sha256:${binding.inputContentHash}`
    || binding.contentDigest !== binding.inputContentHash
    || !/^[a-f0-9]{64}$/.test(binding.inputContentHash)
    || !/^[a-f0-9]{64}$/.test(binding.bindingChecksum)) throw new Error('VERIFIED_BINDING_CONTRACT_INVALID');
  if (bindingByDigest.has(binding.inputContentHash)) throw new Error(`AMBIGUOUS_VERIFIED_BINDING_DIGEST:${binding.inputContentHash}`);
  bindingByDigest.set(binding.inputContentHash, binding);
}

const exactPacketByBinding = new Map<string, Record<string, any>[]>();
for (const packet of lineageReport.packetEvidence ?? []) {
  if (typeof packet.packetKey !== 'string' || typeof packet.sourceRef !== 'string'
    || typeof packet.sourceRevision !== 'string' || typeof packet.workspaceRevision !== 'string') continue;
  const key = tupleKey([packet.sourceRef, packet.sourceRevision, packet.workspaceRevision]);
  (exactPacketByBinding.get(key) ?? exactPacketByBinding.set(key, []).get(key)!).push(packet);
}
const candidateByPacketTuple = new Map(map.candidates.map((candidate) => [
  tupleKey([candidate.packetKey, candidate.sourceRef, candidate.sourceRevision, candidate.workspaceRevision]), candidate,
]));

const parsedRows = shardBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
if (parsedRows.length !== shardEntry.records || parsedRows.some((row) => row.corpus !== 'PRIMARY_METADATA_CORPUS'
  || row.schema !== 'atlas.enriched-index-record-local.v1' || row.canonicalAuthority !== false)) {
  throw new Error('SEALED_PRIMARY_METADATA_SHARD_SCHEMA_MISMATCH');
}
const countsByDigest = new Map<string, number>();
for (const row of parsedRows) {
  const value = String(row.metadata?.contentHash ?? '').toLowerCase();
  if (/^[a-f0-9]{64}$/.test(value)) countsByDigest.set(value, (countsByDigest.get(value) ?? 0) + 1);
}

const outputRows = parsedRows.map((row) => {
  const historicalDigest = String(row.metadata?.contentHash ?? '').toLowerCase();
  const binding = /^[a-f0-9]{64}$/.test(historicalDigest) ? bindingByDigest.get(historicalDigest) : undefined;
  const duplicateCount = countsByDigest.get(historicalDigest) ?? 0;
  const base = {
    schema: 'atlas.mapreduce-candidate-evidence-crosswalk-row.v1',
    inputArtifactSha256: row.sourceEvidence.artifactSha256,
    recordOrdinal: row.sourceEvidence.recordOrdinal,
    historicalFilePath: row.metadata?.filePath ?? null,
    inputContentHash: /^[a-f0-9]{64}$/.test(historicalDigest) ? historicalDigest : null,
    duplicateContentDigestRecordCount: duplicateCount,
    identity: null as Record<string, unknown> | null,
    canonicalAuthority: false as const,
    featureAdmitted: false as const,
  };
  if (!binding) return { ...base, status: 'NO_UNIQUE_VERIFIED_CURRENT_BINDING' };
  if (duplicateCount > 1) return {
    ...base,
    status: 'DUPLICATE_CONTENT_DIGEST_INPUT',
    contentBindingEvidence: {
      sourceRef: binding.canonicalSourceRef, sourceRevision: binding.sourceRevision,
      workspaceRevision: binding.workspaceRevision, bindingChecksum: binding.bindingChecksum,
      producerRevision: binding.producerRevision,
    },
  };
  const packetKey = tupleKey([binding.canonicalSourceRef, binding.sourceRevision, binding.workspaceRevision]);
  const packets = exactPacketByBinding.get(packetKey) ?? [];
  if (packets.length !== 1) return {
    ...base,
    status: packets.length > 1 ? 'AMBIGUOUS_CURRENT_PACKET' : 'NO_EXACT_PACKET_SOURCE_REVISION_MATCH',
    contentBindingEvidence: {
      sourceRef: binding.canonicalSourceRef, sourceRevision: binding.sourceRevision,
      workspaceRevision: binding.workspaceRevision, bindingChecksum: binding.bindingChecksum,
      producerRevision: binding.producerRevision,
    },
  };
  const packet = packets[0]!;
  const candidate = candidateByPacketTuple.get(tupleKey([packet.packetKey, binding.canonicalSourceRef, binding.sourceRevision, binding.workspaceRevision]));
  if (!candidate) return {
    ...base,
    status: 'PACKET_NOT_IN_PINNED_CANDIDATE_SNAPSHOT',
    contentBindingEvidence: { sourceRef: binding.canonicalSourceRef, sourceRevision: binding.sourceRevision, workspaceRevision: binding.workspaceRevision, bindingChecksum: binding.bindingChecksum },
    packetKey: packet.packetKey,
  };
  return {
    ...base,
    status: 'EXACT_CURRENT_CANDIDATE_MATCH',
    identity: {
      candidateOrdinal: candidate.candidateOrdinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      sourceRevision: candidate.sourceRevision,
      workspaceRevision: candidate.workspaceRevision,
      candidateSnapshotRevision: map.candidateSnapshotRevision,
      ordinalMapChecksum: map.ordinalMapChecksum,
    },
    contentBindingEvidence: {
      bindingChecksum: binding.bindingChecksum,
      producerRevision: binding.producerRevision,
      verifiedCurrentSourceBytes: true,
      contentDigest: binding.contentDigest,
      byteLength: binding.byteLength,
    },
    evidenceRefs: [
      `mapreduce:${row.sourceEvidence.artifactSha256}#record=${row.sourceEvidence.recordOrdinal}`,
      `source-binding:${binding.bindingChecksum}`,
      `atlas_packets:${packet.packetKey}:${binding.sourceRevision}`,
      `candidate-snapshot:${map.candidateSnapshotRevision}:${candidate.candidateOrdinal}`,
    ],
  };
});

const counts: Record<string, number> = {};
for (const row of outputRows) counts[row.status] = (counts[row.status] ?? 0) + 1;
const exact = outputRows.filter((row) => row.status === 'EXACT_CURRENT_CANDIDATE_MATCH');
const ordinals = exact.map((row) => row.identity!.candidateOrdinal as number);
if (outputRows.length !== parsedRows.length || new Set(ordinals).size !== ordinals.length) throw new Error('CROSSWALK_CONSERVATION_OR_CANDIDATE_ORDINAL_DUPLICATE');

const stamp = new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(outputRoot, stamp);
fs.mkdirSync(outDir, { recursive: true });
const outputBody = `${outputRows.map((row) => JSON.stringify(row)).join('\n')}\n`;
const outputPath = path.join(outDir, 'crosswalk.ndjson');
fs.writeFileSync(outputPath, outputBody, { flag: 'wx' });
const receipt = {
  schema: 'atlas.mapreduce-candidate-evidence-crosswalk-receipt.v1',
  generatedAt: new Date().toISOString(),
  status: exact.length > 0 ? 'PARTIAL_EXACT_PACKET_CANDIDATE_CROSSWALK' : 'NO_EXACT_PACKET_CANDIDATES',
  mode: 'SEALED_LOCAL_ARTIFACTS_ONLY',
  authority: {
    sourceBindingOwner: sourceReport.contentDigestSourceBinding.owner,
    workspaceRevision: authorityRevision,
    authorityReport: path.relative(ROOT, authorityReportPath).replaceAll('\\', '/'),
    sourceReport: path.relative(ROOT, sourceReportPath).replaceAll('\\', '/'),
    packetLineageReport: path.relative(ROOT, lineageReportPath).replaceAll('\\', '/'),
    candidateMap: path.relative(ROOT, candidateMapPath).replaceAll('\\', '/'),
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    ordinalMapChecksum: map.ordinalMapChecksum,
    candidateMapScope: allowLineageQualifiedSubsetMap ? 'LINEAGE_QUALIFIED_SUBSET' : 'FULL_CANDIDATE_SNAPSHOT',
    candidateMapRows: map.rowCount,
  },
  inputs: {
    metadataShard: path.relative(ROOT, shardPath).replaceAll('\\', '/'),
    metadataShardSha256: `sha256:${shardDigest}`,
    metadataRows: parsedRows.length,
    sourceArtifactSha256: parsedRows[0]?.sourceEvidence?.artifactSha256 ?? null,
    uniqueCurrentByteVerifiedBindings: bindings.length,
    exactPacketRowsFromReadOnlyLineageAudit: lineageReport.counts.exactPacketRows,
    exactPacketCandidateRowsInCandidateMap: map.rowCount,
  },
  counts: {
    rowsIn: parsedRows.length,
    rowsOut: outputRows.length,
    outcomes: counts,
    exactCandidateRows: exact.length,
    exactDistinctCandidateOrdinals: new Set(ordinals).size,
    unclassified: outputRows.filter((row) => !row.status).length,
    conserved: outputRows.length === parsedRows.length,
  },
  output: { path: path.relative(ROOT, outputPath).replaceAll('\\', '/'), rows: outputRows.length, sha256: digest(outputBody) },
  semantics: {
    contentDigestIsBridgeNotIdentity: true,
    historicalFilePathRemainsUntrustedHint: true,
    duplicateDigestRowsExcluded: true,
    chunkCurrentRevisionQualification: 'BLOCKED: read-only audit found zero lineage chunk rows whose indexed source/workspace revision tuple matches the current binding',
    canonicalAuthority: false,
    featureAdmitted: false,
  },
  writes: { postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0, neo4j: 0, graphify: 0 },
};
receipt['receiptChecksum'] = digest(canonicalJson(receipt));
const receiptPath = path.join(outDir, 'manifest.json');
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: receipt.status, counts: receipt.counts, output: receipt.output, receiptPath: path.relative(ROOT, receiptPath).replaceAll('\\', '/') }, null, 2));
