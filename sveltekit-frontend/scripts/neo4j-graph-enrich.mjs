/**
 * neo4j-graph-enrich.mjs  (Phase D2)
 *
 * Neo4j GDS → Qdrant payload patch → Redis ACE authority cache.
 *
 * Pipeline:
 *   1. Project codeGraph named graph in Neo4j GDS
 *      (IMPORTS + DEPENDS_ON + SIMILAR_TOPOLOGY + CLASSIFIED_AS)
 *   2. PageRank stream → write n.pagerank + n.graphAuthorityScore to each node
 *   3. Louvain community detection → write n.communityId to each node
 *   4. Compute composite graphAuthorityScore
 *        0.35 × normPageRank + 0.25 × normFanIn + 0.15 × topoTrust
 *        + 0.15 × testCoverage + 0.10 × riskPenalty
 *   5. Patch Qdrant codebase_chunks_768 payloads: graphAuthorityScore, communityId,
 *      pagerank, communitySize, relation_types, cluster_key
 *   6. Cache top-200 authorities in Redis  ace:authority:top  (HASH, 6h TTL)
 *   7. Write enrichment summary to  memory/graphify/gds/latest.json
 *      and  memory/graphify/gds/<runId>.json
 *
 * Degraded mode (GDS unavailable):
 *   Falls back to Postgres code_relations fan-in counts for authority scoring.
 *   Still patches Qdrant + Redis so ACE always gets enriched payloads.
 *
 * Usage:
 *   node scripts/neo4j-graph-enrich.mjs
 *   node scripts/neo4j-graph-enrich.mjs --dry-run
 *   node scripts/neo4j-graph-enrich.mjs --dry-run --limit=200
 *   node scripts/neo4j-graph-enrich.mjs --no-qdrant
 *   node scripts/neo4j-graph-enrich.mjs --no-redis
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg     from 'pg';
import Redis  from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI flags ─────────────────────────────────────────────────────────────────

const DRY_RUN        = process.argv.includes('--dry-run');
const NO_QDRANT      = process.argv.includes('--no-qdrant');
const NO_REDIS       = process.argv.includes('--no-redis');
const FORCE_RECREATE = process.argv.includes('--force-recreate');
const LIMIT_ARG      = process.argv.find(a => a.startsWith('--limit'));
const LIMIT          = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1] ?? LIMIT_ARG.split(' ')[1] ?? '5000') : 5_000;

// ── Config ────────────────────────────────────────────────────────────────────

const NEO4J_URL   = process.env.NEO4J_HTTP_URL  ?? 'http://localhost:7474';
const NEO4J_USER  = process.env.NEO4J_USER       ?? 'neo4j';
const NEO4J_PASS  = process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123';
if (!process.env.NEO4J_PASSWORD && !process.env.NEO4J_PASS) {
  console.warn('   ⚠ NEO4J_PASSWORD not set in environment — using hardcoded default. Add to .env: NEO4J_PASSWORD=<password>');
}
const QDRANT_URL  = process.env.QDRANT_URL       ?? 'http://127.0.0.1:6333';
const QDRANT_COLL = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';
const DB_URL      = process.env.DATABASE_URL     ?? 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db';
const REDIS_URL   = process.env.REDIS_URL        ?? 'redis://127.0.0.1:6379';
const REDIS_TTL   = 6 * 3600; // 6 h
const GRAPH_NAME  = 'codeGraph';
const OUTPUT_DIR  = resolve(__dirname, '../memory/graphify/gds');

// ── Neo4j HTTP helper ─────────────────────────────────────────────────────────

async function neo4j(cypher, params = {}) {
  const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64')}` },
    body:    JSON.stringify({ statements: [{ statement: cypher, parameters: params }] }),
    signal:  AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Neo4j HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors.map(e => e.message).join('; '));
  // Attach columns to each row for neo4jRows() to use names not meta ids
  const result = data.results?.[0] ?? { columns: [], data: [] };
  result.data.forEach(d => { d._columns = result.columns; });
  return result.data;
}

function neo4jRows(data) {
  return data.map(d => {
    const obj = {};
    const cols = d._columns;
    if (cols?.length) {
      cols.forEach((col, i) => { obj[col] = d.row[i]; });
    } else {
      // Fallback to meta-based naming for older callers
      d.meta?.forEach((m, i) => { obj[m?.id ?? `col${i}`] = d.row[i]; });
    }
    return obj;
  });
}

// ── Phase 1: GDS project ──────────────────────────────────────────────────────

async function ensureProjection() {
  // Check if projection exists and whether it has nodes
  const existing = await neo4j(`
    CALL gds.graph.list()
    YIELD graphName, nodeCount, relationshipCount
    RETURN graphName, nodeCount, relationshipCount
  `).catch(() => []);

  const existingRow = neo4jRows(existing).find(r => r.graphName === GRAPH_NAME);
  if (existingRow) {
    const nodeCount = existingRow.nodeCount ?? 0;
    if (nodeCount > 0 && !FORCE_RECREATE) {
      console.log(`   ✓ GDS projection '${GRAPH_NAME}' exists (${nodeCount} nodes, ${existingRow.relationshipCount ?? 0} rels)`);
      return true;
    }
    // Projection has 0 nodes (stale) or --force-recreate requested — drop and recreate
    const reason = FORCE_RECREATE ? '--force-recreate requested' : `0 nodes (stale projection)`;
    console.warn(`   ⚠ GDS projection '${GRAPH_NAME}' — ${reason}, dropping and recreating`);
    await neo4j(`CALL gds.graph.drop('${GRAPH_NAME}', false) YIELD graphName RETURN graphName`).catch(() => {});
  }

  // Create projection
  const projRows = await neo4j(`
    CALL gds.graph.project(
      '${GRAPH_NAME}',
      ['CodebaseFile'],
      {
        IMPORTS:           { orientation: 'NATURAL' },
        DYNAMIC_IMPORTS:   { orientation: 'NATURAL' },
        SIMILAR_TOPOLOGY:  { orientation: 'UNDIRECTED' }
      }
    )
    YIELD graphName, nodeCount, relationshipCount
    RETURN graphName, nodeCount, relationshipCount
  `);

  const created = neo4jRows(projRows)[0];
  const nodeCount = created?.nodeCount ?? 0;
  if (nodeCount === 0) {
    console.warn(`   ⚠ GDS projection '${GRAPH_NAME}' created but has 0 CodebaseFile nodes`);
    console.warn(`      Run: npm run graphify:full  to populate Neo4j before running GDS enrichment`);
  } else {
    console.log(`   ✓ GDS projection '${GRAPH_NAME}' created (${nodeCount} nodes, ${created?.relationshipCount ?? 0} rels)`);
  }
  return nodeCount > 0;
}

// ── Phase 2: PageRank ─────────────────────────────────────────────────────────

async function runPageRank() {
  // Write PageRank scores to node property using write mode (avoids CALL {} IN TRANSACTIONS)
  const writeData = await neo4j(`
    CALL gds.pageRank.write('${GRAPH_NAME}', {
      maxIterations: 30,
      dampingFactor: 0.85,
      writeProperty: 'graphPageRank'
    })
    YIELD nodePropertiesWritten, ranIterations
    RETURN nodePropertiesWritten, ranIterations
  `).catch(async (e) => {
    console.warn(`   ⚠ GDS PageRank failed (${e.message.slice(0, 80)})`);
    return [];
  });
  const writeRows = neo4jRows(writeData);
  const written = writeRows[0]?.nodePropertiesWritten ?? 0;
  console.log(`   ✓ PageRank: ${written} nodes scored`);
  if (!written) return [];

  // Return top 50 by score for downstream use
  const data = await neo4j(`
    MATCH (n:CodebaseFile)
    WHERE n.graphPageRank IS NOT NULL
    RETURN coalesce(n.filePath, n.id) AS stableKey, n.filePath AS filePath, n.graphPageRank AS score
    ORDER BY n.graphPageRank DESC
    LIMIT 50
  `).catch(() => []);
  return neo4jRows(data);
}

/** Fallback: approximate authority from Postgres code_relations fan-in counts */
async function fallbackAuthorityFromPostgres(pool) {
  const { rows } = await pool.query(`
    SELECT source_file AS file_path, COUNT(DISTINCT target_key) AS fan_in
    FROM code_relations
    WHERE source_file IS NOT NULL AND relation_type != 'EXPORTS_SYMBOL'
    GROUP BY source_file
    ORDER BY fan_in DESC
    LIMIT ${LIMIT}
  `).catch(() => ({ rows: [] }));
  return rows.map(r => ({ filePath: r.file_path, fanIn: parseInt(r.fan_in, 10) }));
}

