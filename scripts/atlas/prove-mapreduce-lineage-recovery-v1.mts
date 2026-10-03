#!/usr/bin/env node
/**
 * MAPREDUCE-LINEAGE-RECOVERY-01 (MR-XWALK-01..05). Read-only, artifact-only.
 * Historical MapReduce records are HINT evidence. Current PROVEN atlas_packet_chunk_lineage is
 * the identity authority; the chunk-grained CandidateOrdinalMapV1 is the destination.
 * No scoring, re-embedding, placeholder promotion, or CEI-23 involvement. No datastore writes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import {
  assertCandidateOrdinalMapIntegrityV1,
  type CandidateOrdinalMapV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enrichedDir = path.join(ROOT, '.tmp/atlas/mapreduce-primary-placeholder-enrichment-v1/20260926T154258.271Z');
const enrichedPath = path.join(enrichedDir, 'primary_metadata_corpus-enriched-00001.ndjson');
const manifestPath = path.join(enrichedDir, 'manifest.json');
const mapPath = path.join(ROOT, '.tmp/atlas/candidate-ordinal-bridged-v1/20260926T074719Z/candidate-ordinal-map-v1.json');
const sha = (data: string | Buffer) => `sha256:${crypto.createHash('sha256').update(data).digest('hex')}`;

// ---- MR-XWALK-01/02: artifact schema, checksum, uniqueness
const enrichedBytes = fs.readFileSync(enrichedPath);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (sha(enrichedBytes) !== manifest.output.sha256) throw new Error('ENRICHED_ARTIFACT_CHECKSUM_MISMATCH');
const all = enrichedBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
if (all.length !== manifest.output.rows) throw new Error('ENRICHED_ARTIFACT_ROW_COUNT_MISMATCH');
const hist = all.filter((r) => r.indexedEvidence);
const historicalArtifactDigest = all[0].sourceEvidence.artifactSha256 as string;
if (all.some((r) => r.sourceEvidence.artifactSha256 !== historicalArtifactDigest)) throw new Error('MIXED_HISTORICAL_ARTIFACT_DIGEST');
const ordinals = hist.map((r) => r.sourceEvidence.recordOrdinal as number);
if (new Set(ordinals).size !== hist.length) throw new Error('DUPLICATE_RECORD_ORDINAL');
const fieldsPresent = {
  stableKey: hist.filter((r) => r.metadata?.stableKey).length,
  historicalFilePath: hist.filter((r) => r.metadata?.filePath).length,
  contentHash: hist.filter((r) => r.metadata?.contentHash).length,
  derivedSourceRef: hist.filter((r) => r.identity?.sourceRef).length,
  derivedSourceRevision: hist.filter((r) => r.identity?.sourceRevision).length,
  packetKey: hist.filter((r) => r.identity?.packetKey).length,
  chunkIdentity: hist.filter((r) => (r.indexedEvidence.lineage?.canonicalChunkIds ?? []).length > 0).length,
};

const candidateMap = JSON.parse(fs.readFileSync(mapPath, 'utf8')) as CandidateOrdinalMapV1;
assertCandidateOrdinalMapIntegrityV1(candidateMap);
const mapByChunk = new Map(candidateMap.candidates.map((c) => [c.canonicalId, c]));

// duplicates: same content digest => same current source binding; first ordinal is representative
const sorted = [...hist].sort((a, b) => a.sourceEvidence.recordOrdinal - b.sourceEvidence.recordOrdinal);
const repByDigest = new Map<string, number>();
for (const r of sorted) {
  const d = r.metadata?.contentHash as string | undefined;
  if (d && !repByDigest.has(d)) repByDigest.set(d, r.sourceEvidence.recordOrdinal);
}

// ---- MR-XWALK-03: current PROVEN lineage, exact source_ref + source_revision (read-only)
const reps = sorted.filter((r) => r.metadata?.contentHash && r.identity?.sourceRef && r.identity?.sourceRevision
  && repByDigest.get(r.metadata.contentHash) === r.sourceEvidence.recordOrdinal);
const wanted = JSON.stringify(reps.map((r) => ({ source_ref: r.identity.sourceRef, source_revision: r.identity.sourceRevision, workspace_revision: r.identity.workspaceRevision })));
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 180000 });
const client = await pool.connect();
let packetRows: Array<{ source_ref: string; packet_key: string; source_revision: string | null; ws_key: string | null }>;
let lineageRows: Array<{ packet_key: string; source_ref: string; source_revision: string; canonical_chunk_id: string; chunk_row_id: string; chunk_exists: boolean }>;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  packetRows = (await client.query(`
    WITH w AS (SELECT * FROM json_to_recordset($1::json) AS x(source_ref text, source_revision text, workspace_revision text))
    SELECT p.source_ref, p.packet_key, lower(p.source_revision::text) AS source_revision, lower(p.workspace_revision_key::text) AS ws_key
      FROM w JOIN public.atlas_packets p ON p.source_ref = w.source_ref`, [wanted])).rows;
  lineageRows = (await client.query(`
    WITH w AS (SELECT * FROM json_to_recordset($1::json) AS x(source_ref text, source_revision text, workspace_revision text))
    SELECT l.packet_key, l.source_ref, l.source_revision, l.canonical_chunk_id, l.chunk_row_id::text AS chunk_row_id, (c.id IS NOT NULL) AS chunk_exists
      FROM w JOIN public.atlas_packet_chunk_lineage l
        ON l.source_ref = w.source_ref AND l.source_revision = w.source_revision AND l.revision_status = 'PROVEN'
      LEFT JOIN public.codebase_chunk_index c ON c.id = l.chunk_row_id AND c.chunk_id::text = l.canonical_chunk_id`, [wanted])).rows;
  await client.query('ROLLBACK');
} catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); await pool.end(); }

const packetsByRef = new Map<string, typeof packetRows>();
for (const p of packetRows) (packetsByRef.get(p.source_ref) ?? packetsByRef.set(p.source_ref, []).get(p.source_ref)!).push(p);
const lineageByKey = new Map<string, typeof lineageRows>();
for (const l of lineageRows) (lineageByKey.get(`${l.source_ref}\0${l.source_revision}`) ?? lineageByKey.set(`${l.source_ref}\0${l.source_revision}`, []).get(`${l.source_ref}\0${l.source_revision}`)!).push(l);

// ---- MR-XWALK-04/05: classify every one of the 417, then join to the 6,732 map
type State = 'EXACT_CURRENT_CHUNK_MATCH' | 'EXACT_PACKET_CURRENT_CHUNK_AMBIGUOUS' | 'SOURCE_REVISION_CHANGED' | 'CURRENT_PACKET_NOT_FOUND'
  | 'CURRENT_PROVEN_LINEAGE_MISSING' | 'CHUNK_IDENTITY_MISMATCH' | 'HISTORICAL_IDENTITY_INSUFFICIENT' | 'DUPLICATE_HISTORICAL_RECORD';
const detail = sorted.map((r) => {
  const base = {
    recordOrdinal: r.sourceEvidence.recordOrdinal, historicalArtifactDigest,
    historicalStableKey: r.metadata?.stableKey ?? null, historicalContentHash: r.metadata?.contentHash ?? null,
    sourceRef: r.identity?.sourceRef ?? null, sourceRevision: r.identity?.sourceRevision ?? null, workspaceRevision: r.identity?.workspaceRevision ?? null,
    packetKey: null as string | null, chunks: [] as Array<Record<string, unknown>>, reasons: [] as string[], canonicalAuthority: false as const,
  };
  const digest = r.metadata?.contentHash as string | undefined;
  if (!digest || !base.sourceRef || !base.sourceRevision) return { ...base, recoveryState: 'HISTORICAL_IDENTITY_INSUFFICIENT' as State };
  if (repByDigest.get(digest) !== base.recordOrdinal) return { ...base, recoveryState: 'DUPLICATE_HISTORICAL_RECORD' as State, reasons: [`SAME_CONTENT_DIGEST_AS_RECORD_${repByDigest.get(digest)}`] };
  const pk = packetsByRef.get(base.sourceRef) ?? [];
  if (pk.length === 0) return { ...base, recoveryState: 'CURRENT_PACKET_NOT_FOUND' as State };
  const pkRev = pk.filter((p) => p.source_revision === base.sourceRevision.toLowerCase());
  if (pkRev.length === 0) return { ...base, recoveryState: 'SOURCE_REVISION_CHANGED' as State };
  if (pkRev.length > 1) return { ...base, recoveryState: 'EXACT_PACKET_CURRENT_CHUNK_AMBIGUOUS' as State, reasons: ['PACKET_AMBIGUOUS_FOR_SOURCE_REVISION'] };
  const packet = pkRev[0]!;
  const withPacket = { ...base, packetKey: packet.packet_key };
  const lin = (lineageByKey.get(`${base.sourceRef}\0${base.sourceRevision}`) ?? []).filter((l) => l.packet_key === packet.packet_key && l.chunk_exists);
  if (lin.length === 0) return { ...withPacket, recoveryState: 'CURRENT_PROVEN_LINEAGE_MISSING' as State };
  const chunks = lin.map((l) => {
    const c = mapByChunk.get(l.canonical_chunk_id);
    const inMap = !!c && c.packetKey === l.packet_key && c.sourceRef === l.source_ref && c.sourceRevision === l.source_revision
      && c.workspaceRevision === candidateMap.workspaceRevision && c.evidenceRefs.includes(`atlas_packet_chunk_lineage:${l.chunk_row_id}`);
    return { chunkRowId: l.chunk_row_id, canonicalChunkId: l.canonical_chunk_id, candidateOrdinal: inMap ? c!.candidateOrdinal : null, inCurrentOrdinalMap: inMap };
  });
  const inMap = chunks.filter((c) => c.inCurrentOrdinalMap);
  if (inMap.length === 0) return { ...withPacket, chunks, recoveryState: 'CHUNK_IDENTITY_MISMATCH' as State, reasons: ['PROVEN_CHUNKS_NOT_IN_CURRENT_ORDINAL_MAP'] };
  // Historical records are file-grained: >1 current chunk means the record cannot nominate one chunk.
  if (chunks.length > 1) return { ...withPacket, chunks, recoveryState: 'EXACT_PACKET_CURRENT_CHUNK_AMBIGUOUS' as State, reasons: ['FILE_GRAINED_HISTORICAL_RECORD_MAPS_TO_MULTIPLE_CURRENT_CHUNKS'] };
  return { ...withPacket, chunks, recoveryState: 'EXACT_CURRENT_CHUNK_MATCH' as State };
});
const counts: Record<string, number> = {};
for (const d of detail) counts[d.recoveryState] = (counts[d.recoveryState] ?? 0) + 1;
const conserved = detail.length === hist.length && Object.values(counts).reduce((a, b) => a + b, 0) === hist.length;
const ambiguous = detail.filter((d) => d.recoveryState === 'EXACT_PACKET_CURRENT_CHUNK_AMBIGUOUS');
const stamp = new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(ROOT, `.tmp/atlas/mapreduce-lineage-recovery-v1/${stamp}`);
fs.mkdirSync(outDir, { recursive: true });
const body = detail.map((d) => JSON.stringify(d)).join('\n') + '\n';
fs.writeFileSync(path.join(outDir, 'recovery.ndjson'), body);
const receipt = {
  schema: 'atlas.mapreduce-lineage-recovery-receipt.v1',
  status: conserved ? 'MAPREDUCE_LINEAGE_RECOVERY_CONSERVED' : 'CONSERVATION_FAILED',
  generatedAt: new Date().toISOString(), canonicalAuthority: false,
  historicalArtifact: { enriched: path.relative(ROOT, enrichedPath), enrichedSha256: manifest.output.sha256, sourceArtifactSha256: historicalArtifactDigest, records: hist.length, uniqueRecordOrdinals: new Set(ordinals).size, uniqueContentDigests: repByDigest.size },
  historicalIdentityFieldsPresent: fieldsPresent,
  note: 'Historical records are file-grained; sourceRef/sourceRevision were derived by content-digest binding, not carried as chunk coordinates.',
  destination: { ordinalMap: path.relative(ROOT, mapPath), rowCount: candidateMap.rowCount, candidateSnapshotRevision: candidateMap.candidateSnapshotRevision, ordinalMapChecksum: candidateMap.ordinalMapChecksum },
  conservation: { input: hist.length, output: detail.length, conserved, counts },
  chunkLevel: { exactMatchChunks: detail.filter((d) => d.recoveryState === 'EXACT_CURRENT_CHUNK_MATCH').length, ambiguousRecordsCurrentChunkTotal: ambiguous.reduce((a, d) => a + d.chunks.length, 0), distinctCurrentOrdinalsAddressable: new Set(detail.flatMap((d) => d.chunks.map((c: Record<string, unknown>) => c.candidateOrdinal)).filter((o) => o !== null)).size },
  semantics: 'CURRENTLY_ADDRESSABLE_HISTORICAL_EVIDENCE only; historical values are not current canonical features.',
  detail: { path: path.relative(ROOT, path.join(outDir, 'recovery.ndjson')), sha256: sha(body), rows: detail.length },
  producer: { scored: false, reEmbedded: false, placeholdersPromoted: false, cei23Touched: false },
  writes: { postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0, graphify: 0 },
};
const receiptPath = path.join(ROOT, `docs/reports/mapreduce-lineage-recovery-v1-${stamp}.json`);
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ receiptPath, status: receipt.status, fieldsPresent, conservation: receipt.conservation, chunkLevel: receipt.chunkLevel }, null, 2));
if (!conserved) process.exit(2);
