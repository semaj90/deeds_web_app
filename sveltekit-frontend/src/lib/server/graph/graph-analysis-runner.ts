import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { GraphAnalysisRunSchema, CommunityAssignmentSchema, CommunityTaxonomyRecordSchema, type GraphAnalysisRun, type GraphAlgorithm } from './graph-analysis-types.js';
import { getGraphDispatcherRegistryEntry } from './graph-dispatcher-registry.js';
import { ensureProjectionClient, PROJECTION_NAME } from './neo4j-gds-client.js';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import { prepareLouvainResolutionSeeds } from './louvain-resolution-seeder.js';
import { NAMED_PROJECTION_CANDIDATES, type NamedProjectionCandidate } from './graph-projection-manifest.js';
import { graphAlgorithmRevision } from './graph-algorithm-revision.js';

const DEFAULT_WORKSPACE_REVISION = 'workspace:parent-atlas';

export interface GraphAnalysisRequest {
  algorithm: GraphAlgorithm;
  /**
   * Use a named, relationship-filtered projection (see
   * NAMED_PROJECTION_CANDIDATES in graph-projection-manifest.ts) instead of
   * the default full 'codeTopology' projection. Only meaningful for
   * community algorithms (louvain/leiden) today — this is Patch E's
   * mechanism for comparing community quality by relationship semantics per
   * README point 10, rather than tuning resolution on the combined graph.
   * Takes precedence over `projectionName` if both are set.
   */
  namedProjection?: NamedProjectionCandidate;
  projectionName?: string;
  maxIterations?: number;
  dampingFactor?: number;
  limit?: number;
  sidecarUrl?: string | null;
  /**
   * Which backend computes the result for algorithms with more than one
   * (currently only 'pagerank'). Defaults to 'neo4j-gds', the existing
   * canonical, RUNTIME_SMOKE_PROVEN backend — this field is additive and
   * changes no default behavior. 'cugraph-rapids' calls the GPU sidecar at
   * `sidecarUrl` (see cugraph-pagerank-adapter.ts); it requires a graph
   * projection to already be resident there (fails closed with a skipped
   * result if not — it does not auto-load one).
   */
  engine?: 'neo4j-gds' | 'cugraph-rapids';
}

export interface GraphAnalysisExecutionResult {
  run: GraphAnalysisRun;
  metricsWritten: number;
  communitiesWritten: number;
  unresolvedPacketKeys: number;
  excludedPacketKeys: number;
  skippedReason?: string;
}

function buildRunBase(params: {
  algorithm: GraphAlgorithm;
  projectionName: string;
  nodeCount: number;
  relationshipCount: number;
  graphRevision: string;
  startedAt: string;
  completedAt: string | null;
  parameters: Record<string, unknown>;
  metrics: Record<string, unknown>;
  backendPreference: 'native-ts' | 'python-sidecar' | 'gpu-sidecar' | 'offline';
  backendActual: 'native-ts' | 'python-sidecar' | 'gpu-sidecar' | 'offline';
  gpuAccelerated: boolean;
  sidecarUrl: string | null;
  inputHash: string | null;
  outputHash: string | null;
  parameterRevision: string;
}): GraphAnalysisRun {
  return GraphAnalysisRunSchema.parse({
    runId: randomUUID(),
    algorithm: params.algorithm,
    algorithmRevision: graphAlgorithmRevision(params.algorithm),
    parameterRevision: params.parameterRevision,
    workspaceRevision: DEFAULT_WORKSPACE_REVISION,
    sourceRevision: params.graphRevision,
    backendPreference: params.backendPreference,
    backendActual: params.backendActual,
    gpuAccelerated: params.gpuAccelerated,
    sidecarUrl: params.sidecarUrl,
    inputHash: params.inputHash,
    outputHash: params.outputHash,
    graphRevision: params.graphRevision,
    projectionRevision: params.graphRevision,
    projectionName: params.projectionName,
    nodeCount: params.nodeCount,
    relationshipCount: params.relationshipCount,
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    status: params.completedAt ? 'succeeded' : 'running',
    parameters: params.parameters,
    metrics: params.metrics,
  });
}

