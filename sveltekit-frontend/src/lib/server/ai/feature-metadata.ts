import { createHash } from 'node:crypto';

export type ProgrammingLanguage =
  | 'typescript'
  | 'javascript'
  | 'svelte'
  | 'sql'
  | 'python'
  | 'powershell'
  | 'markdown'
  | 'json'
  | 'yaml'
  | 'unknown';

export type ProtocolDetected =
  | 'http'
  | 'http2'
  | 'http3'
  | 'sse'
  | 'websocket'
  | 'grpc'
  | 'mcp'
  | 'stdio'
  | 'docker'
  | 'rabbitmq'
  | 'redis'
  | 'qdrant'
  | 'postgres'
  | 'neo4j';

export type FeatureIndexMetadata = {
  path: string;
  stableKey: string;
  featureFamily: string;
  labels: string[];
  programmingLanguage: ProgrammingLanguage;
  protocolDetected: ProtocolDetected[];
  routeKind?: 'sveltekit-route' | 'api-route' | 'server-module' | 'script' | 'test' | 'doc';
  svelteKitRoute?: string;
  nestedRouteDepth?: number;
  owningLibrary?: string;
  exportedSymbols: string[];
  importedSymbols: string[];
  astRelations: Array<{
    kind: 'imports' | 'calls' | 'exports' | 'route-handler' | 'schema-ref' | 'test-covers';
    from: string;
    to: string;
  }>;
  cacheSignals: {
    redisKeys: string[];
    qdrantCollections: string[];
    postgresTables: string[];
    duckdbInputs: string[];
    acePacketKeys: string[];
  };
  recommendation: {
    productionStatus: 'ready' | 'degraded' | 'stub' | 'test-only' | 'unknown';
    nextAction: string;
    priority: 'P0' | 'P1' | 'P2' | 'P3';
  };
};

const PROTOCOL_RULES: Array<{ protocol: ProtocolDetected; re: RegExp }> = [
  { protocol: 'http', re: /fetch\(|RequestHandler|\bResponse\b/i },
  { protocol: 'http2', re: /http2/i },
  { protocol: 'http3', re: /http3|quic/i },
  { protocol: 'sse', re: /text\/event-stream|EventSource/i },
  { protocol: 'websocket', re: /WebSocket|ws:\/\//i },
  { protocol: 'grpc', re: /\bgrpc\b|protobuf|\.proto\b/i },
  { protocol: 'mcp', re: /\/mcp|tools\/list|tools\/call|model context protocol/i },
  { protocol: 'stdio', re: /process\.stdin|process\.stdout|\bstdio\b/i },
  { protocol: 'docker', re: /docker|docker-compose|dockerode/i },
  { protocol: 'rabbitmq', re: /amqp|rabbitmq/i },
  { protocol: 'redis', re: /\bredis\b|redis-cli/i },
  { protocol: 'qdrant', re: /\bqdrant\b|collections/i },
  { protocol: 'postgres', re: /postgres|drizzle|pgTable|\bsql\b/i },
  { protocol: 'neo4j', re: /neo4j|cypher|bolt:\/\//i },
];

const KEYWORD_LABELS = [
  'bifrost',
  'ace',
  'kag',
  'hmm',
  'redis',
  'qdrant',
  'drizzle',
  'postgres',
  'neo4j',
  'rabbitmq',
  'mcp',
  'cuda',
];

export function detectProgrammingLanguage(path: string): ProgrammingLanguage {
  const p = path.toLowerCase();
  if (p.endsWith('.ts')) return 'typescript';
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'javascript';
  if (p.endsWith('.svelte')) return 'svelte';
  if (p.endsWith('.sql')) return 'sql';
  if (p.endsWith('.py')) return 'python';
  if (p.endsWith('.ps1')) return 'powershell';
  if (p.endsWith('.md')) return 'markdown';
  if (p.endsWith('.json')) return 'json';
  if (p.endsWith('.yml') || p.endsWith('.yaml')) return 'yaml';
  return 'unknown';
}

export function detectProtocols(content: string): ProtocolDetected[] {
  const found: ProtocolDetected[] = [];
  for (const rule of PROTOCOL_RULES) {
    if (rule.re.test(content)) found.push(rule.protocol);
  }
  return found;
}

export function detectRouteKind(path: string): FeatureIndexMetadata['routeKind'] {
  const p = path.replace(/\\/g, '/');
  if (p.includes('/src/routes/')) {
    if (p.endsWith('+server.ts') || p.endsWith('+server.js')) return 'api-route';
    return 'sveltekit-route';
  }
  if (p.includes('/scripts/')) return 'script';
  if (p.includes('/tests/')) return 'test';
  if (p.includes('/src/lib/server/')) return 'server-module';
  if (p.endsWith('.md') || p.endsWith('.txt')) return 'doc';
  return 'doc';
}

function defaultRecommendation(kind: FeatureIndexMetadata['routeKind']) {
  if (kind === 'test') {
    return { productionStatus: 'test-only', nextAction: 'Exclude from production synthesis.', priority: 'P3' } as const;
  }
  return { productionStatus: 'unknown', nextAction: 'Needs explicit production-readiness review.', priority: 'P2' } as const;
}

export function buildFeatureMetadata(path: string, content: string): FeatureIndexMetadata {
  const normalizedPath = path.replace(/\\/g, '/');
  const lower = content.toLowerCase();
  const labels = KEYWORD_LABELS.filter((k) => lower.includes(k));
  const routeKind = detectRouteKind(normalizedPath);

  const redisKeys = [...content.matchAll(/\b[a-z0-9:_-]*redis[a-z0-9:_-]*\b/gi)].map((m) => m[0]);
  const qdrantCollections = [...content.matchAll(/\b[a-z0-9:_-]*qdrant[a-z0-9:_-]*\b/gi)].map((m) => m[0]);
  const postgresTables = [...content.matchAll(/\b(pgTable|drizzle|postgres|sql)\b/gi)].map((m) => m[0]);
  const duckdbInputs = [...content.matchAll(/\bduckdb\b/gi)].map((m) => m[0]);
  const acePacketKeys = [...content.matchAll(/\bace:[a-z0-9:_-]+\b/gi)].map((m) => m[0]);

  const uniq = <T>(arr: T[]) => Array.from(new Set(arr));

  return {
    path: normalizedPath,
    stableKey: createHash('sha1').update(normalizedPath).digest('hex').slice(0, 16),
    featureFamily: routeKind ?? 'doc',
    labels,
    programmingLanguage: detectProgrammingLanguage(normalizedPath),
    protocolDetected: detectProtocols(content),
    routeKind,
    svelteKitRoute: routeKind === 'sveltekit-route' || routeKind === 'api-route' ? normalizedPath : undefined,
    nestedRouteDepth: normalizedPath.includes('/src/routes/')
      ? normalizedPath.split('/src/routes/')[1]?.split('/').length ?? 0
      : undefined,
    owningLibrary: normalizedPath.includes('/src/lib/') ? 'src/lib' : undefined,
    exportedSymbols: [],
    importedSymbols: [],
    astRelations: [],
    cacheSignals: {
      redisKeys: uniq(redisKeys),
      qdrantCollections: uniq(qdrantCollections),
      postgresTables: uniq(postgresTables),
      duckdbInputs: uniq(duckdbInputs),
      acePacketKeys: uniq(acePacketKeys),
    },
    recommendation: defaultRecommendation(routeKind),
  };
}
