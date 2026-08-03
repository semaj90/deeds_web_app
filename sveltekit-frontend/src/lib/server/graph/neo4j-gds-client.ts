/**
 * neo4j-gds-client.ts — low-level Neo4j driver + GDS/APOC call layer.
 *
 * No orchestration, no business logic — just bolt-driver session handling
 * and the raw Cypher for projection lifecycle, PageRank mutate, top-authority
 * read, and bounded neighborhood expansion. graph-analytics-service.ts is the
 * only intended caller.
 */
import neo4j from 'neo4j-driver';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';

export const PROJECTION_NAME = 'codeTopology';

/**
 * Cypher clauses like LIMIT/topK require a Neo4j Integer, not a JS float —
 * the driver otherwise serializes whole numbers as e.g. `5.0` and Neo4j
 * rejects it. Apply to every params object passed to session.run() below.
 */
function toNeo4jParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      typeof value === 'number' && Number.isInteger(value) ? neo4j.int(value) : value,
    ]),
  );
}

const PROJECTION_NODE_LABELS = [
  'CodebaseFile',
  'ParentAtlasSource',
  'ParentAtlasFeature',
  'Packet',
  'SourceRef',
  'Feature',
  'Concept',
  'Trace',
  'Community',
  'Centroid',
  'Function',
  'InteractiveSession',
  'ToolDomain',
  'Inference',
  'Intent',
  'Tool',
] as const;

const PROJECTION_RELATIONSHIP_TYPES = [
  'IMPORTS',
  'CALLS',
  'CONTAINS',
  'HAS_CHUNK',
  'BELONGS_TO_CLUSTER',
  'REFERENCES',
  'SIMILAR_TOPOLOGY',
  'HAS_CENTROID',
  'BELONGS_TO_FEATURE',
] as const;

async function loadProjectionSchema(session: ReturnType<ReturnType<typeof getNeo4jDriver>['session']>) {
  const labelsRes = await session.run(`CALL db.labels() YIELD label RETURN collect(label) AS labels`);
  const relTypesRes = await session.run(`CALL db.relationshipTypes() YIELD relationshipType RETURN collect(relationshipType) AS relTypes`);
  const labels = new Set<string>((labelsRes.records[0]?.get('labels') ?? []) as string[]);
  const relTypes = new Set<string>((relTypesRes.records[0]?.get('relTypes') ?? []) as string[]);
  return { labels, relTypes };
}

export interface ProjectionResult {
  created: boolean;
  nodeCount: number;
  relationshipCount: number;
}

/** Idempotent named-graph projection lifecycle (create-if-absent, or force-refresh). */
export async function ensureProjectionClient(
  projectionName: string,
  force = false,
): Promise<ProjectionResult> {
  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    if (force) {
      try {
        await session.run(`CALL gds.graph.drop($name, false) YIELD graphName`, { name: projectionName });
      } catch {
        /* didn't exist, fine */
      }
    }

    const existsResult = await session.run(
      `CALL gds.graph.exists($name) YIELD exists RETURN exists`,
      { name: projectionName },
    );
    const exists = existsResult.records[0]?.get('exists') ?? false;
    if (exists && !force) {
      const infoResult = await session.run(
        `CALL gds.graph.list($name) YIELD nodeCount, relationshipCount RETURN nodeCount, relationshipCount`,
        { name: projectionName },
      );
      const rec = infoResult.records[0];
      return {
        created: false,
        nodeCount: rec?.get('nodeCount') ?? 0,
        relationshipCount: rec?.get('relationshipCount') ?? 0,
      };
    }

    const schema = await loadProjectionSchema(session);
    const nodeLabels = PROJECTION_NODE_LABELS.filter((label) => schema.labels.has(label));
    const relationshipTypes = PROJECTION_RELATIONSHIP_TYPES.filter((type) => schema.relTypes.has(type));
    if (!nodeLabels.length) {
      throw new Error(`No projection node labels exist in Neo4j. Expected one of: ${PROJECTION_NODE_LABELS.join(', ')}`);
    }
    if (!relationshipTypes.length) {
      throw new Error(`No projection relationship types exist in Neo4j. Expected one of: ${PROJECTION_RELATIONSHIP_TYPES.join(', ')}`);
    }

    const costForType = (type: string): number =>
      type === 'HAS_CENTROID' || type === 'BELONGS_TO_FEATURE'
        ? 0.1
        : type === 'CONTAINS'
          ? 0.25
          : type === 'HAS_CHUNK'
            ? 0.2
            : type === 'BELONGS_TO_CLUSTER'
              ? 0.3
              : type === 'REFERENCES'
                ? 0.35
                : type === 'SIMILAR_TOPOLOGY'
                  ? 0.4
                  : 0.15;

    // gds.graph.project's native (non-Cypher) projection requires the named
    // relationship property to actually exist on at least one relationship
    // of that type — it fails with "Relationship properties not found"
    // rather than silently applying `defaultValue` to every relationship
    // when the property is entirely absent. Self-heal: backfill `cost` on
    // any relationship that doesn't already carry one, idempotently
    // (coalesce never overwrites a real, previously-set value).
    for (const type of relationshipTypes) {
      await session.run(
        `MATCH ()-[r:${type}]->() WHERE r.cost IS NULL SET r.cost = $cost`,
        { cost: costForType(type) },
      );
    }

    const relationshipProjection = relationshipTypes
      .map((type) => {
        const orientation =
          type === 'BELONGS_TO_CLUSTER' || type === 'SIMILAR_TOPOLOGY' || type === 'HAS_CENTROID' || type === 'BELONGS_TO_FEATURE'
            ? 'UNDIRECTED'
            : 'NATURAL';
        const cost = costForType(type);
        return `          ${type}: { orientation: '${orientation}', properties: { cost: { property: 'cost', defaultValue: ${cost} } } }`;
      })
      .join(',\n');

    const result = await session.run(
      `
      CALL gds.graph.project(
        $name,
        ${JSON.stringify(nodeLabels)},
        {
${relationshipProjection}
        }
      )
      YIELD nodeCount, relationshipCount
    `,
      { name: projectionName },
    );

    const rec = result.records[0];
    return {
      created: true,
      nodeCount: rec?.get('nodeCount') ?? 0,
      relationshipCount: rec?.get('relationshipCount') ?? 0,
    };
  } finally {
    await session.close();
  }
}

