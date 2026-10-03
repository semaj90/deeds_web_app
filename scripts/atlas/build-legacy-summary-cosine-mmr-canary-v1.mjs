#!/usr/bin/env node
/**
 * Artifact-only mechanics canary: exact legacy-summary cosine features on the
 * current quality-requalified, CandidateOrdinal-aligned HINT cohort, then MMR.
 * Query vectors are explicitly unqualified clean HINT pseudo-probes, not user
 * queries or graded relevance labels. No retrieval vote or datastore writes.
 */
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const root = process.cwd();
const require = createRequire(import.meta.url);
const napi = require(path.resolve(root, 'crates/turbovec-napi/turbovec-napi.win32-x64-msvc.node'));
const dim = 768;
const hintDir = path.resolve(root, '.tmp/atlas/legacy-summary-hint-embedding-full-v1/20260926T063456Z');
const hintManifest = JSON.parse(fs.readFileSync(path.join(hintDir, 'manifest.json'), 'utf8'));
const censusReceiptPath = path.resolve(root, 'docs/reports/legacy-summary-census-v1-20260926T0800Z.json');
const censusReceipt = JSON.parse(fs.readFileSync(censusReceiptPath, 'utf8'));
const censusPath = path.resolve(root, censusReceipt.shardPath);
const candidateMapPath = path.resolve(root, '.tmp/atlas/candidate-ordinal-bridged-v1/20260926T074719Z/candidate-ordinal-map-v1.json');
const crosswalkDir = path.resolve(root, '.tmp/atlas/legacy-summary-hint-ordinal-join-v1/20260926T080239Z');
const crosswalkPath = path.join(crosswalkDir, 'hint-candidate-ordinal.ndjson');
const crosswalkManifest = JSON.parse(fs.readFileSync(path.join(crosswalkDir, 'manifest.json'), 'utf8'));
const map = JSON.parse(fs.readFileSync(candidateMapPath, 'utf8'));
const outputDir = path.resolve(root, `.tmp/atlas/legacy-summary-cosine-mmr-canary-v1/${new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d+Z$/, 'Z')}`);
const sha = (b) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const readJsonl = async (file) => {
  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) rows.push(JSON.parse(line));
  return rows;
};
const hashFile = async (file) => {
  const hash = crypto.createHash('sha256'); let bytes = 0;
  for await (const chunk of fs.createReadStream(file)) { hash.update(chunk); bytes += chunk.length; }
  return { sha256: `sha256:${hash.digest('hex')}`, bytes };
};

if (hintManifest.schema !== 'atlas.summary-hint-vector-set.v1' || hintManifest.status !== 'ARTIFACT_ONLY_COMPLETE'
  || hintManifest.canonicalAuthority !== false || hintManifest.dim !== dim
  || censusReceipt.conservation?.pass !== true || censusReceipt.readOnlyGuard?.databaseWrites !== 0
  || crosswalkManifest.status !== 'EXACT_QUALITY_REQUALIFIED_LINEAGE_BOUND_HINT_INTERSECTION_SEALED'
  || crosswalkManifest.boundaries?.canonicalAuthority !== false || crosswalkManifest.boundaries?.retrievalVoteAdded !== false
  || crosswalkManifest.counts?.lineageBoundMatches !== 330 || crosswalkManifest.counts?.contaminatedRejected !== 281) {
  throw new Error('FROZEN_REQUALIFIED_HINT_INPUTS_REQUIRED');
}
const [vectorFile, indexFile, censusFile, crosswalkFile, candidateMapFile] = await Promise.all([
  hashFile(path.join(hintDir, 'vectors.f32')),
  hashFile(path.join(hintDir, 'index.ndjson')),
  hashFile(censusPath),
  hashFile(crosswalkPath),
  hashFile(candidateMapPath),
]);
if (vectorFile.sha256 !== hintManifest.files.vectors.sha256 || vectorFile.bytes !== hintManifest.embeddedRows * dim * 4
  || indexFile.sha256 !== hintManifest.files.index.sha256 || censusFile.sha256 !== censusReceipt.shardSha256
  || crosswalkFile.sha256 !== crosswalkManifest.output.sha256
  || candidateMapFile.sha256 !== crosswalkManifest.candidateMap.checksum) throw new Error('INPUT_CHECKSUM_MISMATCH');

const vectorBytes = fs.readFileSync(path.join(hintDir, 'vectors.f32'));
const vectorFloats = new Float32Array(vectorBytes.buffer.slice(vectorBytes.byteOffset, vectorBytes.byteOffset + vectorBytes.byteLength));
const indexRows = await readJsonl(path.join(hintDir, 'index.ndjson'));
const censusRows = await readJsonl(censusPath);
const censusById = new Map(censusRows.map((row) => [row.chunkRowId, row]));
if (censusById.size !== censusReceipt.tally.totalLegacy || indexRows.length !== hintManifest.embeddedRows) throw new Error('INPUT_CENSUS_CONSERVATION_FAILED');

