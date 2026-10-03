#!/usr/bin/env node
/**
 * Draft rows for the PROPOSED atlas_feature_unknowns worklist. Artifact-only: NO database access, nothing inserted.
 * Splits the single NO_QUALIFIED_LEGACY_SUMMARY_HINT reason into two actionable reasons using sealed artifacts.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = (b: string | Buffer) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const rel = (p: string) => path.relative(ROOT, p);
const ndjson = (p: string) => fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const reports = path.join(ROOT, 'docs/reports');
const latest = (prefix: string) => path.join(reports, fs.readdirSync(reports).filter((f) => f.startsWith(prefix)).sort().pop()!);

// Deterministic UUIDv5 (RFC 9562) — an idempotent-upsert surrogate, never identity.
const NAMESPACE = (() => { // frozen: v5(URL namespace, 'atlas.feature-unknown.v1')
  const url = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');
  return uuidv5(url, 'atlas.feature-unknown.v1');
})();
function uuidv5(ns: Buffer, name: string): Buffer {
  const h = crypto.createHash('sha1').update(ns).update(Buffer.from(name, 'utf8')).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x50; b[8] = (b[8]! & 0x3f) | 0x80;
  return b;
}
const uuidStr = (b: Buffer) => { const h = b.toString('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };

// ---- sealed inputs, each verified
const fr = JSON.parse(fs.readFileSync(latest('legacy-summary-hint-feature-v2-'), 'utf8'));
const rowsPath = path.resolve(ROOT, fr.artifacts.featureRows.path);
if (sha(fs.readFileSync(rowsPath)) !== fr.artifacts.featureRows.sha256) throw new Error('HINT_FEATURE_ROWS_ARTIFACT_TAMPERED');
const rows = ndjson(rowsPath);
const cei = JSON.parse(fs.readFileSync(path.join(reports, 'cei24-candidate-chunk-overlay-v1-20260926T161153Z.json'), 'utf8'));
if (cei.cei24b.candidateSnapshotRevision !== fr.bindings.candidateSnapshotRevision) throw new Error('SNAPSHOT_MISMATCH_BETWEEN_OVERLAY_AND_FEATURE');
const overlayPath = path.resolve(ROOT, cei.artifacts.overlay.path);
if (sha(fs.readFileSync(overlayPath)) !== cei.artifacts.overlay.sha256) throw new Error('CEI24_OVERLAY_ARTIFACT_TAMPERED');
const chunkCountByOrdinal = new Map(ndjson(overlayPath).map((o: any) => [o.candidateOrdinal as number, (o.chunks as unknown[]).length]));

// Packet-level summary flag from the CEI-23 numeric plane (context only; never a value for this feature).
const numeric = fs.readFileSync(path.join(ROOT, '.tmp/atlas/candidate-feature-matrix-v1/20260926T150456Z/numeric.f32le'));
const f32 = new Float32Array(numeric.buffer, numeric.byteOffset, numeric.byteLength / 4);
const SUMMARY_COL = 2, COLS = 6;

const producerRevision = sha(JSON.stringify({ feature: 'atlas_feature_unknowns.draft.v2', upstreamProducerRevision: fr.producerRevision, script: sha(fs.readFileSync(fileURLToPath(import.meta.url))) }));
const FEATURE = 'legacy_summary_cosine_max';
const drafts = rows.filter((r: any) => r.state === 'UNAVAILABLE').map((r: any) => {
  const chunks = chunkCountByOrdinal.get(r.candidateOrdinal) ?? 0;
  const hasChunks = chunks > 0;
  const naturalKey = [r.candidateSnapshotRevision, r.packetKey, FEATURE, 'MISSING_FEATURE_VALUE'].join('\u0000');
  return {
    unknown_key: uuidStr(uuidv5(NAMESPACE, naturalKey)),
    candidate_snapshot_revision: r.candidateSnapshotRevision, ordinal_map_checksum: r.ordinalMapChecksum,
    candidate_ordinal: r.candidateOrdinal, packet_key: r.packetKey, source_ref: r.sourceRef,
    feature_name: FEATURE, unknown_kind: 'MISSING_FEATURE_VALUE',
    reason_code: hasChunks ? 'CHUNK_WITHOUT_QUALIFIED_SUMMARY' : 'NO_PROVEN_CHUNK_LINEAGE',
    resolver_kind: hasChunks ? 'SUMMARY_GENERATION' : 'LINEAGE_REPAIR',
    status: 'OPEN', producer_revision: producerRevision,
    evidence: { provenChunkCount: chunks, matrixRowIndex: r.matrixRowIndex, packetLevelSummaryPresent: f32[r.matrixRowIndex * COLS + SUMMARY_COL] === 1, upstreamReason: r.unavailableReason },
  };
});

// ---- invariants
const keys = new Set(drafts.map((d: any) => d.unknown_key));
const naturalKeys = new Set(drafts.map((d: any) => `${d.candidate_snapshot_revision}|${d.packet_key}|${d.feature_name}|${d.unknown_kind}`));
const byReason: Record<string, number> = {}; for (const d of drafts) byReason[d.reason_code] = (byReason[d.reason_code] ?? 0) + 1;
const expected = fr.coverage.unavailable;
const checks = {
  matchesUnavailableCount: drafts.length === expected,
  uniqueSurrogateKeys: keys.size === drafts.length,
  uniqueNaturalKeys: naturalKeys.size === drafts.length,
  reasonsPartitionAll: Object.values(byReason).reduce((a, b) => a + b, 0) === drafts.length,
  noValuesStored: drafts.every((d: any) => !('value' in d) && !('rawCosine' in d)),
  deterministic: (() => { const again = uuidStr(uuidv5(NAMESPACE, [drafts[0].candidate_snapshot_revision, drafts[0].packet_key, FEATURE, 'MISSING_FEATURE_VALUE'].join('\u0000'))); return again === drafts[0].unknown_key; })(),
};
if (!Object.values(checks).every(Boolean)) throw new Error(`DRAFT_INVARIANT_FAILED:${JSON.stringify(checks)}`);

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(ROOT, `.tmp/atlas/feature-unknowns-draft-v2/${stamp}`);
fs.mkdirSync(outDir, { recursive: true });
const body = drafts.map((d) => JSON.stringify(d)).join('\n') + '\n';
fs.writeFileSync(path.join(outDir, 'atlas_feature_unknowns.draft.ndjson'), body);
const sqlPath = path.join(ROOT, 'sveltekit-frontend/drizzle/manual/20260926_atlas_feature_unknowns_PROPOSED.sql');
const receipt = {
  schema: 'atlas.feature-unknowns-draft-receipt.v2', status: 'DRAFT_ARTIFACT_ONLY_NOT_APPLIED', generatedAt: new Date().toISOString(),
  target: 'public.atlas_feature_unknowns (PROPOSED; table does not exist)', migration: { path: rel(sqlPath), sha256: sha(fs.readFileSync(sqlPath)), applied: false },
  inputs: { featureReceipt: rel(latest('legacy-summary-hint-feature-v2-')), featureRows: fr.artifacts.featureRows, cei24Overlay: cei.artifacts.overlay },
  coordinates: { candidateSnapshotRevision: fr.bindings.candidateSnapshotRevision, ordinalMapChecksum: fr.bindings.ordinalMapChecksum },
  draftRows: drafts.length, byReason, checks, uuidNamespace: uuidStr(NAMESPACE), producerRevision,
  artifact: { path: rel(path.join(outDir, 'atlas_feature_unknowns.draft.ndjson')), sha256: sha(body), rows: drafts.length },
  packetLevelSummaryPresentAmongDrafts: drafts.filter((d: any) => d.evidence.packetLevelSummaryPresent).length,
  writes: { postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0, graphify: 0 },
  semantics: 'Worklist of missing feature values. Not identity, not a value store; distinct from unknown_packets (packet-identity lifecycle).',
};
const receiptPath = path.join(reports, `feature-unknowns-draft-v2-${stamp}.json`);
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ receiptPath: rel(receiptPath), draftRows: drafts.length, byReason, checks, packetLevelSummaryPresentAmongDrafts: receipt.packetLevelSummaryPresentAmongDrafts, uuidNamespace: receipt.uuidNamespace }, null, 2));
