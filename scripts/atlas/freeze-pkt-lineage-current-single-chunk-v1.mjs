#!/usr/bin/env node
/**
 * PKT-LINEAGE-CURRENT-SINGLE-CHUNK-01 -- proposal freeze, READ ONLY.
 *
 * Scope: packets bound to the ADMITTED workspace revision (atlas_packets.workspace_revision_key)
 * that have NO atlas_packet_chunk_lineage row, whose file has EXACTLY ONE codebase_chunk_index chunk
 * (unambiguous EXACT_SINGLE_MEMBER -- no source_ref fanout). Identity values are read verbatim from
 * existing columns, same recipe as freeze-pkt-lineage-09-proposal-v1.mjs:
 *   canonicalChunkId = codebase_chunk_index.chunk_id, chunkRowId = codebase_chunk_index.id,
 *   sourceNamespace  = 'workspace:' || graphify_files.workspace_id.
 * Revision is PROVEN only when the whole-source digests all agree: packet.source_revision ==
 * chunk.file_content_hash == graphify_files.code_source_revision (file row chosen by that parity).
 * Rows failing any parity check are counted and skipped, never coerced.
 *
 * NO WRITES. Output: docs/reports/pkt-lineage-current-single-chunk-frozen-proposal-v1.json
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

// --multi: files with MORE THAN ONE chunk -> EXACT_MULTI_MEMBER, every chunk with relative_path = source_ref
// (the existing 09 convention). A packet is skipped whole if ANY of its chunks fails digest parity.
// Proposal goes to gitignored .tmp/atlas/ (large; the repo hook rejects >10MB files).
const MULTI = process.argv.includes('--multi');
const OUT = MULTI
  ? path.join(REPO_ROOT, '.tmp/atlas/pkt-lineage-current-multi-chunk-frozen-proposal-v1.json')
  : path.join(REPO_ROOT, 'docs/reports/pkt-lineage-current-single-chunk-frozen-proposal-v1.json');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const admission = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true) throw new Error('NO_ADMITTED_WORKSPACE_REVISION');
const WR = admission.workspaceRevision;
const norm = (h) => (h ? String(h).replace(/^sha256:/, '') : null);
const PRODUCER = MULTI ? 'PKT-LINEAGE-CURRENT-MULTI-CHUNK-01:v1' : 'PKT-LINEAGE-CURRENT-SINGLE-CHUNK-01:v1';

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 300000 });
const { rows } = await pool.query(`
  WITH u AS (
    SELECT p.packet_key, p.source_ref, p.source_revision
    FROM atlas_packets p
    WHERE p.workspace_revision_key = $1 AND p.source_revision IS NOT NULL AND p.source_ref IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM atlas_packet_chunk_lineage l WHERE l.packet_key = p.packet_key)
  ), one AS (
    SELECT c.relative_path FROM codebase_chunk_index c JOIN u ON u.source_ref = c.relative_path
    GROUP BY c.relative_path HAVING COUNT(*) ${MULTI ? '>' : '='} 1
  )
  SELECT u.packet_key, u.source_ref, u.source_revision,
         c.chunk_id::text AS chunk_id, c.id::text AS chunk_row_id, c.file_content_hash,
         gf.workspace_id::text AS workspace_id, NULLIF(BTRIM(gf.code_source_revision::text), '') AS graphify_rev
  FROM u
  JOIN one ON one.relative_path = u.source_ref
  JOIN codebase_chunk_index c ON c.relative_path = u.source_ref
  LEFT JOIN LATERAL (
    SELECT g.workspace_id, g.code_source_revision FROM graphify_files g
    WHERE g.source_ref = u.source_ref AND g.code_source_revision = u.source_revision
    ORDER BY g.updated_at DESC NULLS LAST LIMIT 1
  ) gf ON TRUE
`, [WR]);
await pool.end();

const skipped = { no_namespace: 0, chunk_hash_mismatch: 0, graphify_rev_mismatch: 0, missing_chunk_id: 0, duplicate_canonical_chunk_id: 0 };
const byPacket = new Map();
for (const r of rows) { if (!byPacket.has(r.packet_key)) byPacket.set(r.packet_key, []); byPacket.get(r.packet_key).push(r); }
const proposedMembershipRows = [];
for (const [, group] of byPacket) {
  let bad = null;
  // Same canonical chunk id on two distinct chunk rows is an identity ambiguity: never pick one.
  if (new Set(group.map((r) => r.chunk_id)).size !== group.length) bad = 'duplicate_canonical_chunk_id';
  if (!bad) for (const r of group) {
    if (!r.chunk_id || !r.chunk_row_id) bad = 'missing_chunk_id';
    else if (!r.workspace_id) bad = 'no_namespace';
    else if (norm(r.file_content_hash) !== norm(r.source_revision)) bad = 'chunk_hash_mismatch';
    else if (!r.graphify_rev || norm(r.graphify_rev) !== norm(r.source_revision)) bad = 'graphify_rev_mismatch';
    if (bad) break;
  }
  if (bad) { skipped[bad]++; continue; } // whole packet skipped: membership must be exact or absent
  for (const r of group) {
    proposedMembershipRows.push({
      packetKey: r.packet_key, canonicalChunkId: r.chunk_id, chunkRowId: r.chunk_row_id, sourceRef: r.source_ref,
      sourceNamespace: `workspace:${r.workspace_id}`, sourceRevision: r.source_revision,
      membershipStatus: MULTI ? 'EXACT_MULTI_MEMBER' : 'EXACT_SINGLE_MEMBER', revisionStatus: 'PROVEN', chunkOrdinal: null,
      lineageProducerRevision: PRODUCER,
      evidenceRefs: [path.relative(REPO_ROOT, OUT).split(path.sep).join('/')],
    });
  }
}
proposedMembershipRows.sort((a, b) => a.packetKey.localeCompare(b.packetKey));
const checksum = crypto.createHash('sha256').update(JSON.stringify(proposedMembershipRows)).digest('hex');
const report = {
  schema: 'atlas.pkt-lineage-current-single-chunk-frozen-proposal.v1', task: 'PKT-LINEAGE-CURRENT-SINGLE-CHUNK-01',
  generatedAt: new Date().toISOString(), mode: 'READ_ONLY_PROPOSAL_FREEZE', writesPerformed: false,
  workspaceRevision: WR, candidateRows: rows.length, candidatePackets: byPacket.size, skipped, proposedMembershipRowCount: proposedMembershipRows.length,
  proposedMembershipSetChecksum: `sha256:${checksum}`, proposedMembershipRows,
};
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ out: path.relative(REPO_ROOT, OUT), candidateRows: rows.length, candidatePackets: byPacket.size, skipped, proposed: proposedMembershipRows.length, checksum: report.proposedMembershipSetChecksum }, null, 2));
