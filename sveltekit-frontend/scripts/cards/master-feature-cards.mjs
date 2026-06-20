import crypto from 'node:crypto';
import { MASTER_FEATURE_MAP } from '../../src/lib/server/atlas/master-feature-map.ts';
import { sortObject, stableHash } from '../index/shared.mjs';

function compact(text, limit = 220) {
  const normalized = String(text ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function cardLabels(...labels) {
  return [...new Set(labels.filter(Boolean).map((label) => String(label).trim()).filter(Boolean))].sort();
}

function hashCard(card) {
  const clone = { ...card };
  delete clone.hash;
  return stableHash(JSON.stringify(sortObject(clone)));
}

function makeCard(base) {
  const card = { ...base };
  card.hash = hashCard(card);
  return card;
}

function scoreOf(card) {
  const scores = card.scores ?? {};
  return [
    Number(scores.rank ?? 0),
    Number(scores.authority ?? 0),
    Number(scores.recency ?? 0),
  ].reduce((sum, value) => sum + value, 0);
}

function statusRank(status) {
  switch (String(status ?? '').toLowerCase()) {
    case 'active':
      return 95;
    case 'partial':
      return 82;
    case 'dry_run':
      return 68;
    case 'planned':
      return 54;
    case 'research_spike':
      return 42;
    case 'deprecated':
      return 12;
    default:
      return 20;
  }
}

function featureSourceRefs(entry) {
  const refs = new Set(['src/lib/server/atlas/master-feature-map.ts']);
  if (entry?.params?.docRef) refs.add(String(entry.params.docRef));
  for (const file of entry?.evidence?.files ?? []) refs.add(String(file));
  for (const file of entry?.pathMapping ?? []) refs.add(String(file));
  return [...refs];
}

function basePathModules(entry) {
  return Array.isArray(entry?.pathMapping) ? entry.pathMapping.map((path) => path.replace(/^src\//, 'src/').replace(/\/$/, '')) : [];
}

function inferModules(entry) {
  const explicit = Array.isArray(entry?.modules) ? entry.modules.map(String) : [];
  const pathModules = basePathModules(entry);
  return cardLabels(...explicit, ...pathModules);
}

function inferImports(entry) {
  const explicit = Array.isArray(entry?.imports) ? entry.imports.map(String) : [];
  const inferred = [];
  if (String(entry?.service ?? '').length > 0) inferred.push(String(entry.service));
  if (Array.isArray(entry?.stores)) {
    for (const store of entry.stores) inferred.push(`store:${store}`);
  }
  if (Array.isArray(entry?.pathMapping)) {
    for (const path of entry.pathMapping) {
      if (String(path).includes('atlas')) inferred.push('route-feature-map');
      if (String(path).includes('route')) inferred.push('route-map');
      if (String(path).includes('cache')) inferred.push('feature-cache');
      if (String(path).includes('db') || String(path).includes('schema')) inferred.push('schema');
    }
  }
  return cardLabels(...explicit, ...inferred);
}

function inferDependencies(entry) {
  const explicit = Array.isArray(entry?.dependencies) ? entry.dependencies.map(String) : [];
  const inferred = [];
  const text = [entry?.name, entry?.intent, entry?.service, ...(entry?.pathMapping ?? []), ...(entry?.stores ?? [])].join(' ');
  if (/atlas/i.test(text)) inferred.push('route atlas');
  if (/import/i.test(text)) inferred.push('import map');
  if (/neo4j/i.test(text)) inferred.push('neo4j projection');
  if (/duckdb/i.test(text)) inferred.push('duckdb offline');
  if (/couchdb/i.test(text)) inferred.push('couchdb offline');
  if (/redis/i.test(text)) inferred.push('redis hot cache');
  if (/qdrant/i.test(text)) inferred.push('qdrant vector store');
  if (/postgres/i.test(text)) inferred.push('postgres registry');
  if (/gemma4|opencode/i.test(text)) inferred.push('gemma4 inference');
  return cardLabels(...explicit, ...inferred);
}

function inferLanguages(entry) {
  const explicit = Array.isArray(entry?.languages) ? entry.languages.map(String) : [];
  const inferred = ['TypeScript'];
  if (Array.isArray(entry?.pathMapping) && entry.pathMapping.some((path) => String(path).endsWith('.md'))) inferred.push('Markdown');
  if (Array.isArray(entry?.pathMapping) && entry.pathMapping.some((path) => String(path).endsWith('.json'))) inferred.push('JSON');
  if (Array.isArray(entry?.pathMapping) && entry.pathMapping.some((path) => String(path).endsWith('.mjs'))) inferred.push('JavaScript');
  return cardLabels(...explicit, ...inferred);
}

function inferNetworking(entry) {
  const explicit = Array.isArray(entry?.networking) ? entry.networking.map(String) : [];
  const inferred = [];
  const text = [entry?.service, ...(entry?.stores ?? []), ...(entry?.params ? Object.keys(entry.params) : [])].join(' ');
  if (/redis/i.test(text)) inferred.push('Redis');
  if (/postgres/i.test(text)) inferred.push('Postgres');
  if (/qdrant/i.test(text)) inferred.push('Qdrant');
  if (/neo4j/i.test(text)) inferred.push('Neo4j');
  if (/http/i.test(text) || /route/i.test(String(entry?.intent ?? ''))) inferred.push('HTTP');
  return cardLabels(...explicit, ...inferred);
}

function inferOfflineProcessing(entry) {
  const explicit = Array.isArray(entry?.offlineProcessing) ? entry.offlineProcessing.map(String) : [];
  const inferred = [];
  const text = [entry?.service, entry?.intent, ...(entry?.pathMapping ?? []), ...(entry?.params ? Object.values(entry.params).flatMap((v) => String(v)) : [])].join(' ');
  if (/duckdb/i.test(text)) inferred.push('DuckDB');
  if (/couchdb/i.test(text)) inferred.push('CouchDB');
  return cardLabels(...explicit, ...inferred);
}

function inferCache(entry) {
  const explicit = Array.isArray(entry?.cache) ? entry.cache.map(String) : [];
  const inferred = [];
  const text = [entry?.service, entry?.intent, ...(entry?.stores ?? [])].join(' ');
  if (/redis/i.test(text)) inferred.push('Redis hot cache');
  if (/cache/i.test(text)) inferred.push('feature-map cache');
  return cardLabels(...explicit, ...inferred);
}

function inferFallbacks(entry) {
  const explicit = Array.isArray(entry?.inferenceFallbacks) ? entry.inferenceFallbacks.map(String) : [];
  const inferred = [];
  const text = [entry?.service, entry?.intent, ...(entry?.params ? Object.values(entry.params).flatMap((v) => String(v)) : [])].join(' ');
  if (/gemma4|opencode/i.test(text)) inferred.push('Gemma4 Opencode');
  if (/cpu/i.test(text)) inferred.push('CPU fallback');
  if (/fallback/i.test(text)) inferred.push('Graceful fallback');
  return cardLabels(...explicit, ...inferred);
}

function featureSummary(entry) {
  const stores = Array.isArray(entry?.stores) ? entry.stores.join(', ') : 'none';
  const clusters = Array.isArray(entry?.clusters) && entry.clusters.length > 0
    ? entry.clusters.map(String).join(', ')
    : 'none';
  const modules = inferModules(entry).slice(0, 3).join(', ') || 'none';
  const imports = inferImports(entry).slice(0, 3).join(', ') || 'none';
  return compact(
    `${entry.name} — ${entry.intent}. Status ${entry.status}. ` +
    `Service ${entry.service}; stores ${stores}; clusters ${clusters}; modules ${modules}; imports ${imports}`
  );
}

function featureLabels(entry) {
  const stores = Array.isArray(entry?.stores) ? entry.stores.map((store) => `store:${store}`) : [];
  const clusters = Array.isArray(entry?.clusters) ? entry.clusters.map((cluster) => `cluster:${cluster}`) : [];
  const pathMapping = Array.isArray(entry?.pathMapping) ? entry.pathMapping.map((path) => `path:${path}`) : [];
  const modules = inferModules(entry).map((module) => `module:${module}`);
  const languages = inferLanguages(entry).map((language) => `lang:${language}`);
  const networking = inferNetworking(entry).map((item) => `net:${item}`);
  const offlineProcessing = inferOfflineProcessing(entry).map((item) => `offline:${item}`);
  const cache = inferCache(entry).map((item) => `cache:${item}`);
  const inferenceFallbacks = inferFallbacks(entry).map((item) => `fallback:${item}`);
  return cardLabels(
    'feature-map',
    `status:${entry.status}`,
    `service:${entry.service}`,
    ...stores,
    ...clusters,
    ...pathMapping,
    ...modules,
    ...languages,
    ...networking,
    ...offlineProcessing,
    ...cache,
    ...inferenceFallbacks,
  );
}

export function buildMasterFeatureCards() {
  const cards = Object.values(MASTER_FEATURE_MAP).map((entry) => {
    const rank = statusRank(entry.status);
    const evidenceCount = Array.isArray(entry?.evidence?.files) ? entry.evidence.files.length : 0;
    return makeCard({
      id: `feature-map:${entry.id}`,
      kind: 'feature',
      labels: featureLabels(entry),
      summary: featureSummary(entry),
      sourceRefs: featureSourceRefs(entry),
      scores: {
        rank,
        authority: Math.min(1, (Array.isArray(entry.stores) ? entry.stores.length : 0) * 0.1 + evidenceCount * 0.05),
      },
      payload: {
        id: entry.id,
        name: entry.name,
        intent: entry.intent,
        service: entry.service,
        stores: entry.stores,
        modules: inferModules(entry),
        imports: inferImports(entry),
        dependencies: inferDependencies(entry),
        languages: inferLanguages(entry),
        networking: inferNetworking(entry),
        offlineProcessing: inferOfflineProcessing(entry),
        cache: inferCache(entry),
        inferenceFallbacks: inferFallbacks(entry),
        clusters: entry.clusters,
        status: entry.status,
        params: entry.params,
        pathMapping: entry.pathMapping ?? [],
        failOpen: entry.failOpen,
      },
    });
  });

  return cards.sort((a, b) => scoreOf(b) - scoreOf(a) || a.id.localeCompare(b.id));
}
