import { createHash } from 'crypto';

export type FeatureIndexMetadata = {
  path: string;
  stableKey: string;
  featureFamily: string;
  labels: string[];

  programmingLanguage:
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

  protocolDetected: Array<
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
    | 'neo4j'
  >;

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
    confidence: number;
  };
};

export function generateStableKey(path: string, symbol: string, route: string, fileHash: string): string {
  const data = `${path}|${symbol}|${route}|${fileHash}`;
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

export function detectProgrammingLanguage(path: string): FeatureIndexMetadata['programmingLanguage'] {
  const lower = path.toLowerCase();
  if (lower.endsWith('.ts')) return 'typescript';
  if (lower.endsWith('.js') || lower.endsWith('.cjs') || lower.endsWith('.mjs')) return 'javascript';
  if (lower.endsWith('.svelte')) return 'svelte';
  if (lower.endsWith('.sql')) return 'sql';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.ps1')) return 'powershell';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.json') || lower.endsWith('.jsonl') || lower.endsWith('.jsonc')) return 'json';
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml';
  return 'unknown';
}

const PROTOCOL_RULES: Array<{ name: FeatureIndexMetadata['protocolDetected'][number]; re: RegExp }> = [
  { name: 'http', re: /fetch\(|RequestHandler|\bResponse\b|\bHTTP\b/i },
  { name: 'http2', re: /http2/i },
  { name: 'http3', re: /http3|quic/i },
  { name: 'sse', re: /text\/event-stream|EventSource/i },
  { name: 'websocket', re: /WebSocket|ws:\/\//i },
  { name: 'grpc', re: /\bgrpc\b|protobuf|proto/i },
  { name: 'mcp', re: /\/mcp|tools\/list|tools\/call|Model Context Protocol/i },
  { name: 'stdio', re: /process\.stdin|process\.stdout|\bstdio\b/i },
  { name: 'docker', re: /docker|docker-compose/i },
  { name: 'rabbitmq', re: /amqp|rabbitmq/i },
  { name: 'redis', re: /\bredis\b|redis-cli/i },
  { name: 'qdrant', re: /\bqdrant\b|collections/i },
  { name: 'postgres', re: /postgres|drizzle|pgTable|\bsql\b/i },
  { name: 'neo4j', re: /neo4j|Cypher|bolt:\/\//i },
];

export function detectProtocols(content: string): FeatureIndexMetadata['protocolDetected'] {
  const found: FeatureIndexMetadata['protocolDetected'] = [];
  for (const rule of PROTOCOL_RULES) {
    if (rule.re.test(content)) {
      found.push(rule.name);
    }
  }
  return found;
}
