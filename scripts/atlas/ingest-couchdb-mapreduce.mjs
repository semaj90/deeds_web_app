import pg from 'pg';
import {
  loadConfig,
  loadRouteMap,
  loadClusterAliases,
  createProgressLogger,
  resolveRepoPath,
  writeJson,
  writeMarkdown,
  parentAtlasMarkdown,
  routeSummary,
  workspaceForPath,
  loadCodebaseGraph,
  fileLanguage
} from './_atlas-utils.mjs';

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
const PROGRESS_EVERY = parseInt([...args].find((arg) => String(arg).startsWith('--progress-every='))?.split('=')[1] ?? '100', 10);

if (WRITE && !RUN_ID) {
  console.error('Refusing write: --runId is required for write mode.');
  process.exit(1);
}

const EFFECTIVE_RUN_ID = RUN_ID || `run_${Date.now()}`;

const config = loadConfig();
const routeMap = loadRouteMap(config);
const aliases = loadClusterAliases(config);

console.log(`Starting CouchDB MapReduce Ingestion [WRITE=${WRITE}] [runId=${EFFECTIVE_RUN_ID}]`);

if (WRITE) {
  const rawUrl = process.env.COUCHDB_URL || 'http://admin:deeds123@localhost:5984';
  const urlMatch = rawUrl.match(/^https?:\/\/([^:]+):([^@]+)@(.+)$/);
  const [, COUCH_USER, COUCH_PASS, COUCH_HOST] = urlMatch ?? ['', 'admin', 'deeds123', 'localhost:5984'];
  const BASE = `http://${COUCH_HOST}`;
  const AUTH = 'Basic ' + Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64');
  
  console.log(`Connecting to CouchDB at ${BASE}...`);
  try {
    const ping = await fetch(`${BASE}/`, { headers: { Authorization: AUTH } });
    if (!ping.ok) throw new Error('CouchDB unreachable');
  } catch (err) {
    console.error('CouchDB connection failed:', err.message);
    process.exit(1);
  }
}

// Query Postgres for authoritative lineage
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
let files = [];
try {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const { rows } = await pool.query(`
    SELECT 
      pad.source_ref, 
      pad.rel_path, 
      pad.feature_id, 
      pad.line_count,
      pad.is_route, 
      pad.is_svelte_comp, 
      pad.has_zod, 
      pad.drizzle_refs, 
      pad.imports, 
      pad.exports, 
      pad.qdrant_point_id, 
      pad.related_feature_ids,
      afm.cluster_id, 
      afm.centroid_id, 
      afm.som_cluster,
      afm.nes_card_id,
      afm.lane_ids,
      afm.atlas_version
    FROM parent_atlas_documents pad
    LEFT JOIN atlas_feature_map afm ON afm.source_ref = pad.source_ref;
  `);
  await pool.end();
  files = rows.map(r => ({
    rel: r.rel_path || r.source_ref,
    source_ref: r.source_ref,
    source_id: r.source_ref,
    feature_id: r.feature_id || 'feature.unknown',
    featureKey: r.feature_id || 'feature.unknown',
    line_count: r.line_count,
    is_route: r.is_route,
    is_svelte_comp: r.is_svelte_comp,
    has_zod: r.has_zod,
    drizzle_refs: r.drizzle_refs,
    imports: r.imports,
    exports: r.exports,
    qdrant_point_id: r.qdrant_point_id,
    related_feature_ids: r.related_feature_ids,
    cluster_id: r.cluster_id,
    centroid_id: r.centroid_id,
    som_cluster: r.som_cluster,
    gpu_cluster: r.cluster_id,
    nes_card_id: r.nes_card_id,
    lane_ids: r.lane_ids,
    atlas_version: r.atlas_version || 1
  }));
  console.log(`Loaded ${files.length} documents from Postgres.`);
} catch (err) {
  console.warn(`Postgres query failed, falling back to codebase-graph.json: ${err.message}`);
  const graph = loadCodebaseGraph(config);
  files = (graph?.files ?? []).map(f => ({
    rel: f.rel,
    source_ref: f.rel,
    source_id: f.rel,
    feature_id: f.featureKey || 'feature.unknown',
    featureKey: f.featureKey || 'feature.unknown',
    cluster_id: f.gpuCluster || f.clusterId,
    gpu_cluster: f.gpuCluster || f.clusterId,
    som_cluster: f.som_cluster || (f.somRow != null ? `${f.somRow}:${f.somCol}` : null),
    centroid_id: f.centroidId,
    atlas_version: 1
  }));
}

// Remove feature:* source_refs from physical file mapping lists
files = files.filter(f => f.source_ref && !f.source_ref.startsWith('feature:'));

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

