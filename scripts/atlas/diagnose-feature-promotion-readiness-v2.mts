import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFeaturePromotionReadinessV2 } from '../../sveltekit-frontend/src/lib/server/retrieval/feature-promotion-readiness-v2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_INPUT = 'docs/reports/mapreduce-chunk-readiness-v3-20260928T012835Z.json';
const args = process.argv.slice(2);

function argValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function sha256(bytes: Buffer | string): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

const inputRef = argValue('--input') ?? DEFAULT_INPUT;
const outputRef = argValue('--output');
assert(!args.some((arg) => arg.startsWith('--') && !['--input', '--output'].includes(arg)), 'UNKNOWN_ARGUMENT');
assert(!args.includes('--input') || !!argValue('--input'), 'MISSING_INPUT_VALUE');
assert(!args.includes('--output') || !!outputRef, 'MISSING_OUTPUT_VALUE');

const inputPath = path.resolve(ROOT, inputRef);
const sourceBytes = readFileSync(inputPath);
const source = JSON.parse(sourceBytes.toString('utf8')) as any;
assert(source.schema === 'atlas.mapreduce-chunk-readiness-receipt.v3', 'UNSUPPORTED_SOURCE_RECEIPT_SCHEMA');
assert(source.status === 'READINESS_REPLAY_COMPLETE', 'SOURCE_RECEIPT_NOT_COMPLETE');
assert(source.canonicalAuthority === false, 'SOURCE_RECEIPT_AUTHORITY_MUST_BE_FALSE');
assert(source.currentSemanticOwner?.table === 'codebase_chunk_index', 'CURRENT_SEMANTIC_OWNER_TABLE_MISMATCH');
assert(source.currentSemanticOwner?.column === 'content_embedding_768', 'CURRENT_SEMANTIC_OWNER_COLUMN_MISMATCH');
assert(source.currentSemanticOwner?.storageType === 'vector(768)', 'CURRENT_SEMANTIC_OWNER_TYPE_MISMATCH');
assert(source.receiptChecksum && source.receiptChecksum === (() => {
  const checksumBody = { ...source, receiptChecksum: null };
  return sha256(JSON.stringify(checksumBody));
})(), 'SOURCE_RECEIPT_CHECKSUM_MISMATCH');

const rowDetailsRef = source.artifacts?.rowDetails;
assert(typeof rowDetailsRef === 'string' && rowDetailsRef.length > 0, 'ROW_DETAILS_REF_MISSING');
const rowDetailsPath = path.resolve(ROOT, rowDetailsRef);
const rowDetailsBytes = readFileSync(rowDetailsPath);
assert(sha256(rowDetailsBytes) === source.artifacts.rowDetailsChecksum, 'ROW_DETAILS_CHECKSUM_MISMATCH');

const candidateCount = source.candidateCount;
const chunkCount = source.chunkCount;
assert(Number.isInteger(candidateCount) && candidateCount > 0, 'INVALID_CANDIDATE_COUNT');
assert(Number.isInteger(chunkCount) && chunkCount > 0, 'INVALID_CHUNK_COUNT');
const measured = source.measured ?? {};
const counts = {
  packetQualified: measured.packetStates?.PACKET_REVISION_QUALIFIED ?? 0,
  chunkQualified: measured.chunkStates?.CHUNK_REVISION_QUALIFIED ?? 0,
  eligibilityQualified: measured.eligibilityStates?.CHUNK_REVISION_QUALIFIED ?? 0,
  semanticPhysicalMissing: measured.semantic768PhysicalStates?.MISSING ?? 0,
  semanticQualityMissing: measured.semantic768QualityStates?.MISSING ?? 0,
  representationUnqualified: measured.semanticRepresentationBindingStates?.UNQUALIFIED_OR_INCOMPLETE ?? 0,
  currentSourceBytesMatch: measured.currentSourceBytesMatchRows ?? 0,
  sourceFilesRehashed: measured.currentSourceFilesRehashed ?? 0,
};
const zeroWrites = ['postgres', 'qdrant', 'valkey', 'rabbitmq', 'neo4j', 'graphify']
  .every((store) => source.writes?.[store] === 0);
assert(zeroWrites, 'SOURCE_RECEIPT_HAS_WRITES');