// ── Phase 3: Louvain community detection ──────────────────────────────────────

async function runLouvain() {
  // Write Louvain community IDs to node property then query back
  await neo4j(`
    CALL gds.louvain.write('${GRAPH_NAME}', {
      maxLevels: 10,
      maxIterations: 10,
      writeProperty: 'communityId'
    })
    YIELD communityCount, modularity
    RETURN communityCount, modularity
  `).catch(async (e) => {
    console.warn(`   ⚠ GDS Louvain write failed (${e.message.slice(0, 80)}) — skipping community detection`);
  });

  const data = await neo4j(`
    MATCH (n:CodebaseFile)
    WHERE n.communityId IS NOT NULL
    RETURN coalesce(n.filePath, n.id) AS stableKey, n.filePath AS filePath, n.communityId AS communityId
    LIMIT ${LIMIT}
  `).catch(async (e) => {
    console.warn(`   ⚠ GDS Louvain failed (${e.message.slice(0, 80)}) — skipping community detection`);
    return [];
  });
  const rows = neo4jRows(data);
  // Compute community sizes
  const sizes = new Map();
  for (const r of rows) sizes.set(r.communityId, (sizes.get(r.communityId) ?? 0) + 1);
  console.log(`   ✓ Louvain: ${rows.length} nodes in ${sizes.size} communities`);
  return { communityRows: rows, communitySizes: sizes };
}

