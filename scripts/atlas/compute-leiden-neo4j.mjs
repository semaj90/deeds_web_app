#!/usr/bin/env node
/**
 * Phase 8: Compute Leiden community detection via Neo4j GDS
 *
 * Runs Leiden community detection on the codebase graph and records the
 * results in a separate Leiden-specific Postgres table and Redis cache.
 * This keeps the Leiden lane distinct from the existing Louvain lane.
 *
 * GR5 gap-filling (2026-09-09, `reports/parent-atlas-open-lanes-todo.md` GR5 / Thread D):
 *   - `cohesion_score` is now a real intra-community edge-density metric (internal edges /
 *     (internal + boundary edges) over `SIMILAR_TOPOLOGY`), not the prior hardcoded `0`.
 *   - `embedding` is now the mean-pool centroid of member packets' `content_embedding` (768d,
 *     read from `codebase_chunk_index` by `source_ref`), not always `NULL` -- same elementwise
 *     centroid idiom already used in `summarize-rank-embed-centroids.mjs`, not a new mechanism.
 *   - Leiden community membership is now mirrored into Qdrant `codebase_chunks_768` payloads
 *     (`leiden_community_id`), following the exact scroll+patch pattern
 *     `writeAuthorityScoresToQdrant()` (`src/lib/server/graph/neo4j-gds.ts`) already uses for
 *     PageRank/Louvain authority scores -- so Leiden membership is now visible to retrieval, not
 *     only to the standalone `community_reports_leiden` Postgres table.
 *
 * NOT done here (recorded, not silently glossed over, per the Duplication Prevention rule):
 * this script's `packetGraph_leiden` GDS projection remains a 3rd, separate projection alongside
 * `codeTopology` and `retrievalAnalysis` (`neo4j-gds.ts`), which duplicate Louvain between them.
 * No projection consolidation is attempted in this pass -- see
 * `openspec/changes/parent-atlas-retrieval-fusion-reachability/`-adjacent governance
 * ("One Canonical Runtime Owner Per Capability") for why that needs its own explicit decision,
 * not a drive-by merge inside a cohesion-score fix.
 *
 * Usage:
 *   node scripts/atlas/compute-leiden-neo4j.mjs --dry-run
 *   node scripts/atlas/compute-leiden-neo4j.mjs --apply
 */

import neo4j from 'neo4j-driver';
import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import crypto from 'node:crypto';
import fetch from 'node-fetch';
import { resolveAtlasRedisContext, runRedisCli } from './lib/redis-valkey.mjs';

config({ path: resolve('.', '.env') });

// Matches the established repo convention for writing pgvector columns from Node
// (see scripts/atlas/backfill-graphify-rff-embeddings-768.mjs) -- no ORM, plain
// bracketed float-list literal cast with ::vector(N) at the call site.
function vectorLiteral(vector) { return `[${vector.join(',')}]`; }

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';