const directoryDocs = new Map();
const clusterDocs = new Map();
const featureDocs = new Map();
const sourceDocs = new Map();

for (const file of files) {
  const rel = file.rel ?? '';
  const dir = rel.includes('/') ? rel.split('/').slice(0, -1).join('/') : '.';
  const clusterId = file.gpuCluster ?? file.gpu_cluster ?? file.clusterId ?? null;
  const featureKey = file.featureKey ?? file.feature_key ?? 'feature.unknown';

  if (!directoryDocs.has(dir)) {
    directoryDocs.set(dir, sanitizePayload({
      _id: `wiki:dir:${dir}`,
      type: 'directory_wiki',
      source_id: `dir:${dir}`,
      source_ref: `dir:${dir}`,
      source_kind: 'directory',
      file_path: null,
      rel_path: dir,
      feature_id: null,
      related_feature_ids: [],
      atlas_version: config.atlasVersion || '1',
      cold_storage_ready: true,
      workspace: workspaceForPath(rel, config.workspaces),
      path: dir,
      summary: '',
      clusters: new Set(),
      topFiles: [],
      tags: new Set(),
      pageRankAvg: 0,
      runId: EFFECTIVE_RUN_ID,
      updatedAt: new Date().toISOString()
    }));
  }
  const doc = directoryDocs.get(dir);
  doc.topFiles.push(rel);
  doc.pageRankAvg += file.pageRank ?? file.page_rank_score ?? 0;
  if (clusterId != null) doc.clusters.add(String(clusterId));
  doc.tags.add(featureKey);

  if (clusterId != null) {
    if (!clusterDocs.has(String(clusterId))) {
      clusterDocs.set(String(clusterId), sanitizePayload({
        _id: `cluster:${clusterId}`,
        type: 'cluster_summary',
        source_id: `cluster:${clusterId}`,
        source_ref: `cluster:${clusterId}`,
        source_kind: 'cluster',
        file_path: null,
        rel_path: null,
        feature_id: null,
        related_feature_ids: [],
        atlas_version: config.atlasVersion || '1',
        cold_storage_ready: true,
        clusterId: String(clusterId),
        alias: aliases[String(clusterId)]?.alias ?? null,
        summary: '',
        dirs: new Set(),
        topTags: new Set(),
        runId: EFFECTIVE_RUN_ID
      }));
    }
    const clusterDoc = clusterDocs.get(String(clusterId));
    clusterDoc.dirs.add(dir);
    clusterDoc.topTags.add(featureKey);
  }

  if (!featureDocs.has(featureKey)) {
    featureDocs.set(featureKey, sanitizePayload({
      _id: `feature:${featureKey}`,
      type: 'feature_card',
      source_id: `feature:${featureKey}`,
      source_ref: `feature:${featureKey}`,
      source_kind: 'feature',
      file_path: null,          // feature cards never have a file_path
      rel_path: null,
      feature_id: featureKey,
      related_feature_ids: [],
      atlas_version: config.atlasVersion || '1',
      cold_storage_ready: true,
      featureKey,
      summary: '',
      routes: new Set(),
      files: new Set(),
      clusters: new Set(),
      runId: EFFECTIVE_RUN_ID
    }));
  }
  const featureDoc = featureDocs.get(featureKey);
  featureDoc.files.add(rel);
  if (clusterId != null) featureDoc.clusters.add(String(clusterId));

  const sourceKind = file.is_route ? 'route' : (file.is_svelte_comp ? 'component' : fileLanguage(rel));
  const sourceCard = sanitizePayload({
    _id: `source:${file.source_ref}`,
    type: 'source_card',
    source_id: file.source_id,
    source_ref: file.source_ref,
    feature_id: file.feature_id,
    related_feature_ids: file.related_feature_ids || [],
    rel_path: rel,
    file_path: rel,
    source_kind: sourceKind,
    atlas_version: file.atlas_version,
    cold_storage_ready: true,
    line_count: file.line_count || 0,
    has_zod: !!file.has_zod,
    drizzle_refs: file.drizzle_refs || [],
    imports: file.imports || [],
    exports: file.exports || [],
    qdrant_point_id: file.qdrant_point_id,
    cluster_id: clusterId ? String(clusterId) : null,
    centroid_id: file.centroid_id,
    som_cluster: file.som_cluster,
    lane_ids: file.lane_ids || [],
    runId: EFFECTIVE_RUN_ID,
    updatedAt: new Date().toISOString()
  });
  sourceDocs.set(file.source_ref, sourceCard);
}