async function resolveGraphRevision(projectionName: string, nodeCount: number, relationshipCount: number): Promise<string> {
  return createHash('sha256').update(`${projectionName}:${nodeCount}:${relationshipCount}`).digest('hex');
}

async function runSkippedAnalysis(
  algorithm: GraphAnalysisRequest['algorithm'],
  projectionName: string,
  nodeCount: number,
  relationshipCount: number,
  reason: string,
): Promise<GraphAnalysisExecutionResult> {
  const startedAt = new Date().toISOString();
  const graphRevision = await resolveGraphRevision(projectionName, nodeCount, relationshipCount);
  const run = buildRunBase({
    algorithm,
    projectionName,
    nodeCount,
    relationshipCount,
    graphRevision,
    startedAt,
    completedAt: new Date().toISOString(),
    parameters: { reason },
    metrics: { skipped: true, reason },
    backendPreference: 'offline',
    backendActual: 'offline',
    gpuAccelerated: false,
    sidecarUrl: null,
    inputHash: null,
    outputHash: null,
    parameterRevision: `skipped-${algorithm}-v1`,
  });

  return { run, metricsWritten: 0, communitiesWritten: 0, unresolvedPacketKeys: 0, excludedPacketKeys: 0, skippedReason: reason };
}

const COMMUNITY_MUTATE_PROPERTY: Record<'louvain' | 'leiden', string> = {
  louvain: 'louvainCommunity',
  leiden: 'leidenCommunity',
};

/**
 * Shared Louvain/Leiden runner — both algorithms emit the same
 * CommunityAssignment/CommunityTaxonomyRecord shape via one contract (per
 * README.md's Patch D description), kept as separate `gds.<algo>.mutate`
 * calls, not a merged code path. Generalized 2026-08-09 (Patch E) from a
 * Louvain-only implementation to also parameterize by projection +
 * relationship-type list, so different named projections (dependency vs.
 * execution vs. feature/topology — see `NAMED_PROJECTION_CANDIDATES` in
 * graph-projection-manifest.ts) can be compared, per README point 10.
 */
