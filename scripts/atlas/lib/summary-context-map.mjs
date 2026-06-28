import path from 'node:path';

const DOMAIN_RULES = [
  ['retrieval', /hyperrag|retriev|qdrant|search|bm25|rrf|rerank|ann|vector/i],
  ['cache', /redis|valkey|bifrost|cache|ttl|centroid/i],
  ['graph', /neo4j|graph|cypher|gds|pagerank|topology|som|cluster|community|karpathy/i],
  ['gpu', /gpu|cuda|cuvs|libtorch|turbovec|tensor|xgboost|matmul|vram/i],
  ['agent', /agent|opencode|mcp|acp|ace|gemma|langgraph|tool|prompt|recommend/i],
  ['database', /postgres|drizzle|schema|migration|sql|pgvector|jsonb|table|db/i],
  ['legal', /legal|case|evidence|citation|statute|court|brief|document/i],
  ['ui', /svelte|route|page|layout|component|button|modal|admin/i],
  ['ops', /docker|startup|health|smoke|telemetry|trace|rabbitmq|nats|caddy|seaweed/i],
  ['docs', /docs?|todo|report|readme|architecture|runbook|memory/i],
];

const EXT_LANGUAGE = new Map([
  ['.ts', 'typescript'],
  ['.tsx', 'typescript'],
  ['.js', 'javascript'],
  ['.mjs', 'javascript'],
  ['.cjs', 'javascript'],
  ['.svelte', 'svelte'],
  ['.sql', 'sql'],
  ['.md', 'markdown'],
  ['.mdx', 'markdown'],
  ['.txt', 'text'],
  ['.json', 'json'],
  ['.jsonl', 'jsonl'],
  ['.ndjson', 'ndjson'],
  ['.py', 'python'],
  ['.rs', 'rust'],
  ['.ps1', 'powershell'],
  ['.sh', 'shell'],
]);

function objectValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return null;
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function normalizedPathDir(value) {
  const text = String(value ?? '').trim();
  if (!text || !/[\\/]/.test(text)) return null;
  const dir = path.dirname(text.replace(/\\/g, '/')).replace(/\\/g, '/');
  return dir && dir !== '.' ? dir : null;
}

function missingFields(object, fields) {
  return fields.filter((field) => !String(object[field] ?? '').trim());
}

export function classifyDomain(sourceRef = '', featureId = '', summary = '') {
  const haystack = `${sourceRef} ${featureId} ${summary}`.toLowerCase();
  for (const [domain, pattern] of DOMAIN_RULES) {
    if (pattern.test(haystack)) return domain;
  }
  const topDir = String(sourceRef ?? '').split(/[\\/]/).filter(Boolean)[0];
  if (topDir === 'scripts') return 'ops';
  if (topDir === 'docs' || topDir === 'reports' || topDir === 'next_steps') return 'docs';
  if (topDir === 'src' || topDir === 'sveltekit-frontend') return 'code';
  return 'codebase';
}

export function classifyOntology(sourceRef = '', featureId = '', functionSymbol = '') {
  const text = `${sourceRef} ${featureId} ${functionSymbol}`.toLowerCase();
  if (/schema|table|migration|zod|drizzle|sql/.test(text)) return 'schema';
  if (/route|\+server|api|handler|endpoint|rpc/.test(text)) return 'api_route';
  if (/worker|consumer|queue|job|orchestrat/.test(text)) return 'worker';
  if (/client|adapter|bridge|gateway|connector/.test(text)) return 'adapter';
  if (/test|smoke|verify|validate|audit|gan/.test(text)) return 'validation';
  if (/summar|gemma|langextract|feature|label|ontology/.test(text)) return 'semantic_enrichment';
  if (/cache|redis|bifrost/.test(text)) return 'cache_contract';
  if (/graph|neo4j|topology|cluster|som/.test(text)) return 'graph_contract';
  if (/retriev|search|qdrant|bm25|rrf/.test(text)) return 'retrieval_contract';
  if (/util|helper|lib|common/.test(text)) return 'utility';
  return 'artifact';
}

