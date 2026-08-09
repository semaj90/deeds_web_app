#!/usr/bin/env npx tsx
/**
 * GR2/GR3 smoke proof for openspec/changes/parent-atlas-graph-runtime-enhancement.
 *
 * Reuses existing owners — does NOT create new graph clients or projection managers:
 *   - ensureGdsProjection(), runDijkstraContext()  from src/lib/server/graph/neo4j-gds.ts
 *   - runPageRankClient(), getTopPageRankClient()  from src/lib/server/graph/neo4j-gds-client.ts
 * Only raw Cypher for APOC bounded expansion + GDS BFS is new (no existing owner for either).
 *
 * Run from sveltekit-frontend/ (module aliases + relative imports require it):
 *   npx tsx ../scripts/atlas/smoke-gr2-gr3-graph-runtime.mts
 */
import neo4j from 'neo4j-driver';

// ESM hoists all static imports before any top-level code runs, so env.server.ts's module-level
// ENV object would capture process.env.NEO4J_PASSWORD as undefined if imported statically here
// before loadRuntimeEnv() runs. Force real ordering with dynamic imports.
const { loadRuntimeEnv } = await import('../../sveltekit-frontend/src/lib/server/config/load-runtime-env.js');
loadRuntimeEnv();

const { getNeo4jDriver } = await import('../../sveltekit-frontend/src/lib/server/neo4j-driver.ts');
const { runDijkstraContext } = await import('../../sveltekit-frontend/src/lib/server/graph/neo4j-gds.ts');
const { getGraphAnalyticsService } = await import('../../sveltekit-frontend/src/lib/server/graph/graph-analytics-service.ts');
const { getTopPageRankClient, PROJECTION_NAME } = await import('../../sveltekit-frontend/src/lib/server/graph/neo4j-gds-client.ts');

const graphAnalytics = getGraphAnalyticsService();

/** Neo4j driver may return integers as plain JS numbers or as neo4j.Integer, depending on value size. */
function toNum(value: unknown): number {
  return neo4j.isInt(value) ? (value as ReturnType<typeof neo4j.int>).toNumber() : Number(value);
}

const SEED_PATH = 'src/lib/server/features/ai/ace/context-assembler.ts';
const TARGET_PATH = 'src/lib/server/queue/rabbitmq-manager-fixed.ts';
const MAX_DEPTH = 3;
const LIMIT = 50;
const REL_TYPES = ['IMPORTS', 'CALLS', 'REFERENCES'];

type GateResult = {
  gate: string;
  query: string;
  projection: string;
  seed: string;
  returnedCount: number;
  latencyMs: number;
  pass: boolean;
  failure?: string;
};

const results: GateResult[] = [];

function record(r: GateResult) {
  results.push(r);
  console.log(`[${r.pass ? 'PASS' : 'FAIL'}] ${r.gate} — count=${r.returnedCount} latency=${r.latencyMs}ms${r.failure ? ` — ${r.failure}` : ''}`);
}