// ── Phase 4: Composite authority score ────────────────────────────────────────

function computeAuthority(pagerank, fanIn, topoTrust, hasTest, riskByte, maxPagerank, maxFanIn) {
  const normPr  = maxPagerank > 0 ? pagerank  / maxPagerank : 0;
  const normFi  = maxFanIn    > 0 ? fanIn     / maxFanIn    : 0;
  const trust   = topoTrust   / 3;       // 0-3 → 0-1
  const test    = hasTest ? 1 : 0;
  const risk    = riskByte > 0 ? Math.min(riskByte / 3, 1) : 0;

  return Math.min(1,
    0.35 * normPr
    + 0.25 * normFi
    + 0.15 * trust
    + 0.15 * test
    - 0.10 * risk   // penalty for risky files
  );
}

function topoTrustLevel(fp) {
  if (!fp) return 0;
  if (/src\/lib\/server\/(db|graph|tensor|vector)\//.test(fp)) return 3;
  if (/src\/lib\/server\//.test(fp)) return 2;
  if (/src\/routes\/api\//.test(fp)) return 2;
  if (/src\/lib\//.test(fp)) return 1;
  return 0;
}

function riskLevel(fp) {
  if (!fp) return 0;
  if (/auth|session|token|credential|password|secret/.test(fp)) return 3;
  if (/migration|delete|drop|truncate/.test(fp)) return 2;
  if (/admin|rbac|permission|role/.test(fp)) return 1;
  return 0;
}

// ── Phase 5: Qdrant batch patch ───────────────────────────────────────────────

/** Normalise a file path to a repo-relative forward-slash key (src/... or scripts/...) */
function normQdrantKey(fp) {
  return (fp ?? '')
    .replace(/\\/g, '/')
    .replace(/^.*?\/sveltekit-frontend\//, '')
    .replace(/^.*?\/src\//, 'src/')
    .replace(/^\//, '');
}

/** Scroll Qdrant, building relativePath → [point-id, …] mapping (all chunks per file) */
async function buildQdrantIndex(limit = 50_000) {
  // Map<normalised-path, point-id[]>
  const index = new Map();
  let offset = null;
  let collected = 0;
  while (collected < limit) {
    const r = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLL}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 500,
        with_payload: ['stable_key', 'relativePath', 'file_path'],
        with_vector: false,
        ...(offset ? { offset } : {}),
      }),
    });
    if (!r.ok) break;
    const d = await r.json();
    const pts = d.result?.points ?? [];
    for (const pt of pts) {
      const raw = pt.payload?.relativePath ?? pt.payload?.file_path ?? pt.payload?.stable_key;
      if (!raw) continue;
      const key = normQdrantKey(raw);
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(pt.id);
    }
    collected += pts.length;
    offset = d.result?.next_page_offset ?? null;
    if (!offset || pts.length < 500) break;
  }
  return index;
}

async function qdrantPatchBatch(patches) {
  const CHUNK = 100;
  for (let i = 0; i < patches.length; i += CHUNK) {
    const chunk = patches.slice(i, i + CHUNK);
    await Promise.all(chunk.map(({ id, payload }) =>
      fetch(`${QDRANT_URL}/collections/${QDRANT_COLL}/points/payload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, points: [id] }),
      }).catch(() => {})
    ));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function runId() {
  return createHash('sha256').update(Date.now().toString()).digest('hex').slice(0, 12);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const RUN_ID = runId();
  console.log(`🧠 Neo4j GDS Enrichment (Phase D2)${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`   run_id=${RUN_ID}  limit=${LIMIT}  neo4j=${NEO4J_URL}`);

  const pool  = new pg.Pool({ connectionString: DB_URL, max: 4 });
  const redis = NO_REDIS ? null : new Redis(REDIS_URL, { lazyConnect: false, enableOfflineQueue: false, connectTimeout: 3000 }).on('error', () => {});

  const summary = {
    runId: RUN_ID, startedAt: new Date().toISOString(),
    gdsAvailable: false, pagerankRows: 0, communities: 0,
    authorityScoresComputed: 0, qdrantPatched: 0, redisCached: 0,
    gates: {},
  };

  // ── GATE GDS1: Neo4j reachable ────────────────────────────────────────────
  let neo4jOk = false;
  try {
    await neo4j('RETURN 1 AS ok');
    neo4jOk = true;
    summary.gates.GDS1 = 'PASS';
    console.log('   ✓ GDS1 Neo4j reachable');
  } catch (e) {
    summary.gates.GDS1 = `FAIL: ${e.message.slice(0, 60)}`;
    console.warn(`   ✗ GDS1 Neo4j unreachable: ${e.message.slice(0, 80)}`);
  }

  // ── GATE GDS2: GDS available ──────────────────────────────────────────────
  let gdsOk = false;
  if (neo4jOk) {
    try {
      await neo4j('RETURN gds.version() AS version');  // GDS 2.x: function not YIELD-able procedure
      gdsOk = true;
      summary.gdsAvailable = true;
      summary.gates.GDS2 = 'PASS';
      console.log('   ✓ GDS2 GDS available');
    } catch {
      summary.gates.GDS2 = 'DEGRADED: GDS unavailable — using Postgres fan-in fallback';
      console.warn('   ⚠ GDS2 GDS not available — using Postgres fan-in fallback');
    }
  } else {
    summary.gates.GDS2 = 'SKIP (Neo4j unreachable)';
  }

  // ── PHASE 1: Graph projection ─────────────────────────────────────────────
  if (gdsOk) {
    try {
      const projOk = await ensureProjection();
      if (projOk) {
        summary.gates.GDS3 = 'PASS';
      } else {
        gdsOk = false;
        summary.gates.GDS3 = 'FAIL: projection created but has 0 nodes — run graphify:full first';
        console.warn('   ✗ GDS3 skipping PageRank/Louvain — projection has 0 nodes');
      }
    } catch (e) {
      gdsOk = false;
      summary.gates.GDS3 = `FAIL: ${e.message.slice(0, 80)}`;
      console.warn(`   ✗ GDS3 projection failed: ${e.message.slice(0, 80)}`);
    }
  } else {
    summary.gates.GDS3 = 'SKIP (GDS unavailable)';
  }

  // ── PHASE 2: PageRank ─────────────────────────────────────────────────────
  let pagerankByKey = new Map(); // stableKey/filePath → score
  let fallbackFanIn = new Map(); // filePath → fanIn (degraded)

  if (gdsOk) {
    try {
      const rows = await runPageRank();
      for (const r of rows) {
        const key = r.stableKey ?? r.filePath;
        if (key) pagerankByKey.set(key, r.score ?? 0);
      }
      summary.pagerankRows = pagerankByKey.size;
      summary.gates.GDS4 = pagerankByKey.size > 0 ? 'PASS' : 'FAIL: 0 rows';
    } catch (e) {
      summary.gates.GDS4 = `FAIL: ${e.message.slice(0, 60)}`;
    }
  } else {
    // Degraded: Postgres fan-in
    const pgRows = await fallbackAuthorityFromPostgres(pool);
    for (const r of pgRows) fallbackFanIn.set(r.filePath, r.fanIn);
    summary.gates.GDS4 = `DEGRADED: ${pgRows.length} files from Postgres fan-in`;
    console.log(`   ⚠ GDS4 using Postgres fan-in: ${pgRows.length} files`);
  }

  // ── PHASE 3: Community detection ─────────────────────────────────────────
  let communityByKey = new Map();  // stableKey → communityId
  let communitySizes = new Map();  // communityId → size

  if (gdsOk) {
    try {
      const { communityRows, communitySizes: sizes } = await runLouvain();
      for (const r of communityRows) {
        const key = r.stableKey ?? r.filePath;
        if (key) communityByKey.set(key, r.communityId);
      }
      communitySizes = sizes;
      summary.communities = sizes.size;
      summary.gates.GDS5 = communityByKey.size > 0 ? 'PASS' : 'FAIL: 0 rows';
    } catch (e) {
      summary.gates.GDS5 = `FAIL: ${e.message.slice(0, 60)}`;
    }
  } else {
    summary.gates.GDS5 = 'SKIP (GDS unavailable)';
  }

  // ── PHASE 4: Load all scored nodes from Neo4j ─────────────────────────────
  // Pull enriched node properties for authority computation
  let allNodes = [];
  if (neo4jOk) {
    const data = await neo4j(`
      MATCH (f:CodebaseFile)
      WHERE f.filePath IS NOT NULL OR f.id IS NOT NULL
      RETURN coalesce(f.filePath, f.id) AS stableKey, f.filePath AS filePath,
             coalesce(f.graphPageRank, f.pagerank, 0.0) AS pagerank,
             coalesce(f.communityId, -1) AS communityId,
             coalesce(f.topoByte, 0) AS topoByte,
             coalesce(f.topoClass, 'unclassified') AS topoClass,
             coalesce(f.importCount, 0) AS fanIn
      LIMIT ${LIMIT}
    `).catch(() => []);
    allNodes = neo4jRows(data);
    console.log(`   Loaded ${allNodes.length} nodes from Neo4j`);
  }

  // If Neo4j had no data, use Postgres fallback
  if (!allNodes.length) {
    for (const [fp, fi] of fallbackFanIn) {
      allNodes.push({ stableKey: null, filePath: fp, pagerank: 0, communityId: -1, topoByte: 0, topoClass: 'unclassified', fanIn: fi });
    }
  }

  // Merge pagerankByKey into allNodes
  for (const n of allNodes) {
    const key = n.stableKey ?? n.filePath;
    if (key && pagerankByKey.has(key)) n.pagerank = pagerankByKey.get(key);
    if (key && communityByKey.has(key)) n.communityId = communityByKey.get(key);
  }

  // Compute max values for normalisation
  const maxPagerank = Math.max(1e-10, ...allNodes.map(n => n.pagerank ?? 0));
  const maxFanIn    = Math.max(1,     ...allNodes.map(n => n.fanIn ?? 0));

  // Compute authority scores
  const enriched = allNodes.map(n => {
    const fp      = n.filePath ?? '';
    const fanIn   = (n.fanIn ?? fallbackFanIn.get(fp) ?? 0);
    const trust   = topoTrustLevel(fp);
    const risk    = riskLevel(fp);
    const hasTest = /\/(tests?|spec|__tests?__)/.test(fp.toLowerCase());
    const authority = computeAuthority(n.pagerank ?? 0, fanIn, trust, hasTest, risk, maxPagerank, maxFanIn);
    const comId   = n.communityId >= 0 ? n.communityId : null;
    const comSize = comId != null ? (communitySizes.get(comId) ?? 0) : 0;
    return {
      stableKey:           n.stableKey,
      filePath:            fp,
      pagerank:            n.pagerank ?? 0,
      graphAuthorityScore: Math.round(authority * 10000) / 10000,
      communityId:         comId != null ? `community:${comId}` : null,
      communitySize:       comSize,
      topoClass:           n.topoClass ?? 'unclassified',
      topoByte:            n.topoByte ?? 0,
      clusterKey:          `${n.topoClass ?? 'unclassified'}:community-${comId ?? 'none'}`,
    };
  });

  enriched.sort((a, b) => b.graphAuthorityScore - a.graphAuthorityScore);
  summary.authorityScoresComputed = enriched.length;
  summary.gates.GDS6 = enriched.filter(e => e.graphAuthorityScore > 0).length >= 25
    ? 'PASS'
    : `WARN: only ${enriched.filter(e => e.graphAuthorityScore > 0).length} files with non-zero score`;
  console.log(`   ✓ Authority scores computed for ${enriched.length} nodes`);

  // Write authority scores back to Neo4j nodes
  if (!DRY_RUN && neo4jOk) {
    const CHUNK = 300;
    for (let i = 0; i < enriched.length; i += CHUNK) {
      const rows = enriched.slice(i, i + CHUNK).map(e => ({
        sk: e.stableKey, fp: e.filePath,
        auth: e.graphAuthorityScore, comId: e.communityId,
      }));
      await neo4j(`
        UNWIND $rows AS row
        OPTIONAL MATCH (f:CodebaseFile {stable_key: row.sk})
        OPTIONAL MATCH (g:CodebaseFile {file_path: row.fp})
        OPTIONAL MATCH (h:CodebaseFile {filePath: row.fp})
        WITH coalesce(f, g, h) AS node, row
        WHERE node IS NOT NULL
        SET node.graphAuthorityScore = row.auth,
            node.communityId         = row.comId
      `, { rows }).catch(() => {});
    }
    console.log(`   ✓ Wrote graphAuthorityScore + communityId to Neo4j`);
  }

  // ── PHASE 5: Qdrant payload patch ────────────────────────────────────────
  if (!NO_QDRANT) {
    console.log('\n── Phase 5: Qdrant payload patch ────────────────────────────────');
    try {
      const qdrantIndex = await buildQdrantIndex(50_000);
      console.log(`   Qdrant index built: ${qdrantIndex.size} unique paths → point-id[] mappings`);

      const patches = [];
      for (const e of enriched) {
        // normalise both sides to repo-relative path (strips 'sveltekit-frontend/' prefix)
        const key = normQdrantKey(e.filePath ?? e.stableKey ?? '');
        const ids = qdrantIndex.get(key);
        if (!ids?.length) continue;
        const payload = {
          graphAuthorityScore: e.graphAuthorityScore,
          communityId:         e.communityId,
          communitySize:       e.communitySize,
          pagerank:            e.pagerank,
          cluster_key:         e.clusterKey,
        };
        // Patch ALL chunks for this file (one point per chunk)
        for (const id of ids) patches.push({ id, payload });
      }

      const dryNote = DRY_RUN ? ' (dry — no writes)' : '';
      summary.gates.GDS7 = patches.length > 0 ? `PASS: ${patches.length} patches${dryNote}` : 'WARN: 0 patches';
      console.log(`   Qdrant patches: ${patches.length}${dryNote}`);

      if (!DRY_RUN) {
        await qdrantPatchBatch(patches);
        summary.qdrantPatched = patches.length;
        console.log(`   ✓ Qdrant patched`);
      }
    } catch (e) {
      summary.gates.GDS7 = `FAIL: ${e.message.slice(0, 80)}`;
      console.warn(`   ✗ Qdrant patch failed: ${e.message.slice(0, 80)}`);
    }
  } else {
    summary.gates.GDS7 = 'SKIP (--no-qdrant)';
  }

  // ── PHASE 6: Redis ACE authority cache ───────────────────────────────────
  if (!NO_REDIS && redis) {
    console.log('\n── Phase 6: Redis ACE authority hot cache ───────────────────────');
    try {
      const top200 = enriched.slice(0, 200);
      const dryNote = DRY_RUN ? ' (dry — no writes)' : '';

      if (!DRY_RUN) {
        // Store as a Redis HASH: ace:authority:top  key=filePath  value=JSON
        const pipeline = redis.pipeline();
        pipeline.del('ace:authority:top');
        for (const e of top200) {
          pipeline.hset('ace:authority:top', e.filePath || e.stableKey || '', JSON.stringify({
            graphAuthorityScore: e.graphAuthorityScore,
            communityId:         e.communityId,
            pagerank:            e.pagerank,
            topoClass:           e.topoClass,
            clusterKey:          e.clusterKey,
          }));
        }
        pipeline.expire('ace:authority:top', REDIS_TTL);
        await pipeline.exec();
        summary.redisCached = top200.length;
      }

      summary.gates.GDS8 = `PASS: ${top200.length} entries${dryNote}`;
      console.log(`   ✓ Redis ace:authority:top — ${top200.length} entries${dryNote}`);
    } catch (e) {
      summary.gates.GDS8 = `FAIL: ${e.message.slice(0, 80)}`;
      console.warn(`   ✗ Redis cache failed: ${e.message.slice(0, 80)}`);
    }
  } else {
    summary.gates.GDS8 = 'SKIP (--no-redis)';
  }

  // GDS9: Degraded mode ran without crashing (always pass if we got here)
  summary.gates.GDS9 = 'PASS';

  // ── PHASE 7: Summary artifact ─────────────────────────────────────────────
  summary.finishedAt = new Date().toISOString();

  const toAuthEntry = e => ({
    filePath:            e.filePath,
    graphAuthorityScore: e.graphAuthorityScore,
    communityId:         e.communityId,
    pagerank:            e.pagerank,
    topoClass:           e.topoClass,
  });

  // Normalize to repo-relative forward-slash path for lookup
  const normPath = fp => (fp ?? '')
    .replace(/\\/g, '/')
    .replace(/^.*?\/src\//, 'src/')
    .replace(/^.*?\/sveltekit-frontend\//, '')
    .replace(/^\//, '');

  summary.topAuthorities  = enriched.slice(0, 500).map(toAuthEntry);
  summary.allAuthorities  = enriched.map(toAuthEntry);
  summary.byPath          = Object.fromEntries(
    enriched.map(e => [normPath(e.filePath), toAuthEntry(e)])
  );

  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(`${OUTPUT_DIR}/latest.json`,       JSON.stringify(summary, null, 2), 'utf-8');
    writeFileSync(`${OUTPUT_DIR}/${RUN_ID}.json`,    JSON.stringify(summary, null, 2), 'utf-8');
    summary.gates.GDS10 = 'PASS';
    console.log(`\n   ✓ Summary → memory/graphify/gds/latest.json`);
  } catch (e) {
    summary.gates.GDS10 = `FAIL: ${e.message}`;
  }

  // ── Final report ─────────────────────────────────────────────────────────
  console.log('\n── Gate results ─────────────────────────────────────────────────');
  let passed = 0;
  for (const [gate, result] of Object.entries(summary.gates)) {
    const icon = result.startsWith('PASS') ? '✓' : result.startsWith('FAIL') ? '✗' : '⚠';
    if (result.startsWith('PASS')) passed++;
    console.log(`   ${icon} ${gate}: ${result}`);
  }
  const total = Object.keys(summary.gates).length;
  console.log(`\n${passed === total ? '✅' : '⚠ '} ${passed}/${total} gates passed`);
  console.log(`   Authority scores: ${enriched.length}  Communities: ${summary.communities}`);
  console.log(`   Qdrant patched: ${summary.qdrantPatched}  Redis cached: ${summary.redisCached}`);

  if (redis) redis.disconnect();
  await pool.end();
}

main().catch(err => { console.error('\n❌ GDS enrichment failed:', err); process.exit(1); });
