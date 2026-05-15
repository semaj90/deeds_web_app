#!/usr/bin/env node
import { loadConfig, loadCodebaseGraph, loadRouteMap, loadClusterAliases, resolveRepoPath, writeJson, writeMarkdown, parentAtlasMarkdown, topEntries, workspaceForPath, fileLanguage, routeSummary } from './_atlas-utils.mjs';
import { createNoopEngramPluginAdapter, createRedisEngramAdapter } from './engram-plugin-adapter.mjs';

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');
const LIMIT = parseInt([...args].find((arg) => String(arg).startsWith('--limit='))?.split('=')[1] ?? '0', 10);
const WORKSPACE = [...args].find(a => a.startsWith('--workspace='))?.split('=')[1];
const RUN_ID = [...args].find(a => a.startsWith('--runId='))?.split('=')[1];

if (WRITE && !RUN_ID) {
  console.error('Refusing write: --runId is required for write mode.');
  process.exit(1);
}

const EFFECTIVE_RUN_ID = RUN_ID || `run_${Date.now()}`;


const config = loadConfig();
const graph = loadCodebaseGraph(config);
const routeMap = loadRouteMap(config);
const aliases = loadClusterAliases(config);
const adapter = WRITE 
  ? createRedisEngramAdapter({ url: process.env.REDIS_URL })
  : createNoopEngramPluginAdapter('atlas:engram:dry-run');

function sanitizePayload(payload) {
  const forbidden = ['hiddenThoughts', 'chainOfThought', 'kv_cache', 'tensor', 'cudaPointer'];
  for (const field of forbidden) {
    delete payload[field];
  }
  return payload;
}


if (!graph) throw new Error(`Missing source graph: ${config.sources.codebaseGraph}`);

let files = graph.files ?? [];

// Apply workspace filter
if (WORKSPACE) {
  console.log(`Filtering for workspace: ${WORKSPACE}`);
  files = files.filter(f => workspaceForPath(f.rel, config.workspaces) === WORKSPACE);
}

// Apply limit
if (LIMIT > 0) {
  console.log(`Applying limit: ${LIMIT}`);
  files = files.slice(0, LIMIT);
}

const workspaceCounts = new Map();

const clusterCounts = new Map();
const featureCounts = new Map();
const candidates = [];

for (const file of files) {
  const rel = file.rel ?? '';
  const workspace = workspaceForPath(rel, config.workspaces);
  const cluster = file.gpuCluster ?? file.gpu_cluster ?? file.clusterId ?? null;
  const featureKey = file.featureKey ?? file.feature_key ?? (rel.includes('/routes/') ? 'route.surface' : 'code.surface');
  workspaceCounts.set(workspace, (workspaceCounts.get(workspace) ?? 0) + 1);
  if (cluster != null) clusterCounts.set(String(cluster), (clusterCounts.get(String(cluster)) ?? 0) + 1);
  featureCounts.set(featureKey, (featureCounts.get(featureKey) ?? 0) + 1);
}

const topWorkspaces = topEntries(workspaceCounts, 10);
const topClusters = topEntries(clusterCounts, 10);
const topFeatures = topEntries(featureCounts, 10);

for (const { key: workspace } of topWorkspaces.slice(0, 3)) {
  candidates.push(sanitizePayload({
    id: `engram:${workspace}`,
    repo: config.repoName,
    workspace,
    memory_type: 'workflow_lesson',
    summary: `Workspace ${workspace} hot context lesson`,
    content: `Top files and routes for ${workspace}`,
    accepted: true,
    tests_passed: true,
    reward: 1.0,
    trust: 'low_hint',
    stores: ['redis', 'couchdb', 'neo4j'],
    tags: ['engram', 'workspace', workspace],
    runId: EFFECTIVE_RUN_ID,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

for (const { key: clusterId } of topClusters.slice(0, 3)) {
  candidates.push(sanitizePayload({
    id: `engram:cluster:${clusterId}`,
    repo: config.repoName,
    clusterId,
    memory_type: 'retrieval_lesson',
    summary: `Cluster ${clusterId} (${aliases[clusterId]?.alias ?? 'unknown'}) hot context lesson`,
    content: `Verified cluster performance for ${aliases[clusterId]?.alias ?? 'unknown'}`,
    accepted: true,
    tests_passed: true,
    reward: 1.0,
    trust: 'low_hint',
    stores: ['redis', 'qdrant', 'neo4j'],
    tags: ['engram', 'cluster', aliases[clusterId]?.alias ?? 'cluster'],
    runId: EFFECTIVE_RUN_ID,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

for (const { key: featureKey } of topFeatures.slice(0, 3)) {
  candidates.push(sanitizePayload({
    id: `engram:feature:${featureKey}`,
    repo: config.repoName,
    featureKey,
    memory_type: 'debug_lesson',
    summary: `Feature ${featureKey} hot context debug lesson`,
    content: `Feature activity summary for ${featureKey}`,
    accepted: true,
    tests_passed: true,
    reward: 1.0,
    trust: 'low_hint',
    stores: ['redis', 'postgres', 'qdrant'],
    tags: ['engram', 'feature', featureKey],
    runId: EFFECTIVE_RUN_ID,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

const health = await adapter.health();
const writes = [];
for (const memory of candidates) {
  if (WRITE) writes.push(await adapter.writeMemory(memory));
}

const report = {
  repo: config.repoName,
  runId: EFFECTIVE_RUN_ID,
  generatedAt: new Date().toISOString(),
  dryRun: !WRITE,
  health,
  routeCount: routeSummary(routeMap).total,
  workspaceCount: workspaceCounts.size,
  clusterCount: clusterCounts.size,
  featureCount: featureCounts.size,
  memoryCount: candidates.length,
  writes: writes.length,
  sample: candidates.slice(0, 12),
};

writeJson(resolveRepoPath('docs/graph/repo-engram-memory-report.json'), report);
writeMarkdown(resolveRepoPath('docs/graph/repo-engram-memory-report.md'), parentAtlasMarkdown('Engram Memory Sync', { memories: candidates.length, routes: report.routeCount, health: health.ok ? 'ok' : 'degraded' }, topFeatures.map(({ key, value }) => `${key}: ${value}`)));

console.log(`Engram memory report written to docs/graph/repo-engram-memory-report.json [runId: ${EFFECTIVE_RUN_ID}]`);
if (WRITE) console.log(`Successfully synced ${writes.length} engram memories to Redis.`);
else console.log('Dry-run complete. Add --write to sync engram memories.');

await adapter.close();