const docs = [
  ...[...directoryDocs.values()].map((doc) => ({
    ...doc,
    clusters: [...doc.clusters],
    topFiles: doc.topFiles.slice(0, 5),
    tags: [...doc.tags],
    pageRankAvg: Number((doc.pageRankAvg / Math.max(doc.topFiles.length, 1)).toFixed(4))
  })),
  ...[...clusterDocs.values()].map((doc) => ({
    ...doc,
    dirs: [...doc.dirs],
    topTags: [...doc.topTags]
  })),
  ...[...featureDocs.values()].map((doc) => ({
    ...doc,
    routes: [...doc.routes],
    files: [...doc.files].slice(0, 8),
    clusters: [...doc.clusters]
  })),
  ...[...sourceDocs.values()]
];

if (WRITE) {
  const rawUrl = process.env.COUCHDB_URL || 'http://admin:deeds123@localhost:5984';
  const urlMatch = rawUrl.match(/^https?:\/\/([^:]+):([^@]+)@(.+)$/);
  const [, COUCH_USER, COUCH_PASS, COUCH_HOST] = urlMatch ?? ['', 'admin', 'deeds123', 'localhost:5984'];
  const BASE = `http://${COUCH_HOST}`;
  const AUTH = 'Basic ' + Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64');
  
  const allDocs = [
    ...directoryDocs.values(),
    ...clusterDocs.values(),
    ...featureDocs.values(),
    ...sourceDocs.values()
  ].map(d => {
    // Handle Set conversion to Array for JSON
    const cloned = { ...d };
    for (const k of Object.keys(cloned)) {
      if (cloned[k] instanceof Set) cloned[k] = [...cloned[k]];
    }
    return cloned;
  });

    const startAt = Date.now();
    console.log(`Writing ${allDocs.length} documents to CouchDB (db: wiki_cards) in batches of ${PROGRESS_EVERY}...`);
    const progress = createProgressLogger({ label: 'couchdb-ingest', total: allDocs.length, every: PROGRESS_EVERY });
    
    for (let i = 0; i < allDocs.length; i += PROGRESS_EVERY) {
      const batch = allDocs.slice(i, i + PROGRESS_EVERY);
      const res = await fetch(`${BASE}/wiki_cards/_bulk_docs`, {
        method: 'POST',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ docs: batch })
      });
      
      if (!res.ok) {
        const errJson = await res.json();
        console.error(`CouchDB bulk write batch ${i} failed:`, errJson);
        process.exit(1);
      }
      progress(Math.min(i + PROGRESS_EVERY, allDocs.length));
    }
    
    const elapsed = ((Date.now() - startAt) / 1000).toFixed(1);
    console.log(`Successfully wrote ${allDocs.length} documents to CouchDB in ${elapsed}s.`);
}

const report = {
  repo: config.repoName,
  runId: EFFECTIVE_RUN_ID,
  generatedAt: new Date().toISOString(),
  dryRun: !WRITE,
  workspace: WORKSPACE || 'all',
  limit: LIMIT,
  docs: docs.length,
  docCounts: {
    directory_wiki: directoryDocs.size,
    cluster_summary: clusterDocs.size,
    feature_card: featureDocs.size,
    source_card: sourceDocs.size,
    engram_memory: 0
  },
  views: [
    'by_type', 'by_workspace', 'by_cluster', 'by_feature', 'by_route', 'by_tag', 'by_updated_at',
    'by_engram_memory_type', 'by_engram_feature', 'by_engram_reward', 'stale_docs'
  ],
  routeCount: routeSummary(routeMap).total,
  sample: docs.slice(0, 25)
};

writeJson(resolveRepoPath(config.outputs.couchdbReportJson), report);
writeJson(resolveRepoPath('.tmp/couchdb-mapreduce-reingest-report.json'), report);
writeJson(resolveRepoPath('.tmp/parent-atlas-reingest-report.json'), report);
writeMarkdown(resolveRepoPath(config.outputs.couchdbReportMd), parentAtlasMarkdown('CouchDB MapReduce Ingestion — Parent Atlas Rollups', {
  documents: report.docs,
  views: report.views.length,
  stage: 'Ingestion',
  runId: EFFECTIVE_RUN_ID
}, report.views.map((view) => view)));

console.log(`CouchDB MapReduce report written to ${config.outputs.couchdbReportJson} [runId: ${EFFECTIVE_RUN_ID}]`);
console.log(`Saved reports to .tmp/couchdb-mapreduce-reingest-report.json and .tmp/parent-atlas-reingest-report.json`);
if (!WRITE) console.log('Dry-run complete. Add --write once CouchDB client is configured.');

process.exit(0);

