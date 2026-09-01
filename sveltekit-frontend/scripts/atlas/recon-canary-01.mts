#!/usr/bin/env node
/**
 * RECON-CANARY-01 -- the first real write in this whole investigation chain.
 *
 * Scope, deliberately narrow:
 *   - 25 rows total (10 packet_qdrant_bridge + 15 atlas_packets), all from
 *     the DRY_RUN_EXACT population in bridge-recon-dry-02-results.json.
 *   - UPDATE exactly one column (qdrant_point_id) on exactly one row each,
 *     identified by primary key (packet_key / packet_id), never by
 *     source_ref alone.
 *   - Re-resolves live through ProjectionRegistryV1 immediately before
 *     writing (not reusing the dry-run receipt's stale values) -- the
 *     PROPOSED value written is whatever the registry says RIGHT NOW.
 *   - Wrapped in a single Postgres transaction: if ANY row's read-back
 *     verification fails, the whole transaction is rolled back -- nothing
 *     partial is left committed.
 *   - Records BEFORE for every row explicitly, sufficient for manual
 *     rollback if ever needed.
 *   - No deletes. No _768 touched. No point/payload/vector mutation in
 *     Qdrant -- Postgres only.
 *
 * Usage: npx tsx scripts/atlas/recon-canary-01.mts [--apply]
 * Default is a dry preview of exactly what would be written (no DB writes).
 * --apply performs the transactional write + read-back + rollback-on-failure.
 */
import { loadAtlasEnv } from './load-atlas-env.mjs';
await loadAtlasEnv();

const { resolveProjectionsBatch } = await import(
  '../../src/lib/server/atlas/retrieval/projection-registry-v1.js'
);

const APPLY = process.argv.includes('--apply');

