#!/usr/bin/env node
/**
 * Read-only structural audit for the existing Parent Atlas Neo4j/GDS graph.
 * No projection, community, or node-property mutation is performed.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv } from './connection-config.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const env = loadRepoEnv();
const outputPath = resolve(repoRoot, 'docs/reports/graph-structural-quality-v1.json');

const neo4jUrl = (env.NEO4J_HTTP_URL
  ?? (env.NEO4J_URL ?? env.NEO4J_URI ?? 'http://127.0.0.1:7474')
    .replace(/^bolt:\/\//i, 'http://')
    .replace(/^neo4j:\/\//i, 'http://')
    .replace(':7687', ':7474'));
const neo4jUser = env.NEO4J_USER ?? 'neo4j';
const neo4jPassword = env.NEO4J_PASSWORD ?? env.NEO4J_PASS ?? 'neo4j123';
const graphName = env.ATLAS_GDS_GRAPH_NAME ?? 'codeGraph';
const allowedRelationshipTypes = [
  'CALLS', 'REFERENCES', 'IMPORTS', 'EXPORTS', 'EXTENDS', 'IMPLEMENTS',
  'TESTS', 'TYPE_OF', 'DEFINES', 'DEPENDS_ON',
];

async function rows(statement, parameters = {}) {
  const response = await fetch(`${neo4jUrl}/db/neo4j/tx/commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${neo4jUser}:${neo4jPassword}`).toString('base64')}`,
    },
    body: JSON.stringify({ statements: [{ statement, parameters }] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Neo4j HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join('; '));
  const result = payload.results?.[0];
  return (result?.data ?? []).map((entry) => Object.fromEntries(
    (result.columns ?? []).map((column, index) => [column, entry.row[index]]),
  ));
}

const metricErrors = [];
async function readMetric(name, statement, parameters = {}) {
  try {
    const result = await rows(statement, parameters);
    return result[0] ?? {};
  } catch (error) {
    metricErrors.push({ name, error: String(error.message ?? error) });
    return {};
  }
}

const report = {
  schema: 'atlas.graph-structural-quality.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  canonicalAuthority: false,
  graphRevision: env.ATLAS_GRAPH_REVISION ?? null,
  projectionRevision: graphName,
  nodeCount: 0,
  relationshipCount: 0,
  weaklyConnectedComponentCount: 0,
  isolatedNodeCount: 0,
  largestComponentNodeCount: 0,
  averageDegree: 0,
  communityCount: 0,
  singletonCommunityCount: 0,
  modularity: null,
  allowedRelationshipTypes,
  communityPromotionEligible: false,
  reasonCodes: [],
  metricErrors,
};

try {
  const graph = await readMetric('graph.list', `
    CALL gds.graph.list($graphName)
    YIELD graphName, nodeCount, relationshipCount, configuration
    RETURN graphName, nodeCount, relationshipCount, configuration
  `, { graphName });
  report.nodeCount = Number(graph.nodeCount ?? 0);
  report.relationshipCount = Number(graph.relationshipCount ?? 0);

  const degree = await readMetric('degree', `
    CALL gds.degree.stream($graphName, { orientation: 'UNDIRECTED' })
    YIELD score
    RETURN count(*) AS nodeCount,
      sum(score) AS degreeSum,
      avg(score) AS averageDegree,
      percentileCont(score, 0.5) AS medianDegree,
      max(score) AS maxDegree,
      sum(CASE WHEN score = 0 THEN 1 ELSE 0 END) AS isolatedNodeCount
  `, { graphName });
  report.averageDegree = Number(degree.averageDegree ?? 0);
  report.isolatedNodeCount = Number(degree.isolatedNodeCount ?? 0);
  if (!report.nodeCount) report.nodeCount = Number(degree.nodeCount ?? 0);

  const wcc = await readMetric('wcc', `
    CALL gds.wcc.stream($graphName, { consecutiveIds: false })
    YIELD componentId
    WITH componentId, count(*) AS componentSize
    RETURN count(*) AS weaklyConnectedComponentCount,
      max(componentSize) AS largestComponentNodeCount,
      sum(CASE WHEN componentSize = 1 THEN 1 ELSE 0 END) AS singletonComponentCount
  `, { graphName });
  report.weaklyConnectedComponentCount = Number(wcc.weaklyConnectedComponentCount ?? 0);
  report.largestComponentNodeCount = Number(wcc.largestComponentNodeCount ?? 0);
  if (!report.isolatedNodeCount) report.isolatedNodeCount = Number(wcc.singletonComponentCount ?? 0);

  const communities = await readMetric('communityId', `
    MATCH (n:CodebaseFile)
    WHERE n.communityId IS NOT NULL
    WITH n.communityId AS communityId, count(*) AS communitySize
    RETURN count(*) AS communityCount,
      sum(CASE WHEN communitySize = 1 THEN 1 ELSE 0 END) AS singletonCommunityCount
  `);
  report.communityCount = Number(communities.communityCount ?? 0);
  report.singletonCommunityCount = Number(communities.singletonCommunityCount ?? 0);
} catch (error) {
  metricErrors.push({ name: 'connection', error: String(error.message ?? error) });
  report.reasonCodes.push('SOURCE_UNAVAILABLE');
}

const isolatedRatio = report.nodeCount ? report.isolatedNodeCount / report.nodeCount : 1;
const singletonCommunityRatio = report.communityCount
  ? report.singletonCommunityCount / report.communityCount : 0;
if (report.averageDegree < 1) report.reasonCodes.push('AVERAGE_DEGREE_TOO_LOW');
if (isolatedRatio > 0.25) report.reasonCodes.push('ISOLATED_NODE_RATIO_HIGH');
if (report.weaklyConnectedComponentCount > 1) report.reasonCodes.push('MULTIPLE_WEAK_COMPONENTS');
if (singletonCommunityRatio > 0.75) report.reasonCodes.push('COMMUNITY_SINGLETON_RATIO_HIGH');
if (report.communityCount && report.communityCount >= report.nodeCount * 0.75) {
  report.reasonCodes.push('COMMUNITY_COUNT_NEAR_NODE_COUNT');
}
if (report.nodeCount > 0 && report.largestComponentNodeCount === 0) {
  report.reasonCodes.push('LARGEST_COMPONENT_MISSING');
}
report.communityPromotionEligible = report.reasonCodes.length === 0;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, report }, null, 2));