export function classifyTopology(sourceRef = '', featureId = '', domainClass = '') {
  const text = `${sourceRef} ${featureId} ${domainClass}`.toLowerCase();
  if (/cache|redis|bifrost|valkey/.test(text)) return 'cache_layer';
  if (/retriev|search|qdrant|bm25|rrf|hyperrag/.test(text)) return 'retrieval_layer';
  if (/neo4j|graph|topology|som|cluster|pagerank/.test(text)) return 'graph_layer';
  if (/postgres|drizzle|schema|sql|pgvector/.test(text)) return 'storage_layer';
  if (/mcp|agent|opencode|gemma|langgraph/.test(text)) return 'agent_layer';
  if (/gpu|cuda|cuvs|libtorch|turbovec/.test(text)) return 'accelerator_layer';
  if (/svelte|routes|component|ui/.test(text)) return 'ui_layer';
  if (/test|smoke|verify|audit|telemetry|trace/.test(text)) return 'validation_layer';
  return 'codebase_layer';
}

export function buildSummaryContext(row = {}) {
  const metadata = objectValue(row.metadata);
  const payload = objectValue(row.payload);
  const topology = objectValue(row.topology);
  const featureLabels = objectValue(metadata.feature_labels ?? payload.feature_labels);
  const workspace = objectValue(metadata.workspace);

  const filePath = firstText(
    row.file_path,
    payload.file_path,
    payload.filePath,
    metadata.file_path,
    metadata.filePath,
  );
  const directoryPath = firstText(
    row.directory_path,
    payload.directory_path,
    payload.directoryPath,
    metadata.directory_path,
    metadata.directoryPath,
    normalizedPathDir(filePath),
    normalizedPathDir(row.source_ref),
  );
  const sourceRef = firstText(row.source_ref, payload.source_ref, metadata.source_ref, filePath) ?? '';
  const packetKey = firstText(
    row.packet_key,
    payload.packet_key,
    payload.packetKey,
    metadata.packet_key,
    metadata.packetKey,
  );
  const featureId = firstText(row.feature_id, payload.feature_id, metadata.feature_id);
  const functionSymbol = firstText(row.function_symbol, metadata.function_symbol, payload.function_symbol);
  const ext = path.extname(sourceRef).toLowerCase();
  const language = firstText(row.language, payload.language, metadata.language, EXT_LANGUAGE.get(ext), 'unknown');

  const domainClass = firstText(
    row.domain_class,
    row.domain,
    featureLabels.domain_class,
    payload.domain_class,
    metadata.domain_class,
    classifyDomain(sourceRef, featureId, row.summary),
    workspace.domain,
  );
  const ontologyLabel = firstText(
    row.ontology_label,
    featureLabels.ontology_label,
    payload.ontology_label,
    metadata.ontology_label,
    classifyOntology(sourceRef, featureId, functionSymbol),
  );
  const topologyLabel = firstText(
    row.topology_label,
    featureLabels.topology_label,
    payload.topology_label,
    metadata.topology_label,
    topology.topology_label,
    classifyTopology(sourceRef, featureId, domainClass),
  );

  const communityId = firstNumber(row.community_id, payload.community_id, metadata.community_id, topology.community_id);
  const clusterId = firstNumber(row.cluster_id, row.kmeans_cluster, payload.cluster_id, metadata.cluster_id, topology.cluster_id);
  const somCluster = firstText(row.som_cluster, payload.som_cluster, metadata.som_cluster, topology.som_cluster);
  const pagerank = firstNumber(row.pagerank, payload.pagerank, metadata.pagerank, topology.pagerank);

  const clusterKey = firstText(
    somCluster ? `som:${somCluster}` : null,
    clusterId !== null ? `cluster:${clusterId}` : null,
    communityId !== null ? `community:${communityId}` : null,
    `${domainClass}:${topologyLabel}`,
  );

  const ontologyTags = [
    ...new Set([
      ...(Array.isArray(featureLabels.ontology_tags) ? featureLabels.ontology_tags : []),
      ...(Array.isArray(payload.ontology_tags) ? payload.ontology_tags : []),
      ...(Array.isArray(metadata.ontology_tags) ? metadata.ontology_tags : []),
      domainClass,
      ontologyLabel,
      topologyLabel,
    ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean)),
  ].slice(0, 12);

  const featureLabel = firstText(row.feature_label, payload.feature_label, metadata.feature_label, path.basename(sourceRef));
  const identity = {
    directory_path: directoryPath,
    source_ref: sourceRef || null,
    file_path: filePath,
    function_symbol: functionSymbol,
    feature_id: featureId,
    feature_label: featureLabel,
    packet_key: packetKey,
  };
  const requiredIdentityFields = ['directory_path', 'source_ref', 'feature_id', 'feature_label', 'packet_key'];
  const fullIdentityFields = ['directory_path', 'source_ref', 'file_path', 'function_symbol', 'feature_id', 'feature_label', 'packet_key'];
  const identityMissingRequired = missingFields(identity, requiredIdentityFields);
  const identityMissingFull = missingFields(identity, fullIdentityFields);

  return {
    directory_path: directoryPath,
    source_ref: sourceRef || null,
    file_path: filePath,
    function_symbol: functionSymbol,
    packet_key: packetKey,
    feature_id: featureId,
    feature_label: featureLabel,
    domain_class: domainClass,
    ontology_label: ontologyLabel,
    topology_label: topologyLabel,
    cluster_key: clusterKey,
    community_id: communityId,
    cluster_id: clusterId,
    som_cluster: somCluster,
    pagerank,
    language,
    ontology_tags: ontologyTags,
    identity_chain: identity,
    identity_required_complete: identityMissingRequired.length === 0,
    identity_chain_complete: identityMissingFull.length === 0,
    identity_missing_required: identityMissingRequired,
    identity_missing_full: identityMissingFull,
  };
}

