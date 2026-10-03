#!/usr/bin/env tsx

/**
 * CEI-24 SUMMARY-HINT-XWALK-01: read-only packet -> proven chunk -> clean
 * lineage-bound legacy HINT join. CandidateOrdinal remains packet-scoped;
 * 0..N chunk memberships are preserved. No cosine or external writes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const candidateDirArg = process.argv.slice(2).find((arg) => arg.startsWith('--candidate-dir='))?.slice('--candidate-dir='.length);
const CANDIDATE_DIR = candidateDirArg ?? '.tmp/atlas/cei24-candidate-ordinal-map-v1/20260926T161327.479Z';
const matrixReportArg = process.argv.slice(2).find((arg) => arg.startsWith('--matrix-report='))?.slice('--matrix-report='.length);
const MATRIX_REPORT = matrixReportArg ?? 'docs/reports/candidate-feature-matrix-draft-v1-20260926T150456Z.json';
const coveragePolicyArg = process.argv.slice(2).find((arg) => arg.startsWith('--coverage-policy='))?.slice('--coverage-policy='.length);
const COVERAGE_POLICY = coveragePolicyArg ?? 'ALL_330_EXACT';
if (!['ALL_330_EXACT', 'PARTIAL_EXACT_ONLY_V1'].includes(COVERAGE_POLICY)) throw new Error('UNKNOWN_HINT_COVERAGE_POLICY');
const candidateRoot = path.resolve(ROOT, CANDIDATE_DIR);
const allowedCandidateRoot = path.resolve(ROOT, '.tmp/atlas/cei24-candidate-ordinal-map-v1');
if (!candidateRoot.startsWith(`${allowedCandidateRoot}${path.sep}`)) {
  throw new Error('CANDIDATE_DIR_OUTSIDE_CEI24_ARTIFACT_ROOT');
}
const HINT_DIR = '.tmp/atlas/legacy-summary-hint-ordinal-join-v1/20260926T080239Z';
const VECTOR_DIR = '.tmp/atlas/legacy-summary-hint-embedding-full-v1/20260926T063456Z';
const CENSUS_RECEIPT = 'docs/reports/legacy-summary-census-v1-20260926T0800Z.json';
const sha = (value: string | Buffer) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const stamp = new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d+Z$/, 'Z');
const outDir = `.tmp/atlas/cei24-packet-chunk-hint-crosswalk-v1/${stamp}`;
const digestText = (text: string | null) => text === null ? null : sha(Buffer.from(text, 'utf8'));

async function hashFile(file: string): Promise<{ sha256: string; bytes: number }> {
  const hash = crypto.createHash('sha256'); let bytes = 0;
  for await (const chunk of fs.createReadStream(file)) { hash.update(chunk); bytes += chunk.length; }
  return { sha256: `sha256:${hash.digest('hex')}`, bytes };
}
async function* jsonl<T>(file: string): AsyncGenerator<T> {
  const lines = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let lineNo = 0;
  for await (const line of lines) {
    lineNo++;
    if (!line.trim()) continue;
    try { yield JSON.parse(line) as T; } catch { throw new Error(`JSONL_INVALID:${path.basename(file)}:${lineNo}`); }
  }
}

const candidatePath = path.join(ROOT, CANDIDATE_DIR, 'candidate-ordinal-map-v1.json');
const candidateMap = candidateOrdinalMapV1Schema.parse(JSON.parse(fs.readFileSync(candidatePath, 'utf8'))) as CandidateOrdinalMapV1;
assertCandidateOrdinalMapIntegrityV1(candidateMap);
if (candidateMap.rowCount !== 16_151 || candidateMap.identityAuthority !== false
  || candidateMap.producerRevision !== 'cei24-packet-candidate-ordinal-map:v1'
  || candidateMap.candidates.some((c, i) => c.candidateOrdinal !== i || c.canonicalId !== c.packetKey || c.treeNodeId !== null)) {
  throw new Error('CEI24_PACKET_CANDIDATE_MAP_REQUIRED');
}
const ceiReceipt = JSON.parse(fs.readFileSync(path.join(ROOT, CANDIDATE_DIR, 'receipt.json'), 'utf8'));
if (ceiReceipt.candidateSnapshotRevision !== candidateMap.candidateSnapshotRevision
  || ceiReceipt.ordinalMapChecksum !== candidateMap.ordinalMapChecksum
  || ceiReceipt.counts?.canonicalPacketCandidates !== 16_151
  || ceiReceipt.counts?.chunkIdentitiesIncluded !== 0) throw new Error('CEI24_SNAPSHOT_RECEIPT_MISMATCH');

const hintManifest = JSON.parse(fs.readFileSync(path.join(ROOT, HINT_DIR, 'manifest.json'), 'utf8'));
const hintFile = path.join(ROOT, HINT_DIR, hintManifest.output.path);
const hintFileDigest = await hashFile(hintFile);
const vectorManifest = JSON.parse(fs.readFileSync(path.join(ROOT, VECTOR_DIR, 'manifest.json'), 'utf8'));
const vectorIndexFile = path.join(ROOT, VECTOR_DIR, vectorManifest.files.index.path);
const vectorFile = path.join(ROOT, VECTOR_DIR, vectorManifest.files.vectors.path);
const censusReceipt = JSON.parse(fs.readFileSync(path.join(ROOT, CENSUS_RECEIPT), 'utf8'));
const censusFile = path.resolve(ROOT, censusReceipt.shardPath);
const [vectorIndexDigest, vectorBytesDigest, censusDigest] = await Promise.all([
  hashFile(vectorIndexFile), hashFile(vectorFile), hashFile(censusFile),
]);
if (hintManifest.schema !== 'atlas.legacy-summary-hint-candidate-ordinal-join.v1'
  || hintManifest.status !== 'EXACT_QUALITY_REQUALIFIED_LINEAGE_BOUND_HINT_INTERSECTION_SEALED'
  || hintManifest.output.rows !== 330 || hintFileDigest.sha256 !== hintManifest.output.sha256
  || hintManifest.legacyHintCorpus.indexSha256 !== vectorIndexDigest.sha256
  || hintManifest.legacyHintCorpus.vectorsSha256 !== vectorBytesDigest.sha256
  || vectorManifest.schema !== 'atlas.summary-hint-vector-set.v1'
  || vectorManifest.status !== 'ARTIFACT_ONLY_COMPLETE' || vectorManifest.canonicalAuthority !== false
  || vectorManifest.dim !== 768 || vectorBytesDigest.bytes !== vectorManifest.embeddedRows * 768 * 4
  || censusReceipt.schema !== 'atlas.legacy-summary-census.v1'
  || censusReceipt.conservation?.pass !== true || censusReceipt.readOnlyGuard?.databaseWrites !== 0
  || censusDigest.sha256 !== hintManifest.census.sha256) throw new Error('SEALED_330_HINT_AND_CENSUS_INPUTS_REQUIRED');

type Hint = {
  chunkRowId: string; canonicalChunkId: string; packetKey: string; sourceRef: string;
  sourceRevision: string; workspaceRevision: string; summaryDigest: string;
  vectorIndexRow: number; vectorByteOffset: number; trust: string;
  canonicalAuthority: boolean; retrievalVoteAdded: boolean;
};
const hints: Hint[] = [];
const hintByChunk = new Map<string, Hint>();
const vectorRowsNeeded = new Set<number>();
for await (const row of jsonl<Record<string, unknown>>(hintFile)) {
  if (row.schema !== 'atlas.legacy-summary-candidate-ordinal-hint.v1'
    || row.trust !== 'LEGACY_HINT_LINEAGE_BOUND' || row.canonicalAuthority !== false
    || row.retrievalVoteAdded !== false || typeof row.chunkRowId !== 'string'
    || typeof row.canonicalChunkId !== 'string' || typeof row.packetKey !== 'string'
    || typeof row.sourceRef !== 'string' || typeof row.sourceRevision !== 'string'
    || typeof row.workspaceRevision !== 'string' || typeof row.summaryDigest !== 'string'
    || !Number.isInteger(row.vectorIndexRow) || !Number.isInteger(row.vectorByteOffset)) {
    throw new Error('INVALID_OR_UNTRUSTED_330_HINT_ROW');
  }
  const hint = row as unknown as Hint;
  if (hintByChunk.has(hint.chunkRowId)) throw new Error(`DUPLICATE_HINT_CHUNK:${hint.chunkRowId}`);
  hintByChunk.set(hint.chunkRowId, hint); hints.push(hint); vectorRowsNeeded.add(hint.vectorIndexRow);
}
if (hints.length !== 330) throw new Error(`HINT_ROW_COUNT_MISMATCH:${hints.length}`);

const vectorIndexByRow = new Map<number, Record<string, unknown>>();
for await (const row of jsonl<Record<string, unknown>>(vectorIndexFile)) {
  if (Number.isInteger(row.row) && vectorRowsNeeded.has(row.row as number)) vectorIndexByRow.set(row.row as number, row);
}
for (const hint of hints) {
  const v = vectorIndexByRow.get(hint.vectorIndexRow);
  if (!v || v.chunkRowId !== hint.chunkRowId || v.chunkId !== hint.canonicalChunkId
    || v.summaryDigest !== hint.summaryDigest || v.row !== hint.vectorIndexRow
    || hint.vectorByteOffset !== hint.vectorIndexRow * 768 * 4) throw new Error(`HINT_VECTOR_COORDINATE_MISMATCH:${hint.chunkRowId}`);
}

type CensusRow = { chunkRowId: string; chunkId: string; summaryDigest: string; class: string; quarantined: boolean; detectorClean: boolean; lineageExact: boolean };
const censusByChunk = new Map<string, CensusRow>();
const hintIds = new Set(hintByChunk.keys());
for await (const row of jsonl<CensusRow>(censusFile)) {
  if (!hintIds.has(row.chunkRowId)) continue;
  if (censusByChunk.has(row.chunkRowId)) throw new Error(`DUPLICATE_HINT_CENSUS_ROW:${row.chunkRowId}`);
  censusByChunk.set(row.chunkRowId, row);
}
for (const hint of hints) {
  const row = censusByChunk.get(hint.chunkRowId);
  if (!row || row.class !== 'LEGACY_HINT_LINEAGE_BOUND' || row.quarantined
    || !row.detectorClean || !row.lineageExact || row.chunkId !== hint.canonicalChunkId
    || row.summaryDigest !== hint.summaryDigest) throw new Error(`HINT_CENSUS_QUALITY_OR_DIGEST_DRIFT:${hint.chunkRowId}`);
}

const candidateInputs = candidateMap.candidates.map((c) => ({
  candidate_ordinal: c.candidateOrdinal, canonical_id: c.canonicalId, packet_key: c.packetKey,
  source_ref: c.sourceRef, source_revision: c.sourceRevision, workspace_revision: c.workspaceRevision,
}));
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1, statement_timeout: 120_000,
  application_name: 'atlas-cei24-packet-chunk-hint-crosswalk-v1' });
let raw: Array<Record<string, unknown>>;
let isolation = '';
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    isolation = String((await client.query('SHOW transaction_read_only')).rows[0]?.transaction_read_only ?? '');
    if (isolation !== 'on') throw new Error('POSTGRES_READ_ONLY_TRANSACTION_REQUIRED');
    raw = (await client.query(`
      WITH candidate AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
          candidate_ordinal integer, canonical_id text, packet_key text,
          source_ref text, source_revision text, workspace_revision text
        )
      )
      SELECT i.candidate_ordinal, i.canonical_id, i.packet_key, i.source_ref,
             i.source_revision AS candidate_source_revision,
             i.workspace_revision AS candidate_workspace_revision,
             p.packet_id::text AS packet_id, p.packet_key::text AS stored_packet_key,
             p.source_ref::text AS packet_source_ref, p.source_revision::text AS packet_source_revision,
             p.workspace_revision::text AS packet_workspace_revision,
             b.repo_id::text AS binding_repo_id, b.canonical_source_ref::text AS binding_source_ref,
             b.source_revision::text AS binding_source_revision,
             b.workspace_revision::text AS binding_workspace_revision,
             l.packet_key::text AS lineage_packet_key, l.source_ref::text AS lineage_source_ref,
             l.source_revision::text AS lineage_source_revision,
             l.canonical_chunk_id::text AS lineage_canonical_chunk_id,
             l.chunk_row_id::text AS lineage_chunk_row_id, l.revision_status::text AS lineage_revision_status,
             c.id::text AS chunk_row_id, c.chunk_id::text AS chunk_id, c.summary::text AS chunk_summary
      FROM candidate i
      LEFT JOIN public.atlas_packets p ON p.packet_key::text = i.packet_key
      LEFT JOIN public.atlas_workspace_source_bindings b
        ON b.repo_id::text = 'deeds-web-app'
       AND b.canonical_source_ref::text = i.source_ref
       AND b.source_revision::text = i.source_revision
       AND b.workspace_revision::text = i.workspace_revision
      LEFT JOIN public.atlas_packet_chunk_lineage l ON l.packet_key::text = i.packet_key
      LEFT JOIN public.codebase_chunk_index c ON c.id = l.chunk_row_id
      ORDER BY i.candidate_ordinal, l.canonical_chunk_id::text, l.chunk_row_id::text
    `, [JSON.stringify(candidateInputs)])).rows;
    await client.query('ROLLBACK');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
} finally { await pool.end(); }

const grouped = new Map<number, Array<Record<string, unknown>>>();
for (const row of raw!) {
  const ordinal = Number(row.candidate_ordinal);
  const bucket = grouped.get(ordinal) ?? []; bucket.push(row); grouped.set(ordinal, bucket);
}
if (grouped.size !== candidateMap.rowCount) throw new Error(`DB_CANDIDATE_CONSERVATION_FAILED:${grouped.size}`);
const candidateStats = { packetMissing: 0, packetIdentityExact: 0, packetWorkspaceMirrorMismatches: 0, bindingExact: 0, provenChunkMemberships: 0, chunkRowExact: 0, candidatesWithZeroProvenChunks: 0, candidatesWithOneProvenChunk: 0, candidatesWithMultipleProvenChunks: 0, maxProvenChunksPerCandidate: 0 };
const provenByOrdinal = new Map<number, Array<Record<string, unknown>>>();
for (const candidate of candidateMap.candidates) {
  const records = grouped.get(candidate.candidateOrdinal)!;
  const packetRows = records.filter((r) => r.packet_id !== null);
  if (packetRows.length === 0) { candidateStats.packetMissing++; continue; }
  const exactPacketRows = packetRows.filter((r) => r.stored_packet_key === candidate.packetKey
    && r.packet_source_ref === candidate.sourceRef && r.packet_source_revision === candidate.sourceRevision);
  const exactPacket = new Map(exactPacketRows.map((r) => [r.packet_id, r]));
  if (exactPacket.size !== 1) continue;
  candidateStats.packetIdentityExact++;
  if ([...exactPacket.values()][0].packet_workspace_revision !== candidate.workspaceRevision) candidateStats.packetWorkspaceMirrorMismatches++;
  const boundRows = records.filter((r) => r.binding_repo_id === 'deeds-web-app'
    && r.binding_source_ref === candidate.sourceRef
    && r.binding_source_revision === candidate.sourceRevision
    && r.binding_workspace_revision === candidate.workspaceRevision);
  if (new Set(boundRows.map((r) => r.binding_repo_id + '\0' + r.binding_source_ref + '\0' + r.binding_source_revision + '\0' + r.binding_workspace_revision)).size !== 1) continue;
  candidateStats.bindingExact++;
  const links = records.filter((r) => r.lineage_packet_key === candidate.packetKey
    && r.lineage_source_ref === candidate.sourceRef && r.lineage_source_revision === candidate.sourceRevision
    && r.lineage_revision_status === 'PROVEN' && r.lineage_chunk_row_id !== null
    && r.chunk_row_id === r.lineage_chunk_row_id
    && r.chunk_id === r.lineage_canonical_chunk_id);
  const uniqueLinks = new Map<string, Record<string, unknown>>();
  for (const link of links) uniqueLinks.set(`${link.lineage_chunk_row_id}\0${link.lineage_canonical_chunk_id}`, link);
  const proven = [...uniqueLinks.values()];
  provenByOrdinal.set(candidate.candidateOrdinal, proven);
  candidateStats.provenChunkMemberships += proven.length;
  candidateStats.chunkRowExact += proven.length;
  if (proven.length === 0) candidateStats.candidatesWithZeroProvenChunks++;
  else if (proven.length === 1) candidateStats.candidatesWithOneProvenChunk++;
  else candidateStats.candidatesWithMultipleProvenChunks++;
  candidateStats.maxProvenChunksPerCandidate = Math.max(candidateStats.maxProvenChunksPerCandidate, proven.length);
}

const outcomes: Array<Record<string, unknown>> = [];
const matchedHintCounts = new Map<number, number>();
const outcomeCounts: Record<string, number> = {};
for (const hint of hints) {
  const candidateMatches = candidateMap.candidates.filter((c) => c.packetKey === hint.packetKey);
  let status = 'EXACT_CURRENT_CANDIDATE_MATCH';
  let candidate = candidateMatches[0];
  let exactLineage: Record<string, unknown> | undefined;
  if (candidateMatches.length === 0) status = 'CURRENT_CANDIDATE_NOT_FOUND';
  else if (candidateMatches.length > 1) status = 'AMBIGUOUS_MATCH';
  else if (candidate!.sourceRef !== hint.sourceRef) status = 'CHUNK_IDENTITY_MISMATCH';
  else if (candidate!.sourceRevision !== hint.sourceRevision) status = 'SOURCE_REVISION_MISMATCH';
  else if (candidate!.workspaceRevision !== hint.workspaceRevision) status = 'WORKSPACE_REVISION_MISMATCH';
  else {
    const proven = provenByOrdinal.get(candidate!.candidateOrdinal) ?? [];
    const exactChunkRows = proven.filter((r) => r.lineage_chunk_row_id === hint.chunkRowId
      && r.lineage_canonical_chunk_id === hint.canonicalChunkId
      && r.chunk_id === hint.canonicalChunkId);
    if (exactChunkRows.length > 1) status = 'AMBIGUOUS_MATCH';
    else if (exactChunkRows.length === 0) status = 'CHUNK_IDENTITY_MISMATCH';
    else {
      exactLineage = exactChunkRows[0];
      if (digestText(exactLineage.chunk_summary === null ? null : String(exactLineage.chunk_summary)) !== hint.summaryDigest) status = 'SUMMARY_DIGEST_MISMATCH';
    }
  }
  if (status === 'EXACT_CURRENT_CANDIDATE_MATCH' && candidate) matchedHintCounts.set(candidate.candidateOrdinal, (matchedHintCounts.get(candidate.candidateOrdinal) ?? 0) + 1);
  outcomeCounts[status] = (outcomeCounts[status] ?? 0) + 1;
  outcomes.push({
    schema: 'atlas.cei24-packet-chunk-summary-hint-crosswalk-row.v1',
    candidateOrdinal: candidate?.candidateOrdinal ?? null,
    candidateSnapshotRevision: candidateMap.candidateSnapshotRevision,
    ordinalMapChecksum: candidateMap.ordinalMapChecksum,
    packetKey: hint.packetKey, sourceRef: hint.sourceRef, sourceRevision: hint.sourceRevision,
    workspaceRevision: hint.workspaceRevision, chunkRowId: hint.chunkRowId,
    canonicalChunkId: hint.canonicalChunkId, summaryDigest: hint.summaryDigest,
    vectorIndexRow: hint.vectorIndexRow, vectorByteOffset: hint.vectorByteOffset,
    status, hintClass: 'LEGACY_HINT_LINEAGE_BOUND',
    lineageRevisionStatus: exactLineage?.lineage_revision_status ?? null,
    currentSummaryDigest: exactLineage ? digestText(exactLineage.chunk_summary === null ? null : String(exactLineage.chunk_summary)) : null,
    canonicalAuthority: false,
  });
}
if (outcomes.length !== 330 || Object.values(outcomeCounts).reduce((a, b) => a + b, 0) !== 330) throw new Error('HINT_CROSSWALK_CONSERVATION_FAILED');

const hintsPerCandidate = [...candidateMap.candidates].map((c) => ({ candidateOrdinal: c.candidateOrdinal, count: matchedHintCounts.get(c.candidateOrdinal) ?? 0 }));
const multiplicity = {
  candidates: hintsPerCandidate.length,
  candidatesWith0Hints: hintsPerCandidate.filter((x) => x.count === 0).length,
  candidatesWith1Hint: hintsPerCandidate.filter((x) => x.count === 1).length,
  candidatesWithMultipleHints: hintsPerCandidate.filter((x) => x.count > 1).length,
  maxHintsPerCandidate: Math.max(0, ...hintsPerCandidate.map((x) => x.count)),
  matchedHintRows: outcomes.filter((row) => row.status === 'EXACT_CURRENT_CANDIDATE_MATCH').length,
  unmatchedHintRows: outcomes.filter((row) => row.status !== 'EXACT_CURRENT_CANDIDATE_MATCH').length,
};

const outputBody = `${outcomes.map((row) => JSON.stringify(row)).join('\n')}\n`;
const candidateMultiplicityRows = candidateMap.candidates.map((candidate) => {
  const links = (provenByOrdinal.get(candidate.candidateOrdinal) ?? []).map((row) => ({
    chunkRowId: String(row.lineage_chunk_row_id), canonicalChunkId: String(row.lineage_canonical_chunk_id),
  })).sort((a, b) => Buffer.compare(Buffer.from(a.canonicalChunkId), Buffer.from(b.canonicalChunkId))
    || Buffer.compare(Buffer.from(a.chunkRowId), Buffer.from(b.chunkRowId)));
  return {
    schema: 'atlas.cei24-packet-chunk-multiplicity-row.v1',
    candidateOrdinal: candidate.candidateOrdinal,
    candidateSnapshotRevision: candidateMap.candidateSnapshotRevision,
    ordinalMapChecksum: candidateMap.ordinalMapChecksum,
    canonicalId: candidate.canonicalId,
    packetKey: candidate.packetKey,
    sourceRef: candidate.sourceRef,
    sourceRevision: candidate.sourceRevision,
    workspaceRevision: candidate.workspaceRevision,
    provenChunkCount: links.length,
    provenChunkMemberships: links,
    qualifiedLegacyHintCount: matchedHintCounts.get(candidate.candidateOrdinal) ?? 0,
    provenChunkMembershipDigest: sha(JSON.stringify(links)),
    canonicalAuthority: false,
  };
});
if (candidateMultiplicityRows.length !== candidateMap.rowCount
  || candidateMultiplicityRows.some((row, i) => row.candidateOrdinal !== i)) throw new Error('CANDIDATE_MULTIPLICITY_UNIVERSE_NOT_CONSERVED');
const multiplicityBody = `${candidateMultiplicityRows.map((row) => JSON.stringify(row)).join('\n')}\n`;
const matrixReport = JSON.parse(fs.readFileSync(path.join(ROOT, MATRIX_REPORT), 'utf8'));
const matrixMapPath = path.join(ROOT, matrixReport.outDir, 'candidate-ordinal-map.ndjson');
const matrixRows = (await fs.promises.readFile(matrixMapPath, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const matrixRowByPacketKey = new Map(matrixRows.map((row) => [row.packetKey, row]));
if (matrixReport.candidates !== candidateMap.rowCount || matrixRows.length !== candidateMap.rowCount
  || matrixRowByPacketKey.size !== candidateMap.rowCount || candidateMap.candidates.some((candidate) => {
    const row = matrixRowByPacketKey.get(candidate.packetKey!);
    return !row || row.sourceRef !== candidate.sourceRef || row.sourceRevision !== candidate.sourceRevision
      || row.workspaceRevision !== candidate.workspaceRevision;
  })) {
  throw new Error('CEI24_MATRIX_ROW_CROSSWALK_NOT_EXACT');
}
const candidateChunkOverlayRows = candidateMap.candidates.map((candidate) => {
  const chunks = (provenByOrdinal.get(candidate.candidateOrdinal) ?? []).map((row) => ({
    chunkRowId: String(row.lineage_chunk_row_id), canonicalChunkId: String(row.lineage_canonical_chunk_id),
  })).sort((a, b) => Buffer.compare(Buffer.from(a.canonicalChunkId), Buffer.from(b.canonicalChunkId))
    || Buffer.compare(Buffer.from(a.chunkRowId), Buffer.from(b.chunkRowId)));
  return {
    schema: 'atlas.cei24-candidate-chunk-evidence-overlay-row.v1',
    candidateOrdinal: candidate.candidateOrdinal, matrixRowIndex: matrixRowByPacketKey.get(candidate.packetKey!)!.candidateOrdinal,
    candidateSnapshotRevision: candidateMap.candidateSnapshotRevision, ordinalMapChecksum: candidateMap.ordinalMapChecksum,
    canonicalId: candidate.canonicalId, packetKey: candidate.packetKey, sourceRef: candidate.sourceRef,
    sourceRevision: candidate.sourceRevision, workspaceRevision: candidate.workspaceRevision,
    chunks, canonicalAuthority: false,
  };
});
const candidateChunkOverlayBody = `${candidateChunkOverlayRows.map((row) => JSON.stringify(row)).join('\n')}\n`;
const report = {
  schema: 'atlas.cei24-packet-chunk-summary-hint-crosswalk-receipt.v1',
  status: 'LEGACY_SUMMARY_FEATURE_BLOCKED_SNAPSHOT_ALIGNMENT',
  coveragePolicy: COVERAGE_POLICY,
  generatedAt: new Date().toISOString(),
  mode: 'REPEATABLE_READ_READ_ONLY_PLUS_LOCAL_ARTIFACT',
  inputs: {
    candidateMap: `${CANDIDATE_DIR}/candidate-ordinal-map-v1.json`,
    candidateSnapshotRevision: candidateMap.candidateSnapshotRevision,
    ordinalMapChecksum: candidateMap.ordinalMapChecksum,
    candidateMapSha256: await hashFile(candidatePath),
    hintCrosswalk: `${HINT_DIR}/${hintManifest.output.path}`,
    hintCrosswalkSha256: hintFileDigest.sha256,
    vectorIndexSha256: vectorIndexDigest.sha256,
    vectorBytesSha256: vectorBytesDigest.sha256,
    census: censusReceipt.shardPath,
    censusSha256: censusDigest.sha256,
    lineageOwner: 'public.atlas_packet_chunk_lineage + public.codebase_chunk_index',
    sourceBindingOwner: 'public.atlas_workspace_source_bindings (repo_id=deeds-web-app)',
    transactionReadOnly: isolation,
  },
  counts: { candidates: candidateMap.rowCount, ...candidateStats, hints: hints.length, outcomes: outcomeCounts, ...multiplicity },
  conservation: { hintsIn: hints.length, rowsOut: outcomes.length, unclassified: 0, pass: outcomes.length === hints.length },
  output: {
    hintCrosswalk: { path: `${outDir}/crosswalk.ndjson`, rows: outcomes.length, sha256: sha(outputBody) },
    candidateMultiplicity: { path: `${outDir}/candidate-multiplicity.ndjson`, rows: candidateMultiplicityRows.length, sha256: sha(multiplicityBody) },
    candidateChunkEvidenceOverlay: { path: `${outDir}/candidate-chunk-evidence-overlay.ndjson`, rows: candidateChunkOverlayRows.length, sha256: sha(candidateChunkOverlayBody) },
  },
  boundaries: {
    packetIdentityIsNotChunkIdentity: true, chunkMultiplicityPreserved: true,
    cosineComputed: false, queryEmbeddingCreated: false, featureProducerAdmitted: false,
    canonicalAuthority: false, databaseWrites: 0, qdrantWrites: 0,
    valkeyWrites: 0, rabbitmqPublishes: 0, graphifyRuns: 0,
  },
};
const allowedPartialOutcomes = outcomes.every((row) => row.status === 'EXACT_CURRENT_CANDIDATE_MATCH'
  || row.status === 'CURRENT_CANDIDATE_NOT_FOUND');
const exactCandidateSetProven = candidateStats.packetIdentityExact === candidateMap.rowCount
  && candidateStats.bindingExact === candidateMap.rowCount
  && candidateStats.packetMissing === 0;
if (exactCandidateSetProven && report.conservation.pass && allowedPartialOutcomes) {
  if (multiplicity.unmatchedHintRows === 0) report.status = 'EXACT_CURRENT_PACKET_CHUNK_HINT_CROSSWALK_PROVEN';
  else if (COVERAGE_POLICY === 'PARTIAL_EXACT_ONLY_V1') report.status = 'PARTIAL_EXACT_ONLY_CROSSWALK_PROVEN';
}
const reportBody = `${JSON.stringify(report, null, 2)}\n`;
const absoluteOut = path.join(ROOT, outDir);
fs.mkdirSync(absoluteOut, { recursive: true });
fs.writeFileSync(path.join(absoluteOut, 'crosswalk.ndjson'), outputBody, { flag: 'wx' });
fs.writeFileSync(path.join(absoluteOut, 'candidate-multiplicity.ndjson'), multiplicityBody, { flag: 'wx' });
fs.writeFileSync(path.join(absoluteOut, 'candidate-chunk-evidence-overlay.ndjson'), candidateChunkOverlayBody, { flag: 'wx' });
fs.writeFileSync(path.join(absoluteOut, 'receipt.json'), reportBody, { flag: 'wx' });
const reportPath = `docs/reports/cei24-packet-chunk-summary-hint-crosswalk-v1-${stamp}.json`;
fs.writeFileSync(path.join(ROOT, reportPath), reportBody, { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, counts: report.counts, conservation: report.conservation, output: report.output, reportPath }, null, 2));