async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows: bridgeCandidates } = await pool.query(`
    SELECT pqb.packet_key, pqb.source_ref, pqb.qdrant_point_id AS before_value, ci.id AS canonical_packet_identity
    FROM packet_qdrant_bridge pqb
    JOIN codebase_chunk_index ci ON ci.source_ref = pqb.source_ref
    WHERE ci.qdrant_id IS NOT NULL AND ci.qdrant_id ~ '^[0-9]+$'
    ORDER BY pqb.packet_key
    LIMIT 10
  `);
  const { rows: atlasCandidates } = await pool.query(`
    SELECT ap.packet_id, ap.source_ref, ap.qdrant_point_id AS before_value, ci.id AS canonical_packet_identity
    FROM atlas_packets ap
    JOIN codebase_chunk_index ci ON ci.source_ref = ap.source_ref
    WHERE ap.qdrant_point_id IS NOT NULL
      AND ci.qdrant_id IS NOT NULL AND ci.qdrant_id ~ '^[0-9]+$'
    ORDER BY ap.packet_id
    LIMIT 15
  `);

  const allCanonicalIds = [
    ...new Set([...bridgeCandidates, ...atlasCandidates].map((r) => r.canonical_packet_identity)),
  ];
  const keys = allCanonicalIds.map((id) => ({ canonicalPacketIdentity: id, representationIdentity: 'semantic_768' as const }));
  const resolutions = await resolveProjectionsBatch(keys);
  const refByCanonicalId = new Map<string, any>();
  for (let i = 0; i < resolutions.length; i++) {
    const r = resolutions[i];
    if (r.ok) refByCanonicalId.set(keys[i].canonicalPacketIdentity, r.ref);
  }

  const bridgePlan = bridgeCandidates.map((row) => {
    const ref = refByCanonicalId.get(row.canonical_packet_identity);
    return {
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      before: row.before_value,
      proposed: ref?.physicalPointId ?? null,
      resolvable: !!ref,
      changes: !!ref && ref.physicalPointId !== row.before_value,
    };
  });
  const atlasPlan = atlasCandidates.map((row) => {
    const ref = refByCanonicalId.get(row.canonical_packet_identity);
    return {
      packet_id: row.packet_id,
      source_ref: row.source_ref,
      before: row.before_value,
      proposed: ref?.physicalPointId ?? null,
      resolvable: !!ref,
      changes: !!ref && ref.physicalPointId !== row.before_value,
    };
  });

  const allResolvable = [...bridgePlan, ...atlasPlan].every((p) => p.resolvable);

  if (!allResolvable) {
    console.error('[RECON-CANARY-01] ABORT: not all canary rows resolved live -- refusing to write. This should not happen given DRY_RUN_EXACT, investigate before retrying.');
    console.log(JSON.stringify({ bridgePlan, atlasPlan }, null, 2));
    await pool.end();
    process.exit(1);
  }

  if (!APPLY) {
    console.log('[RECON-CANARY-01] DRY PREVIEW (no --apply, no writes)');
    console.log(JSON.stringify({ bridgePlan, atlasPlan }, null, 2));
    await pool.end();
    process.exit(0);
  }

  const client = await pool.connect();
  const writeReceipts: any[] = [];
  try {
    await client.query('BEGIN');

    for (const p of bridgePlan) {
      if (p.changes) {
        await client.query('UPDATE packet_qdrant_bridge SET qdrant_point_id = $1, updated_at = now() WHERE packet_key = $2', [p.proposed, p.packet_key]);
      }
      const { rows } = await client.query('SELECT qdrant_point_id FROM packet_qdrant_bridge WHERE packet_key = $1', [p.packet_key]);
      const readBack = rows[0]?.qdrant_point_id;
      const verified = readBack === p.proposed;
      writeReceipts.push({ table: 'packet_qdrant_bridge', key: p.packet_key, before: p.before, proposed: p.proposed, readBack, verified });
      if (!verified) throw new Error(`READBACK_MISMATCH packet_qdrant_bridge.packet_key=${p.packet_key}`);
    }

    for (const p of atlasPlan) {
      if (p.changes) {
        await client.query('UPDATE atlas_packets SET qdrant_point_id = $1, updated_at = now() WHERE packet_id = $2', [p.proposed, p.packet_id]);
      }
      const { rows } = await client.query('SELECT qdrant_point_id FROM atlas_packets WHERE packet_id = $1', [p.packet_id]);
      const readBack = rows[0]?.qdrant_point_id;
      const verified = readBack === p.proposed;
      writeReceipts.push({ table: 'atlas_packets', key: p.packet_id, before: p.before, proposed: p.proposed, readBack, verified });
      if (!verified) throw new Error(`READBACK_MISMATCH atlas_packets.packet_id=${p.packet_id}`);
    }

    const allVerified = writeReceipts.every((r) => r.verified);
    if (!allVerified) throw new Error('READBACK_VERIFICATION_FAILED');

    await client.query('COMMIT');

    const report = {
      schema: 'atlas.recon-canary-01.v1',
      task: 'RECON-CANARY-01',
      readOnly: false,
      writesPerformed: true,
      transactional: true,
      committed: true,
      deletesPerformed: false,
      qdrantTouched: false,
      collectionsQuarantined: [],
      population: writeReceipts.length,
      rowsChanged: writeReceipts.filter((r) => r.before !== r.proposed).length,
      allReadBacksVerified: allVerified,
      writeReceipts,
      rollbackNote: 'Every row above has an explicit before value. Manual rollback: UPDATE <table> SET qdrant_point_id = <before> WHERE <key column> = <key>.',
    };
    console.log(JSON.stringify(report, null, 2));
    const fs = await import('node:fs');
    fs.writeFileSync(
      'C:/Users/james/Videos/deeds-web-app/docs/reports/recon-canary-01-results.json',
      JSON.stringify(report, null, 2) + '\n',
    );
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[RECON-CANARY-01] ROLLED BACK -- no changes committed. Reason:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
  process.exit(0);
}

main().catch((err) => { console.error('[FAIL]', err); process.exit(1); });