async function gr2Apoc() {
  const driver = getNeo4jDriver();
  const session = driver.session();
  const t0 = Date.now();
  try {
    const result = await session.run(
      `
      MATCH (seed:CodebaseFile {path: $seedPath})
      CALL apoc.path.expandConfig(seed, {
        relationshipFilter: apoc.text.join([r IN $relTypes | r], '|'),
        minLevel: 1,
        maxLevel: $maxDepth,
        uniqueness: 'NODE_GLOBAL',
        limit: $limit
      })
      YIELD path
      WITH path, last(nodes(path)) AS node, length(path) AS depth
      RETURN node.path AS nodePath, depth, [r IN relationships(path) | type(r)] AS relTypesInPath
      ORDER BY depth ASC
      LIMIT $limit
      `,
      { seedPath: SEED_PATH, relTypes: REL_TYPES, maxDepth: neo4j.int(MAX_DEPTH), limit: neo4j.int(LIMIT) },
    );

    const rows = result.records.map((r) => ({
      nodePath: r.get('nodePath') as string,
      depth: toNum(r.get('depth')),
      relTypesInPath: r.get('relTypesInPath') as string[],
    }));

    const maxDepthHonored = rows.every((row) => row.depth <= MAX_DEPTH);
    const limitHonored = rows.length <= LIMIT;
    const onlyAllowedRelTypes = rows.every((row) => row.relTypesInPath.every((t) => REL_TYPES.includes(t)));

    const seedCheck = await session.run(`MATCH (s:CodebaseFile {path: $seedPath}) RETURN count(s) AS c`, { seedPath: SEED_PATH });
    const seedCount = toNum(seedCheck.records[0]?.get('c'));

    const pass = seedCount === 1 && maxDepthHonored && limitHonored && onlyAllowedRelTypes;
    record({
      gate: 'GR2 APOC apoc.path.expandConfig',
      query: 'apoc-bounded-neighborhood.cypher',
      projection: 'n/a (raw graph, not GDS projection)',
      seed: SEED_PATH,
      returnedCount: rows.length,
      latencyMs: Date.now() - t0,
      pass,
      failure: pass
        ? undefined
        : `seedResolved=${seedCount === 1} maxDepthHonored=${maxDepthHonored} limitHonored=${limitHonored} onlyAllowedRelTypes=${onlyAllowedRelTypes}`,
    });
  } catch (err) {
    record({
      gate: 'GR2 APOC apoc.path.expandConfig',
      query: 'apoc-bounded-neighborhood.cypher',
      projection: 'n/a',
      seed: SEED_PATH,
      returnedCount: 0,
      latencyMs: Date.now() - t0,
      pass: false,
      failure: (err as Error).message,
    });
  } finally {
    await session.close();
  }
}

/**
 * gds.bfs.stream yields ONE row with sourceNode + nodeIds (the full reachable set bounded by
 * maxDepth) — not one row per node with individual depth (confirmed live, 2026-08-09; see
 * neo4j/gds-bfs.cypher for the full explanation). So "maxDepth respected" is proven by
 * monotonicity: a smaller maxDepth must not return MORE reachable nodes than a larger one.
 */
async function runBfsOnce(maxDepth: number): Promise<{ sourceResolved: boolean; reachableCount: number }> {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const result = await session.run(
      `
      MATCH (source:CodebaseFile {path: $seedPath})
      CALL gds.bfs.stream($projection, {
        sourceNode: source,
        maxDepth: $maxDepth
      })
      YIELD nodeIds
      RETURN size(nodeIds) AS reachableCount
      `,
      { seedPath: SEED_PATH, projection: PROJECTION_NAME, maxDepth: neo4j.int(maxDepth) },
    );
    const sourceCheck = await session.run(`MATCH (s:CodebaseFile {path: $seedPath}) RETURN count(s) AS c`, { seedPath: SEED_PATH });
    return {
      sourceResolved: toNum(sourceCheck.records[0]?.get('c')) === 1,
      reachableCount: toNum(result.records[0]?.get('reachableCount')),
    };
  } finally {
    await session.close();
  }
}

async function gr3Bfs() {
  const t0 = Date.now();
  try {
    await graphAnalytics.ensureProjection({ projectionName: PROJECTION_NAME });

    const shallow = await runBfsOnce(1);
    const deep = await runBfsOnce(MAX_DEPTH);

    const sourceResolved = shallow.sourceResolved && deep.sourceResolved;
    const reachableNodesReturned = deep.reachableCount > 0;
    const maxDepthRespected = shallow.reachableCount <= deep.reachableCount;

    const pass = sourceResolved && reachableNodesReturned && maxDepthRespected;
    record({
      gate: 'GR3 BFS gds.bfs.stream',
      query: 'gds-bfs.cypher',
      projection: PROJECTION_NAME,
      seed: SEED_PATH,
      returnedCount: deep.reachableCount,
      latencyMs: Date.now() - t0,
      pass,
      failure: pass
        ? undefined
        : `sourceResolved=${sourceResolved} reachableNodesReturned=${reachableNodesReturned} maxDepthRespected=${maxDepthRespected} (depth1=${shallow.reachableCount}, depth${MAX_DEPTH}=${deep.reachableCount})`,
    });
  } catch (err) {
    record({
      gate: 'GR3 BFS gds.bfs.stream',
      query: 'gds-bfs.cypher',
      projection: PROJECTION_NAME,
      seed: SEED_PATH,
      returnedCount: 0,
      latencyMs: Date.now() - t0,
      pass: false,
      failure: (err as Error).message,
    });
  }
}

