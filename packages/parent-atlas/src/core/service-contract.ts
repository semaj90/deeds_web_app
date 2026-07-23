export const serviceProbeStatuses = ['LIVE_PASS', 'FALLBACK_PASS', 'FAIL'] as const;
export type ServiceProbeStatus = typeof serviceProbeStatuses[number];

export const serviceProbeTransports = ['http', 'grpc', 'jsonrpc', 'postgres', 'redis'] as const;
export type ServiceProbeTransport = typeof serviceProbeTransports[number];

export const canonicalServiceNames = [
  'gemma4-llama-server',
  'langextract',
  'turbovec-grpc',
  'go-retrieval',
  'embeddinggemma',
  'qdrant',
  'postgres',
  'seaweedfs',
  'neo4j',
  'redis-valkey',
] as const;

export type CanonicalServiceName = typeof canonicalServiceNames[number];

export type ServiceProbe = {
  service_name: CanonicalServiceName;
  url: string;
  port: number;
  transport: ServiceProbeTransport;
  status: ServiceProbeStatus;
  fallback_used: boolean;
  duration_ms: number;
  error?: string;
};

export const canonicalServiceProbeDefaults: Record<CanonicalServiceName, {
  url: string;
  port: number;
  transport: ServiceProbeTransport;
  role: string;
}> = {
  'gemma4-llama-server': {
    url: 'http://127.0.0.1:8090',
    port: 8090,
    transport: 'http',
    role: 'Gemma4 bounded synthesis and LangExtract fallback; Ollama is not used for synthesis.',
  },
  langextract: {
    url: 'http://127.0.0.1:8096',
    port: 8096,
    transport: 'http',
    role: 'Feature extraction backed by Gemma4 llama-server.',
  },
  'turbovec-grpc': {
    url: '127.0.0.1:50062',
    port: 50062,
    transport: 'grpc',
    role: 'TurboVec accelerator proof and ANN bridge; legacy JSON-RPC 8792 is not canonical.',
  },
  'go-retrieval': {
    url: 'http://127.0.0.1:8100',
    port: 8100,
    transport: 'http',
    role: 'Go search and retrieval orchestration with HTTP health and gRPC search.',
  },
  embeddinggemma: {
    url: 'http://127.0.0.1:8081',
    port: 8081,
    transport: 'http',
    role: 'EmbeddingGemma OpenAI-compatible embedding endpoint; Ollama fallback is embedding-only.',
  },
  qdrant: {
    url: 'http://127.0.0.1:6333',
    port: 6333,
    transport: 'http',
    role: 'Dense vector mirror with payload tags; Postgres remains truth.',
  },
  postgres: {
    url: 'postgresql://127.0.0.1:5434/legal_ai_db',
    port: 5434,
    transport: 'postgres',
    role: 'Canonical packet, summary, feature, telemetry, and provenance truth store.',
  },
  seaweedfs: {
    url: 'http://127.0.0.1:8333',
    port: 8333,
    transport: 'http',
    role: 'Blob/object storage. HTTP 403 at root is acceptable liveness for an authenticated S3 gateway.',
  },
  neo4j: {
    url: 'http://127.0.0.1:7474',
    port: 7474,
    transport: 'http',
    role: 'Graph mirror and GDS/PageRank lane, not canonical truth.',
  },
  'redis-valkey': {
    url: 'redis://127.0.0.1:6379',
    port: 6379,
    transport: 'redis',
    role: 'Hot cache and BitFrost semantic cache, not canonical truth.',
  },
};

