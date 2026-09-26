#!/usr/bin/env node
/**
 * SUMMARY-HINT-FEATURE-02: align the requalified lineage-bound legacy hint
 * vectors to the complete frozen CandidateOrdinal universe. This is an
 * input/availability artifact, not a cosine score: no query vector is present.
 * No canonical, retrieval, or datastore writes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { buildLegacySummaryFeatureAlignmentV1 } from './lib/legacy-summary-feature-alignment-v1.mjs';

const ROOT = process.cwd();
const DIM = 768;
const candidateDir = path.join(ROOT, '.tmp/atlas/candidate-ordinal-bridged-v1/20260926T074719Z');
const candidatePath = path.join(candidateDir, 'candidate-ordinal-map-v1.json');
const hintDir = path.join(ROOT, '.tmp/atlas/legacy-summary-hint-embedding-full-v1/20260926T063456Z');
const crosswalkDir = path.join(ROOT, '.tmp/atlas/legacy-summary-hint-ordinal-join-v1/20260926T080239Z');
const censusReceiptPath = path.join(ROOT, 'docs/reports/legacy-summary-census-v1-20260926T0800Z.json');
const sha = (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const readJsonl = async (file) => {
  const rows = [];
  const lines = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) rows.push(JSON.parse(line));
  return rows;
};
const hashFile = async (file) => {
  const hash = crypto.createHash('sha256'); let bytes = 0;
  for await (const chunk of fs.createReadStream(file)) { hash.update(chunk); bytes += chunk.length; }
  return { sha256: `sha256:${hash.digest('hex')}`, bytes };
};

const map = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
const hintManifest = JSON.parse(fs.readFileSync(path.join(hintDir, 'manifest.json'), 'utf8'));
const crosswalkManifest = JSON.parse(fs.readFileSync(path.join(crosswalkDir, 'manifest.json'), 'utf8'));
const censusReceipt = JSON.parse(fs.readFileSync(censusReceiptPath, 'utf8'));
const candidateRows = map.candidates;
if (map.schema !== 'atlas.candidate-ordinal-map.v1' || map.identityAuthority !== false
  || candidateRows.length !== 6732 || map.rowCount !== candidateRows.length) throw new Error('FROZEN_CANDIDATE_ORDINAL_MAP_REQUIRED');
if (hintManifest.schema !== 'atlas.summary-hint-vector-set.v1' || hintManifest.status !== 'ARTIFACT_ONLY_COMPLETE'
  || hintManifest.canonicalAuthority !== false || hintManifest.dim !== DIM || hintManifest.selectedRows !== 29219
  || hintManifest.databaseWrites !== 0 || hintManifest.qdrantWrites !== 0 || hintManifest.valkeyWrites !== 0
  || hintManifest.rabbitmqPublishes !== 0) throw new Error('SEALED_HINT_VECTOR_SET_REQUIRED');
if (crosswalkManifest.status !== 'EXACT_QUALITY_REQUALIFIED_LINEAGE_BOUND_HINT_INTERSECTION_SEALED'
  || crosswalkManifest.boundaries?.canonicalAuthority !== false
  || crosswalkManifest.boundaries?.retrievalVoteAdded !== false
  || crosswalkManifest.counts?.lineageBoundMatches !== 330
  || crosswalkManifest.counts?.contaminatedRejected !== 281
  || crosswalkManifest.candidateMap?.candidateSnapshotRevision !== map.candidateSnapshotRevision
  || crosswalkManifest.candidateMap?.ordinalMapChecksum !== map.ordinalMapChecksum) throw new Error('REQUALIFIED_330_ROW_CROSSWALK_REQUIRED');
if (censusReceipt.schema !== 'atlas.legacy-summary-census.v1' || censusReceipt.conservation?.pass !== true
  || censusReceipt.readOnlyGuard?.databaseWrites !== 0
  || censusReceipt.tally?.cleanNotQuarantinedLineageBound !== 330) throw new Error('FROZEN_QUALITY_CENSUS_REQUIRED');

const vectorPath = path.join(hintDir, 'vectors.f32');
const indexPath = path.join(hintDir, 'index.ndjson');
const crosswalkPath = path.join(crosswalkDir, 'hint-candidate-ordinal.ndjson');
const censusPath = path.resolve(ROOT, censusReceipt.shardPath);
const [candidateFile, vectorFile, indexFile, crosswalkFile, censusFile] = await Promise.all([
  hashFile(candidatePath), hashFile(vectorPath), hashFile(indexPath), hashFile(crosswalkPath), hashFile(censusPath),
]);
if (candidateFile.sha256 !== crosswalkManifest.candidateMap?.checksum
  || vectorFile.sha256 !== hintManifest.files.vectors.sha256 || vectorFile.bytes !== 29219 * DIM * 4
  || indexFile.sha256 !== hintManifest.files.index.sha256 || indexFile.bytes <= 0
  || crosswalkFile.sha256 !== crosswalkManifest.output?.sha256
  || censusFile.sha256 !== censusReceipt.shardSha256) throw new Error('INPUT_ARTIFACT_CHECKSUM_MISMATCH');

const crosswalkRows = await readJsonl(crosswalkPath);
if (crosswalkRows.length !== 330) throw new Error('CROSSWALK_ROW_COUNT_MISMATCH');
const byOrdinal = new Map();
const vectorBytes = fs.readFileSync(vectorPath);
const vectorView = new DataView(vectorBytes.buffer, vectorBytes.byteOffset, vectorBytes.byteLength);
for (const row of crosswalkRows) {
  const ordinal = row.candidateOrdinal;
  const candidate = candidateRows[ordinal];
  if (!Number.isInteger(ordinal) || ordinal < 0 || byOrdinal.has(ordinal) || !candidate
    || row.trust !== 'LEGACY_HINT_LINEAGE_BOUND'
    || row.candidateSnapshotRevision !== map.candidateSnapshotRevision
    || row.ordinalMapChecksum !== map.ordinalMapChecksum
    || candidate.canonicalId !== row.canonicalChunkId || candidate.packetKey !== row.packetKey
    || candidate.sourceRef !== row.sourceRef || candidate.sourceRevision !== row.sourceRevision
    || candidate.workspaceRevision !== row.workspaceRevision || candidate.candidateOrdinal !== ordinal
    || !/^sha256:[0-9a-f]{64}$/.test(row.summaryDigest)
    || !Number.isInteger(row.vectorIndexRow) || row.vectorIndexRow < 0 || row.vectorIndexRow >= hintManifest.embeddedRows) {
    throw new Error(`CROSSWALK_CANDIDATE_IDENTITY_MISMATCH:${ordinal}`);
  }
  const start = row.vectorIndexRow * DIM * 4;
  const vector = new Float32Array(DIM);
  const vectorHash = crypto.createHash('sha256');
  for (let i = 0; i < DIM; i++) {
    const value = vectorView.getFloat32(start + i * 4, true);
    if (!Number.isFinite(value)) throw new Error(`NON_FINITE_VECTOR:${ordinal}:${i}`);
    vector[i] = value;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (Math.abs(norm - 1) > 1e-3) throw new Error(`NON_UNIT_VECTOR:${ordinal}:${norm}`);
  vectorHash.update(Buffer.from(vectorBytes.subarray(start, start + DIM * 4)));
  byOrdinal.set(ordinal, { hint: row, vectorDigest: `sha256:${vectorHash.digest('hex')}`, vectorNorm: norm });
}

const qualityPolicyRevision = sha(JSON.stringify({
  gate: 'SUMMARY-HINT-FEATURE-02', censusSchema: censusReceipt.schema,
  censusShardSha256: censusFile.sha256, semantics: censusReceipt.semantics,
}));
const features = buildLegacySummaryFeatureAlignmentV1({ candidates: candidateRows, alignedHints: byOrdinal, qualityPolicyRevision, ordinalMapChecksum: map.ordinalMapChecksum });
if (byOrdinal.size !== 330 || features.filter((row) => row.state === 'PENDING_QUERY_VECTOR').length !== 330
  || features.filter((row) => row.state === 'UNAVAILABLE').length !== 6402
  || features.some((row) => row.rawCosine !== null || row.score01 !== null)) throw new Error('FEATURE_ALIGNMENT_CONSERVATION_FAILED');

const featureBody = features.map((row) => `${JSON.stringify(row)}\n`).join('');
const producerRevision = sha(fs.readFileSync(new URL(import.meta.url)));
const featureRevision = sha(JSON.stringify({
  candidateMap: candidateFile.sha256, crosswalk: crosswalkFile.sha256, vectors: vectorFile.sha256,
  index: indexFile.sha256, census: censusFile.sha256, qualityPolicyRevision, producerRevision,
  semantics: 'vector alignment only; query vector required before cosine scoring',
}));
const featurePath = `.tmp/atlas/legacy-summary-cosine-feature-alignment-v1/${new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d+Z$/, 'Z')}`;
const outDir = path.resolve(ROOT, featurePath);
fs.mkdirSync(outDir, { recursive: true });
const featureFilePath = path.join(outDir, 'features.ndjson');
const manifestPath = path.join(outDir, 'manifest.json');
const manifestBody = {
  schema: 'atlas.legacy-summary-cosine-feature-alignment.v1',
  status: 'CANDIDATE_ORDINAL_ALIGNED_QUERY_PENDING',
  generatedAt: new Date().toISOString(), featureRevision, producerRevision, qualityPolicyRevision,
  candidateMap: { path: path.relative(ROOT, candidatePath).replaceAll('\\', '/'), sha256: candidateFile.sha256, candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum, rows: candidateRows.length },
  hintCrosswalk: { path: path.relative(ROOT, crosswalkPath).replaceAll('\\', '/'), sha256: crosswalkFile.sha256, rows: crosswalkRows.length },
  qualityCensus: { receipt: path.relative(ROOT, censusReceiptPath).replaceAll('\\', '/'), shardSha256: censusFile.sha256, policySemantics: censusReceipt.semantics },
  vectorSet: { path: path.relative(ROOT, vectorPath).replaceAll('\\', '/'), sha256: vectorFile.sha256, dim: DIM, selectedRows: hintManifest.selectedRows },
  output: { path: 'features.ndjson', rows: features.length, sha256: sha(featureBody), pendingQueryRows: 330, unavailableRows: 6402 },
  counts: { candidateUniverse: features.length, lineageBoundCleanHints: 330, unavailable: 6402, duplicateCandidateOrdinals: 0 },
  nextGate: 'SUMMARY-HINT-FEATURE-03_REQUIRES_EXPLICIT_SEMANTIC_768_QUERY_VECTOR',
  boundaries: { cosineScoresGenerated: 0, canonicalAuthority: false, retrievalVote: false, rankingPromotion: false, databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0, rabbitmqPublishes: 0, graphifyRuns: 0 },
};
const manifest = { ...manifestBody, manifestChecksum: sha(JSON.stringify(manifestBody)) };
fs.writeFileSync(featureFilePath, featureBody, { flag: 'wx' });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: manifest.status, counts: manifest.counts, featureRevision, outDir: path.relative(ROOT, outDir).replaceAll('\\', '/') }, null, 2));
