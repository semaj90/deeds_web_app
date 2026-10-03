#!/usr/bin/env node
/**
 * HINT-FEATURE-03A (v2): standalone `legacy_summary_cosine_max` mechanics proof. Artifact-only, no datastore access.
 * Frozen query -> :8097 raw semantic_768 -> cosine over EXACT_CHUNK legacy-summary HINT overlays ->
 * max-by-CandidateOrdinal -> 16,151 candidate states. Does NOT touch the RF feature-name registry.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HINT_VECTOR_DIM,
  LEGACY_SUMMARY_AGGREGATION_POLICY_V2,
  LEGACY_SUMMARY_HINT_FEATURE_SCHEMA_V2,
  buildLegacySummaryHintFeatureV2,
  legacySummaryHintFeatureChecksumV2,
  vectorDigestV2,
  type FeatureCandidateV2,
  type HintVectorV2,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/legacy-summary-hint-feature-v2.js';
import type { HistoricalEvidenceCurrentCandidateOverlayV2 } from '../../sveltekit-frontend/src/lib/server/atlas/features/historical-evidence-current-candidate-overlay-v2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1]! : d; };
const QUERY_TEXT = arg('--query', 'trace the current Graphify packet to chunk and AST lineage');
const ENDPOINT = arg('--endpoint', 'http://127.0.0.1:8097/embed');
const sha = (b: string | Buffer) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const rel = (p: string) => path.relative(ROOT, p);
const ndjson = (p: string) => fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const latest = (dir: string, prefix: string) => path.join(dir, fs.readdirSync(dir).filter((f) => f.startsWith(prefix)).sort().pop()!);

// ---- sealed inputs, each verified against its own receipt. The fresh CEI-24 packetKey
// crosswalk is preferred; the old packet_id overlay is retained only for historical replay.
const crosswalkArg = arg('--crosswalk-receipt', '');
const ceiReceiptPath = path.resolve(ROOT, crosswalkArg || arg('--cei24-receipt', 'docs/reports/cei24-candidate-chunk-overlay-v1-20260926T161153Z.json'));
const cei = JSON.parse(fs.readFileSync(ceiReceiptPath, 'utf8'));
if (crosswalkArg && !['EXACT_CURRENT_PACKET_CHUNK_HINT_CROSSWALK_PROVEN', 'PARTIAL_EXACT_ONLY_CROSSWALK_PROVEN'].includes(cei.status)) {
  throw new Error('CROSSWALK_POLICY_NOT_ADMITTED');
}
if (cei.status === 'PARTIAL_EXACT_ONLY_CROSSWALK_PROVEN' && cei.coveragePolicy !== 'PARTIAL_EXACT_ONLY_V1') {
  throw new Error('PARTIAL_CROSSWALK_POLICY_REVISION_MISMATCH');
}
const ovProofPath = path.resolve(ROOT, arg('--overlay-proof', rel(latest(path.join(ROOT, 'docs/reports'), 'historical-evidence-overlay-proof-v2-'))));
const ovProof = JSON.parse(fs.readFileSync(ovProofPath, 'utf8'));
const packetKeyCrosswalk = Boolean(crosswalkArg);
const candidateSnapshotRevision = packetKeyCrosswalk ? cei.inputs.candidateSnapshotRevision : cei.cei24b.candidateSnapshotRevision;
const ordinalMapChecksum = packetKeyCrosswalk ? cei.inputs.ordinalMapChecksum : cei.cei24b.ordinalMapChecksum;
if (ovProof.destination.candidateSnapshotRevision !== candidateSnapshotRevision || ovProof.destination.ordinalMapChecksum !== ordinalMapChecksum) throw new Error('OVERLAY_PROOF_DESTINATION_MISMATCH');
const mapRelativePath = packetKeyCrosswalk ? cei.inputs.candidateMap : cei.artifacts.ordinalMap.path;
const overlayRelativePath = packetKeyCrosswalk ? cei.output.candidateChunkEvidenceOverlay.path : cei.artifacts.overlay.path;
const expectedMapChecksum = packetKeyCrosswalk ? cei.inputs.candidateMapSha256.sha256 : cei.artifacts.ordinalMap.sha256;
const expectedOverlayChecksum = packetKeyCrosswalk ? cei.output.candidateChunkEvidenceOverlay.sha256 : cei.artifacts.overlay.sha256;
const mapFile = path.resolve(ROOT, mapRelativePath);
const ceiOverlayFile = path.resolve(ROOT, overlayRelativePath);
if (sha(fs.readFileSync(mapFile)) !== expectedMapChecksum) throw new Error('CEI24_ORDINAL_MAP_ARTIFACT_TAMPERED');
if (sha(fs.readFileSync(ceiOverlayFile)) !== expectedOverlayChecksum) throw new Error('CEI24_OVERLAY_ARTIFACT_TAMPERED');
const ordinalMap = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
const matrixRowByOrdinal = new Map(ndjson(ceiOverlayFile).map((o: any) => [o.candidateOrdinal as number, o.matrixRowIndex as number]));
const candidates: FeatureCandidateV2[] = ordinalMap.candidates.map((c: any) => ({
  candidateOrdinal: c.candidateOrdinal, matrixRowIndex: matrixRowByOrdinal.get(c.candidateOrdinal)!,
  packetId: c.canonicalId, packetKey: c.packetKey, sourceRef: c.sourceRef, sourceRevision: c.sourceRevision, workspaceRevision: c.workspaceRevision,
}));
if (candidates.some((c) => c.matrixRowIndex === undefined)) throw new Error('MATRIX_ROW_INDEX_MISSING');

const hintOverlayPath = path.resolve(ROOT, ovProof.artifacts.legacySummaryHintOverlay.path);
const hintOverlayBytes = fs.readFileSync(hintOverlayPath);
if (sha(hintOverlayBytes) !== ovProof.artifacts.legacySummaryHintOverlay.sha256) throw new Error('HINT_OVERLAY_ARTIFACT_TAMPERED');
const allHintOverlays = hintOverlayBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) as HistoricalEvidenceCurrentCandidateOverlayV2[];
const exactOverlays = allHintOverlays.filter((o) => o.resolution.state === 'EXACT_CHUNK');
const excluded = allHintOverlays.filter((o) => o.resolution.state !== 'EXACT_CHUNK');

const vecDir = path.join(ROOT, '.tmp/atlas/legacy-summary-hint-embedding-full-v1/20260926T063456Z');
const vecManifest = JSON.parse(fs.readFileSync(path.join(vecDir, 'manifest.json'), 'utf8'));
const align = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reports/legacy-summary-cei23-alignment-v1-20260926T155209.080Z.json'), 'utf8'));
const vecBytes = fs.readFileSync(path.join(vecDir, 'vectors.f32'));
const vectorArtifactSha = sha(vecBytes);
if (vectorArtifactSha !== vecManifest.files.vectors.sha256 || vectorArtifactSha !== align.inputs.vectorBytesSha256) throw new Error('HINT_VECTOR_ARTIFACT_TAMPERED');
const indexRows = ndjson(path.join(vecDir, 'index.ndjson'));
const rowByChunk = new Map(indexRows.map((r: any) => [r.chunkRowId as string, r]));
const hintVectors = new Map<string, HintVectorV2>();
const hintDigestByEvidence = new Map<string, string>();
for (const o of exactOverlays) {
  const m = o.resolution.memberships[0]!;
  const row: any = rowByChunk.get(m.chunkRowId);
  if (!row) throw new Error(`HINT_VECTOR_INDEX_ROW_MISSING:${m.chunkRowId}`);
  if (row.chunkId !== m.canonicalChunkId) throw new Error(`HINT_VECTOR_INDEX_CHUNK_ID_MISMATCH:${m.chunkRowId}`);
  const f = new Float32Array(HINT_VECTOR_DIM);
  const off = row.row * HINT_VECTOR_DIM * 4;
  Buffer.from(vecBytes.buffer, vecBytes.byteOffset + off, HINT_VECTOR_DIM * 4).copy(Buffer.from(f.buffer));
  hintVectors.set(m.chunkRowId, { chunkRowId: m.chunkRowId, canonicalChunkId: m.canonicalChunkId, summaryDigest: row.summaryDigest, vector: f });
  hintDigestByEvidence.set(o.evidenceId, row.summaryDigest);
  // the overlay's historical digest must bind this same summary digest
  const expectedEvidenceDigest = sha(`${m.chunkRowId}\0${m.canonicalChunkId}\0${row.summaryDigest}`);
  if (o.historicalEvidenceDigest !== expectedEvidenceDigest) throw new Error(`HINT_OVERLAY_SUMMARY_DIGEST_MISMATCH:${m.chunkRowId}`);
}

// ---- frozen query embedded fresh through :8097 (raw semantic_768, same path as the HINT vectors); twice, for determinism
async function embed(text: string): Promise<Float32Array> {
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texts: [text] }), signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`EMBED_HTTP_${res.status}`);
  return Float32Array.from((await res.json()).embeddings[0]);
}
const health = await (await fetch(ENDPOINT.replace(/\/embed$/, '/health'))).json();
const q1 = await embed(QUERY_TEXT);
const q2 = await embed(QUERY_TEXT);
const queryEmbeddingDigest = vectorDigestV2(q1);
const queryDeterministic = queryEmbeddingDigest === vectorDigestV2(q2);
if (!queryDeterministic) throw new Error('QUERY_EMBEDDING_NOT_DETERMINISTIC');

const result = buildLegacySummaryHintFeatureV2({
  candidateSnapshotRevision, ordinalMapChecksum,
  candidates, overlays: exactOverlays, hintVectors, queryVector: q1, queryEmbeddingDigest,
});
const rerun = buildLegacySummaryHintFeatureV2({
  candidateSnapshotRevision, ordinalMapChecksum,
  candidates: [...candidates].reverse(), overlays: [...exactOverlays].reverse(), hintVectors, queryVector: q1, queryEmbeddingDigest,
});
const featureChecksum = legacySummaryHintFeatureChecksumV2(result.rows);
const replayIdentical = featureChecksum === legacySummaryHintFeatureChecksumV2(rerun.rows);

// ---- invariants measured, not assumed
const distinctOrdinals = new Set(result.chunkScores.map((s) => s.candidateOrdinal)).size;
const cosines = result.chunkScores.map((s) => s.rawCosine);
const invariants = {
  exactChunkScoresProduced: result.chunkScores.length,
  excludedHintsNeverScored: excluded.length,
  distinctCandidateOrdinalsDerived: result.derivedCount,
  distinctOrdinalsFromChunkScores: distinctOrdinals,
  unavailable: result.unavailableCount,
  totalStates: result.rows.length,
  noDuplicateOrMissingCandidateState: new Set(result.rows.map((r) => r.candidateOrdinal)).size === candidates.length && result.rows.length === candidates.length,
  unavailableRowsCarryNull: result.rows.filter((r) => r.state === 'UNAVAILABLE').every((r) => r.rawCosine === null && r.score01 === null),
  ordinalMatrixRowConflated: result.rows.some((r) => r.matrixRowIndex !== matrixRowByOrdinal.get(r.candidateOrdinal)),
  ordinalDiffersFromMatrixRowOnRows: result.rows.filter((r) => r.candidateOrdinal !== r.matrixRowIndex).length,
  cosineMin: Math.min(...cosines), cosineMax: Math.max(...cosines),
  score01Correct: result.chunkScores.every((s) => Math.abs(s.score01 - (s.rawCosine + 1) / 2) < 1e-12),
  replayIdentical, queryDeterministic,
};
const pass = invariants.exactChunkScoresProduced === exactOverlays.length && invariants.totalStates === candidates.length
  && invariants.noDuplicateOrMissingCandidateState && invariants.unavailableRowsCarryNull && !invariants.ordinalMatrixRowConflated && replayIdentical
  && result.derivedCount === distinctOrdinals;

// ---- producer revision binds every input that shapes the values
const censusReceipt = path.join(ROOT, 'docs/reports/legacy-summary-census-v1-20260926T0800Z.json');
const bindings = {
  candidateSnapshotRevision, ordinalMapChecksum,
  cei24OverlayChecksum: packetKeyCrosswalk ? expectedOverlayChecksum : cei.overlay.checksum,
  crosswalkReceiptChecksum: packetKeyCrosswalk ? sha(fs.readFileSync(ceiReceiptPath)) : null,
  historicalEvidenceOverlaySetChecksum: ovProof.legacySummary.overlaySetChecksum,
  hintCensusChecksum: align.inputs.qualityCensusSha256, qualityPolicyRevision: sha(fs.readFileSync(censusReceipt)),
  hintVectorArtifactChecksum: vectorArtifactSha, queryEmbeddingDigest, aggregationPolicyRevision: LEGACY_SUMMARY_AGGREGATION_POLICY_V2,
  producerScriptDigest: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
};
const producerRevision = sha(JSON.stringify(bindings));

const stamp = new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(ROOT, `.tmp/atlas/legacy-summary-hint-feature-v2/${stamp}`);
fs.mkdirSync(outDir, { recursive: true });
const write = (name: string, body: string | Buffer) => { fs.writeFileSync(path.join(outDir, name), body); return { path: rel(path.join(outDir, name)), sha256: sha(body), bytes: Buffer.byteLength(body) }; };
const artifacts = {
  featureRows: write('feature-rows.ndjson', result.rows.map((r) => JSON.stringify(r)).join('\n') + '\n'),
  chunkScores: write('chunk-scores.ndjson', result.chunkScores.map((r) => JSON.stringify(r)).join('\n') + '\n'),
  queryVector: write('query-vector.f32', Buffer.from(q1.buffer, q1.byteOffset, q1.byteLength)),
};
const receipt = {
  schema: LEGACY_SUMMARY_HINT_FEATURE_SCHEMA_V2,
  status: pass ? 'STANDALONE_HINT_FEATURE_MECHANICS_PROVEN' : 'STANDALONE_HINT_FEATURE_INVARIANT_FAILED',
  generatedAt: new Date().toISOString(), featureName: 'legacy_summary_cosine_max',
  canonicalAuthority: false, retrievalVote: false, rankingPromotion: false,
  rfContract: { registryTouched: false, rf04Admitted: false, rf05Replayed: false, nextGate: 'REVIEW_THEN_RF-04-CONTRACT-EXTENSION-01' },
  query: { text: QUERY_TEXT, textDigest: sha(QUERY_TEXT), endpoint: ENDPOINT, taskPrefix: 'NONE_RAW', service: health, modelRevision: 'NOT_REPORTED_BY_SERVICE', dimension: HINT_VECTOR_DIM, embeddingDigest: queryEmbeddingDigest },
  bindings, producerRevision, featureChecksum,
  coverage: { derived: result.derivedCount, unavailable: result.unavailableCount, total: result.rows.length },
  hints: { overlaysInput: allHintOverlays.length, exactChunkScored: exactOverlays.length, excludedStates: excluded.reduce((a: Record<string, number>, o) => { a[o.resolution.state] = (a[o.resolution.state] ?? 0) + 1; return a; }, {}) },
  invariants,
  scoreSummary: (() => {
    const s = result.rows.filter((r) => r.state === 'DERIVED').map((r) => r.rawCosine!).sort((a, b) => a - b);
    return { min: s[0], median: s[Math.floor(s.length / 2)], max: s[s.length - 1] };
  })(),
  artifacts, writes: { postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0, graphify: 0 },
  semantics: 'Query-conditioned, chunk-summary HINT evidence aggregated to packet candidates by MAX cosine; no relevance-lift claim (0 graded labels).',
};
const receiptPath = path.join(ROOT, `docs/reports/legacy-summary-hint-feature-v2-${stamp}.json`);
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ receiptPath: rel(receiptPath), status: receipt.status, coverage: receipt.coverage, invariants, scoreSummary: receipt.scoreSummary }, null, 2));
if (!pass) process.exit(2);