const candidateInputs = await readJsonl(crosswalkPath);
const candidateVectorsByDigest = new Map();
for (const entry of candidateInputs) {
  const candidate = map.candidates[entry.candidateOrdinal];
  if (!candidate || candidate.canonicalId !== entry.canonicalChunkId || candidate.packetKey !== entry.packetKey
    || candidate.sourceRef !== entry.sourceRef || candidate.sourceRevision !== entry.sourceRevision
    || candidate.workspaceRevision !== entry.workspaceRevision || entry.trust !== 'LEGACY_HINT_LINEAGE_BOUND') {
    throw new Error(`CANDIDATE_ORDINAL_IDENTITY_DRIFT:${entry.candidateOrdinal}`);
  }
  const current = censusById.get(entry.chunkRowId);
  if (!current || current.class !== 'LEGACY_HINT_LINEAGE_BOUND' || current.summaryDigest !== entry.summaryDigest) throw new Error(`HINT_TRUST_OR_DIGEST_DRIFT:${entry.chunkRowId}`);
  const prior = candidateVectorsByDigest.get(entry.summaryDigest);
  if (!prior || entry.candidateOrdinal < prior.entry.candidateOrdinal) {
    candidateVectorsByDigest.set(entry.summaryDigest, { entry, vectorIndexRow: entry.vectorIndexRow });
  }
}
const candidates = [...candidateVectorsByDigest.values()].sort((a, b) => a.entry.candidateOrdinal - b.entry.candidateOrdinal).map((item) => {
  const { entry, vectorIndexRow } = item;
  const vector = vectorFloats.subarray(vectorIndexRow * dim, (vectorIndexRow + 1) * dim);
  if (vector.length !== dim || Array.from(vector).some((v) => !Number.isFinite(v))) throw new Error(`INVALID_CANDIDATE_VECTOR:${entry.candidateOrdinal}`);
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (Math.abs(norm - 1) > 1e-3) throw new Error(`CANDIDATE_VECTOR_NOT_UNIT:${entry.candidateOrdinal}:${norm}`);
  return { ...entry, vector };
});
if (candidates.length < 100) throw new Error('TOP100_POOL_REQUIRES_AT_LEAST_100_UNIQUE_DIGESTS');

// Query probes are selected evenly from currently clean but unqualified legacy HINT rows.
const candidateDigests = new Set(candidates.map((candidate) => candidate.summaryDigest));
const queryRows = indexRows.filter((row) => censusById.get(row.chunkRowId)?.class === 'LEGACY_HINT_UNQUALIFIED'
  && !candidateDigests.has(row.summaryDigest));
const uniqueQueryRows = [...new Map(queryRows.map((row) => [row.summaryDigest, row])).values()];
const queryCount = Math.min(32, uniqueQueryRows.length);
const queryProbes = Array.from({ length: queryCount }, (_, i) => uniqueQueryRows[Math.floor((i * uniqueQueryRows.length) / queryCount)]);
const alphaValues = [0.7, 0.8, 0.9, 1.0];
const featureRows = [];
const queryResults = [];
const dot = (a, b) => { let sum = 0; for (let i = 0; i < dim; i++) sum += a[i] * b[i]; return sum; };
const topK = 100;
const finalK = 20;
const candidateFlat = new Float32Array(candidates.length * dim);
candidates.forEach((candidate, i) => candidateFlat.set(candidate.vector, i * dim));
const queryFlat = new Float32Array(queryProbes.length * dim);
queryProbes.forEach((query, i) => queryFlat.set(vectorFloats.subarray(query.row * dim, (query.row + 1) * dim), i * dim));
const exactOracle = napi.hintExactCosineTopk(candidateFlat, queryFlat, dim, topK);
let oracleParityRows = 0;
let oracleMaxAbsScoreError = 0;
let oracleNearTieRankReorders = 0;

