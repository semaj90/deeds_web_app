#!/usr/bin/env node
/**
 * HIST-EVIDENCE-OVERLAY-02..04 (v2). Artifact-only: no database, Qdrant, Valkey, RabbitMQ or Graphify access.
 * Adapters: legacy summary HINT (chunk-grained) and historical MapReduce record (file-grained) resolve
 * through ONE set-valued owner onto the sealed CEI-24 candidate snapshot. Replays twice and compares checksums.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertCurrentCandidateIndexV2,
  historicalEvidenceOverlaySetChecksumV2,
  resolveHistoricalEvidenceToCandidates,
  verifyHistoricalEvidenceOverlayV2,
  type CurrentCandidateIndexV2,
  type HistoricalEvidenceCurrentCandidateOverlayV2,
  type HistoricalEvidenceInputV2,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/historical-evidence-current-candidate-overlay-v2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1]! : d; };
const sha = (b: string | Buffer) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const rel = (p: string) => path.relative(ROOT, p);
const ndjson = (p: string) => fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

// ---- sealed destination: prefer the fresh packetKey snapshot + read-only DB crosswalk.
const crosswalkReceiptPathArg = arg('--crosswalk-receipt', '');
const crosswalkReceiptPath = crosswalkReceiptPathArg ? path.resolve(ROOT, crosswalkReceiptPathArg) : null;
const crosswalk = crosswalkReceiptPath ? JSON.parse(fs.readFileSync(crosswalkReceiptPath, 'utf8')) : null;
const legacyCeiReceiptPath = path.resolve(ROOT, arg('--cei24-receipt', 'docs/reports/cei24-candidate-chunk-overlay-v1-20260926T161153Z.json'));
const legacyCei = crosswalk ? null : JSON.parse(fs.readFileSync(legacyCeiReceiptPath, 'utf8'));
if (!crosswalk && legacyCei.status !== 'CANDIDATE_CHUNK_OVERLAY_SEALED') throw new Error('CEI24_OVERLAY_NOT_SEALED');
if (crosswalk && (!crosswalk.conservation?.pass || crosswalk.counts?.hints !== 330
  || crosswalk.output?.candidateChunkEvidenceOverlay?.rows !== 16_151)) throw new Error('CEI24_CROSSWALK_NOT_CONSERVED');
const mapRelative = crosswalk?.inputs.candidateMap ?? legacyCei.artifacts.ordinalMap.path;
const overlayRelative = crosswalk?.output.candidateChunkEvidenceOverlay.path ?? legacyCei.artifacts.overlay.path;
const mapFile = path.resolve(ROOT, mapRelative);
const overlayFile = path.resolve(ROOT, overlayRelative);
const expectedMapSha = crosswalk?.inputs.candidateMapSha256.sha256 ?? legacyCei.artifacts.ordinalMap.sha256;
const expectedOverlaySha = crosswalk?.output.candidateChunkEvidenceOverlay.sha256 ?? legacyCei.artifacts.overlay.sha256;
if (sha(fs.readFileSync(mapFile)) !== expectedMapSha) throw new Error('CEI24_ORDINAL_MAP_ARTIFACT_TAMPERED');
if (sha(fs.readFileSync(overlayFile)) !== expectedOverlaySha) throw new Error('CEI24_OVERLAY_ARTIFACT_TAMPERED');
const ordinalMap = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
const expectedSnapshot = crosswalk?.inputs.candidateSnapshotRevision ?? legacyCei.cei24b.candidateSnapshotRevision;
const expectedOrdinalChecksum = crosswalk?.inputs.ordinalMapChecksum ?? legacyCei.cei24b.ordinalMapChecksum;
if (ordinalMap.candidateSnapshotRevision !== expectedSnapshot || ordinalMap.ordinalMapChecksum !== expectedOrdinalChecksum) throw new Error('CEI24_COORDINATES_MISMATCH');
const overlayRows = ndjson(overlayFile);

const index: CurrentCandidateIndexV2 = {
  candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
  ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
  candidates: ordinalMap.candidates.map((c: any) => ({ candidateOrdinal: c.candidateOrdinal, packetKey: c.packetKey, sourceRef: c.sourceRef, sourceRevision: c.sourceRevision })),
  memberships: overlayRows.flatMap((o: any) => o.chunks.map((c: any) => ({ candidateOrdinal: o.candidateOrdinal, chunkRowId: c.chunkRowId, canonicalChunkId: c.canonicalChunkId }))),
};
assertCurrentCandidateIndexV2(index);
const coords = { candidateSnapshotRevision: index.candidateSnapshotRevision, ordinalMapChecksum: index.ordinalMapChecksum };

// ---- OVERLAY-02 adapter: legacy summary HINT (chunk-grained)
const hintFile = path.resolve(ROOT, arg('--hints', '.tmp/atlas/legacy-summary-hint-ordinal-join-v1/20260926T080239Z/hint-candidate-ordinal.ndjson'));
const hintBytes = fs.readFileSync(hintFile);
const hintArtifactSha = sha(hintBytes);
const hintAlign = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reports/legacy-summary-cei23-alignment-v1-20260926T155209.080Z.json'), 'utf8'));
if (hintArtifactSha !== hintAlign.inputs.hintCrosswalkSha256) throw new Error('HINT_CROSSWALK_ARTIFACT_TAMPERED');
const hints = hintBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const hintEvidence = (): HistoricalEvidenceInputV2[] => hints.map((h: any) => ({
  evidenceId: `legacy-summary-hint:${h.chunkRowId}`, evidenceKind: 'LEGACY_SUMMARY_HINT', evidenceGranularity: 'CHUNK',
  historicalArtifactRevision: hintArtifactSha,
  historicalEvidenceDigest: sha(`${h.chunkRowId}\0${h.canonicalChunkId}\0${h.summaryDigest}`),
  sourceRef: h.sourceRef ?? null, sourceRevision: h.sourceRevision ?? null,
  chunk: { chunkRowId: h.chunkRowId, canonicalChunkId: h.canonicalChunkId, packetKey: h.packetKey ?? null },
  evidenceRefs: [`summary-digest:${h.summaryDigest}`, `codebase_chunk_index:${h.chunkRowId}`],
}));

// ---- OVERLAY-03 adapter: historical MapReduce (file-grained)
const enrichedDir = path.join(ROOT, '.tmp/atlas/mapreduce-primary-placeholder-enrichment-v1/20260926T154258.271Z');
const enrichedBytes = fs.readFileSync(path.join(enrichedDir, 'primary_metadata_corpus-enriched-00001.ndjson'));
const enrichedManifest = JSON.parse(fs.readFileSync(path.join(enrichedDir, 'manifest.json'), 'utf8'));
if (sha(enrichedBytes) !== enrichedManifest.output.sha256) throw new Error('MAPREDUCE_ENRICHED_ARTIFACT_TAMPERED');
const mrAll = enrichedBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.indexedEvidence)
  .sort((a, b) => a.sourceEvidence.recordOrdinal - b.sourceEvidence.recordOrdinal);
const mrEvidence = (): HistoricalEvidenceInputV2[] => {
  const firstByDigest = new Map<string, string>();
  return mrAll.map((r: any) => {
    const id = `mapreduce:${r.sourceEvidence.artifactSha256}#record=${r.sourceEvidence.recordOrdinal}`;
    const digest = r.metadata?.contentHash as string | undefined;
    const dup = digest ? firstByDigest.get(digest) ?? null : null;
    if (digest && !dup) firstByDigest.set(digest, id);
    return {
      evidenceId: id, evidenceKind: 'MAPREDUCE_RECORD', evidenceGranularity: 'FILE',
      historicalArtifactRevision: `sha256:${r.sourceEvidence.artifactSha256}`,
      historicalEvidenceDigest: sha(`${r.metadata?.stableKey}\0${digest}\0${r.metadata?.filePath}`),
      sourceRef: r.identity?.sourceRef ?? null, sourceRevision: r.identity?.sourceRevision ?? null,
      duplicateOfEvidenceId: dup, evidenceRefs: r.evidenceRefs ?? [],
    };
  });
};

// ---- OVERLAY-04 replay: build twice, verify every overlay, compare checksums
function run() {
  const hintOverlays = hintEvidence().map((e) => resolveHistoricalEvidenceToCandidates(e, index));
  const mrOverlays = mrEvidence().map((e) => resolveHistoricalEvidenceToCandidates(e, index));
  for (const o of [...hintOverlays, ...mrOverlays]) verifyHistoricalEvidenceOverlayV2(o, coords);
  return { hintOverlays, mrOverlays };
}
const a = run();
const b = run();
const tally = (os: HistoricalEvidenceCurrentCandidateOverlayV2[]) => {
  const t: Record<string, number> = {};
  for (const o of os) t[o.resolution.state] = (t[o.resolution.state] ?? 0) + 1;
  return t;
};
const hintCounts = tally(a.hintOverlays);
const mrCounts = tally(a.mrOverlays);
const hintSetChecksum = historicalEvidenceOverlaySetChecksumV2(a.hintOverlays);
const mrSetChecksum = historicalEvidenceOverlaySetChecksumV2(a.mrOverlays);
const replayIdentical = hintSetChecksum === historicalEvidenceOverlaySetChecksumV2(b.hintOverlays)
  && mrSetChecksum === historicalEvidenceOverlaySetChecksumV2(b.mrOverlays);

// Expectations are DERIVED from prior measured receipts, not hardcoded.
const priorMr = JSON.parse(fs.readFileSync(path.join(ROOT, fs.readdirSync(path.join(ROOT, 'docs/reports')).filter((f) => f.startsWith('mapreduce-lineage-recovery-v1-')).sort().pop()!.replace(/^/, 'docs/reports/')), 'utf8'));
const pc = priorMr.conservation.counts;
const chunkSetChunks = new Set(a.mrOverlays.flatMap((o) => o.resolution.canonicalChunkIds));
const exactHintOrdinals = new Set(a.hintOverlays.filter((o) => o.resolution.state === 'EXACT_CHUNK').flatMap((o) => o.resolution.candidateOrdinals));
const expectations = {
  legacySummary: {
    qualified: hints.length,
    exactChunk: crosswalk?.counts.matchedHintRows ?? legacyCei.hints.qualifiedHintsMatched,
    unresolved: crosswalk?.counts.unmatchedHintRows ?? legacyCei.hints.qualifiedHintsUnmatched,
    distinctCandidateOrdinals: crosswalk
      ? crosswalk.counts.candidatesWith1Hint + crosswalk.counts.candidatesWithMultipleHints
      : legacyCei.hints.distinctCandidateOrdinalsWithHint,
  },
  // CEI-24 contains only the selected revision-qualified packet cohort. Historical sources
  // absent from that snapshot are CURRENT_PACKET_NOT_FOUND, including the prior revision-change
  // population; do not infer or upgrade them to a current candidate.
  mapReduce: { total: mrAll.length, currentChunkSet: pc.EXACT_PACKET_CURRENT_CHUNK_AMBIGUOUS, distinctAddressableChunks: priorMr.chunkLevel.distinctCurrentOrdinalsAddressable, lineageMissing: pc.CURRENT_PROVEN_LINEAGE_MISSING, sourceRevisionChanged: 0, packetNotFound: pc.SOURCE_REVISION_CHANGED + pc.CURRENT_PACKET_NOT_FOUND, duplicates: pc.DUPLICATE_HISTORICAL_RECORD },
};
const observed = {
  legacySummary: { qualified: hints.length, exactChunk: hintCounts.EXACT_CHUNK ?? 0, unresolved: hints.length - (hintCounts.EXACT_CHUNK ?? 0), distinctCandidateOrdinals: exactHintOrdinals.size },
  mapReduce: { total: mrAll.length, currentChunkSet: mrCounts.CURRENT_CHUNK_SET ?? 0, distinctAddressableChunks: chunkSetChunks.size, lineageMissing: mrCounts.CURRENT_PROVEN_LINEAGE_MISSING ?? 0, sourceRevisionChanged: mrCounts.SOURCE_REVISION_CHANGED ?? 0, packetNotFound: mrCounts.CURRENT_PACKET_NOT_FOUND ?? 0, duplicates: mrCounts.DUPLICATE_HISTORICAL_EVIDENCE ?? 0 },
};
const deltas: string[] = [];
for (const k of Object.keys(expectations) as Array<keyof typeof expectations>) for (const f of Object.keys(expectations[k])) {
  if ((expectations[k] as any)[f] !== (observed[k] as any)[f]) deltas.push(`${k}.${f}: expected ${(expectations[k] as any)[f]} observed ${(observed[k] as any)[f]}`);
}

const stamp = new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(ROOT, `.tmp/atlas/historical-evidence-overlay-v2/${stamp}`);
fs.mkdirSync(outDir, { recursive: true });
const write = (name: string, rows: unknown[]) => { const body = rows.map((r) => JSON.stringify(r)).join('\n') + '\n'; fs.writeFileSync(path.join(outDir, name), body); return { path: rel(path.join(outDir, name)), sha256: sha(body), rows: rows.length }; };
const artifacts = { legacySummaryHintOverlay: write('legacy-summary-hint-overlay.ndjson', a.hintOverlays), mapReduceOverlay: write('mapreduce-overlay.ndjson', a.mrOverlays) };
const receipt = {
  schema: 'atlas.historical-evidence-overlay-proof-receipt.v2',
  status: replayIdentical && deltas.length === 0 ? 'HISTORICAL_EVIDENCE_OVERLAY_REPLAY_PROVEN' : 'HISTORICAL_EVIDENCE_OVERLAY_DELTAS_OBSERVED',
  generatedAt: new Date().toISOString(), canonicalAuthority: false, retrievalVote: false,
  destination: { cei24Receipt: crosswalkReceiptPath ? rel(crosswalkReceiptPath) : rel(legacyCeiReceiptPath), ...coords, candidateRows: ordinalMap.rowCount, memberships: index.memberships.length },
  inputs: { candidateMap: { path: rel(mapFile), sha256: expectedMapSha }, candidateChunkOverlay: { path: rel(overlayFile), sha256: expectedOverlaySha }, legacySummaryHintCrosswalk: { path: rel(hintFile), sha256: hintArtifactSha }, mapReduceEnriched: { path: rel(path.join(enrichedDir, 'primary_metadata_corpus-enriched-00001.ndjson')), sha256: enrichedManifest.output.sha256 } },
  legacySummary: { counts: hintCounts, overlaySetChecksum: hintSetChecksum },
  mapReduce: { counts: mrCounts, overlaySetChecksum: mrSetChecksum, distinctAddressableChunks: chunkSetChunks.size },
  replay: { identical: replayIdentical },
  expectationsDerivedFromPriorReceipts: expectations, observed, deltas,
  artifacts, writes: { postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0, graphify: 0 },
  notes: ['File-grained MapReduce records project one-to-many onto current chunks (CURRENT_CHUNK_SET); this is not an ambiguity failure.', 'DUPLICATE_HISTORICAL_EVIDENCE extends the requested resolution states so all 417 records conserve.'],
};
const receiptPath = path.join(ROOT, `docs/reports/historical-evidence-overlay-proof-v2-${stamp}.json`);
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ receiptPath: rel(receiptPath), status: receipt.status, legacySummary: hintCounts, mapReduce: mrCounts, distinctAddressableChunks: chunkSetChunks.size, replayIdentical, deltas }, null, 2));
if (!replayIdentical) process.exit(2);
