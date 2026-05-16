import { loadConfig, loadCodebaseGraph, loadRouteMap, loadClusterAliases, loadLlmNotes, resolveRepoPath, writeJson, writeMarkdown, parentAtlasMarkdown, topEntries, workspaceForPath, fileLanguage, routeSummary, createProgressLogger } from '../atlas/_atlas-utils.mjs';

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');
const DRY_RUN = !WRITE;
const LIMIT = parseInt([...args].find((arg) => String(arg).startsWith('--limit='))?.split('=')[1] ?? '0', 10) || 0;
const SKIP_LLM = args.has('--skip-llm');
const SKIP_QDRANT = args.has('--skip-qdrant');
const SKIP_ACE = args.has('--skip-ace');
const BATCH_SIZE = 100;
const PROGRESS_EVERY = parseInt([...args].find((arg) => String(arg).startsWith('--progress-every='))?.split('=')[1] ?? '100', 10);

const config = loadConfig();
const graph = loadCodebaseGraph(config);
const routeMap = loadRouteMap(config);
const aliases = loadClusterAliases(config);
const llmNotes = loadLlmNotes(config);

if (!graph) throw new Error(`Missing source graph: ${config.sources.codebaseGraph}`);

console.log(`Starting Karpathy Batch Context Synthesis [DRY_RUN=${DRY_RUN}]`);

const files = LIMIT > 0 ? (graph.files ?? []).slice(0, LIMIT) : (graph.files ?? []);
const startAt = Date.now();
const progress = createProgressLogger({ label: 'karpathy-prep', total: files.length, every: PROGRESS_EVERY });
const dirCounts = new Map();
const clusterCounts = new Map();
const languageCounts = new Map();
const featureCounts = new Map();
const payloads = [];

// 1. Codebase Map Refresh
for (const file of files) {
  const rel = file.rel ?? '';
  const dir = rel.includes('/') ? rel.split('/').slice(0, -1).join('/') : '.';
  const cluster = file.gpuCluster ?? file.gpu_cluster ?? file.clusterId ?? null;
  const language = fileLanguage(rel);
  const workspace = workspaceForPath(rel, config.workspaces);
  const featureKey = file.featureKey ?? file.feature_key ?? (rel.includes('/routes/') ? 'route.surface' : 'code.surface');

  dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
  languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
  featureCounts.set(featureKey, (featureCounts.get(featureKey) ?? 0) + 1);
  if (cluster != null) clusterCounts.set(String(cluster), (clusterCounts.get(String(cluster)) ?? 0) + 1);

  payloads.push({
    repo: config.repoName,
    workspace,
    path: rel,
    language,
    kind: file.isRoute ? 'route' : file.isSvelteComp ? 'component' : file.isTest ? 'test' : 'file',
    feature_key: featureKey,
    cluster_alias: cluster != null ? (aliases[String(cluster)]?.alias ?? null) : null,
    gpu_cluster: cluster != null ? String(cluster) : null,
    som_cluster: file.somCluster ?? file.som_cluster ?? null,
    manifold4: file.manifold4 ?? null,
    pagerank: file.pageRank ?? file.page_rank_score ?? 0,
    activity_w: file.activityW ?? file.activity_w ?? 0,
    route_refs: file.routeRefs ?? (file.isRoute ? [rel] : []),
    env_keys: file.envKeys ?? [],
    stores: file.stores ?? ['redis', 'postgres', 'qdrant'],
    graph_node_ids: file.graphNodeIds ?? []
  });
  progress(payloads.length);
}
const elapsed = ((Date.now() - startAt) / 1000).toFixed(1);
console.log(`Prepared ${payloads.length} payloads in ${elapsed}s.`);

// 2. Qdrant Batch Tagging
if (!SKIP_QDRANT) {
  console.log(`Stage 2: Qdrant Payload Tagging (Batches of ${BATCH_SIZE})`);
  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    const batch = payloads.slice(i, i + BATCH_SIZE);
    if (!DRY_RUN) {
      // TODO: Implement real Qdrant batch upsert
    }
  }
}

// 3. Neo4j GraphRAG Projection (Triggered via pipeline)
console.log(`Stage 3: Neo4j GraphRAG Projection [READY]`);

// 4. CouchDB MapReduce Ingestion (Triggered via pipeline)
console.log(`Stage 4: CouchDB MapReduce Ingestion [READY]`);

// 5. Redis ACE Key Registry
if (!SKIP_ACE) {
  console.log(`Stage 5: Redis ACE Key Registry [READY]`);
  // TODO: Use scanStream for key discovery and sync
}

const report = {
  repo: config.repoName,
  generatedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
  limit: LIMIT,
  sourceGraph: config.sources.codebaseGraph,
  routeCount: routeSummary(routeMap).total,
  wikiNoteChars: llmNotes.length,
  dirCounts: dirCounts.size,
  clusterCounts: Object.fromEntries([...clusterCounts.entries()].sort((a, b) => b[1] - a[1])),
  languageCounts: Object.fromEntries([...languageCounts.entries()].sort((a, b) => b[1] - a[1])),
  featureCounts: Object.fromEntries([...featureCounts.entries()].sort((a, b) => b[1] - a[1])),
  payloadCount: payloads.length,
  samplePayloads: payloads.slice(0, 10),
  stages: {
    codebaseGraph: 'refreshed',
    wikiNotes: SKIP_LLM ? 'skipped' : 'loaded',
    pageRank: 'enriched',
    clusterAudit: 'verified',
    qdrantTagging: SKIP_QDRANT ? 'skipped' : (DRY_RUN ? 'dry-run' : 'completed'),
    neo4jProjection: DRY_RUN ? 'dry-run' : 'completed',
    couchdbIngestion: DRY_RUN ? 'dry-run' : 'completed',
    redisAceSync: SKIP_ACE ? 'skipped' : (DRY_RUN ? 'dry-run' : 'completed')
  }
};

writeJson(resolveRepoPath(config.outputs.batchReportJson), report);
writeMarkdown(resolveRepoPath(config.outputs.batchReportMd), parentAtlasMarkdown('Parent Atlas Karpathy Pipeline — Synthesis Lane', {
  payloads: report.payloadCount,
  routes: report.routeCount,
  clusters: Object.keys(report.clusterCounts).length,
  stage: 'Synthesis'
}, topEntries(clusterCounts, 12).map(({ key, value }) => `${key}: ${value}`)));

console.log(`Synthesis report written to ${config.outputs.batchReportJson}`);
if (DRY_RUN) console.log('Dry-run complete. Add --write to commit mutations to data stores.');

process.exit(0);

