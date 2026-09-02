#!/usr/bin/env node

/** Read-only preflight for the future packet↔chunk lineage capture canary. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = process.cwd();
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Math.max(1, Math.min(Number.parseInt(limitArg?.split('=')[1] ?? '10', 10) || 10, 100));
const reportPath = path.resolve(root, 'docs/reports/packet-chunk-lineage-promotion-preflight-v1.json');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1, statement_timeout: 30000 });

function packetKey(sourceRef) {
  return `packet:${crypto.createHash('sha256').update(sourceRef).digest('hex').slice(0, 12)}`;
}

let candidates = [];
let databaseError = null;
try {
  const { rows } = await pool.query(`
    SELECT
      cci.relative_path AS source_ref,
      cci.chunk_id AS canonical_chunk_id,
      MIN(cci.id::text) AS chunk_row_id,
      gf.workspace_id::text AS workspace_id,
      NULLIF(BTRIM(gf.code_source_revision::text), '') AS source_revision
    FROM codebase_chunk_index cci
    LEFT JOIN LATERAL (
      SELECT workspace_id, code_source_revision
      FROM graphify_files
      WHERE source_ref = cci.relative_path
      ORDER BY workspace_revision DESC NULLS LAST, code_source_revision DESC NULLS LAST
      LIMIT 1
    ) gf ON TRUE
    WHERE NULLIF(BTRIM(cci.relative_path), '') IS NOT NULL
      AND cci.relative_path NOT IN (SELECT source_ref FROM atlas_packets WHERE source_ref IS NOT NULL)
      AND NULLIF(BTRIM(cci.chunk_id::text), '') IS NOT NULL
    GROUP BY cci.relative_path, cci.chunk_id, gf.workspace_id, gf.code_source_revision
    ORDER BY cci.relative_path, cci.chunk_id
    LIMIT $1
  `, [limit * 20]);

  const bySource = new Map();
  for (const row of rows) {
    const list = bySource.get(row.source_ref) ?? [];
    list.push(row);
    bySource.set(row.source_ref, list);
  }
  candidates = [...bySource.entries()].slice(0, limit).map(([sourceRef, rowsForSource]) => {
    const namespaces = [...new Set(rowsForSource.map((row) => row.workspace_id).filter(Boolean))];
    const revisions = [...new Set(rowsForSource.map((row) => row.source_revision).filter(Boolean))];
    const qualified = namespaces.length === 1 && revisions.length === 1 && rowsForSource.length > 0;
    const memberships = rowsForSource.map((row) => ({
      canonicalChunkId: row.canonical_chunk_id,
      chunkRowId: row.chunk_row_id,
    }));
    const membershipChecksum = crypto.createHash('sha256').update(JSON.stringify(memberships)).digest('hex');
    return {
      packetKey: packetKey(sourceRef),
      sourceRef,
      namespace: qualified ? `workspace:${namespaces[0]}` : null,
      sourceRevision: qualified ? revisions[0] : null,
      membershipCount: memberships.length,
      membershipChecksum: `sha256:${membershipChecksum}`,
      memberships,
      classification: qualified ? 'READY_FOR_AUTHORIZATION' : 'BLOCKED_LINEAGE_AUTHORITY',
      blockedReasons: [
        ...(namespaces.length !== 1 ? ['SOURCE_NAMESPACE_UNPROVEN_OR_AMBIGUOUS'] : []),
        ...(revisions.length !== 1 ? ['SOURCE_REVISION_UNPROVEN_OR_AMBIGUOUS'] : []),
      ],
    };
  });
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const eligible = candidates.filter((candidate) => candidate.classification === 'READY_FOR_AUTHORIZATION');
const deterministicBody = {
  schema: 'atlas.packet-chunk-lineage-promotion-preflight.v1',
  mode: 'READ_ONLY_PROMOTION_PREFLIGHT',
  limit,
  candidates,
  eligibleCandidateCount: eligible.length,
  plannedWrites: eligible[0] ? { atlas_packets: 1, atlas_packet_chunk_lineage: eligible[0].membershipCount, qdrant: 0, graph: 0, cache: 0 } : { atlas_packets: 0, atlas_packet_chunk_lineage: 0, qdrant: 0, graph: 0, cache: 0 },
  verdict: databaseError ? 'BLOCKED_DATABASE_READ' : eligible[0] ? 'READY_FOR_AUTHORIZATION' : 'BLOCKED_NO_QUALIFIED_CANDIDATE',
};
const report = {
  ...deterministicBody,
  generatedAt: new Date().toISOString(),
  databaseError,
  writesPerformed: false,
  canonicalAuthority: false,
  promotionAuthorized: false,
  rollback: 'Transaction rollback before commit; no transaction was opened by this preflight.',
  preflightChecksum: `sha256:${crypto.createHash('sha256').update(JSON.stringify(deterministicBody)).digest('hex')}`,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, verdict: report.verdict, eligibleCandidateCount: report.eligibleCandidateCount, writesPerformed: false }, null, 2));

