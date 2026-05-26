import { createHash } from 'node:crypto';

export const FEATURE_LABEL_KEYS = [
  'api-route',
  'ui-component',
  'svelte-inspector',
  'svelte-realtime',
  'evidence',
  'graph',
  'database',
  'retrieval',
  'agent',
  'cache',
  'symbol',
  'general',
] as const;

export type FeatureLabelKey = (typeof FEATURE_LABEL_KEYS)[number];

export interface FeatureLabelDefinition {
  key: FeatureLabelKey;
  aliases: string[];
  description: string;
}

export const FEATURE_LABEL_REGISTRY: FeatureLabelDefinition[] = [
  {
    key: 'api-route',
    aliases: ['route', 'api', 'handler', 'endpoint', 'server-route', 'http-route'],
    description: 'HTTP route handlers and API endpoints',
  },
  {
    key: 'ui-component',
    aliases: ['ui', 'component', 'page', 'view', 'svelte', 'screen'],
    description: 'User-facing UI components and pages',
  },
  {
    key: 'svelte-inspector',
    aliases: ['inspector', 'inspecter', 'route-inspector', 'memory-inspector', 'admin-inspector'],
    description: 'Inspector surfaces, route lenses, and admin debugging panes',
  },
  {
    key: 'svelte-realtime',
    aliases: ['realtime', 'real-time', 'sse', 'live-update', 'streaming', 'progress-stream'],
    description: 'Realtime SSE, streaming progress, and live update lanes',
  },
  {
    key: 'evidence',
    aliases: ['evidence', 'document', 'pdf', 'citation', 'case'],
    description: 'Evidence, legal documents, and case material',
  },
  {
    key: 'graph',
    aliases: ['graph', 'neo4j', 'cluster', 'topology', 'som', 'pagerank', 'graphrag'],
    description: 'Graph, cluster, topology, and authority flows',
  },
  {
    key: 'database',
    aliases: ['db', 'sql', 'drizzle', 'postgres', 'postgresql', 'qdrant-jsonb'],
    description: 'Database schemas, queries, and persistence layers',
  },
  {
    key: 'retrieval',
    aliases: ['search', 'rag', 'query', 'semantic', 'retrieval'],
    description: 'Search, RAG, and retrieval orchestration',
  },
  {
    key: 'agent',
    aliases: ['mcp', 'tool', 'agent', 'workflow', 'orchestration'],
    description: 'Agentic orchestration, MCP tools, and workflow control',
  },
  {
    key: 'cache',
    aliases: ['redis', 'cache', 'semantic-cache', 'prompt-cache'],
    description: 'Hot cache and semantic cache lanes',
  },
  {
    key: 'symbol',
    aliases: ['symbol', 'function', 'method', 'class'],
    description: 'Symbol-level references and anchors',
  },
  {
    key: 'general',
    aliases: [],
    description: 'Fallback label when no stronger classification is available',
  },
];

const registryMap = new Map<string, FeatureLabelKey>();
for (const entry of FEATURE_LABEL_REGISTRY) {
  registryMap.set(entry.key, entry.key);
  for (const alias of entry.aliases) {
    registryMap.set(alias, entry.key);
  }
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeFeatureLabel(value: string | null | undefined): FeatureLabelKey {
  const raw = (value ?? 'general').trim().toLowerCase();
  if (!raw) return 'general';

  const normalized = normalizeText(raw);
  const direct = registryMap.get(normalized);
  if (direct) return direct;

  for (const entry of FEATURE_LABEL_REGISTRY) {
    if (entry.aliases.some((alias) => normalized === alias || normalized.includes(alias))) {
      return entry.key;
    }
  }

  if (normalized.includes('route') || normalized.includes('api')) return 'api-route';
  if (normalized.includes('ui') || normalized.includes('component') || normalized.includes('page') || normalized.includes('view')) {
    return 'ui-component';
  }
  if (normalized.includes('inspector') || normalized.includes('inspecter')) return 'svelte-inspector';
  if (normalized.includes('realtime') || normalized.includes('real-time') || normalized.includes('sse') || normalized.includes('stream')) {
    return 'svelte-realtime';
  }
  if (normalized.includes('evidence') || normalized.includes('document') || normalized.includes('pdf') || normalized.includes('case')) {
    return 'evidence';
  }
  if (normalized.includes('graph') || normalized.includes('cluster') || normalized.includes('topolog') || normalized.includes('som')) {
    return 'graph';
  }
  if (normalized.includes('db') || normalized.includes('sql') || normalized.includes('drizzle') || normalized.includes('postgres')) {
    return 'database';
  }
  if (normalized.includes('search') || normalized.includes('retrieval') || normalized.includes('rag') || normalized.includes('semantic')) {
    return 'retrieval';
  }
  if (normalized.includes('mcp') || normalized.includes('tool') || normalized.includes('agent') || normalized.includes('workflow')) {
    return 'agent';
  }
  if (normalized.includes('cache') || normalized.includes('redis')) return 'cache';
  if (normalized.includes('symbol') || normalized.includes('function') || normalized.includes('method')) return 'symbol';
  return 'general';
}

export function getFeatureLabelDefinition(value: string | null | undefined): FeatureLabelDefinition {
  const key = normalizeFeatureLabel(value);
  return FEATURE_LABEL_REGISTRY.find((entry) => entry.key === key) ?? FEATURE_LABEL_REGISTRY[FEATURE_LABEL_REGISTRY.length - 1];
}

export function featureLabelRegistrySignature(): string {
  return createHash('sha256')
    .update(JSON.stringify(FEATURE_LABEL_REGISTRY))
    .digest('hex')
    .slice(0, 16);
}
