#!/usr/bin/env node
/**
 * CEI-24A/B + CANDIDATE-CHUNK-OVERLAY-01/02. Read-only, artifact-only.
 *
 * 24A  Prove the existing packet-level canonical-id owner for CEI-23 rows
 *      (atlas_packets.packet_id, the convention already used by
 *      materialize-candidate-ordinal-corpus-v1). Exact join only; fail closed otherwise.
 * 24B  Build CandidateOrdinalMapV1 from the frozen CEI-23 cohort via the existing owner.
 * OV1  Attach exact PROVEN atlas_packet_chunk_lineage chunks (0..N) to each candidate.
 * OV2  Seal + checksum the overlay and report 0/1/N multiplicity + HINT association.
 *
 * Never writes to Postgres/Qdrant/Valkey/RabbitMQ. Never runs Graphify. No cosine.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapChecksum,
  materializeCandidateOrdinalMap,
  materializeRevisionQualifiedSourceChunkOrdinalMapV1,
  revisionQualifiedSourceChunkCohortV1Schema,
  type CanonicalCandidateIdentityInput,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const argValue = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const MATRIX_DIR = path.resolve(ROOT, argValue('--matrix-dir', '.tmp/atlas/candidate-feature-matrix-v1/20260926T150456Z'));
const HINT_PATH = path.resolve(ROOT, argValue('--hint-crosswalk', '.tmp/atlas/legacy-summary-hint-ordinal-join-v1/20260926T080239Z/hint-candidate-ordinal.ndjson'));
const sha = (data: string | Buffer) => `sha256:${crypto.createHash('sha256').update(data).digest('hex')}`;
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, c]) => c !== undefined)
    .sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
    .map(([k, c]) => `${JSON.stringify(k)}:${stableJson(c)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
};
const readNdjson = (file: string) => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

interface MatrixRow {
  candidateOrdinal: number; packetKey: string; sourceRef: string;
  sourceRevision: string; workspaceRevision: string;
}
const matrixMapPath = path.join(MATRIX_DIR, 'candidate-ordinal-map.ndjson');
const matrixRows = readNdjson(matrixMapPath) as MatrixRow[];
const matrixFileSha = sha(fs.readFileSync(matrixMapPath));
const workspaceRevision = matrixRows[0].workspaceRevision;
if (matrixRows.some((r) => r.workspaceRevision !== workspaceRevision)) throw new Error('CEI23_MIXED_WORKSPACE_REVISION');
if (new Set(matrixRows.map((r) => r.packetKey)).size !== matrixRows.length) throw new Error('CEI23_DUPLICATE_PACKET_KEY');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 180000 });
const client = await pool.connect();
let packetRows: Array<{ packet_key: string; packet_id: string; n: number }>;
let lineageRows: Array<{ packet_key: string; canonical_chunk_id: string; chunk_row_id: string; membership_status: string; chunk_ordinal: number | null; lineage_producer_revision: string; chunk_exists: boolean }>;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const wanted = JSON.stringify(matrixRows.map((r) => ({ packet_key: r.packetKey, source_ref: r.sourceRef, source_revision: r.sourceRevision, workspace_revision: r.workspaceRevision })));
  // 24A: exact tuple -> packet_id. Any row that is not exactly 1 match fails the owner proof.
  packetRows = (await client.query(`
    WITH wanted AS (
      SELECT * FROM json_to_recordset($1::json) AS x(packet_key text, source_ref text, source_revision text, workspace_revision text)
    )
    SELECT w.packet_key, min(p.packet_id) AS packet_id, count(p.packet_id)::int AS n
      FROM wanted w
      LEFT JOIN public.atlas_packets p
        ON p.packet_key = w.packet_key
       AND p.source_ref = w.source_ref
       AND lower(p.source_revision::text) = lower(w.source_revision)
       AND lower(p.workspace_revision_key::text) = lower(w.workspace_revision)
     GROUP BY w.packet_key`, [wanted])).rows;
  // OV1: exact PROVEN lineage for the same tuple; chunk row must exist with matching chunk_id.
  lineageRows = (await client.query(`
    WITH wanted AS (
      SELECT * FROM json_to_recordset($1::json) AS x(packet_key text, source_ref text, source_revision text, workspace_revision text)
    )
    SELECT l.packet_key, l.canonical_chunk_id, l.chunk_row_id::text AS chunk_row_id, l.membership_status,
           l.chunk_ordinal, l.lineage_producer_revision, (c.id IS NOT NULL) AS chunk_exists
      FROM wanted w
      JOIN public.atlas_packet_chunk_lineage l
        ON l.packet_key = w.packet_key
       AND l.source_ref = w.source_ref
       AND l.source_revision = w.source_revision
       AND l.revision_status = 'PROVEN'
      LEFT JOIN public.codebase_chunk_index c
        ON c.id = l.chunk_row_id AND c.chunk_id::text = l.canonical_chunk_id
     ORDER BY l.packet_key, l.canonical_chunk_id`, [wanted])).rows;
  await client.query('ROLLBACK');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}

// ---- 24A verdict
const packetIdByKey = new Map(packetRows.map((r) => [r.packet_key, r]));
const unresolved = matrixRows.filter((r) => (packetIdByKey.get(r.packetKey)?.n ?? 0) === 0).length;
const ambiguous = matrixRows.filter((r) => (packetIdByKey.get(r.packetKey)?.n ?? 0) > 1).length;
const packetIdEqualsPacketKey = packetRows.filter((r) => r.n === 1 && r.packet_id === r.packet_key).length;
const resolvedIds = packetRows.filter((r) => r.n === 1).map((r) => r.packet_id);
const duplicatePacketIds = resolvedIds.length - new Set(resolvedIds).size;
const ownerVerdict = unresolved === 0 && ambiguous === 0 && duplicatePacketIds === 0
  ? 'CEI_PACKET_CANONICAL_ID_OWNER_PROVEN' : 'CEI_PACKET_CANONICAL_ID_OWNER_MISSING';

const stamp = new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(ROOT, `.tmp/atlas/cei24-candidate-chunk-overlay-v1/${stamp}`);
const receiptPath = path.join(ROOT, `docs/reports/cei24-candidate-chunk-overlay-v1-${stamp}.json`);
const baseReceipt = {
  schema: 'atlas.cei24-candidate-chunk-overlay-receipt.v1',
  generatedAt: new Date().toISOString(),
  canonicalAuthority: false,
  inputs: { matrixDir: path.relative(ROOT, MATRIX_DIR), matrixOrdinalFileSha256: matrixFileSha, matrixRows: matrixRows.length, workspaceRevision },
  cei24a: {
    owner: 'atlas_packets.packet_id (convention of scripts/atlas/materialize-candidate-ordinal-corpus-v1.mts)',
    exactTupleJoin: 'packet_key + exact source_ref (canonical_source_ref is a lowercased variant, not the key) + source_revision + workspace_revision_key (atlas_packets.workspace_revision is legacy integer 0)',
    unresolved, ambiguous, duplicatePacketIds, packetIdEqualsPacketKeyRows: packetIdEqualsPacketKey, packetIdDiffersFromPacketKeyRows: resolvedIds.length - packetIdEqualsPacketKey, verdict: ownerVerdict,
  },
  writes: { postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0, graphify: 0 },
};
if (ownerVerdict !== 'CEI_PACKET_CANONICAL_ID_OWNER_PROVEN') {
  fs.writeFileSync(receiptPath, JSON.stringify({ ...baseReceipt, status: 'BLOCKED_CEI_PACKET_ID_OWNER_MISSING' }, null, 2));
  console.log(`BLOCKED ${ownerVerdict} unresolved=${unresolved} ambiguous=${ambiguous} dupIds=${duplicatePacketIds}\n${receiptPath}`);
  process.exit(2);
}

// ---- 24B: CandidateOrdinalMapV1 through the existing owner
const rawCandidates: CanonicalCandidateIdentityInput[] = matrixRows.map((r) => {
  const packetId = packetIdByKey.get(r.packetKey)!.packet_id;
  return {
    canonicalId: packetId, packetKey: r.packetKey, sourceRef: r.sourceRef,
    treeNodeId: null, symbolVersionId: null, workspaceRevision, sourceRevision: r.sourceRevision,
    graphRevision: null, semanticRevision: null, degradedIdentity: false,
    evidenceRefs: [`atlas_packets:${packetId}`], representationBindings: [],
  };
});
const cohortIdentity = {
  schema: 'atlas.cei23-packet-candidate-ordinal-input.v1',
  workspaceRevision, matrixOrdinalFileSha256: matrixFileSha, rowCount: rawCandidates.length,
  candidates: rawCandidates,
};
const candidateSnapshotRevision = sha(stableJson(cohortIdentity));
const producerRevision = `materialize-cei24-candidate-chunk-overlay-v1:${sha(fs.readFileSync(fileURLToPath(import.meta.url)))}`;
const seed = materializeCandidateOrdinalMap({ candidates: rawCandidates, candidateSnapshotRevision, workspaceRevision, producerRevision });
const cohort = revisionQualifiedSourceChunkCohortV1Schema.parse({
  status: 'REVISION_QUALIFIED', workspaceRevision, candidateSnapshotRevision,
  sourceRevisionSetChecksum: candidateOrdinalMapChecksum([...new Set(matrixRows.map((r) => `${r.sourceRef}\0${r.sourceRevision}`))].sort()),
  candidates: seed.candidates,
});
const ordinalMap = materializeRevisionQualifiedSourceChunkOrdinalMapV1({ cohort, producerRevision });
assertCandidateOrdinalMapIntegrityV1(ordinalMap);
if (ordinalMap.rowCount !== matrixRows.length || ordinalMap.identityAuthority !== false) throw new Error('ORDINAL_MAP_MISMATCH');

// ---- OV1: overlay (0..N proven chunks per candidate)
const matrixRowByPacketKey = new Map(matrixRows.map((r) => [r.packetKey, r.candidateOrdinal]));
const chunksByPacket = new Map<string, typeof lineageRows>();
for (const l of lineageRows) {
  if (!l.chunk_exists) continue;
  const arr = chunksByPacket.get(l.packet_key) ?? [];
  arr.push(l);
  chunksByPacket.set(l.packet_key, arr);
}
const lineageWithoutChunkRow = lineageRows.filter((l) => !l.chunk_exists).length;
const overlay = ordinalMap.candidates.map((c) => {
  const chunks = (chunksByPacket.get(c.packetKey!) ?? []).map((l) => ({
    chunkRowId: l.chunk_row_id, canonicalChunkId: l.canonical_chunk_id,
    membershipStatus: l.membership_status, chunkOrdinal: l.chunk_ordinal,
    lineageRevision: l.lineage_producer_revision,
    evidenceRefs: [`atlas_packet_chunk_lineage:${l.chunk_row_id}`, `codebase_chunk_index:${l.chunk_row_id}`],
  }));
  return {
    schema: 'atlas.candidate-chunk-evidence-overlay.v1',
    candidateOrdinal: c.candidateOrdinal, candidateSnapshotRevision, ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    matrixRowIndex: matrixRowByPacketKey.get(c.packetKey!)!,
    packetKey: c.packetKey, sourceRef: c.sourceRef, sourceRevision: c.sourceRevision, workspaceRevision,
    chunks, canonicalAuthority: false,
  };
});

// ---- OV2: multiplicity + HINT association
const counts = overlay.map((o) => o.chunks.length);
const multiplicity = {
  candidateRowsWithNoProvenChunks: counts.filter((n) => n === 0).length,
  candidateRowsWithOneProvenChunk: counts.filter((n) => n === 1).length,
  candidateRowsWithMultipleProvenChunks: counts.filter((n) => n > 1).length,
  totalProvenChunks: counts.reduce((a, b) => a + b, 0),
  maxChunksPerCandidate: Math.max(...counts),
};
const chunkKeyToOverlay = new Map<string, number>();
overlay.forEach((o) => o.chunks.forEach((c) => chunkKeyToOverlay.set(`${c.chunkRowId}\0${c.canonicalChunkId}\0${o.packetKey}`, o.candidateOrdinal)));
const hints = readNdjson(HINT_PATH) as Array<{ chunkRowId: string; canonicalChunkId: string; packetKey: string; sourceRef: string; sourceRevision: string; workspaceRevision: string; summaryDigest: string }>;
const hintDetail = hints.map((h) => {
  const ord = chunkKeyToOverlay.get(`${h.chunkRowId}\0${h.canonicalChunkId}\0${h.packetKey}`);
  const packetInCei = matrixRowByPacketKey.has(h.packetKey);
  const o = ord === undefined ? null : overlay[ord];
  const exactRev = o !== null && o.sourceRef === h.sourceRef && o.sourceRevision === h.sourceRevision && o.workspaceRevision === h.workspaceRevision;
  const status = ord !== undefined && exactRev ? 'MATCHED_PROVEN_CHUNK'
    : !packetInCei ? 'NO_CURRENT_CANDIDATE'
    : ord !== undefined ? 'REVISION_MISMATCH' : 'PACKET_CANDIDATE_CHUNK_NOT_PROVEN';
  return { chunkRowId: h.chunkRowId, canonicalChunkId: h.canonicalChunkId, packetKey: h.packetKey, summaryDigest: h.summaryDigest, candidateOrdinal: status === 'MATCHED_PROVEN_CHUNK' ? ord : null, status };
});
const hintStatusCounts: Record<string, number> = {};
for (const d of hintDetail) hintStatusCounts[d.status] = (hintStatusCounts[d.status] ?? 0) + 1;
const matchedOrdinals = new Set(hintDetail.filter((d) => d.candidateOrdinal !== null).map((d) => d.candidateOrdinal));

fs.mkdirSync(outDir, { recursive: true });
const write = (name: string, body: string) => { fs.writeFileSync(path.join(outDir, name), body); return { path: path.relative(ROOT, path.join(outDir, name)), sha256: sha(body), bytes: Buffer.byteLength(body) }; };
const artifacts = {
  ordinalMap: write('candidate-ordinal-map-v1.json', JSON.stringify(ordinalMap)),
  overlay: write('candidate-chunk-evidence-overlay.ndjson', overlay.map((o) => JSON.stringify(o)).join('\n') + '\n'),
  hintAssociation: write('hint-association.ndjson', hintDetail.map((d) => JSON.stringify(d)).join('\n') + '\n'),
};
const overlayChecksum = candidateOrdinalMapChecksum(overlay);
const receipt = {
  ...baseReceipt,
  status: 'CANDIDATE_CHUNK_OVERLAY_SEALED',
  cei24b: {
    candidateSnapshotRevision, ordinalMapChecksum: ordinalMap.ordinalMapChecksum, rowCount: ordinalMap.rowCount,
    producerRevision, orderingNote: 'CandidateOrdinalMapV1 ordinals are canonicalId(packet_id)-ordered; CEI-23 matrix rows are sourceRef-ordered — overlay carries matrixRowIndex as the crosswalk.',
    ordinalIsPermutationOfMatrixRow: overlay.some((o) => o.candidateOrdinal !== o.matrixRowIndex),
  },
  overlay: { checksum: overlayChecksum, ...multiplicity, lineageRowsWithoutExistingChunkRow: lineageWithoutChunkRow },
  hints: {
    input: path.relative(ROOT, HINT_PATH), rows: hints.length, statusCounts: hintStatusCounts,
    qualifiedHintsMatched: hintStatusCounts.MATCHED_PROVEN_CHUNK ?? 0,
    qualifiedHintsUnmatched: hints.length - (hintStatusCounts.MATCHED_PROVEN_CHUNK ?? 0),
    distinctCandidateOrdinalsWithHint: matchedOrdinals.size,
    unavailableCandidates: ordinalMap.rowCount - matchedOrdinals.size,
  },
  producer: { feature: 'legacy_summary_cosine', started: false, queryVectorCreated: false, cosineComputed: false, rf04Admitted: false, rf05Replayed: false },
  artifacts,
};
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ receiptPath, status: receipt.status, cei24a: receipt.cei24a.verdict, snapshot: candidateSnapshotRevision, multiplicity, hints: receipt.hints }, null, 2));