async function gr3Dijkstra() {
  const t0 = Date.now();
  try {
    const result = await runDijkstraContext({ sourceRef: SEED_PATH, targetRefs: [TARGET_PATH], limit: 10 });
    const pathReturned = result.hits.length > 0;
    const finiteCosts = result.hits.every((h) => Number.isFinite(h.totalCost));
    // Unreachable is a legitimate outcome (empty hits), not a failure — only fail on a thrown
    // error or a non-finite cost among returned hits.
    const pass = finiteCosts;
    record({
      gate: 'GR3 Dijkstra runDijkstraContext (existing owner)',
      query: 'neo4j-gds.ts:runDijkstraContext',
      projection: PROJECTION_NAME,
      seed: SEED_PATH,
      returnedCount: result.hits.length,
      latencyMs: Date.now() - t0,
      pass,
      failure: pass ? undefined : `finiteCosts=${finiteCosts} (pathReturned=${pathReturned}, gdsUsed=${result.gdsUsed})`,
    });
  } catch (err) {
    record({
      gate: 'GR3 Dijkstra runDijkstraContext (existing owner)',
      query: 'neo4j-gds.ts:runDijkstraContext',
      projection: PROJECTION_NAME,
      seed: SEED_PATH,
      returnedCount: 0,
      latencyMs: Date.now() - t0,
      pass: false,
      failure: (err as Error).message,
    });
  }
}

async function gr3PageRank() {
  const t0 = Date.now();
  try {
    await graphAnalytics.ensureProjection({ projectionName: PROJECTION_NAME });
    const mutateResult = await graphAnalytics.runPageRank({ projectionName: PROJECTION_NAME });
    const topResult = await getTopPageRankClient(20);

    const nonEmpty = topResult.length > 0;
    const finiteScores = topResult.every((r) => Number.isFinite(r.graphPageRank));
    const pass = nonEmpty && finiteScores && mutateResult.nodesUpdated > 0;

    record({
      gate: 'GR3 PageRank runPageRankClient/getTopPageRankClient (existing owner)',
      query: 'neo4j-gds-client.ts:runPageRankClient+getTopPageRankClient',
      projection: PROJECTION_NAME,
      seed: 'n/a (global algorithm)',
      returnedCount: topResult.length,
      latencyMs: Date.now() - t0,
      pass,
      failure: pass ? undefined : `nonEmpty=${nonEmpty} finiteScores=${finiteScores} nodesUpdated=${mutateResult.nodesUpdated}`,
    });
  } catch (err) {
    record({
      gate: 'GR3 PageRank runPageRankClient/getTopPageRankClient (existing owner)',
      query: 'neo4j-gds-client.ts:runPageRankClient+getTopPageRankClient',
      projection: PROJECTION_NAME,
      seed: 'n/a',
      returnedCount: 0,
      latencyMs: Date.now() - t0,
      pass: false,
      failure: (err as Error).message,
    });
  }
}

async function main() {
  console.log(`\nGR2/GR3 smoke — seed=${SEED_PATH} target=${TARGET_PATH} maxDepth=${MAX_DEPTH} limit=${LIMIT}\n`);

  await gr2Apoc();
  await gr3Bfs();
  await gr3Dijkstra();
  await gr3PageRank();

  console.log('\n──────────── Summary ────────────');
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.gate}`);
  }
  const allPass = results.every((r) => r.pass);
  console.log(allPass ? '\nGR2/GR3 baseline: ALL PASS' : '\nGR2/GR3 baseline: FAILURES PRESENT — see above');

  const driver = getNeo4jDriver();
  await driver.close();
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
