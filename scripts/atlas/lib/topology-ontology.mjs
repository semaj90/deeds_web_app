#!/usr/bin/env node

const DOMAIN_CLASSES = [
  'frontend',
  'backend',
  'retrieval',
  'graph',
  'cache',
  'agent',
  'compiler',
  'gpu',
  'documentation',
  'infrastructure',
];

const DOMAIN_HINTS = [
  ['frontend', [/sveltekit-frontend\/src\/routes/i, /sveltekit-frontend\/src\/lib\/components/i, /\.svelte$/i]],
  ['backend', [/src\/lib\/server/i, /\/server\//i, /api\/.+\+server\./i]],
  ['retrieval', [/retriev/i, /qdrant/i, /turbovec/i, /rrf/i, /bm25/i, /ranker/i, /search/i]],
  ['graph', [/neo4j/i, /pagerank/i, /louvain/i, /graph/i, /gds/i, /tree_node/i]],
  ['cache', [/redis/i, /valkey/i, /bifrost/i, /cache/i, /centroid/i, /hot-bucket/i]],
  ['agent', [/agent/i, /acp/i, /kanban/i, /tasker/i, /workflow/i, /planner/i, /repair/i, /hmm/i]],
  ['compiler', [/ast-grep/i, /ast_langextract/i, /ts-morph/i, /parser/i, /compiler/i, /typecheck/i]],
  ['gpu', [/gpu/i, /cuda/i, /tensorrt/i, /onnx/i, /libtorch/i, /embeddinggemma/i, /torch/i]],
  ['documentation', [/docs\//i, /\.md$/i, /README/i, /AGENTS\.md$/i, /llms\.md$/i]],
  ['infrastructure', [/docker/i, /compose/i, /k8s/i, /service/i, /infra/i, /deployment/i, /postgres/i, /qdrant/i, /rabbitmq/i]],
];

function safeString(value) {
  return String(value ?? '').trim();
}

function slugDomainClass(value) {
  const text = safeString(value).toLowerCase();
  return DOMAIN_CLASSES.includes(text) ? text : 'infrastructure';
}

function deriveDomainClass(row = {}) {
  const sourceRef = safeString(row.source_ref ?? row.sourceRef ?? row.file_path ?? row.filePath);
  const featureId = safeString(row.feature_id ?? row.featureId);
  const label = [sourceRef, featureId, row.feature_label, row.title_id, row.summary_text]
    .map(safeString)
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  for (const [domain, patterns] of DOMAIN_HINTS) {
    if (patterns.some((pattern) => pattern.test(label))) {
      return domain;
    }
  }
  return 'infrastructure';
}

function normalizeFeatureId(value) {
  return safeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[\-.]+|[\-.]+$/g, '');
}

function deriveFeatureId(row = {}) {
  const direct = safeString(row.feature_id ?? row.featureId);
  if (direct) return normalizeFeatureId(direct);

  const sourceRef = safeString(row.source_ref ?? row.sourceRef ?? row.file_path ?? row.filePath ?? row.relative_path ?? row.relativePath);
  const label = safeString(row.feature_label ?? row.featureLabel ?? row.title_id ?? row.titleId);
  const seed = [sourceRef, label]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (seed) return normalizeFeatureId(seed);
  return 'feature';
}

function normalizeSomCell(somRow, somCol) {
  const row = Number.isFinite(Number(somRow)) ? Number(somRow) : null;
  const col = Number.isFinite(Number(somCol)) ? Number(somCol) : null;
  if (row !== null && col !== null) return `${row}:${col}`;
  const single = safeString(somRow ?? somCol);
  return single ? single : null;
}

function deriveCentroidKeys(row = {}) {
  const domainClass = slugDomainClass(row.domain_class ?? row.domainClass ?? deriveDomainClass(row));
  const featureId = deriveFeatureId(row);
  const somCell = normalizeSomCell(
    row.som_row ?? row.somRow ?? row.som_cluster ?? row.somCluster ?? row.som_cell ?? row.somCell,
    row.som_col ?? row.somCol
  );
  const kmeansCluster = row.kmeans_cluster ?? row.kmeansCluster ?? row.cluster_id ?? row.clusterId;
  const communityId = row.community_id ?? row.communityId ?? null;

  return {
    domain_class: domainClass,
    domain_centroid_key: `atlas:centroid:domain:${domainClass}`,
    feature_centroid_key: featureId ? `atlas:centroid:feature:${featureId}` : null,
    kmeans_centroid_key: kmeansCluster !== null && kmeansCluster !== undefined ? `atlas:centroid:kmeans:${kmeansCluster}` : null,
    som_centroid_key: somCell ? `atlas:centroid:som:${somCell}` : null,
    community_centroid_key: communityId !== null && communityId !== undefined ? `atlas:centroid:community:${communityId}` : null,
    som_cell: somCell,
  };
}

function buildTopologyEnvelope(row = {}) {
  const topology = deriveCentroidKeys(row);
  return {
    domain_class: topology.domain_class,
    centroid_keys: {
      domain: topology.domain_centroid_key,
      feature: topology.feature_centroid_key,
      kmeans: topology.kmeans_centroid_key,
      som: topology.som_centroid_key,
      community: topology.community_centroid_key,
    },
    som_cell: topology.som_cell,
  };
}

export {
  DOMAIN_CLASSES,
  deriveDomainClass,
  deriveCentroidKeys,
  buildTopologyEnvelope,
  deriveFeatureId,
  normalizeFeatureId,
  normalizeSomCell,
  slugDomainClass,
};