for (let qi = 0; qi < queryProbes.length; qi++) {
  const query = queryProbes[qi];
  const queryVector = vectorFloats.subarray(query.row * dim, (query.row + 1) * dim);
  if (Array.from(queryVector).some((v) => !Number.isFinite(v))) throw new Error(`INVALID_QUERY_VECTOR:${qi}`);
  const queryNorm = Math.sqrt(queryVector.reduce((sum, value) => sum + value * value, 0));
  if (Math.abs(queryNorm - 1) > 1e-3) throw new Error(`QUERY_VECTOR_NOT_UNIT:${qi}:${queryNorm}`);
  const currentQuery = censusById.get(query.chunkRowId);
  if (!currentQuery || currentQuery.class !== 'LEGACY_HINT_UNQUALIFIED' || currentQuery.summaryDigest !== query.summaryDigest) throw new Error(`QUERY_PROBE_NOT_CLEAN_UNQUALIFIED_HINT:${qi}`);
  const ranked = candidates.map((candidate) => ({ candidate, score: dot(queryVector, candidate.vector) }))
    .sort((a, b) => b.score - a.score || a.candidate.candidateOrdinal - b.candidate.candidateOrdinal).slice(0, topK);
  if (ranked.length !== topK) throw new Error(`TOP100_INCOMPLETE:${qi}`);
  for (let rank = 0; rank < topK; rank++) {
    const oracleIndex = exactOracle.indices[qi * topK + rank];
    const oracleScore = exactOracle.scores[qi * topK + rank];
    const oracleCandidate = candidates[oracleIndex];
    if (!oracleCandidate) throw new Error(`EXACT_ORACLE_INDEX_OUT_OF_RANGE:${qi}:${rank}:${oracleIndex}`);
    const jsOracleScore = dot(queryVector, oracleCandidate.vector);
    const absError = Math.abs(oracleScore - jsOracleScore);
    oracleMaxAbsScoreError = Math.max(oracleMaxAbsScoreError, absError);
    if (absError > 1e-5) throw new Error(`EXACT_ORACLE_SCORE_MISMATCH:${qi}:${rank}:${absError}`);
    if (oracleCandidate.candidateOrdinal !== ranked[rank].candidate.candidateOrdinal) {
      const tieGap = Math.abs(jsOracleScore - ranked[rank].score);
      if (tieGap > 1e-6) throw new Error(`EXACT_ORACLE_RANK_MISMATCH:${qi}:${rank}:${tieGap}`);
      oracleNearTieRankReorders++;
    }
    oracleParityRows++;
  }
  const selectedByAlpha = {};
  const pureTop20 = ranked.slice(0, finalK).map((x) => x.candidate.candidateOrdinal);
  for (const alpha of alphaValues) {
    const remaining = [...ranked];
    const selected = [];
    while (remaining.length && selected.length < finalK) {
      let bestIndex = -1; let bestScore = -Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const item = remaining[i];
        const redundancy = selected.length ? Math.max(...selected.map((chosen) => dot(item.candidate.vector, chosen.candidate.vector))) : 0;
        const mmrScore = alpha * item.score - (1 - alpha) * redundancy;
        if (mmrScore > bestScore || (mmrScore === bestScore && (bestIndex < 0 || item.candidate.candidateOrdinal < remaining[bestIndex].candidate.candidateOrdinal))) {
          bestScore = mmrScore; bestIndex = i;
        }
      }
      selected.push({ ...remaining.splice(bestIndex, 1)[0], mmrScore: bestScore });
    }
    selectedByAlpha[String(alpha)] = {
      candidateOrdinals: selected.map((item) => item.candidate.candidateOrdinal),
      uniqueSourceRefs: new Set(selected.map((item) => item.candidate.sourceRef)).size,
      uniqueClusterIds: null,
      uniqueConceptIds: null,
      clusterConceptMetadata: 'UNAVAILABLE_IN_FROZEN_CANDIDATE_ORDINAL_MAP',
      meanPairwiseRedundancy: selected.length < 2 ? null : selected.reduce((sum, item, i) => sum + selected.slice(0, i).reduce((inner, prior) => inner + dot(item.candidate.vector, prior.candidate.vector), 0), 0) / (selected.length * (selected.length - 1) / 2),
      overlapWithPureTop20: selected.filter((item) => pureTop20.includes(item.candidate.candidateOrdinal)).length,
    };
  }
  ranked.forEach(({ candidate, score }, rankIndex) => featureRows.push({
    schema: 'atlas.legacy-summary-cosine-feature.v1',
    queryProbeId: `legacy-hint-probe:${query.row}:${query.summaryDigest}`,
    queryTrust: 'LEGACY_HINT_UNQUALIFIED_PSEUDO_QUERY',
    querySummaryDigest: query.summaryDigest,
    candidateOrdinal: candidate.candidateOrdinal,
    candidateSnapshotRevision: candidate.candidateSnapshotRevision,
    ordinalMapChecksum: candidate.ordinalMapChecksum,
    chunkRowId: candidate.chunkRowId,
    canonicalChunkId: candidate.canonicalChunkId,
    packetKey: candidate.packetKey,
    sourceRef: candidate.sourceRef,
    sourceRevision: candidate.sourceRevision,
    workspaceRevision: candidate.workspaceRevision,
    candidateTrust: 'LEGACY_HINT_LINEAGE_BOUND',
    summaryDigest: candidate.summaryDigest,
    rawCosine: score,
    score01: (score + 1) / 2,
    queryRank: rankIndex + 1,
    rankPercentile: rankIndex / Math.max(1, topK - 1),
    gapFromTop1: ranked[0].score - score,
    gapFromTopKBoundary: score - ranked.at(-1).score,
    evidenceRefs: [`legacy-summary-digest:${candidate.summaryDigest}`, `candidate-ordinal:${candidate.candidateOrdinal}`],
    canonicalAuthority: false,
    retrievalVoteAdded: false,
  }));
  queryResults.push({ queryProbeId: `legacy-hint-probe:${query.row}:${query.summaryDigest}`, queryVectorIndexRow: query.row,
    queryTrust: 'LEGACY_HINT_UNQUALIFIED_PSEUDO_QUERY', candidatePoolUniqueDigests: candidates.length,
    topK, finalK, alphaResults: selectedByAlpha, gradedLabelsAvailable: false, recallMrrNdcg: 'NOT_MEASURED' });
}

