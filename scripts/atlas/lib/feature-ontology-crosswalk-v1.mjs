export const CROSSWALK_REVISION = 'feature-ontology-crosswalk:v1';

const DOMAIN_RULES = [
  ['identity', /auth|session|permission|user|role|lucia/],
  ['cases', /case|matter|docket|timeline/],
  ['evidence', /evidence|document|citation|upload|extract/],
  ['collaboration', /message|comment|presence|realtime|board|thread|post/],
  ['developer-platform', /agent|repair|openspec|spec|task|kanban|workflow|mcp|acp|a2a/],
  ['parent-atlas', /atlas|graphify|qdrant|semantic|retrieval|ontology|packet|candidate|embedding|vector/],
  ['operations', /health|audit|observability|telemetry|migration|startup|cache/],
];

const CAPABILITY_RULES = [
  ['identity.authentication', /auth|login|logout|session|lucia/],
  ['identity.authorization', /permission|role|policy|authorize/],
  ['identity.user-management', /user|account|profile|invitation/],
  ['community.discussion', /message|comment|board|thread|post|reaction/],
  ['atlas.retrieval', /retrieval|search|qdrant|bm25|semantic|embedding|vector/],
  ['atlas.code-intelligence', /graphify|ast|symbol|tree-sitter|ast-grep|chunk/],
  ['developer.repair', /agent|repair|error|patch|regression/],
  ['developer.delivery', /openspec|spec|task|kanban|workflow/],
  ['platform.observability', /health|audit|telemetry|observability|startup/],
];

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function values(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return [];
}

function unique(valuesToDeduplicate) {
  return [...new Set(valuesToDeduplicate)].sort((a, b) => a.localeCompare(b));
}

function classifyKind(haystack) {
  if (/auth|permission|security|session|policy/.test(haystack)) return 'SECURITY';
  if (/mcp|acp|a2a|qdrant|neo4j|valkey|postgres|ollama|llama|lucia/.test(haystack)) return 'INTEGRATION';
  if (/audit|health|migration|startup|telemetry|observability|cache/.test(haystack)) return 'OPERATIONS';
  if (/atlas|graphify|retrieval|embedding|semantic|ast|symbol|packet|candidate/.test(haystack)) return 'PLATFORM_FEATURE';
  return 'USER_FEATURE';
}

function classifySurfaces(sourceRefs, haystack) {
  const surfaces = new Set();
  for (const sourceRef of sourceRefs) {
    const value = sourceRef.toLowerCase();
    if (/routes?|components?|pages?|svelte/.test(value)) surfaces.add('WEB');
    if (/\/api\/|\\api\\|mcp|rpc|grpc/.test(value)) surfaces.add('API');
    if (/worker|job|queue|consumer/.test(value)) surfaces.add('WORKER');
    if (/cli|bin|command/.test(value)) surfaces.add('CLI');
  }
  if (/mobile|ios|android/.test(haystack)) surfaces.add('MOBILE');
  return unique([...surfaces]);
}

function classifyRole(sourceRef, sourceKind) {
  const value = sourceRef.toLowerCase();
  if (sourceKind === 'test') return 'TEST';
  if (/routes?|api|rpc|mcp|grpc/.test(value)) return 'API';
  if (/components?|pages?|svelte/.test(value)) return 'UI';
  if (/schema|migration|repository|db|database/.test(value)) return 'DATA_ACCESS';
  if (/worker|job|queue|consumer/.test(value)) return 'BACKGROUND_JOB';
  if (/config|\.json$|\.yaml$|\.yml$/.test(value)) return 'CONFIG';
  return 'DOMAIN_LOGIC';
}

function classifyDimension(haystack, rules) {
  const match = rules.find(([, pattern]) => pattern.test(haystack));
  return match ? { id: match[0], status: 'INFERRED_RULE', rule: String(match[1]) } : { id: null, status: 'UNVERIFIED', rule: null };
}

function buildImplementations(row, sourceRevision) {
  const refs = [
    ...values(row.source_refs).map((sourceRef) => ({ sourceRef, sourceKind: 'source' })),
    ...values(row.code_refs).map((sourceRef) => ({ sourceRef, sourceKind: 'code' })),
    ...values(row.test_refs).map((sourceRef) => ({ sourceRef, sourceKind: 'test' })),
  ];
  const seen = new Set();
  return refs
    .filter(({ sourceRef }) => {
      if (seen.has(sourceRef)) return false;
      seen.add(sourceRef);
      return true;
    })
    .map(({ sourceRef, sourceKind }) => ({
      sourceRef,
      sourceRevision: sourceRevision || null,
      role: classifyRole(sourceRef, sourceKind),
      evidenceRefs: [`feature_registry:${text(row.feature_key)}`, `feature_registry:${sourceKind}_refs`],
      bindingStatus: sourceRevision ? 'REVISION_QUALIFIED' : 'UNVERIFIED_SOURCE_REVISION',
    }));
}

export function deriveFeatureOntologyCrosswalk(row) {
  const featureKey = text(row.feature_key ?? row.featureKey);
  if (!featureKey) throw new Error('FEATURE_ONTOLOGY_CROSSWALK_FEATURE_KEY_REQUIRED');
  const sourceRefs = unique([
    ...values(row.source_refs),
    ...values(row.code_refs),
    ...values(row.test_refs),
  ]);
  const haystack = [
    featureKey,
    text(row.title),
    text(row.description),
    text(row.summary),
    ...values(row.tags),
  ].join(' ').toLowerCase();
  const domain = classifyDimension(haystack, DOMAIN_RULES);
  const capability = classifyDimension(haystack, CAPABILITY_RULES);
  const sourceRevision = text(row.source_revision ?? row.sourceRevision) || null;
  const surfaces = classifySurfaces(sourceRefs, haystack);
  const implementations = buildImplementations(row, sourceRevision);

  return {
    schema: 'atlas.feature-ontology-crosswalk.v1',
    crosswalkRevision: CROSSWALK_REVISION,
    featureKey,
    featureId: text(row.feature_id ?? row.featureId) || null,
    title: text(row.title) || featureKey,
    description: text(row.description) || text(row.summary) || null,
    domainKey: domain.id,
    capabilityKey: capability.id,
    classification: {
      domainStatus: domain.status,
      capabilityStatus: capability.status,
      kind: classifyKind(haystack),
      surfaces,
      status: domain.id && capability.id && surfaces.length > 0 ? 'CLASSIFIED' : 'UNVERIFIED',
    },
    implementations,
    dependencies: [],
    registryEvidence: {
      sourceRefs,
      clusterId: row.cluster_id ?? row.clusterId ?? null,
      trustTier: text(row.trust_tier ?? row.trustTier) || null,
      status: text(row.status) || null,
      lastVerifiedAt: row.last_verified_at ?? row.lastVerifiedAt ?? null,
    },
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

export function deriveFeatureOntologyCrosswalkRows(rows) {
  const records = [];
  const rejected = [];
  for (const row of rows) {
    try {
      records.push(deriveFeatureOntologyCrosswalk(row));
    } catch (error) {
      rejected.push({ featureKey: text(row?.feature_key ?? row?.featureKey) || null, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  records.sort((a, b) => a.featureKey.localeCompare(b.featureKey));
  return { records, rejected };
}
