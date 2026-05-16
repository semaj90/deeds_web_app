import { loadConfig, loadCodebaseGraph, loadRouteMap, loadClusterAliases, resolveRepoPath, writeJson, writeMarkdown, parentAtlasMarkdown, topEntries, workspaceForPath, fileLanguage, routeSummary, createProgressLogger } from './_atlas-utils.mjs';

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');

function sanitizePayload(payload) {
  const forbidden = ['hiddenThoughts', 'chainOfThought', 'kv_cache', 'tensor', 'cudaPointer'];
  for (const field of forbidden) {
    delete payload[field];
  }
  return payload;
}

const LIMIT = parseInt([...args].find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);
const WORKSPACE = [...args].find(a => a.startsWith('--workspace='))?.split('=')[1];
const RUN_ID = [...args].find(a => a.startsWith('--runId='))?.split('=')[1];
const PROGRESS_EVERY = parseInt([...args].find((arg) => String(arg).startsWith('--progress-every='))?.split('=')[1] ?? '100', 10);

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

let files = graph.files ?? [];

// Apply workspace filter
if (WORKSPACE) {
  console.log(`Filtering for workspace: ${WORKSPACE}`);
  files = files.filter(f => workspaceForPath(f.rel, config.workspaces) === WORKSPACE);
}

if (LIMIT > 0) {
  console.log(`Applying limit: ${LIMIT}`);
}

const payloads = [];
const clusterCounts = new Map();
const featureCounts = new Map();
const languageCounts = new Map();

for (const file of files) {
  const rel = file.rel ?? '';
  if (rel.endsWith('.d.ts')) continue;
  
  const lang = fileLanguage(rel);
  if (!['typescript', 'javascript', 'svelte', 'go', 'python'].includes(lang)) continue;

  const cluster = file.gpuCluster ?? file.gpu_cluster ?? file.clusterId ?? null;
  const featureKey = file.featureKey ?? file.feature_key ?? (rel.includes('/routes/') ? 'route.surface' : 'code.surface');
  
  const payload = sanitizePayload({ 
    repo: config.repoName, 
    workspace: workspaceForPath(rel, config.workspaces), 
    path: rel.replace(/\\/g, '/'), 
    language: lang, 
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
    runId: EFFECTIVE_RUN_ID
  });
  
  payloads.push(payload);
  if (cluster != null) clusterCounts.set(String(cluster), (clusterCounts.get(String(cluster)) ?? 0) + 1);
  featureCounts.set(featureKey, (featureCounts.get(featureKey) ?? 0) + 1);
  languageCounts.set(lang, (languageCounts.get(lang) ?? 0) + 1);
}

console.log(`Prepared ${payloads.length} payloads for potential patching.`);

if (WRITE) {
  const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
  const COLLECTION = 'codebase_chunks_768';
  console.log(`Connecting to Qdrant at ${QDRANT_URL} (collection: ${COLLECTION})...`);
  
  try {
    let patched = 0;
    let missesCount = 0;
    const writeBatch = LIMIT > 0 ? payloads.slice(0, LIMIT) : payloads;
    const progress = createProgressLogger({ label: 'qdrant-tag', total: writeBatch.length, every: PROGRESS_EVERY });
    const startAt = Date.now();
    
    for (let i = 0; i < writeBatch.length; i++) {
      const p = writeBatch[i];
      const workspaceRel = p.path.replace(/^[^\/]+\//, '');
      
      const filter = { 
        must: [
          { key: 'relativePath', match: { value: workspaceRel } }
        ]
      };

      const scrollRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter,
          limit: 100,
          with_payload: true
        })
      });
      
      const scrollData = await scrollRes.json();
      const points = scrollData.result?.points ?? [];
      
      if (points.length === 0) {
        if (missesCount < 5) {
          console.log(`  No points found for [${p.path}] (tried rel: ${workspaceRel})`);
          missesCount++;
        }
      } else {
        const pointIds = points.map(pt => pt.id);
        const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payload: p,
            points: pointIds
          })
        });
        
        if (res.ok) {
          patched++;
        } else {
          console.error(`  Failed to patch point(s) for ${p.path}:`, await res.text());
        }
      }
      progress(i + 1, { patched, misses: i + 1 - patched });
    }
    const elapsed = ((Date.now() - startAt) / 1000).toFixed(1);
    console.log(`Successfully patched ${patched} point sets in Qdrant in ${elapsed}s.`);
  } catch (err) {
    console.error('Qdrant patch failed:', err.message);
    process.exit(1);
  }
}

const report = { 
  repo: config.repoName, 
  runId: EFFECTIVE_RUN_ID,
  generatedAt: new Date().toISOString(), 
  dryRun: !WRITE, 
  workspace: WORKSPACE || 'all',
  limit: LIMIT,
  sourceGraph: config.sources.codebaseGraph, 
  routeCount: routeSummary(routeMap).total, 
  payloadCount: payloads.length, 
  clusterCounts: Object.fromEntries([...clusterCounts.entries()].sort((a, b) => b[1] - a[1])), 
  featureCounts: Object.fromEntries([...featureCounts.entries()].sort((a, b) => b[1] - a[1])), 
  languageCounts: Object.fromEntries([...languageCounts.entries()].sort((a, b) => b[1] - a[1])), 
  sample: payloads.slice(0, 25) 
};

writeJson(resolveRepoPath(config.outputs.qdrantReportJson), report);
writeMarkdown(resolveRepoPath(config.outputs.qdrantReportMd), parentAtlasMarkdown('Karpathy Batch Context Synthesis', { payloads: payloads.length, routes: report.routeCount, clusters: clusterCounts.size, runId: EFFECTIVE_RUN_ID }, topEntries(clusterCounts, 12).map(({ key, value }) => `${key}: ${value}`)));

console.log(`Qdrant payload atlas written to ${config.outputs.qdrantReportJson} [runId: ${EFFECTIVE_RUN_ID}]`);
if (!WRITE) console.log('Dry-run only. Pass --write to attempt downstream writes.');

process.exit(0);