const driver = neo4j.default.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.default.auth.basic('neo4j', process.env.NEO4J_PASSWORD || 'password')
);

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const GRAPH_NAME = 'packetGraph_leiden';
const REDIS_KEY = 'bitfrost:leiden:community-stats:v1';
const PG_TABLE = 'community_reports_leiden';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Phase 8: Compute Leiden Communities (Neo4j GDS)              ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(56)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function ensureTable() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ${PG_TABLE} (
      community_id   INT       PRIMARY KEY,
      member_paths   TEXT[]    NOT NULL DEFAULT '{}',
      member_count   INT       NOT NULL DEFAULT 0,
      summary        TEXT      NOT NULL DEFAULT '',
      purpose        TEXT      NOT NULL DEFAULT '',
      tags           TEXT[]    NOT NULL DEFAULT '{}',
      cohesion_score REAL      NOT NULL DEFAULT 0,
      embedding      vector(768),
      built_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      algorithm      TEXT      NOT NULL DEFAULT 'leiden'
    )
  `);
  // LEIDEN-STALE-ROW-LIFECYCLE-01 (2026-09-09): a later Leiden run over a changed graph can stop
  // emitting a community_id a prior run wrote -- the original ON CONFLICT upsert only ever
  // touches community_ids present in the CURRENT run, so that row stays in the table forever,
  // indistinguishable from a live one. Added via ALTER so this also heals a table created by an
  // older version of this script (idempotent, matches this file's existing self-migration
  // pattern for ensureTable()).
  await pgPool.query(`ALTER TABLE ${PG_TABLE} ADD COLUMN IF NOT EXISTS run_id TEXT`);
  await pgPool.query(`ALTER TABLE ${PG_TABLE} ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true`);
  await pgPool.query(`ALTER TABLE ${PG_TABLE} ADD COLUMN IF NOT EXISTS tombstoned_at TIMESTAMPTZ`);
  await pgPool.query(`CREATE INDEX IF NOT EXISTS ${PG_TABLE}_active_idx ON ${PG_TABLE} (active)`);
}

/**
 * LEIDEN-STALE-ROW-LIFECYCLE-01: after every row this run touched has been upserted with the
 * current run_id and active=true, mark any row that still carries an OLDER run_id (i.e. a
 * community_id this run did not re-detect) as active=false/tombstoned_at=NOW(). Idempotent: a row
 * already tombstoned in a prior run is left with its original tombstoned_at, not refreshed, since
 * `AND active = true` only matches rows not yet tombstoned.
 */
async function tombstoneStaleRows(runId) {
  const result = await pgPool.query(
    `UPDATE ${PG_TABLE} SET active = false, tombstoned_at = NOW() WHERE run_id IS DISTINCT FROM $1 AND active = true`,
    [runId],
  );
  return result.rowCount;
}

/**
 * Real per-community cohesion metric: intra-community edge density.
 *   cohesion(c) = internalEdges(c) / (internalEdges(c) + boundaryEdges(c))
 * where internalEdges(c) counts SIMILAR_TOPOLOGY edges with BOTH endpoints in community c,
 * and boundaryEdges(c) counts edges with exactly ONE endpoint in c. A community with no edges
 * at all (isolated singleton) gets cohesion 0 -- there is no "enclosed" structure to score.
 * Replaces the prior hardcoded `cohesionScore = 0`.
 */
async function computeCohesionScores(session) {
  const res = await session.run(`
    MATCH (n:Packet)-[:SIMILAR_TOPOLOGY]-(m:Packet)
    WHERE n.leiden_community_id IS NOT NULL AND m.leiden_community_id IS NOT NULL AND id(n) < id(m)
    RETURN n.leiden_community_id AS commA, m.leiden_community_id AS commB, count(*) AS edgeCount
  `);

  const internal = {};
  const boundary = {};
  for (const record of res.records) {
    const { commA, commB, edgeCount } = record.toObject();
    const a = commA.toNumber ? commA.toNumber() : parseInt(commA);
    const b = commB.toNumber ? commB.toNumber() : parseInt(commB);
    const count = edgeCount.toNumber ? edgeCount.toNumber() : parseInt(edgeCount);
    if (a === b) {
      internal[a] = (internal[a] || 0) + count;
    } else {
      boundary[a] = (boundary[a] || 0) + count;
      boundary[b] = (boundary[b] || 0) + count;
    }
  }

  const cohesion = {};
  const allCommunityIds = new Set([...Object.keys(internal), ...Object.keys(boundary)].map(Number));
  for (const commId of allCommunityIds) {
    const internalCount = internal[commId] || 0;
    const boundaryCount = boundary[commId] || 0;
    const total = internalCount + boundaryCount;
    cohesion[commId] = total > 0 ? internalCount / total : 0;
  }
  return cohesion;
}

/**
 * Mean-pool centroid of member packets' content_embedding (768d), one per community. Reuses the
 * same elementwise-average idiom already used in summarize-rank-embed-centroids.mjs -- no new
 * mechanism, just a new target (Leiden communities instead of directories). Communities with zero
 * embeddable members return no entry (embedding stays NULL, not a zero vector -- a zero vector
 * would falsely imply "no direction" rather than "no data").
 *
 * Batches ONE bulk query per BATCH_SIZE source_refs across ALL communities combined, rather than
 * one query per community -- with graphs producing tens of thousands of (often singleton) Leiden
 * communities, a per-community query would mean tens of thousands of sequential Postgres round
 * trips. Grouping is done in-memory via a path->communityId reverse map after the bulk fetch.
 */
async function computeCommunityCentroids(pgPool, communityMembers) {
  const BATCH_SIZE = 5000;
  const pathToCommId = {};
  const allBareRefs = [];
  for (const [commIdStr, memberPathsWithPrefix] of Object.entries(communityMembers)) {
    const commId = Number(commIdStr);
    // communityMembers stores 'sveltekit-frontend/<path>' for the Postgres member_paths display
    // column; codebase_chunk_index.source_ref is the bare path without that prefix.
    for (const prefixed of memberPathsWithPrefix) {
      const bareRef = prefixed.replace(/^sveltekit-frontend\//, '');
      pathToCommId[bareRef] = commId;
      allBareRefs.push(bareRef);
    }
  }

  const sums = {}; // commId -> { vector: number[768], count: number }
  for (let i = 0; i < allBareRefs.length; i += BATCH_SIZE) {
    const batch = allBareRefs.slice(i, i + BATCH_SIZE);
    let rows;
    try {
      const result = await pgPool.query(
        `SELECT source_ref, content_embedding::text AS emb_text FROM codebase_chunk_index WHERE source_ref = ANY($1) AND content_embedding IS NOT NULL`,
        [batch],
      );
      rows = result.rows;
    } catch (e) {
      console.warn(`   ⚠️  Embedding batch lookup failed (${e.message}), skipping this batch`);
      continue;
    }

    for (const row of rows) {
      const commId = pathToCommId[row.source_ref];
      if (commId === undefined) continue;
      let emb;
      try {
        emb = JSON.parse(row.emb_text);
      } catch {
        continue;
      }
      if (!Array.isArray(emb) || emb.length !== 768) continue;
      if (!sums[commId]) sums[commId] = { vector: new Array(768).fill(0), count: 0 };
      const entry = sums[commId];
      for (let d = 0; d < 768; d++) entry.vector[d] += emb[d];
      entry.count++;
    }
  }

  const centroids = {};
  for (const [commIdStr, { vector, count }] of Object.entries(sums)) {
    if (count === 0) continue;
    for (let d = 0; d < 768; d++) vector[d] /= count;
    centroids[Number(commIdStr)] = vector;
  }
  return centroids;
}

/**
 * Mirrors leiden_community_id into Qdrant codebase_chunks_768 payloads.
 *
 * LEIDEN-QDRANT-IDENTITY-JOIN-01 (2026-09-09): the original version of this function joined on
 * bare file `path` alone (`path`/`relative_path`/`file_path`/`source_ref`/`sourceRef`), modeled on
 * writeAuthorityScoresToQdrant()'s (src/lib/server/graph/neo4j-gds.ts) scroll+patch pattern. A
 * live read-only census run AFTER that version had already applied (79,768/109,774 Qdrant points
 * patched) found this was WRONG, not just imprecise: 96.2% of paths (3,129/3,254) mapped to more
 * than one Leiden community (avg 18.2, max 505 communities per path). Root cause, verified live in
 * Neo4j: Leiden clusters at SYMBOL granularity, not FILE granularity -- a single file can back
 * hundreds of separate `:Packet` nodes (one per type/const/function/table-def/etc.), each with its
 * OWN independent `leiden_community_id`. Path-only matching therefore picked one arbitrary
 * symbol's community (whichever the JS build loop wrote last for that path) and stamped it onto
 * EVERY Qdrant chunk for that file -- wrong for ~239/240 chunks on a typical multi-symbol file.
 *
 * **Prevention note for future syncs of this shape**: when mirroring a graph-computed property
 * from Neo4j into a chunk-level store like Qdrant, verify the two sides' identity GRANULARITY
 * matches before assuming a shared field (like `path`) is a safe join key -- do not assume a
 * cardinality of 1:1 just because a field exists on both sides with the same name. A cheap way to
 * check up front: `MATCH (n:Label) WITH n.<candidateKey> AS k, count(*) AS n RETURN max(n)` -- if
 * that returns > 1, the candidate key is not a valid identity for a per-node property.
 *
 * **The fix**: join on the composite `(path, symbol)` instead. Verified collision-free live
 * (0/7,477 (path, symbol) pairs collide across the whole graph, vs 96.2% for path alone). Real
 * trade-off, not free: only 13,424/109,776 (12.2%) of Qdrant points carry a populated `symbol`
 * payload field (most chunks are coarser than symbol-level, e.g. whole-file or paragraph chunks),
 * so this join necessarily covers far fewer points than the flawed path-only version did. That is
 * the correct outcome -- correctness over coverage. Points with no `symbol` field are left
 * unmirrored (no leiden_community_id at all) rather than guessed. This is still explicitly a
 * coverage-limited stopgap, not the "sealed" final identity join this repo's governance calls
 * for (a real shared packet_key/chunk_id/symbol_version_id would give both correctness AND full
 * coverage) -- flagged as follow-up work, not solved here.
 *
 * **Cleanup of the prior wrong run**: this function now ALSO clears `leiden_community_id` from any
 * point that currently has it set but does not resolve under the new (path, symbol) join --
 * otherwise the 79,768 wrongly-patched points from the flawed run would remain silently wrong
 * forever. Every scanned point is therefore either set to its correct value, left untouched (never
 * had the field, still doesn't match), or explicitly cleared (had it, doesn't match the correct
 * join) -- never left with a stale incorrect value.
 */
async function syncLeidenToQdrant(pathSymbolToCommunity) {
  let mirrored = 0;
  let cleared = 0;
  let errors = 0;
  let offset = null;
  const BATCH = 100;

  function resolveCommunityId(payload) {
    const symbol = payload?.symbol;
    if (!symbol) return undefined;
    for (const pathField of ['path', 'relative_path', 'file_path']) {
      const raw = payload?.[pathField];
      if (!raw) continue;
      const bare = String(raw).replace(/^sveltekit-frontend\//, '');
      const key = `${bare}::${symbol}`;
      if (key in pathSymbolToCommunity) return pathSymbolToCommunity[key];
    }
    return undefined;
  }

  while (true) {
    const scrollBody = JSON.stringify({
      limit: BATCH,
      with_payload: ['path', 'relative_path', 'file_path', 'symbol', 'leiden_community_id'],
      with_vector: false,
      ...(offset ? { offset } : {}),
    });

    const scrollRes = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: scrollBody,
    }).catch(() => null);
    if (!scrollRes?.ok) break;

    const data = await scrollRes.json();
    const pts = data.result?.points ?? [];
    if (pts.length === 0) break;

    for (const pt of pts) {
      const communityId = resolveCommunityId(pt.payload);
      const hadStaleValue = pt.payload?.leiden_community_id !== undefined && pt.payload?.leiden_community_id !== null;

      if (communityId !== undefined) {
        const patchRes = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/payload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payload: { leiden_community_id: communityId },
            points: [pt.id],
          }),
        }).catch(() => null);
        if (patchRes?.ok) mirrored++; else errors++;
      } else if (hadStaleValue) {
        // Had a value from the flawed path-only run but doesn't resolve under the correct
        // (path, symbol) join -- clear it rather than leave a known-wrong value in place.
        const deleteRes = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/payload/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keys: ['leiden_community_id'],
            points: [pt.id],
          }),
        }).catch(() => null);
        if (deleteRes?.ok) cleared++; else errors++;
      }
    }

    offset = data.result?.next_page_offset ?? null;
    if (!offset) break;
  }

  return { mirrored, cleared, errors };
}

async function ensureProjectionDropped(session) {
  try {
    await session.run(`CALL gds.graph.drop('${GRAPH_NAME}')`);
  } catch {
    // Projection doesn't exist or GDS already cleaned it up.
  }
}

async function computeLeiden() {
  const session = driver.session();
  const redisCtx = await resolveAtlasRedisContext(resolve('.'), process.env);

  try {
    if (!DRY_RUN) {
      await ensureTable();
    }

    console.log('📊 Step 1: Drop existing projection (if any) and create GDS projection\n');
    await ensureProjectionDropped(session);

    const projRes = await session.run(`
      CALL gds.graph.project(
        '${GRAPH_NAME}',
        'Packet',
        {
          SIMILAR_TOPOLOGY: { orientation: 'UNDIRECTED' }
        }
      )
      YIELD nodeCount, relationshipCount
      RETURN nodeCount, relationshipCount
    `);

    if (projRes.records.length === 0) {
      throw new Error('Graph projection failed');
    }

    const proj = projRes.records[0].toObject();
    const nodeCount = proj.nodeCount.toNumber ? proj.nodeCount.toNumber() : proj.nodeCount;
    const relCount = proj.relationshipCount.toNumber ? proj.relationshipCount.toNumber() : proj.relationshipCount;
    console.log(`   Projected graph: ${nodeCount} nodes, ${relCount} relationships\n`);

    console.log('🔄 Step 2: Run Leiden community detection\n');

    let leidenRes;
    let stats;

    if (DRY_RUN) {
      leidenRes = await session.run(`
        CALL gds.leiden.stream('${GRAPH_NAME}', {
          randomSeed: 42
        })
        YIELD nodeId, communityId
        RETURN nodeId, communityId
      `);
    } else {
      leidenRes = await session.run(`
        CALL gds.leiden.write('${GRAPH_NAME}', {
          writeProperty: 'leiden_community_id',
          randomSeed: 42
        })
        YIELD nodePropertiesWritten, communityCount
        RETURN nodePropertiesWritten, communityCount
      `);

      if (leidenRes.records.length === 0) {
        throw new Error('Leiden computation failed');
      }

      stats = leidenRes.records[0].toObject();
      const nodesWritten = stats.nodePropertiesWritten.toNumber ? stats.nodePropertiesWritten.toNumber() : stats.nodePropertiesWritten;
      const commCount = stats.communityCount.toNumber ? stats.communityCount.toNumber() : stats.communityCount;
      console.log(`   ✅ Wrote leiden_community_id to ${nodesWritten} Neo4j nodes`);
      console.log(`   ✅ Detected ${commCount} Leiden communities\n`);
    }

    if (DRY_RUN) {
      const streamRows = leidenRes.records;
      const recordCount = streamRows.length;
      const communityStats = {};
      for (const record of streamRows) {
        const { communityId } = record.toObject();
        const idNum = communityId.toNumber ? communityId.toNumber() : parseInt(communityId);
        communityStats[idNum] = (communityStats[idNum] || 0) + 1;
      }
      console.log(`   DRY-RUN: Would assign ${recordCount} nodes to ${Object.keys(communityStats).length} Leiden communities`);
      if (recordCount > 0) {
        const samples = streamRows.slice(0, 3).map((r) => {
          const obj = r.toObject();
          const nodeId = obj.nodeId.toNumber ? obj.nodeId.toNumber() : parseInt(obj.nodeId);
          const commId = obj.communityId.toNumber ? obj.communityId.toNumber() : parseInt(obj.communityId);
          return `node ${nodeId}: Leiden community ${commId}`;
        });
        console.log(`   Sample mappings:\n      ${samples.join('\n      ')}\n`);
      }
      console.log(`   DRY-RUN: Skipping Postgres writes\n`);
      return;
    } else {
      console.log('📝 Step 3: Sync Leiden community IDs to Postgres\n');

      const allRes = await session.run(`
        MATCH (n:Packet)
        WHERE n.leiden_community_id IS NOT NULL AND n.path IS NOT NULL
        RETURN n.path as path, n.symbol as symbol, n.leiden_community_id as community_id
      `);

      const recordCount = allRes.records.length;
      console.log(`   Fetched ${recordCount} Leiden community assignments from Neo4j`);

      // Build canonical Leiden community records after the sync pass.
      const communityStats = {};
      const communityMembers = {};
      // LEIDEN-QDRANT-IDENTITY-JOIN-01: keyed by "path::symbol", NOT path alone -- Leiden clusters
      // at symbol granularity (many :Packet nodes per file), so path alone is not a valid identity
      // join key (verified live: 96.2% collision rate). See syncLeidenToQdrant()'s header comment
      // for the full finding. Nodes with no symbol are excluded from this map (and therefore from
      // the Qdrant mirror) rather than guessed.
      const pathSymbolToCommunity = {};
      for (const record of allRes.records) {
        const { path, symbol, community_id } = record.toObject();
        const idNum = community_id.toNumber ? community_id.toNumber() : parseInt(community_id);
        communityStats[idNum] = (communityStats[idNum] || 0) + 1;
        if (!communityMembers[idNum]) communityMembers[idNum] = [];
        communityMembers[idNum].push(`sveltekit-frontend/${path}`);
        if (symbol) pathSymbolToCommunity[`${path}::${symbol}`] = idNum;
      }

      console.log('📐 Step 3a: Compute per-community cohesion (intra-community edge density)\n');
      const cohesionByCommunity = await computeCohesionScores(session);

      console.log('🧬 Step 3b: Compute per-community embedding centroids from Postgres\n');
      const embeddingByCommunity = await computeCommunityCentroids(pgPool, communityMembers);

      // LEIDEN-STALE-ROW-LIFECYCLE-01: one run_id per apply invocation, stamped onto every row
      // this run touches. Used below (tombstoneStaleRows) to distinguish "still current" from
      // "a prior run wrote this, this run no longer detects it" without needing wall-clock
      // comparisons -- a row's absence from the current run_id is what makes it stale, not age.
      const runId = `leiden:${new Date().toISOString()}:${crypto.randomUUID().slice(0, 8)}`;

      const commIds = Object.keys(communityStats);
      for (const commId of commIds) {
        const communityId = Number(commId);
        const memberPaths = communityMembers[communityId] ?? [];
        const totalMembers = communityStats[communityId];
        const cohesionScore = cohesionByCommunity[communityId] ?? 0;
        const embeddingVector = embeddingByCommunity[communityId] ?? null;
        const record = {
          community_id: communityId,
          member_paths: memberPaths,
          member_count: totalMembers,
          summary: `Leiden community ${communityId} detected across ${totalMembers} packet assignments.`,
          purpose: `Leiden community ${communityId}`,
          tags: ['leiden', 'community', 'graph'],
          cohesion_score: cohesionScore,
          embedding: embeddingVector,
          built_at: new Date().toISOString(),
          algorithm: 'leiden',
        };

        await pgPool.query(`
          INSERT INTO ${PG_TABLE}
            (community_id, member_paths, member_count, summary, purpose, tags, cohesion_score, embedding, built_at, algorithm, run_id, active, tombstoned_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector(768), $9, $10, $11, true, NULL)
          ON CONFLICT (community_id) DO UPDATE SET
            member_paths   = EXCLUDED.member_paths,
            member_count   = EXCLUDED.member_count,
            summary        = EXCLUDED.summary,
            purpose        = EXCLUDED.purpose,
            tags           = EXCLUDED.tags,
            cohesion_score = EXCLUDED.cohesion_score,
            embedding      = EXCLUDED.embedding,
            built_at       = EXCLUDED.built_at,
            algorithm      = EXCLUDED.algorithm,
            run_id         = EXCLUDED.run_id,
            active         = true,
            tombstoned_at  = NULL
        `, [
          record.community_id,
          record.member_paths,
          record.member_count,
          record.summary,
          record.purpose,
          record.tags,
          record.cohesion_score,
          record.embedding ? vectorLiteral(record.embedding) : null,
          record.built_at,
          record.algorithm,
          runId,
        ]);
      }
      console.log(`   ✅ Synced ${commIds.length} Leiden community records to Postgres`);
      const tombstonedCount = await tombstoneStaleRows(runId);
      console.log(`   🧹 Tombstoned ${tombstonedCount} stale rows from prior runs (run_id=${runId})`);
      const withEmbedding = commIds.filter((id) => embeddingByCommunity[Number(id)]).length;
      const withCohesion = commIds.filter((id) => (cohesionByCommunity[Number(id)] ?? 0) > 0).length;
      console.log(`   (${withEmbedding}/${commIds.length} with a computed embedding centroid, ${withCohesion}/${commIds.length} with cohesion_score > 0)\n`);

      console.log('🔗 Step 3c: Mirror leiden_community_id into Qdrant payloads (path+symbol join)\n');
      const qdrantSyncResult = await syncLeidenToQdrant(pathSymbolToCommunity);
      console.log(`   ✅ Mirrored leiden_community_id onto ${qdrantSyncResult.mirrored} Qdrant points (correct path+symbol match)`);
      console.log(`   🧹 Cleared leiden_community_id from ${qdrantSyncResult.cleared} points that had a stale/incorrect value from the prior path-only sync`);
      if (qdrantSyncResult.errors > 0) {
        console.warn(`   ⚠️  ${qdrantSyncResult.errors} points failed to patch/clear (non-fatal, logged only)\n`);
      } else {
        console.log('');
      }

      if (commIds.length > 0 && redisCtx.container) {
        const totalCommunities = commIds.length;
        const totalAssignments = Object.values(communityStats).reduce((sum, count) => sum + count, 0);
        const packetKey = `sha256:${crypto.createHash('sha256').update(`leiden:${totalCommunities}:${totalAssignments}`, 'utf8').digest('hex')}`;
        const packetId = crypto.randomUUID();
        const envelope = {
          packet_id: packetId,
          packet_ulid: null,
          packet_key: packetKey,
          title_id: 'graph.community.stats.leiden',
          feature_id: 'graph.community.clustering.leiden',
          source_ref: 'neo4j://packetGraph_leiden',
          directory_path: 'neo4j',
          community_id: null,
          som_row: null,
          som_col: null,
          som_cluster: null,
          kmeans_cluster_id: null,
          latent_64: null,
          manifold_4d: null,
          qdrant_point_id: null,
          neo4j_neighbors: [],
          page_rank_score: null,
          summary: `Leiden detected ${totalCommunities} communities across ${totalAssignments} packet assignments.`,
          lexical_nouns: ['leiden', 'community', 'packet', 'graph'],
          lexical_verbs: ['detect', 'cluster', 'sync'],
          lexical_adverbs_ly: ['topologically'],
          routing_hints: ['neo4j', 'bitfrost', 'community', 'graph'],
          used_concepts: ['leiden', 'community detection', 'graph topology'],
          supersedes: [],
          superseded_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          confidence: 1,
          extraction_method: 'neo4j-gds-leiden',
          provenance: {
            node_count: recordCount,
            community_count: totalCommunities,
            assignment_count: totalAssignments,
            source: 'neo4j-gds',
          },
        };

        const payload = JSON.stringify({
          envelope,
          community_stats: communityStats,
        });
        const cacheResult = runRedisCli(
          redisCtx.container,
          ['SETEX', REDIS_KEY, String(24 * 3600)],
          redisCtx.password,
          payload,
        );
        if (!cacheResult.ok) {
          console.warn(`   ⚠️  Failed to cache Leiden envelope: ${cacheResult.stderr || cacheResult.error || 'unknown error'}`);
        } else {
          console.log(`   ✅ Cached canonical Leiden envelope at ${REDIS_KEY}`);
          console.log(`   Expiry: 24 hours\n`);
        }
      }
    }

  } finally {
    try {
      await ensureProjectionDropped(session);
      console.log('\n🧹 Step 5: Clean up GDS projection');
      console.log('   ✅ GDS projection dropped\n');
    } catch (e) {
      console.error('\n⚠️  Failed to drop projection:', e.message);
    }

    try {
      await session.close();
    } catch {}

    try {
      await pgPool.end();
    } catch {}
  }
}

(async () => {
  try {
    await computeLeiden();
    console.log('✅ Phase 8 Leiden Complete\n');
    await driver.close();
  } catch (e) {
    console.error('Error:', e.message);
    await driver.close();
    process.exit(1);
  }
})();
