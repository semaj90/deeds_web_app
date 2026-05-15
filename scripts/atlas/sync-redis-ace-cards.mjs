import Redis from 'ioredis';
import { loadConfig, loadCodebaseGraph, loadRouteMap, loadClusterAliases, resolveRepoPath, writeJson, writeMarkdown, parentAtlasMarkdown, topEntries, workspaceForPath, routeSummary, scanKeys } from './_atlas-utils.mjs';

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');

function sanitizePayload(payload) {
  const forbidden = ['hiddenThoughts', 'chainOfThought', 'kv_cache', 'tensor', 'cudaPointer'];
  for (const field of forbidden) {
    delete payload[field];
  }
  return payload;
}

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

if (!graph) throw new Error(`Missing source graph: ${config.sources.codebaseGraph}`);

console.log(`Starting Redis ACE Sync [WRITE=${WRITE}] [runId=${EFFECTIVE_RUN_ID}]`);

let files = graph.files ?? [];

if (WORKSPACE) {
  console.log(`Filtering for workspace: ${WORKSPACE}`);
  files = files.filter(f => workspaceForPath(f.rel, config.workspaces) === WORKSPACE);
}

if (LIMIT > 0) {
  console.log(`Applying limit: ${LIMIT}`);
  files = files.slice(0, LIMIT);
}

const clusterCards = new Map();
const dirNotes = new Map();
const llmOutputs = new Map();
const summaryCards = new Map();

for (const file of files) {
  const dir = file.rel?.includes('/') ? file.rel.split('/').slice(0, -1).join('/') : '.';
  const cluster = file.gpuCluster ?? file.gpu_cluster ?? file.clusterId ?? null;
  const summaryKey = `summary:cluster:${cluster ?? 'none'}`;
  
  if (dir) dirNotes.set(dir, (dirNotes.get(dir) ?? 0) + 1);
  if (cluster != null) clusterCards.set(String(cluster), (clusterCards.get(String(cluster)) ?? 0) + 1);
  llmOutputs.set(file.rel, (llmOutputs.get(file.rel) ?? 0) + 1);
  summaryCards.set(summaryKey, (summaryCards.get(summaryKey) ?? 0) + 1);
}

if (WRITE) {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  console.log('Connecting to Redis for write...');
  
  try {
    const pipeline = redis.pipeline();
    for (const [dir, count] of dirNotes) {
      pipeline.hset(`wiki:note:dir:${dir}`, sanitizePayload({ count, runId: EFFECTIVE_RUN_ID, updatedAt: new Date().toISOString() }));
    }
    for (const [cluster, count] of clusterCards) {
      pipeline.hset(`ace:cluster:${cluster}`, sanitizePayload({ count, runId: EFFECTIVE_RUN_ID, updatedAt: new Date().toISOString() }));
    }
    for (const [path, count] of llmOutputs) {
      pipeline.hset(`code:llm_output:path:${path}`, sanitizePayload({ count, runId: EFFECTIVE_RUN_ID, updatedAt: new Date().toISOString() }));
    }
    for (const [key, count] of summaryCards) {
      pipeline.hset(key, sanitizePayload({ count, runId: EFFECTIVE_RUN_ID, updatedAt: new Date().toISOString() }));
    }
    
    await pipeline.exec();
    console.log(`Successfully wrote ${dirNotes.size + clusterCards.size + llmOutputs.size + summaryCards.size} cards to Redis.`);
    
    // Validation using scanKeys
    const sampleKeys = await scanKeys(redis, 'ace:cluster:*', 5);
    console.log(`Validation: Found ${sampleKeys.length} cluster keys using SCAN.`);
  } catch (err) {
    console.error('Redis write failed:', err);
    process.exit(1);
  } finally {
    redis.disconnect();
  }
}

const report = {
  repo: config.repoName,
  runId: EFFECTIVE_RUN_ID,
  generatedAt: new Date().toISOString(),
  dryRun: !WRITE,
  workspace: WORKSPACE || 'all',
  limit: LIMIT,
  routeCount: routeSummary(routeMap).total,
  cards: {
    dirNotes: dirNotes.size,
    clusterCards: clusterCards.size,
    llmOutputs: llmOutputs.size,
    summaryCards: summaryCards.size,
    engramMemories: 0
  },
  keys: {
    wikiNotes: 'wiki:note:dir:*',
    agents: 'agents:dir:*',
    llmOutputs: 'code:llm_output:path:*',
    summaries: 'summary:cluster:*',
    atlas: 'atlas:glyph:*',
    engram: 'engram:memory:*',
    engramFeature: 'engram:feature:*'
  },
  aliases: Object.keys(aliases ?? {}).length,
  topClusters: topEntries(clusterCards, 12)
};

writeJson(resolveRepoPath(config.outputs.redisReportJson), report);
writeMarkdown(resolveRepoPath(config.outputs.redisReportMd), parentAtlasMarkdown('Redis ACE Sync', { 
  cards: Object.values(report.cards).reduce((sum, value) => sum + value, 0), 
  routes: report.routeCount, 
  aliases: report.aliases,
  runId: EFFECTIVE_RUN_ID
}, report.topClusters.map(({ key, value }) => `${key}: ${value}`)));

console.log(`Redis ACE report written to ${config.outputs.redisReportJson} [runId: ${EFFECTIVE_RUN_ID}]`);
if (!WRITE) console.log('Dry-run complete. Add --write once Redis writes are enabled.');