export interface PageRankMutateResult {
  nodesUpdated: number;
  durationMs: number;
}

/** Runs gds.pageRank.mutate against a projection and writes scores back to live nodes. */
export async function runPageRankClient(
  projectionName: string,
  options: { maxIterations?: number; dampingFactor?: number; mutateProperty?: string } = {},
): Promise<PageRankMutateResult> {
  // 'pageRankScore' is the property production code actually reads — see the
  // matching comment in graph-analytics-service.ts's getTopPageRank() (GS1.35).
  const { maxIterations = 20, dampingFactor = 0.85, mutateProperty = 'pageRankScore' } = options;
  const driver = getNeo4jDriver();
  const session = driver.session();
  const t0 = Date.now();

  try {
    await session.run(
      `
      CALL gds.pageRank.mutate($name, {
        maxIterations: $maxIterations,
        dampingFactor: $dampingFactor,
        mutateProperty: $mutateProperty
      })
    `,
      toNeo4jParams({ name: projectionName, maxIterations, dampingFactor, mutateProperty }),
    );

    const writeResult = await session.run(
      `
      CALL gds.graph.nodeProperties.write($name, [$mutateProperty])
      YIELD propertiesWritten
      RETURN propertiesWritten
    `,
      { name: projectionName, mutateProperty },
    );

    const nodesUpdated = writeResult.records[0]?.get('propertiesWritten') ?? 0;
    return { nodesUpdated, durationMs: Date.now() - t0 };
  } finally {
    await session.close();
  }
}

export interface AuthorityNodeClient {
  labels: string[];
  stableKey: string;
  path?: string;
  graphPageRank: number;
  louvainCommunity?: number;
}

/** Reads the top-N nodes by a written PageRank property, optionally filtered by label. */
export async function getTopPageRankClient(
  limit: number,
  nodeType?: string,
  scoreProperty = 'pageRankScore',
): Promise<AuthorityNodeClient[]> {
  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    const label = nodeType ? `:${nodeType}` : '';
    const result = await session.run(
      `
      MATCH (n${label})
      WHERE n.${scoreProperty} IS NOT NULL
      RETURN labels(n) AS labels,
             coalesce(n.stableKey, n.filePath, n.relativePath, n.path, n.name) AS stableKey,
             n.path AS path,
             n.${scoreProperty} AS graphPageRank,
             n.louvainCommunity AS louvainCommunity
      ORDER BY n.${scoreProperty} DESC
      LIMIT $limit
    `,
      toNeo4jParams({ limit }),
    );

    return result.records.map((r) => ({
      labels: r.get('labels') as string[],
      stableKey: r.get('stableKey') as string,
      path: r.get('path') as string | undefined,
      graphPageRank: r.get('graphPageRank') as number,
      louvainCommunity: r.get('louvainCommunity') as number | undefined,
    }));
  } finally {
    await session.close();
  }
}

export interface ExpandGraphNodeClient {
  labels: string[];
  stableKey: string;
  path?: string;
  distance: number;
}

/** Bounded k-hop neighborhood expansion from a seed node, via APOC when available. */
export async function expandGraphClient(
  stableKey: string,
  maxDepth: number,
  limit: number,
): Promise<{ nodes: ExpandGraphNodeClient[]; apocUsed: boolean }> {
  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    const apocRes = await session.run(`RETURN apoc.version() AS v`).catch(() => null);
    const apocAvailable = !!apocRes;

    if (apocAvailable) {
      const result = await session.run(
        `
        MATCH (start {stableKey: $stableKey})
        CALL apoc.path.subgraphNodes(start, {
          maxLevel: $maxDepth,
          limit: $limit
        })
        YIELD node
        WHERE node <> start AND node.stableKey IS NOT NULL
        WITH node,
             length(shortestPath((start)-[*]-(node))) AS distance
        RETURN labels(node) AS labels,
               node.stableKey   AS stableKey,
               node.path        AS path,
               distance
        ORDER BY distance ASC
        LIMIT $limit
      `,
        toNeo4jParams({ stableKey, maxDepth, limit }),
      );

      return {
        apocUsed: true,
        nodes: result.records.map((r) => ({
          labels: r.get('labels') as string[],
          stableKey: r.get('stableKey') as string,
          path: r.get('path') as string | undefined,
          distance: r.get('distance') as number,
        })),
      };
    }

    const result = await session.run(
      `
      MATCH (start {stableKey: $stableKey})
      MATCH p = (start)-[*1..${maxDepth}]-(n)
      WHERE n.stableKey IS NOT NULL AND n <> start
      WITH n, min(length(p)) AS distance
      RETURN labels(n) AS labels,
             n.stableKey AS stableKey,
             n.path      AS path,
             distance
      ORDER BY distance ASC
      LIMIT $limit
    `,
      toNeo4jParams({ stableKey, limit }),
    );

    return {
      apocUsed: false,
      nodes: result.records.map((r) => ({
        labels: r.get('labels') as string[],
        stableKey: r.get('stableKey') as string,
        path: r.get('path') as string | undefined,
        distance: r.get('distance') as number,
      })),
    };
  } finally {
    await session.close();
  }
}
