#!/usr/bin/env node
/**
 * Exact, artifact-only legacy-summary HINT → current CandidateOrdinal crosswalk.
 * Trust comes from the sealed census; identity/revisions come from CandidateOrdinalMapV1.
 * No vector bytes are copied and no authority or datastore state is changed.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  assertCandidateOrdinalMapIntegrityV1,
  type CandidateOrdinalMapV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const candidateDir = path.join(ROOT, '.tmp/atlas/candidate-ordinal-bridged-v1/20260926T074719Z');
const hintDir = path.join(ROOT, '.tmp/atlas/legacy-summary-hint-embedding-full-v1/20260926T063456Z');
const censusReceiptPath = path.join(ROOT, 'docs/reports/legacy-summary-census-v1-20260926T0800Z.json');
const censusReceipt = JSON.parse(fs.readFileSync(censusReceiptPath, 'utf8'));
const censusPath = path.resolve(ROOT, censusReceipt.shardPath);
const stamp = new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(ROOT, `.tmp/atlas/legacy-summary-hint-ordinal-join-v1/${stamp}`);
const sha = (data: string | Buffer) => `sha256:${crypto.createHash('sha256').update(data).digest('hex')}`;

async function hashFile(file: string): Promise<{ sha256: string; bytes: number }> {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  for await (const chunk of fs.createReadStream(file)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { sha256: `sha256:${hash.digest('hex')}`, bytes };
}

async function* readJsonl<T>(file: string): AsyncGenerator<T> {
  const lines = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    yield JSON.parse(line) as T;
  }
}

const candidatePath = path.join(candidateDir, 'candidate-ordinal-map-v1.json');
const candidateMap = JSON.parse(fs.readFileSync(candidatePath, 'utf8')) as CandidateOrdinalMapV1;
assertCandidateOrdinalMapIntegrityV1(candidateMap);
const hintManifest = JSON.parse(fs.readFileSync(path.join(hintDir, 'manifest.json'), 'utf8'));
if (hintManifest.schema !== 'atlas.summary-hint-vector-set.v1'
  || hintManifest.status !== 'ARTIFACT_ONLY_COMPLETE'
  || hintManifest.canonicalAuthority !== false
  || hintManifest.selectedRows !== hintManifest.embeddedRows
  || hintManifest.dim !== 768
  || hintManifest.databaseWrites !== 0
  || hintManifest.qdrantWrites !== 0
  || hintManifest.valkeyWrites !== 0
  || hintManifest.rabbitmqPublishes !== 0) {
  throw new Error('SEALED_HINT_VECTOR_ARTIFACT_REQUIRED');
}
const [indexFile, vectorFile, censusFile] = await Promise.all([
  hashFile(path.join(hintDir, 'index.ndjson')),
  hashFile(path.join(hintDir, 'vectors.f32')),
  hashFile(censusPath),
]);
if (indexFile.sha256 !== hintManifest.files.index.sha256
  || indexFile.bytes <= 0
  || vectorFile.sha256 !== hintManifest.files.vectors.sha256
  || vectorFile.bytes !== hintManifest.embeddedRows * hintManifest.dim * 4
  || Number(hintManifest.files.index.rows) !== hintManifest.embeddedRows) {
  throw new Error('HINT_VECTOR_SET_CHECKSUM_OR_LAYOUT_MISMATCH');
}
if (censusReceipt.schema !== 'atlas.legacy-summary-census.v1' || censusReceipt.mode !== 'READ_ONLY'
  || censusReceipt.conservation?.pass !== true || censusReceipt.conservation?.classified !== censusReceipt.conservation?.total
  || censusReceipt.readOnlyGuard?.pass !== true || censusReceipt.readOnlyGuard?.databaseWrites !== 0
  || censusReceipt.shardSha256 !== censusFile.sha256) throw new Error('FRESH_LEGACY_SUMMARY_CENSUS_RECEIPT_REQUIRED');

type CensusRow = { schema: string; chunkRowId: string; chunkId: string; summaryDigest: string; class: string; quarantined: boolean; detectorClean: boolean; lineageExact: boolean };
type HintIndexRow = { schema: string; row: number; chunkRowId: string; chunkId: string; hintClass: string; summaryDigest: string };
const census = new Map<string, CensusRow>();
for await (const row of readJsonl<CensusRow>(censusPath)) {
  if (row.schema !== 'atlas.legacy-summary-census-row.v1'
    || !row.chunkRowId || !/^sha256:[0-9a-f]{64}$/.test(row.summaryDigest)
    || census.has(row.chunkRowId)) throw new Error(`INVALID_OR_DUPLICATE_CENSUS_ROW:${row.chunkRowId}`);
  census.set(row.chunkRowId, row);
}

const candidateByChunkRowId = new Map<string, CandidateOrdinalMapV1['candidates'][number]>();
for (const candidate of candidateMap.candidates) {
  const ref = candidate.evidenceRefs.find((item) => item.startsWith('atlas_packet_chunk_lineage:'));
  const chunkRowId = ref?.slice('atlas_packet_chunk_lineage:'.length);
  if (!chunkRowId || candidateByChunkRowId.has(chunkRowId)) throw new Error(`CANDIDATE_LINEAGE_ID_MISSING_OR_DUPLICATE:${chunkRowId ?? 'null'}`);
  candidateByChunkRowId.set(chunkRowId, candidate);
}

const rows: Array<Record<string, unknown>> = [];
const seenHintRows = new Set<number>();
const seenHintIds = new Set<string>();
const stats = { hintRows: 0, censusMatches: 0, exactCandidateMatches: 0, lineageBoundMatches: 0, unqualifiedExcluded: 0, quarantinedRejected: 0, contaminatedRejected: 0, boundWithoutCandidateMap: 0, identityMismatches: 0 };
for await (const hint of readJsonl<HintIndexRow>(path.join(hintDir, 'index.ndjson'))) {
  stats.hintRows++;
  if (hint.schema !== 'atlas.summary-hint-vector-index.v1'
    || !Number.isInteger(hint.row) || hint.row < 0 || seenHintRows.has(hint.row)
    || seenHintIds.has(hint.chunkRowId) || !/^sha256:[0-9a-f]{64}$/.test(hint.summaryDigest)) {
    throw new Error(`INVALID_OR_DUPLICATE_HINT_INDEX_ROW:${hint.row}`);
  }
  seenHintRows.add(hint.row);
  seenHintIds.add(hint.chunkRowId);
  const censusRow = census.get(hint.chunkRowId);
  if (!censusRow || censusRow.chunkId !== hint.chunkId || censusRow.summaryDigest !== hint.summaryDigest) {
    throw new Error(`HINT_CENSUS_IDENTITY_OR_DIGEST_MISMATCH:${hint.chunkRowId}`);
  }
  stats.censusMatches++;
  if (censusRow.quarantined) { stats.quarantinedRejected++; continue; }
  if (censusRow.class === 'LEGACY_CONTAMINATED' || !censusRow.detectorClean) { stats.contaminatedRejected++; continue; }
  if (censusRow.class !== 'LEGACY_HINT_LINEAGE_BOUND') { stats.unqualifiedExcluded++; continue; }
  if (!censusRow.lineageExact) throw new Error(`LINEAGE_BOUND_CLASS_WITHOUT_EXACT_LINEAGE:${hint.chunkRowId}`);

  const candidate = candidateByChunkRowId.get(hint.chunkRowId);
  if (!candidate || candidate.canonicalId !== hint.chunkId || candidate.sourceRef.length === 0
    || !/^sha256:[0-9a-f]{64}$/.test(candidate.sourceRevision)
    || candidate.workspaceRevision !== candidateMap.workspaceRevision
    || candidate.degradedIdentity) {
    if (!candidate && censusRow.class === 'LEGACY_HINT_LINEAGE_BOUND') stats.boundWithoutCandidateMap++;
    else stats.identityMismatches++;
    continue;
  }
  stats.exactCandidateMatches++;
  stats.lineageBoundMatches++;
  rows.push({
    schema: 'atlas.legacy-summary-candidate-ordinal-hint.v1',
    candidateOrdinal: candidate.candidateOrdinal,
    candidateSnapshotRevision: candidate.candidateSnapshotRevision,
    ordinalMapChecksum: candidateMap.ordinalMapChecksum,
    chunkRowId: hint.chunkRowId,
    canonicalChunkId: candidate.canonicalId,
    packetKey: candidate.packetKey,
    sourceRef: candidate.sourceRef,
    sourceRevision: candidate.sourceRevision,
    workspaceRevision: candidate.workspaceRevision,
    summaryDigest: hint.summaryDigest,
    embeddedCensusClass: hint.hintClass,
    vectorIndexRow: hint.row,
    vectorByteOffset: hint.row * hintManifest.dim * 4,
    trust: 'LEGACY_HINT_LINEAGE_BOUND',
    canonicalAuthority: false,
    retrievalVoteAdded: false,
  });
}

if (stats.hintRows !== hintManifest.embeddedRows || stats.hintRows !== 29_219
  || stats.censusMatches !== stats.hintRows || stats.exactCandidateMatches !== censusReceipt.tally.cleanNotQuarantinedLineageBound
  || stats.lineageBoundMatches !== stats.exactCandidateMatches || stats.unqualifiedExcluded !== 28_608
  || stats.quarantinedRejected !== 0 || stats.contaminatedRejected !== 281 || stats.boundWithoutCandidateMap !== 0 || stats.identityMismatches !== 0) {
  throw new Error(`HINT_ORDINAL_CONSERVATION_FAILED:${JSON.stringify(stats)}`);
}
rows.sort((a, b) => Number(a.candidateOrdinal) - Number(b.candidateOrdinal));
const body = rows.map((row) => `${JSON.stringify(row)}\n`).join('');
const outputRoot = sha(body);
const manifestBody = {
  schema: 'atlas.legacy-summary-hint-candidate-ordinal-join.v1',
  status: 'EXACT_QUALITY_REQUALIFIED_LINEAGE_BOUND_HINT_INTERSECTION_SEALED',
  generatedAt: new Date().toISOString(),
  candidateMap: { path: path.relative(ROOT, candidatePath).replaceAll('\\', '/'), checksum: sha(fs.readFileSync(candidatePath)), candidateSnapshotRevision: candidateMap.candidateSnapshotRevision, ordinalMapChecksum: candidateMap.ordinalMapChecksum, rowCount: candidateMap.rowCount },
  legacyHintCorpus: { path: path.relative(ROOT, hintDir).replaceAll('\\', '/'), manifestSchema: hintManifest.schema, selectedRows: hintManifest.selectedRows, indexSha256: indexFile.sha256, vectorsSha256: vectorFile.sha256, vectorBytes: vectorFile.bytes, dim: hintManifest.dim },
  census: { path: path.relative(ROOT, censusPath).replaceAll('\\', '/'), receiptPath: path.relative(ROOT, censusReceiptPath).replaceAll('\\', '/'), sha256: censusFile.sha256, bytes: censusFile.bytes, rowCount: census.size },
  counts: { ...stats, candidateRows: candidateMap.rowCount, candidateRowsWithoutHint: candidateMap.rowCount - rows.length },
  output: { path: 'hint-candidate-ordinal.ndjson', rows: rows.length, sha256: outputRoot, firstOrdinal: rows[0]?.candidateOrdinal ?? null, lastOrdinal: rows.at(-1)?.candidateOrdinal ?? null },
  boundaries: { canonicalAuthority: false, databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0, rabbitmqPublishes: 0, graphifyRuns: 0, vectorBytesCopied: false, retrievalVoteAdded: false },
};
const manifest = { ...manifestBody, manifestChecksum: sha(JSON.stringify(manifestBody)) };
fs.mkdirSync(path.dirname(outDir), { recursive: true });
fs.mkdirSync(outDir, { recursive: false });
fs.writeFileSync(path.join(outDir, 'hint-candidate-ordinal.ndjson'), body, { flag: 'wx' });
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: manifest.status, counts: manifest.counts, output: manifest.output, outDir: path.relative(ROOT, outDir).replaceAll('\\', '/') }, null, 2));