async function runCommunityAnalysis(
  algorithm: 'louvain' | 'leiden',
  db: Pool,
  projectionName: string,
  relationshipTypes?: readonly string[],
): Promise<GraphAnalysisExecutionResult> {
  const mutateProperty = COMMUNITY_MUTATE_PROPERTY[algorithm];
  const projection = await ensureProjectionClient(projectionName, false, relationshipTypes);
  const startedAt = new Date().toISOString();
  const graphRevision = await resolveGraphRevision(projectionName, projection.nodeCount, projection.relationshipCount);
  const neo4jSession = getNeo4jDriver().session();
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // gds.<algo>.mutate throws IllegalArgumentException if mutateProperty
    // already exists on the in-memory graph — confirmed live 2026-08-09 on a
    // second Louvain run against the long-lived 'codeTopology' projection
    // (same class of bug neo4j-gds-client.ts's runPageRankClient already
    // self-heals for 'pageRankScore'). Self-heal: drop the property first,
    // idempotently, for both algorithms.
    await neo4jSession
      .run(`CALL gds.graph.nodeProperties.drop($name, [$prop]) YIELD propertiesRemoved RETURN propertiesRemoved`, {
        name: projectionName,
        prop: mutateProperty,
      })
      .catch(() => { /* property didn't exist yet — fine */ });

    // gds.<algo>.mutate YIELDs 'modularity' directly (confirmed live
    // 2026-08-09 via a manual probe on atlas_feature_v1: modularity
    // 0.9735...) — capture it here rather than defaulting to a fabricated
    // placeholder in community-taxonomy-policy.ts's evaluator.
    const mutateResult = await neo4jSession.run(
      `CALL gds.${algorithm}.mutate($name, { mutateProperty: $prop }) YIELD modularity RETURN modularity`,
      { name: projectionName, prop: mutateProperty },
    );
    const modularity = Number(mutateResult.records[0]?.get('modularity') ?? 0);
    await neo4jSession.run(
      `CALL gds.graph.nodeProperties.write($name, [$prop]) YIELD propertiesWritten RETURN propertiesWritten`,
      { name: projectionName, prop: mutateProperty },
    );

    // Filter to CodebaseFile explicitly and resolve packet_key through
    // atlas_packets, matching pagerank-analysis-adapter.ts's discipline.
    // The coalesced n.stableKey (n.stableKey || n.filePath || n.path || n.name)
    // this used to write directly as packet_key is a Neo4j-only convenience
    // field, never validated against Postgres identity — root CLAUDE.md's
    // "Forbidden Identity Sources" bans stable_key-style pseudo-refs for
    // exactly this reason, and leaving nodeType unfiltered previously risked
    // the same duplicate-key collisions found and fixed in the PageRank
    // adapter (non-CodebaseFile nodes sharing a containing file's path).
    const nodesResult = await neo4jSession.run(
      `
      MATCH (n:CodebaseFile)
      WHERE n[$prop] IS NOT NULL AND n.path IS NOT NULL
      RETURN n.path AS path, toString(n[$prop]) AS community_id
      `,
      { prop: mutateProperty },
    );
    const rawNodes = nodesResult.records
      .map((record) => ({
        path: String(record.get('path') ?? ''),
        community_id: String(record.get('community_id') ?? ''),
      }))
      .filter((row) => row.path.length > 0 && row.community_id.length > 0);

    const completedAt = new Date().toISOString();
    const seedPlan = await prepareLouvainResolutionSeeds(
      db,
      rawNodes.map((row) => ({
        graphNodeKey: row.path,
        rawPath: row.path,
        communityId: row.community_id,
      })),
      graphRevision,
    );
    const nodes = seedPlan.assignmentRows;
    const unresolvedPacketKeys = seedPlan.unresolvedRows;
    const excludedPacketKeys = seedPlan.excludedRows;
    const outputHash = createHash('sha256')
      .update(JSON.stringify(nodes.map((r) => ({ packetKey: r.packet_key, communityId: r.community_id }))))
      .digest('hex');

    const run = buildRunBase({
      algorithm,
      projectionName,
      nodeCount: projection.nodeCount,
      relationshipCount: projection.relationshipCount,
      graphRevision,
      startedAt,
      completedAt,
      parameters: { mutateProperty, relationshipTypes: relationshipTypes ?? null },
      // unresolvedPacketKeys and modularity must be persisted here, not just
      // returned/discarded — community-taxonomy-policy.ts (Patch E) computes
      // coverage and reads modularity from stored graph_analysis_runs.metrics.
      // unresolvedPacketKeys was previously only on the in-process return
      // value, unrecoverable after the fact — same class of "value computed
      // but lost at the return boundary" issue as this session's other fixes.
      metrics: { assignments: nodes.length, unresolvedPacketKeys, excludedPacketKeys, modularity },
      backendPreference: 'offline',
      backendActual: 'offline',
      gpuAccelerated: false,
      sidecarUrl: null,
      inputHash: createHash('sha256').update(JSON.stringify({ algorithm, projectionName, relationshipTypes: relationshipTypes ?? null })).digest('hex'),
      outputHash,
      parameterRevision: `${algorithm}-mutate-v1`,
    });

    await client.query(
      `INSERT INTO graph_analysis_runs (
        run_id, algorithm, algorithm_revision, parameter_revision, workspace_revision,
        source_revision, started_at, completed_at, status, parameters, metrics,
        backend_preference, backend_actual, gpu_accelerated, sidecar_url,
        input_hash, output_hash, graph_revision, projection_revision, projection_name,
        node_count, relationship_count
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        run.runId,
        run.algorithm,
        run.algorithmRevision,
        run.parameterRevision,
        run.workspaceRevision,
        run.sourceRevision,
        run.startedAt,
        run.completedAt,
        run.status,
        JSON.stringify(run.parameters),
        JSON.stringify(run.metrics),
        run.backendPreference,
        run.backendActual,
        run.gpuAccelerated,
        run.sidecarUrl,
        run.inputHash,
        run.outputHash,
        run.graphRevision,
        run.projectionRevision,
        run.projectionName,
        run.nodeCount,
        run.relationshipCount,
      ],
    );

    if (seedPlan.unresolvedSeeds.length > 0) {
      const seedValues: string[] = [];
      const seedParams: unknown[] = [];
      seedPlan.unresolvedSeeds.forEach((seed, index) => {
        const base = index * 7;
        seedValues.push(`($${base + 1}::uuid, $${base + 2}::text, $${base + 3}::text, $${base + 4}::text, $${base + 5}::text, $${base + 6}::text, $${base + 7}::text)`);
        seedParams.push(
          run.runId,
          algorithm,
          seed.graphNodeKey,
          seed.rawPath,
          seed.normalizedPath,
          seed.communityId,
          seed.graphRevision,
        );
      });
      await client.query(
        `INSERT INTO graph_community_resolution_seeds
          (run_id, algorithm, graph_node_key, raw_path, normalized_path, community_id, graph_revision)
         VALUES ${seedValues.join(',\n')}
         ON CONFLICT (run_id, graph_node_key) DO UPDATE SET
           raw_path = EXCLUDED.raw_path,
           normalized_path = EXCLUDED.normalized_path,
           community_id = EXCLUDED.community_id,
           graph_revision = EXCLUDED.graph_revision,
            created_at = now()`,
        seedParams,
      );
    }

    const assignmentRows = nodes.map((row) =>
      CommunityAssignmentSchema.parse({
        runId: run.runId,
        packetKey: row.packet_key,
        algorithm,
        communityId: row.community_id,
        level: 0,
        graphRevision,
        createdAt: completedAt,
      }),
    );

    const communities = new Map<string, { members: string[] }>();
    for (const row of assignmentRows) {
      const current = communities.get(row.communityId) ?? { members: [] };
      current.members.push(row.packetKey);
      communities.set(row.communityId, current);
    }

    for (const row of assignmentRows) {
      await client.query(
        `INSERT INTO graph_community_assignments
          (run_id, packet_key, algorithm, community_id, level, graph_revision, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (run_id, packet_key) DO UPDATE SET
           community_id = EXCLUDED.community_id,
           level = EXCLUDED.level,
           graph_revision = EXCLUDED.graph_revision,
           created_at = EXCLUDED.created_at`,
        [row.runId, row.packetKey, row.algorithm, row.communityId, row.level, row.graphRevision, row.createdAt],
      );
    }

    for (const [communityId, data] of communities) {
      const community = CommunityTaxonomyRecordSchema.parse({
        runId: run.runId,
        algorithm,
        communityId,
        parentCommunityId: null,
        memberCount: data.members.length,
        representativePacketKeys: data.members.slice(0, 5),
        representativeSymbols: [],
        label: null,
        purity: null,
        modularityContribution: null,
        metadata: { source: 'neo4j-gds', projectionName, relationshipTypes: relationshipTypes ?? null },
      });
      await client.query(
        `INSERT INTO graph_communities
          (run_id, algorithm, community_id, parent_community_id, member_count,
           representative_packet_keys, representative_symbols, label, purity,
           modularity_contribution, metadata)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11::jsonb)
         ON CONFLICT (run_id, algorithm, community_id) DO UPDATE SET
           parent_community_id = EXCLUDED.parent_community_id,
           member_count = EXCLUDED.member_count,
           representative_packet_keys = EXCLUDED.representative_packet_keys,
           representative_symbols = EXCLUDED.representative_symbols,
           label = EXCLUDED.label,
           purity = EXCLUDED.purity,
           modularity_contribution = EXCLUDED.modularity_contribution,
           metadata = EXCLUDED.metadata`,
        [
          community.runId,
          community.algorithm,
          community.communityId,
          community.parentCommunityId,
          community.memberCount,
          JSON.stringify(community.representativePacketKeys),
          JSON.stringify(community.representativeSymbols),
          community.label,
          community.purity,
          community.modularityContribution,
          JSON.stringify(community.metadata),
        ],
      );
    }

    await client.query('COMMIT');
    return {
      run,
      metricsWritten: 0,
      communitiesWritten: communities.size,
      unresolvedPacketKeys,
      excludedPacketKeys,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await neo4jSession.close().catch(() => {});
    client.release();
  }
}

export async function runGraphAnalysis(
  db: Pool,
  request: GraphAnalysisRequest,
): Promise<GraphAnalysisExecutionResult> {
  const registryEntry = getGraphDispatcherRegistryEntry(request.algorithm);
  const namedProjection = request.namedProjection;
  const projectionName = namedProjection ?? request.projectionName ?? PROJECTION_NAME;
  const relationshipTypes = namedProjection ? NAMED_PROJECTION_CANDIDATES[namedProjection] : undefined;

  if (registryEntry.dispatchKind === 'fail-closed') {
    return runSkippedAnalysis(
      request.algorithm,
      projectionName,
      0,
      0,
      registryEntry.skipReason ?? `Unsupported graph algorithm: ${request.algorithm}`,
    );
  }

  if (request.algorithm === 'pagerank') {
    if (request.engine === 'cugraph-rapids') {
      const result = await (await import('./cugraph-pagerank-adapter.js')).runCuGraphPageRankAnalysis(db, {
        maxIterations: request.maxIterations,
        dampingFactor: request.dampingFactor,
        limit: request.limit,
        sidecarUrl: request.sidecarUrl,
      });
      return { run: result.run, metricsWritten: result.metricsWritten, communitiesWritten: 0, unresolvedPacketKeys: result.unresolvedPacketKeys, excludedPacketKeys: result.excludedPacketKeys, skippedReason: result.skippedReason };
    }
    const result = await (await import('./pagerank-analysis-adapter.js')).runPageRankAnalysis(db, {
      maxIterations: request.maxIterations,
      dampingFactor: request.dampingFactor,
      limit: request.limit,
    });
    return { run: result.run, metricsWritten: result.metricsWritten, communitiesWritten: 0, unresolvedPacketKeys: result.unresolvedPacketKeys, excludedPacketKeys: result.excludedPacketKeys };
  }

  if (request.algorithm === 'louvain') {
    return runCommunityAnalysis('louvain', db, projectionName, relationshipTypes);
  }

  if (request.algorithm === 'leiden') {
    return runCommunityAnalysis('leiden', db, projectionName, relationshipTypes);
  }

  if (request.algorithm === 'cheirank') {
    const result = await (await import('./cheirank-analysis-adapter.js')).runCheiRankAnalysis(db, {
      maxIterations: request.maxIterations,
      dampingFactor: request.dampingFactor,
      limit: request.limit,
    });
    return { run: result.run, metricsWritten: result.metricsWritten, communitiesWritten: 0, unresolvedPacketKeys: result.unresolvedPacketKeys, excludedPacketKeys: result.excludedPacketKeys };
  }

  if (request.algorithm === 'kcore') {
    const result = await (await import('./kcore-analysis-adapter.js')).runKCoreAnalysis(db, {
      limit: request.limit,
    });
    return { run: result.run, metricsWritten: result.metricsWritten, communitiesWritten: 0, unresolvedPacketKeys: result.unresolvedPacketKeys, excludedPacketKeys: result.excludedPacketKeys };
  }

  if (request.algorithm === 'betweenness') {
    const result = await (await import('./betweenness-analysis-adapter.js')).runBetweennessAnalysis(db, {
      limit: request.limit,
    });
    return { run: result.run, metricsWritten: result.metricsWritten, communitiesWritten: 0, unresolvedPacketKeys: result.unresolvedPacketKeys, excludedPacketKeys: result.excludedPacketKeys };
  }

  return runSkippedAnalysis(request.algorithm, projectionName, 0, 0, `Unsupported graph algorithm: ${request.algorithm}`);
}
