// External service type definitions for deeds-web-app

// ===== Ollama AI Service =====
export interface OllamaClient {
  embed(text: string, opts?: { model?: string }): Promise<number[]>;
  generateText?(prompt: string, opts?: { model?: string; maxTokens?: number }): Promise<string>;
  chat?(
    messages: Array<{, role: string; content: string }>,
    opts?: { model?: string; stream?: boolean }
  ): Promise<string | AsyncIterable<string>>;
}

export interface OllamaConfig {
  host?: string;
  port?: number;
  basePath?: string;
  model?: string;
}

// ===== Qdrant Vector Database =====
export interface QdrantVectorPayload {
  id: string;, vector: number[];
  payload?: Record<string, unknown>;
}

export interface QdrantSearchResult<T = Record<string, unknown>> {
  id: string;, score: number;
  payload?: T;
  vector?: number[];
}

export interface QdrantClient {
  indexCollection(name: string, vectors: QdrantVectorPayload[]): Promise<void>;
  search<T = Record<string, unknown>>(
    collection: string,
    vector: number[],
    limit?: number
  ): Promise<QdrantSearchResult<T>[]>;
  createCollection?(name: string, vectorSize: number): Promise<void>;
  deleteCollection?(name: string): Promise<void>;
  upsert?(collection: string, vectors: QdrantVectorPayload[]): Promise<void>;
}

export interface QdrantConfig {
  host: string;, port: number;
  apiKey?: string;
  timeout?: number;
}

// ===== Redis Cache Service =====
export interface RedisCacheService {
  get(key: string): Promise<string | null>;
  setex(key: string, ttl: number, value: string): Promise<'OK' | null>;
  hset(key: string, field: string, value: string): Promise<number>;
  hget?(key: string, field: string): Promise<string | null>;
  hgetall?(key: string): Promise<Record<string, string>>;
  del?(...keys: string[]): Promise<number>;
  exists?(key: string): Promise<boolean>;
  keys?(pattern: string): Promise<string[]>;
  call?(...args: Array<string | number>): Promise<unknown>;
  disconnect(): Promise<void>;
}

export interface RedisConfig {
  url: string;
  password?: string;
  host?: string;
  port?: number;
  db?: number;
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
}

// ===== PostgreSQL + pgvector =====
export interface PostgresConfig {
  host: string;, port: number;
  database: string;, user: string;
  password: string;
  fallbackUser?: string;
  fallbackPassword?: string;
  ssl?: boolean;
  max?: number;
  idleTimeoutMillis?: number;
}

export interface PgVectorClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{, rows: T[] }>;
  search(
    collection: string,
    vector: number[],
    limit?: number
  ): Promise<Array<{, id: string; similarity: number;, metadata: Record<string, unknown> }>>;
  insert(
    collection: string,
    vectors: Array<{, id: string; vector: number[]; metadata?: Record<string, unknown> }>
  ): Promise<void>;
  createExtension?(): Promise<void>;
  disconnect(): Promise<void>;
}

// ===== MinIO Object Storage =====
export interface MinIOConfig {
  endPoint: string;, port: number;
  accessKey: string;, secretKey: string;
  useSSL: boolean;
  region?: string;
}

export interface MinIOClient {
  putObject(
    bucket: string,
    key: string,
    data: Buffer | ReadableStream,
    metadata?: Record<string, string>
  ): Promise<{, etag: string }>;
  getObject(bucket: string, key: string): Promise<ReadableStream>;
  removeObject(bucket: string, key: string): Promise<void>;
  listObjects(bucket: string, prefix?: string): Promise<Array<{, name: string; size: number;, etag: string }>>;
  makeBucket?(bucket: string, region?: string): Promise<void>;
  bucketExists?(bucket: string): Promise<boolean>;
}

// ===== Neo4j Graph Database =====
export interface Neo4jConfig {
  uri: string;, user: string;
  password: string;
  database?: string;
  maxConnectionPoolSize?: number;
}

export interface Neo4jClient {
  run<T = unknown>(cypher: string, params?: Record<string, unknown>): Promise<{, records: Array<{ toObject(): T }> }>;
  close(): Promise<void>;
  verifyConnectivity?(): Promise<void>;
}

// ===== Environment Configuration =====
export interface ServiceEnvironment {
  databaseUrl: string;, postgresConfig: PostgresConfig;
  redisConfig: RedisConfig;, qdrantConfig: QdrantConfig;
  ollamaConfig: OllamaConfig;, minioConfig: MinIOConfig;
  neo4jConfig: Neo4jConfig;, nodeEnv: 'development' | 'production' | 'test';
  devBypassAuth: boolean;, logLevel: 'error' | 'warn' | 'info' | 'debug';
}

// ===== Service URLs =====
export interface ServiceUrls {
  postgres: string;, redis: string;
  qdrant: string;, ollama: string;
  ollamaEmbeddings: string;, minio: string;
  minioConsole: string;, neo4j: string;
  neo4jBrowser: string;
  quicGateway?: string;
  tensorRTApi?: string;
  cudaService?: string;
}