const featureBody = featureRows.map((row) => `${JSON.stringify(row)}\n`).join('');
const queryBody = `${JSON.stringify({ schema: 'atlas.summary-cosine-mmr-query-results.v1', queries: queryResults, canonicalAuthority: false, retrievalVoteAdded: false }, null, 2)}\n`;
const producerRevision = sha(fs.readFileSync(new URL(import.meta.url)));
const featureRevision = sha(JSON.stringify({ candidateMap: candidateMapFile.sha256, crosswalk: crosswalkFile.sha256,
  vectorRoot: vectorFile.sha256, census: censusFile.sha256, producerRevision, topK, finalK, alphaValues, queryCount }));
const featureOutput = { rows: featureRows.length, sha256: sha(featureBody) };
const queryOutput = { queries: queryResults.length, sha256: sha(queryBody) };
const manifestBody = { schema: 'atlas.legacy-summary-cosine-mmr-canary.v1', status: 'MECHANICS_ONLY_ARTIFACT_PROVEN', generatedAt: new Date().toISOString(),
  featureRevision, producerRevision, featureOutput: { path: 'features.ndjson', ...featureOutput }, queryOutput: { path: 'query-results.json', ...queryOutput },
  inputs: { hintManifest: path.relative(root, path.join(hintDir, 'manifest.json')).replaceAll('\\', '/'), vectorsSha256: vectorFile.sha256,
    censusReceipt: path.relative(root, censusReceiptPath).replaceAll('\\', '/'), censusShardSha256: censusFile.sha256,
    candidateMap: path.relative(root, candidateMapPath).replaceAll('\\', '/'), candidateMapSha256: candidateMapFile.sha256,
    crosswalk: path.relative(root, crosswalkPath).replaceAll('\\', '/'), crosswalkSha256: crosswalkFile.sha256 },
  cohort: { candidateRows: candidateInputs.length, uniqueCandidateSummaryDigests: candidates.length, exactSourceRevisionQualified: true,
    candidateTrust: 'LEGACY_HINT_LINEAGE_BOUND', queryRowsAvailable: queryRows.length, queryRowsSampled: queryCount,
    queryTrust: 'LEGACY_HINT_UNQUALIFIED_PSEUDO_QUERY' },
  selection: { engine: 'turbovec-napi hintExactCosineTopk exact oracle + exact CPU greedy MMR', exactOracleRankScoreParityRows: oracleParityRows, exactOracleMaxAbsScoreError: oracleMaxAbsScoreError, exactOracleNearTieReorders: oracleNearTieRankReorders, nearTieTolerance: 1e-6, deterministicTieBreak: 'candidateOrdinal ASC', topK, finalK, alphaValues,
    cosineAlreadyUnitNormalized: true, dedupeBy: 'summaryDigest', duplicateCandidatesCollapsed: candidateInputs.length - candidates.length },
  evaluation: { gradedLabels: 0, recallAtK: 'NOT_MEASURED', mrr: 'NOT_MEASURED', ndcg: 'NOT_MEASURED', tokenCoverage: 'NOT_MEASURED', userQuerySemantics: 'NOT_PROVEN' },
  boundaries: { canonicalAuthority: false, retrievalVoteAdded: false, databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0, rabbitmqPublishes: 0, graphifyRuns: 0 } };
const manifest = { ...manifestBody, manifestChecksum: sha(JSON.stringify(manifestBody)) };
fs.mkdirSync(path.dirname(outputDir), { recursive: true });
fs.mkdirSync(outputDir, { recursive: false });
fs.writeFileSync(path.join(outputDir, 'features.ndjson'), featureBody, { flag: 'wx' });
fs.writeFileSync(path.join(outputDir, 'query-results.json'), queryBody, { flag: 'wx' });
fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: manifest.status, featureRevision, featureRows: featureRows.length, queryRows: queryCount,
  uniqueCandidateDigests: candidates.length, alphaValues, labelledMetrics: 'NOT_MEASURED', outputDir: path.relative(root, outputDir).replaceAll('\\', '/') }, null, 2));