const sourceEvidenceRef = `${inputRef.replaceAll('\\', '/')}#${source.receiptChecksum}`;
const coordinatesProven = typeof source.candidateSnapshotRevision === 'string'
  && source.candidateSnapshotRevision.length > 0
  && /^[a-f0-9]{64}$/i.test(source.ordinalMapChecksum ?? '');
const lineageProven = counts.packetQualified === chunkCount
  && counts.chunkQualified === chunkCount
  && counts.eligibilityQualified === chunkCount
  && counts.currentSourceBytesMatch === chunkCount
  && counts.sourceFilesRehashed === candidateCount;
const semanticBlocked = counts.semanticPhysicalMissing === chunkCount
  || counts.semanticQualityMissing === chunkCount
  || counts.representationUnqualified === chunkCount;

const readiness = buildFeaturePromotionReadinessV2({
  featureId: 'semantic_768',
  candidateSnapshotRevision: source.candidateSnapshotRevision,
  ordinalMapChecksum: source.ordinalMapChecksum,
  representationId: 'semantic_768',
  storage: source.currentSemanticOwner,
  gates: {
    FEATURE_ARTIFACT_PRESENT: {
      state: 'OPEN', evidenceRefs: [sourceEvidenceRef],
      note: 'The readiness receipt proves measurements, not an admitted semantic feature artifact.',
    },
    SAME_SNAPSHOT_COORDINATES: {
      state: coordinatesProven ? 'PROVEN' : 'BLOCKED', evidenceRefs: [sourceEvidenceRef],
      note: coordinatesProven ? 'Candidate snapshot and ordinal map are pinned by the source receipt.' : 'Snapshot coordinates are incomplete.',
    },
    GRAIN_QUALIFICATION: {
      state: lineageProven ? 'PROVEN' : 'BLOCKED', evidenceRefs: [sourceEvidenceRef],
      note: `packet=${counts.packetQualified}/${chunkCount}; chunk=${counts.chunkQualified}/${chunkCount}; eligibility=${counts.eligibilityQualified}/${chunkCount}; sourceBytes=${counts.currentSourceBytesMatch}/${chunkCount}; filesRehashed=${counts.sourceFilesRehashed}/${candidateCount}.`,
    },
    INPUT_PROVENANCE: {
      state: semanticBlocked ? 'BLOCKED' : 'OPEN', evidenceRefs: [sourceEvidenceRef],
      note: `semanticPhysicalMissing=${counts.semanticPhysicalMissing}/${chunkCount}; qualityMissing=${counts.semanticQualityMissing}/${chunkCount}; representationUnqualified=${counts.representationUnqualified}/${chunkCount}.`,
    },
    MISSING_VALUE_POLICY: { state: 'OPEN', evidenceRefs: [], note: 'No cohort-bound admitted matrix artifact was evaluated by this diagnostic.' },
    PLACEHOLDER_MASKING: { state: 'OPEN', evidenceRefs: [], note: 'No cohort-bound placeholder-mask receipt was evaluated by this diagnostic.' },
    CONTEXT_MANIFEST_READBACK: { state: 'OPEN', evidenceRefs: [], note: 'ContextManifest readback was not part of the source readiness replay.' },
    PRODUCTION_SCORER_CALLER: { state: 'OPEN', evidenceRefs: [], note: 'Production scorer exposure was not tested by the source readiness replay.' },
    HELD_OUT_EVALUATION: { state: 'DEFERRED', evidenceRefs: [], note: 'No eligible frozen human relevance labels are available in this gate.' },
    PERSISTENCE_AUTHORIZATION: { state: 'DEFERRED', evidenceRefs: [], note: 'No persistent feature admission or DDL authorization is included.' },
  },
  canonicalAuthority: false,
  writesPerformed: false,
});

const output = `${JSON.stringify(readiness, null, 2)}\n`;
if (outputRef) {
  const outputPath = path.resolve(ROOT, outputRef);
  const reportsRoot = path.resolve(ROOT, 'docs/reports') + path.sep;
  assert(outputPath.startsWith(reportsRoot), 'OUTPUT_MUST_STAY_UNDER_DOCS_REPORTS');
  writeFileSync(outputPath, output, { encoding: 'utf8', flag: 'wx' });
}
process.stdout.write(output);
