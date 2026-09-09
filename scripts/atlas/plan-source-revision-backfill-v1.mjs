#!/usr/bin/env node
/**
 * SOURCE-REVISION-BACKFILL-PLAN-01 (read-only)
 *
 * Produces SourceRevisionProposalV1 rows for atlas_packets.source_revision
 * (the column migrated this session, currently all NULL) by reusing
 * already-proven evidence in atlas_packet_chunk_lineage rather than
 * re-deriving anything. That table already carries 7,421 rows across 4
 * producers with revision_status='PROVEN' and real content-digest
 * source_revision values (spot-checked 2/2 against live on-disk content
 * before trusting it further -- both matched exactly).
 *
 * The one thing that table's PROVEN status does NOT independently confirm
 * is CURRENCY: the bulk of it (6,898 rows) was written 2026-09-02, a full
 * week before this workspace's current dirty state. A row being PROVEN at
 * write time doesn't mean the source file hasn't changed since. This
 * script re-verifies FRESHNESS for a bounded sample by recomputing each
 * distinct source_ref's current on-disk sha256 and comparing against the
 * stored value -- never trusting "PROVEN" as still-current without
 * checking.
 *
 * Writes ONE receipt (proposals only). Never writes atlas_packets,
 * atlas_packet_chunk_lineage, or any other table.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_PATH = path.join(ROOT, 'docs', 'reports', 'source-revision-backfill-plan-v1.json');
const SAMPLE_LIMIT = Number(process.env.SOURCE_REVISION_PLAN_LIMIT ?? 200);

function sha256File(absPath) {
  const content = fs.readFileSync(absPath);
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

async function main() {
  const env = loadRepoEnv(process.env);
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
  const client = await pool.connect();

  // One row per distinct (packet_key, source_ref) with its already-proven
  // source_revision, plus whether a live atlas_packets row exists for that
  // exact packet_key (exactPacketBinding).
  const rows = await client.query(`
    SELECT DISTINCT ON (l.packet_key, l.source_ref)
      l.packet_key, l.source_ref, l.source_namespace, l.source_revision,
      l.revision_status, l.lineage_producer_revision,
      (p.packet_key IS NOT NULL) AS exact_packet_binding,
      p.source_revision AS atlas_packets_current_source_revision
    FROM atlas_packet_chunk_lineage l
    LEFT JOIN atlas_packets p ON p.packet_key = l.packet_key
    WHERE l.revision_status = 'PROVEN'
    ORDER BY l.packet_key, l.source_ref, l.created_at DESC
    LIMIT $1
  `, [SAMPLE_LIMIT]);

  client.release();
  await pool.end();

  const proposals = rows.rows.map((row) => {
    const absPath = path.join(ROOT, row.source_ref);
    let currentHash = null;
    let fileExists = true;
    try {
      currentHash = sha256File(absPath);
    } catch {
      fileExists = false;
    }

    // CORRECTED 2026-09-09 (operator review): a matching on-disk content
    // digest proves the FILE hasn't changed since the lineage table's value
    // was recorded -- it does NOT prove the packet belongs to an admitted
    // CurrentSourceAuthorityV1. That authority gate is separately sealed
    // NO_CURRENT_SOURCE_SET (CURRENT-SOURCE-OWNER-RECONCILIATION-01). The
    // two are independent booleans, not one PROVEN/SOURCE_NOT_CURRENT axis --
    // conflating them let a downstream tool see "PROVEN" and populate
    // atlas_packets.source_revision despite the upstream authority gate
    // being explicitly blocked, which is exactly what this correction closes.
    const contentMatchProven = fileExists && currentHash === row.source_revision;
    const sourceAuthorityProven = false; // CURRENT-SOURCE-OWNER-RECONCILIATION-01 sealed NO_CURRENT_SOURCE_SET this session -- no admitted source set exists to qualify against yet, for any row.

    // atlas_packets.source_revision is all NULL as of this session's migration,
    // so this will be false for every row today -- recorded honestly, not
    // assumed. If a future run finds it populated and differing, that's a
    // PACKET_NOT_CURRENT signal, not silently overwritten here.
    const packetCurrentlyMatches = row.atlas_packets_current_source_revision === row.source_revision;
    const packetNotCurrent = contentMatchProven && row.exact_packet_binding && !packetCurrentlyMatches && row.atlas_packets_current_source_revision !== null;

    let admission;
    if (!fileExists) admission = 'REVISION_UNPROVEN';
    else if (packetNotCurrent) admission = 'AMBIGUOUS';
    else if (contentMatchProven && sourceAuthorityProven) admission = 'QUALIFIED';
    else if (contentMatchProven && !sourceAuthorityProven) admission = 'CONTENT_MATCH_AUTHORITY_UNPROVEN';
    else admission = 'STALE_CONTENT';

    return {
      packetKey: row.packet_key,
      sourceRef: row.source_ref,
      workspaceRevision: null, // intentionally not filled: CURRENT-SOURCE-OWNER-RECONCILIATION-01 sealed NO_CURRENT_SOURCE_SET; no authoritative workspaceRevision to bind to yet.
      proposedSourceRevision: fileExists ? currentHash : row.source_revision,
      derivation: 'CONTENT_DIGEST',
      contentMatchProven,
      sourceAuthorityProven,
      exactSourceBinding: contentMatchProven,
      exactPacketBinding: row.exact_packet_binding,
      evidenceRefs: [
        'docs/reports/pkt-lineage-09-historical-promotion-apply-v1.json',
        `atlas_packet_chunk_lineage.source_revision (producer: ${row.lineage_producer_revision})`,
        'docs/reports/current-source-authority-v1.json (sourceAuthorityProven=false for every row until this gate seals)',
      ],
      admission,
    };
  });

  const admissionCounts = proposals.reduce((out, p) => { out[p.admission] = (out[p.admission] ?? 0) + 1; return out; }, {});
  const qualifiedCount = admissionCounts.QUALIFIED ?? 0;

  const report = {
    schema: 'atlas.source-revision-backfill-plan.v2',
    gate: 'SOURCE-REVISION-BACKFILL-PLAN-01',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    writesPerformed: false,
    canonicalAuthority: false,
    sampleLimit: SAMPLE_LIMIT,
    sourceEvidence: 'atlas_packet_chunk_lineage (revision_status=PROVEN rows only), cross-checked against atlas_packets.source_revision (all NULL as of this session\'s migration) and freshly recomputed on-disk sha256 content digests -- never trusted at face value.',
    correction_2026_09_09: 'Supersedes this receipt\'s prior v1 schema, which called 183/200 rows "PROVEN" -- that conflated two independent facts. A matching on-disk content digest (contentMatchProven) proves the FILE has not changed since the value was recorded; it does NOT prove the packet belongs to an admitted CurrentSourceAuthorityV1 (sourceAuthorityProven), which is separately sealed NO_CURRENT_SOURCE_SET. Renamed status -> admission with QUALIFIED requiring BOTH booleans true.',
    upstreamGateStatus: {
      gate: 'CURRENT-SOURCE-OWNER-RECONCILIATION-01',
      admission: 'NO_CURRENT_SOURCE_SET',
      implication: 'No authoritative source set exists to qualify ANY row against yet. sourceAuthorityProven is false for every proposal in this receipt, regardless of contentMatchProven. workspaceRevision is left null on every row rather than filled with a guessed or stale value.',
    },
    admissionCounts,
    qualifiedCount,
    proposalCount: proposals.length,
    proposals,
    acceptance: {
      derivationMethodDocumented: true,
      noSyntheticRevisions: true,
      noWorkspaceRevisionGuessed: true,
      readOnly: true,
      safeToBackfill: qualifiedCount > 0, // currently always false -- QUALIFIED requires sourceAuthorityProven, which is false for every row until CURRENT-SOURCE-OWNER-RECONCILIATION-01 (or CURRENT-WORKTREE-SNAPSHOT-AUTHORITY-01) seals a real source set
    },
    nextAction: qualifiedCount === 0
      ? 'safeToBackfill=false. Do not write ANY proposedSourceRevision value into atlas_packets.source_revision yet -- not even the content-match-proven rows -- until CURRENT-SOURCE-OWNER-RECONCILIATION-01 (or a successor like CURRENT-WORKTREE-SNAPSHOT-AUTHORITY-01) actually seals an admitted source set for sourceAuthorityProven to become true against.'
      : 'A subset of proposals are QUALIFIED (both contentMatchProven and sourceAuthorityProven true) -- only those may be considered for a bounded, revision-qualified canary write, still never a corpus backfill in one pass.',
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'SOURCE_REVISION_BACKFILL_PLAN_READ_ONLY_COMPLETE',
    proposalCount: proposals.length,
    admissionCounts,
    qualifiedCount,
    safeToBackfill: qualifiedCount > 0,
    writesPerformed: false,
    reportPath: path.relative(ROOT, REPORT_PATH).replaceAll('\\', '/'),
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'SOURCE_REVISION_BACKFILL_PLAN_FAILED', error: String(error?.stack ?? error), writesPerformed: false }, null, 2));
  process.exitCode = 1;
});