export function formatSummaryContext(context = {}) {
  return [
    `directory_path: ${context.directory_path ?? 'unknown'}`,
    `source_ref: ${context.source_ref ?? 'unknown'}`,
    `file_path: ${context.file_path ?? 'unknown'}`,
    context.function_symbol ? `function_symbol: ${context.function_symbol}` : null,
    `feature_id: ${context.feature_id ?? 'unknown'}`,
    `feature_label: ${context.feature_label ?? 'unknown'}`,
    `packet_key: ${context.packet_key ?? 'unknown'}`,
    `identity_required_complete: ${context.identity_required_complete === false ? 'false' : 'true'}`,
    Array.isArray(context.identity_missing_required) && context.identity_missing_required.length
      ? `identity_missing_required: ${context.identity_missing_required.join(', ')}`
      : null,
    `domain_class: ${context.domain_class ?? 'unknown'}`,
    `ontology_label: ${context.ontology_label ?? 'unknown'}`,
    `topology_label: ${context.topology_label ?? 'unknown'}`,
    `cluster_key: ${context.cluster_key ?? 'unknown'}`,
    `language: ${context.language ?? 'unknown'}`,
    context.community_id !== null && context.community_id !== undefined ? `community_id: ${context.community_id}` : null,
    context.som_cluster ? `som_cluster: ${context.som_cluster}` : null,
    context.pagerank !== null && context.pagerank !== undefined ? `pagerank: ${context.pagerank}` : null,
    Array.isArray(context.ontology_tags) && context.ontology_tags.length
      ? `ontology_tags: ${context.ontology_tags.join(', ')}`
      : null,
  ].filter(Boolean).join('\n');
}
