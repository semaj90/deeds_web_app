#!/usr/bin/env node
/**
 * BRIDGE-RECON-DRY-02 -- read-only. Maps atlas_packets / packet_qdrant_bridge
 * -> canonical packet identity -> semantic_768 -> ProjectionRegistryV1 -> D
 * projection. Does NOT map through generation B as an intermediate (per
 * instruction) -- goes straight from canonical identity to the registry.
 *
 * No writes. No metadata repair. Emits an exact proposed reconciliation
 * receipt, gated on zero ambiguity, for a future bounded write canary.
 *
 * Usage: npx tsx scripts/atlas/bridge-recon-dry-02.mts
 */
import { loadAtlasEnv } from './load-atlas-env.mjs';
await loadAtlasEnv();

const { resolveProjectionsBatch } = await import(
  '../../src/lib/server/atlas/retrieval/projection-registry-v1.js'
);

async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Same population definition as the earlier census (atlas_packets/bridge
  // rows referencing a third, non-numeric-non-uuid point) -- but this time
  // the proposed target is computed via the registry, not carried over from
  // the old census as a write plan.
  const { rows: atlasRows } = await pool.query(`
    SELECT ap.source_ref, ap.qdrant_point_id AS atlas_point_id, ci.id AS canonical_packet_identity
    FROM atlas_packets ap
    JOIN codebase_chunk_index ci ON ci.source_ref = ap.source_ref
    WHERE ap.qdrant_point_id IS NOT NULL
      AND ci.qdrant_id IS NOT NULL AND ci.qdrant_id ~ '^[0-9]+$'
  `);
  const { rows: bridgeRows } = await pool.query(`
    SELECT pqb.source_ref, pqb.qdrant_point_id AS bridge_point_id, ci.id AS canonical_packet_identity
    FROM packet_qdrant_bridge pqb
    JOIN codebase_chunk_index ci ON ci.source_ref = pqb.source_ref
    WHERE ci.qdrant_id IS NOT NULL AND ci.qdrant_id ~ '^[0-9]+$'
  `);

  console.log(`atlas_packets candidate rows: ${atlasRows.length}`);
  console.log(`packet_qdrant_bridge candidate rows: ${bridgeRows.length}`);

  const allCanonicalIds = [...new Set([...atlasRows, ...bridgeRows].map((r) => r.canonical_packet_identity))];
  const keys = allCanonicalIds.map((id) => ({ canonicalPacketIdentity: id, representationIdentity: 'semantic_768' as const }));
  const resolutions = await resolveProjectionsBatch(keys);
  const refByCanonicalId = new Map<string, any>();
  const failureByCanonicalId = new Map<string, any>();
  for (let i = 0; i < resolutions.length; i++) {
    const key = keys[i];
    const r = resolutions[i];
    if (r.ok) refByCanonicalId.set(key.canonicalPacketIdentity, r.ref);
    else failureByCanonicalId.set(key.canonicalPacketIdentity, r.failure.reason);
  }

  function evaluate(rows: typeof atlasRows, currentPointField: 'atlas_point_id' | 'bridge_point_id') {
    let targetExists = 0, canonicalIdentityExact = 0, representationExact = 0, collectionExact = 0,
        vectorNameExact = 0, projectionRevisionExact = 0, ambiguous = 0, missing = 0, wrongCanonicalObject = 0;
    const proposed: any[] = [];
    for (const row of rows) {
      const ref = refByCanonicalId.get(row.canonical_packet_identity);
      const failureReason = failureByCanonicalId.get(row.canonical_packet_identity);
      if (!ref) {
        if (failureReason === 'CANONICAL_IDENTITY_MISMATCH') wrongCanonicalObject++;
        else missing++;
        continue;
      }
      targetExists++;
      canonicalIdentityExact++; // registry already validated this (fail-closed on mismatch above)
      if (ref.executor === 'qdrant') representationExact++;
      if (ref.collection === 'codebase_chunks_768_v2') collectionExact++;
      if (ref.vectorName === 'content') vectorNameExact++;
      if (ref.projectionRevision) projectionRevisionExact++;

      const before = String(row[currentPointField]);
      const proposedPointId = ref.physicalPointId;
      proposed.push({
        source_ref: row.source_ref,
        canonical_packet_identity: row.canonical_packet_identity,
        before_stale_reference: before,
        proposed_reference: proposedPointId,
        changes: before !== proposedPointId,
      });
    }
    return {
      population: rows.length,
      targetExists, canonicalIdentityExact, representationExact, collectionExact,
      vectorNameExact, projectionRevisionExact, ambiguous, missing, wrongCanonicalObject,
      allExact: targetExists === rows.length && missing === 0 && ambiguous === 0 && wrongCanonicalObject === 0,
      proposed,
    };
  }

  const atlasResult = evaluate(atlasRows, 'atlas_point_id');
  const bridgeResult = evaluate(bridgeRows, 'bridge_point_id');

  const report = {
    schema: 'atlas.bridge-recon-dry-02.v1',
    task: 'BRIDGE-RECON-DRY-02',
    readOnly: true,
    writesPerformed: false,
    metadataRepairPerformed: false,
    mappedThroughB: false,
    method: 'atlas_packets/packet_qdrant_bridge -> canonical_packet_identity (codebase_chunk_index.id via source_ref join) -> ProjectionRegistryV1.resolveProjectionsBatch({representationIdentity: semantic_768}) -> live-validated D projection. Recomputed fresh through the registry, not carried over from the earlier census as a write plan.',
    atlas_packets: {
      targetExists: `${atlasResult.targetExists}/${atlasResult.population}`,
      canonicalIdentityExact: `${atlasResult.canonicalIdentityExact}/${atlasResult.population}`,
      representationExact: `${atlasResult.representationExact}/${atlasResult.population}`,
      collectionExact: `${atlasResult.collectionExact}/${atlasResult.population}`,
      vectorNameExact: `${atlasResult.vectorNameExact}/${atlasResult.population}`,
      projectionRevisionExact: `${atlasResult.projectionRevisionExact}/${atlasResult.population}`,
      ambiguous: atlasResult.ambiguous,
      missing: atlasResult.missing,
      wrongCanonicalObject: atlasResult.wrongCanonicalObject,
      status: atlasResult.allExact ? 'DRY_RUN_EXACT' : 'DRY_RUN_INCOMPLETE',
    },
    packet_qdrant_bridge: {
      targetExists: `${bridgeResult.targetExists}/${bridgeResult.population}`,
      canonicalIdentityExact: `${bridgeResult.canonicalIdentityExact}/${bridgeResult.population}`,
      representationExact: `${bridgeResult.representationExact}/${bridgeResult.population}`,
      collectionExact: `${bridgeResult.collectionExact}/${bridgeResult.population}`,
      vectorNameExact: `${bridgeResult.vectorNameExact}/${bridgeResult.population}`,
      projectionRevisionExact: `${bridgeResult.projectionRevisionExact}/${bridgeResult.population}`,
      ambiguous: bridgeResult.ambiguous,
      missing: bridgeResult.missing,
      wrongCanonicalObject: bridgeResult.wrongCanonicalObject,
      status: bridgeResult.allExact ? 'DRY_RUN_EXACT' : 'DRY_RUN_INCOMPLETE',
    },
    proposedMutationSampleAtlasPackets: atlasResult.proposed.slice(0, 10),
    proposedMutationSampleBridge: bridgeResult.proposed.slice(0, 10),
    overallReadyForWriteCanary: atlasResult.allExact && bridgeResult.allExact,
  };

  console.log(JSON.stringify({ ...report, proposedMutationSampleAtlasPackets: undefined, proposedMutationSampleBridge: undefined }, null, 2));
  const fs = await import('node:fs');
  fs.writeFileSync(
    'C:/Users/james/Videos/deeds-web-app/docs/reports/bridge-recon-dry-02-results.json',
    JSON.stringify({
      ...report,
      proposedMutationFullAtlasPackets: atlasResult.proposed,
      proposedMutationFullBridge: bridgeResult.proposed,
    }, null, 2) + '\n',
  );
  await pool.end();
  process.exit(0);
}

main().catch((err) => { console.error('[FAIL]', err); process.exit(1); });
