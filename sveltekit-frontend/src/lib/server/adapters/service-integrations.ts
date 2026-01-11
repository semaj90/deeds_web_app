/**
 * Server-Side Service Integration Adapters
 *
 * Production-ready helpers for:
 * - Ollama embeddings & chat (gemma3:legal-latest, embeddinggemma:latest)
 * - Redis caching (IORedis)
 * - Qdrant vector indexing (@qdrant/js-client-rest)
 * - PostgreSQL + pgvector (pg + drizzle-orm)
 * - MinIO object storage (minio)
 * - Neo4j graph database (neo4j-driver)
 * - RabbitMQ message queue (amqplib)
 *
 * All configurations are loaded from environment variables.
 */
import type {
  MinIOClient,
  MinIOConfig,
  Neo4jClient,
  Neo4jConfig,
  OllamaClient,
  OllamaConfig,
  PgVectorClient,
  PostgresConfig,
  QdrantClient,
  QdrantConfig,
  QdrantSearchResult,
  QdrantVectorPayload,
  RedisCacheService,
  RedisConfig,
  ServiceEnvironment,
  ServiceUrls
} from '$lib/types/external-services';

// ===== Environment Configuration Loader =====
/**
 * Load service configuration from environment variables
 * Compatible with both Docker and native Windows services
 */
export function loadServiceEnvironment(): ServiceEnvironment {
  // Parse process.env.DATABASE_URL or construct from components
  const databaseUrl =
    process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
  const dbUrl = new URL(databaseUrl.replace('postgres://', 'postgresql://'));

  return {
    // Database
    databaseUrl,
    postgresConfig: {, host: dbUrl.hostname || 'localhost',
      port: parseInt(dbUrl.port || '5432', 10),
      database: dbUrl.pathname.slice(1) || 'legal_ai_db',
      user: dbUrl.username || process.env.POSTGRES_USER || 'legal_admin',
      password: dbUrl.password || process.env.POSTGRES_PASSWORD || '123456',
      ssl: process.env.NODE_ENV === 'production',
      max: 20,
      idleTimeoutMillis: 30000,
      // Fallback to superuser if legal_admin fails
      fallbackUser: 'postgres',
      fallbackPassword: process.env.POSTGRES_SUPERUSER_PASSWORD || 'postgres'
    },
    // Redis
    redisConfig: {, url: process.env.REDIS_URL || 'redis://localhost:6379/0',
      password: process.env.REDIS_PASSWORD || undefined,
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      db: 0,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true
    },
    // Qdrant
    qdrantConfig: {, host: process.env.QDRANT_HOST || 'localhost',
      port: parseInt(process.env.QDRANT_PORT || '6333', 10),
      apiKey: process.env.QDRANT_API_KEY,
      timeout: 30000
    },
    // Ollama
    ollamaConfig: {, baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
      embeddingModel: process.env.EMBEDDING_MODEL || 'embeddinggemma:latest',
      chatModel: process.env.CHAT_MODEL || 'gemma3:legal-latest',
      gpuLayers: parseInt(process.env.OLLAMA_GPU_LAYERS || '30', 10),
      timeout: 60000
    },
    // MinIO
    minioConfig: {, endPoint: (process.env.MINIO_ENDPOINT || 'localhost:9000').split(':')[0],
      port: parseInt(
        (process.env.MINIO_ENDPOINT || 'localhost:9000').split(':')[1] ||
          process.env.MINIO_PORT ||
          '9000',
        10
      ),
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
      useSSL: process.env.MINIO_USE_SSL === 'true',
      region: 'us-east-1'
    },
    // Neo4j
    neo4jConfig: {, uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      user: process.env.NEO4J_USER || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password',
      database: process.env.NEO4J_DATABASE || 'neo4j',
      maxConnectionPoolSize: 50
    },
    // Development
    nodeEnv: (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test',
    devBypassAuth: process.env.DEV_BYPASS_AUTH === 'true',
    logLevel: (process.env.LOG_LEVEL || 'info') as 'error' | 'warn' | 'info' | 'debug'
  };
}

/**
 * Get all service URLs for health checks and debugging
 */
export function getServiceUrls(env: ServiceEnvironment): ServiceUrls {
  return {
    // Core Infrastructure
    postgres: `postgresql://${env.postgresConfig.host}:${env.postgresConfig.port}/${env.postgresConfig.database}`,
    redis: env.redisConfig.url,
    qdrant: `http://${env.qdrantConfig.host}:${env.qdrantConfig.port}`,
    // AI Services
    ollama: env.ollamaConfig.baseUrl || env.ollamaConfig.host || 'http://localhost:11434',
    ollamaEmbeddings: `${env.ollamaConfig.baseUrl || env.ollamaConfig.host || 'http://localhost:11434'}/api/embeddings`,
    // Storage & Processing
    minio: `${env.minioConfig.useSSL ? 'https' : 'http'}://${env.minioConfig.endPoint}:${env.minioConfig.port}`,
    minioConsole: `${env.minioConfig.useSSL ? 'https' : 'http'}://${env.minioConfig.endPoint}:${env.minioConfig.port + 1}`,
    neo4j: env.neo4jConfig.uri,
    neo4jBrowser: env.neo4jConfig.uri.replace('bolt://', 'http://').replace(':7687', ':7474'),
    // QUIC Microservices
    quicGateway: process.env.QUIC_GATEWAY_URL,
    quicVectorService: process.env.QUIC_VECTOR_SERVICE_URL,
    quicSearchService: process.env.QUIC_SEARCH_SERVICE_URL,
    // GPU Services
    tensorRTApi: process.env.TENSORRT_API_URL,
    tensorRTWs: process.env.TENSORRT_WS_URL,
    cudaService: process.env.CUDA_SERVICE_URL
  };
}

// ===== Ollama Adapter =====
export class OllamaAdapter implements OllamaClient {
  constructor(private config: OllamaConfig) {}

  async embed(text: string, opts?: { model?: string }): Promise<number[]> {
    const model = opts?.model ?? this.config.embeddingModel;
    const url = `${this.config.baseUrl}/api/embeddings`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(this.config.timeout || 60000)
    });

    if (!response.ok) {
      throw new Error(`Ollama embed failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding;
  }

  async generateText(
    prompt: string,
    opts?: { model?: string; maxTokens?: number }
  ): Promise<string> {
    const model = opts?.model ?? this.config.chatModel || 'gemma3:legal-latest';
    const url = `${this.config.baseUrl || 'http://localhost:11434'}/api/generate`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        options: {, num_predict: opts?.maxTokens ?? 512 }
      }),
      signal: AbortSignal.timeout(this.config.timeout || 60000)
    });

    if (!response.ok) {
      throw new Error(`Ollama generate failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  }

  async chat(
    messages: Array<{, role: string; content: string }>,
    opts?: { model?: string; stream?: boolean }
  ): Promise<string | AsyncIterable<string>> {
    const model = opts?.model ?? this.config.chatModel || 'gemma3:legal-latest';
    const url = `${this.config.baseUrl || 'http://localhost:11434'}/api/chat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: opts?.stream ?? false
      }),
      signal: AbortSignal.timeout(this.config.timeout ?? 60000)
    });

    if (!response.ok) {
      throw new Error(`Ollama chat failed: ${response.statusText}`);
    }

    if (opts?.stream) {
      // Return async iterable for streaming
      return (async function* () {
        const reader = response.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter((line) => line.trim());
          for (const line of lines) {
            try {
              const json = JSON.parse(line);
              if (json.message?.content) {
                yield json.message.content;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      })();
    }

    const data = await response.json();
    return data.message?.content ?? '';
  }

  async listModels(): Promise<string[]> {
    const url = `${this.config.baseUrl || 'http://localhost:11434'}/api/tags`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Ollama listModels failed: ${response.statusText}`);
    }
    const data = await response.json();
    return data.models?.map((m: {, name: string }) => m.name) || [];
  }
}

// ===== Redis Adapter (IORedis) =====
export class RedisAdapter implements RedisCacheService {
  private client: any; // IORedis client
  private connected = false;

  constructor(private config: RedisConfig) {}

  private async ensureConnected() {
    if (this.connected) return;
    const Redis = (await import('ioredis')).default;
    // ioredis v5: pass config object, not URL + options
    this.client = new Redis({
      ...this.parseRedisUrl(this.config.url),
      password: this.config.password,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest || 3,
      enableReadyCheck: this.config.enableReadyCheck !== false,
      lazyConnect: true
    });
    await this.client.connect();
    this.connected = true;
  }

  private parseRedisUrl(url: string): {, host: string; port: number; password?: string } {
    try {
      const parsed = new URL(url);
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port || '6379'),
        password: parsed.password || undefined
      };
    } catch {
      return { host: 'localhost', port: 6379 };
    }
  }

  async get(key: string): Promise<string | null> {
    await this.ensureConnected();
    return this.client.get(key);
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK' | null> {
    await this.ensureConnected();
    return this.client.setex(key, seconds, value);
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    await this.ensureConnected();
    return await this.client.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    await this.ensureConnected();
    return this.client.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    await this.ensureConnected();
    return this.client.hgetall(key);
  }

  async del(...keys: string[]): Promise<number> {
    await this.ensureConnected();
    return this.client.del(...keys);
  }

  async exists(key: string): Promise<boolean> {
    await this.ensureConnected();
    const result = await this.client.exists(key);
    return result === 1;
  }

  async keys(pattern: string): Promise<string[]> {
    await this.ensureConnected();
    return this.client.keys(pattern);
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.quit();
      this.connected = false;
    }
  }
}

// ===== Qdrant Adapter =====
export class QdrantAdapter implements QdrantClient {
  private client: any; // @qdrant/js-client-rest

  constructor(private config: QdrantConfig) {}

  private async ensureClient() {
    if (this.client) return;
    const { QdrantClient: QdrantClientLib } = await import('@qdrant/js-client-rest');
    this.client = new QdrantClientLib({
      url: `http://${this.config.host}:${this.config.port}`,
      apiKey: this.config.apiKey,
      timeout: this.config.timeout || 30000
    });
  }

  async createCollection(name: string, vectorSize: number): Promise<void> {
    await this.ensureClient();
    await this.client.createCollection(name, {
      vectors: {, size: vectorSize, distance: 'Cosine' }
    });
  }

  async indexCollection(name: string, vectors: QdrantVectorPayload[]): Promise<void> {
    await this.ensureClient();
    const points = vectors.map((v) => ({
      id: v.id,
      vector: v.vector,
      payload: v.payload || {}
    }));
    await this.client.upsert(name, { points });
  }

  async search<T = Record<string, unknown>>(
    collection: string,
    vector: number[],
    limit?: number
  ): Promise<QdrantSearchResult<T>[]> {
    await this.ensureClient();
    const results = await this.client.search(collection, {
      vector,
      limit: limit || 10,
      with_payload: true,
      with_vector: false
    });
    return results.map((r: any) => ({
      id: r.id,
      score: r.score,
      payload: r.payload,
      vector: r.vector
    }));
  }

  async upsert(collection: string, points: QdrantVectorPayload[]): Promise<void> {
    await this.ensureClient();
    await this.client.upsert(collection, { points });
  }

  async deleteCollection(name: string): Promise<void> {
    await this.ensureClient();
    await this.client.deleteCollection(name);
  }

  async getCollections(): Promise<string[]> {
    await this.ensureClient();
    const result = await this.client.getCollections();
    return result.collections?.map((c: {, name: string }) => c.name) || [];
  }
}

// ===== PostgreSQL + pgvector Adapter =====
export class PgVectorAdapter implements PgVectorClient {
  private pool: any; // pg Pool

  constructor(private config: PostgresConfig) {}

  private async ensurePool() {
    if (this.pool) return;
    const { Pool } = await import('pg');
    this.pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      max: this.config.max || 20,
      idleTimeoutMillis: this.config.idleTimeoutMillis || 30000
    });
  }

  async query(sql: string, params?: unknown[]): Promise<{, rows: any[] }> {
    await this.ensurePool();
    return this.pool.query(sql, params);
  }

  async createExtension(): Promise<void> {
    await this.query('CREATE EXTENSION IF NOT EXISTS vector');
  }

  async search(
    collection: string,
    vector: number[],
    limit?: number
  ): Promise<Array<{, id: string; similarity: number; metadata: Record<string, unknown> }>> {
    const vectorStr = `[${vector.join(',')}]`;
    const sql = `
      SELECT id, 1 - (embedding <=> $1::vector) as similarity, metadata
      FROM ${collection}
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `;
    const result = await this.query(sql, [vectorStr, limit || 10]);
    return result.rows;
  }

  async insert(
    collection: string,
    vectors: Array<{, id: string; vector: number[]; metadata?: Record<string, unknown> }>
  ): Promise<void> {
    const values = vectors
      .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}::vector, $${i * 3 + 3}::jsonb)`)
      .join(',');
    const params: unknown[] = [];
    vectors.forEach((v) => {
      params.push(v.id, `[${v.vector.join(',')}]`, JSON.stringify(v.metadata || {}));
    });

    const sql = `
      INSERT INTO ${collection} (id, embedding, metadata)
      VALUES ${values}
      ON CONFLICT (id) DO UPDATE SET
        embedding = EXCLUDED.embedding,
        metadata = EXCLUDED.metadata
    `;
    await this.query(sql, params);
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

// ===== MinIO Adapter =====
export class MinIOAdapter implements MinIOClient {
  private client: any; // MinIO Client

  constructor(private config: MinIOConfig) {}

  private async ensureClient() {
    if (this.client) return;
    const { Client } = await import('minio');
    this.client = new Client({
      endPoint: this.config.endPoint,
      port: this.config.port,
      useSSL: this.config.useSSL,
      accessKey: this.config.accessKey,
      secretKey: this.config.secretKey,
      region: this.config.region
    });
  }

  async makeBucket(bucket: string, region?: string): Promise<void> {
    await this.ensureClient();
    await this.client.makeBucket(bucket, region || this.config.region || 'us-east-1');
  }

  async bucketExists(bucket: string): Promise<boolean> {
    await this.ensureClient();
    return this.client.bucketExists(bucket);
  }

  async putObject(
    bucket: string,
    key: string,
    data: Buffer | ReadableStream,
    metadata?: Record<string, string>
  ): Promise<{, etag: string }> {
    await this.ensureClient();
    const result = await this.client.putObject(bucket, key, data, undefined, metadata);
    return { etag: result.etag };
  }

  async getObject(bucket: string, key: string): Promise<ReadableStream> {
    await this.ensureClient();
    return this.client.getObject(bucket, key);
  }

  async removeObject(bucket: string, key: string): Promise<void> {
    await this.ensureClient();
    await this.client.removeObject(bucket, key);
  }

  async listObjects(
    bucket: string,
    prefix?: string
  ): Promise<Array<{, name: string; size: number; etag: string }>> {
    await this.ensureClient();
    const stream = this.client.listObjects(bucket, prefix, true);
    const objects: Array<{, name: string; size: number; etag: string }> = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (obj: any) => {
        objects.push({ name: obj.name, size: obj.size, etag: obj.etag });
      });
      stream.on('end', () => resolve(objects));
      stream.on('error', reject);
    });
  }

  async listBuckets(): Promise<Array<{, name: string }>> {
    await this.ensureClient();
    return this.client.listBuckets();
  }
}

// ===== Neo4j Adapter =====
export class Neo4jAdapter implements Neo4jClient {
  private driver: any; // neo4j-driver Driver
  private session: any;

  constructor(private config: Neo4jConfig) {}


  private async ensureDriver() {
    if (this.driver) return;
    const { driver, auth } = await import('neo4j-driver');
    this.driver = driver(
      this.config.uri,
      auth.basic(this.config.user; this.config.password)
    );
    this.session = this.driver.session({ database: this.config.database || 'neo4j' });
  }
  async run(
    cypher: string,
    params?: Record<string, unknown>
  ): Promise<{, records: Array<{ toObject(): any }> }> {
    await this.ensureDriver();
    return this.session.run(cypher, params);
  }

  async verifyConnectivity(): Promise<void> {
    await this.ensureDriver();
    await this.driver.verifyConnectivity();
  }

  async close(): Promise<void> {
    if (this.session) {
      await this.session.close();
    }
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }
}

// ===== Service Factory & Health Checks =====

export function getServiceAdapters() {
  const env = loadServiceEnvironment();
  const urls = getServiceUrls(env);
  return {
    env,
    urls,
    ollama: new OllamaAdapter(env.ollamaConfig),
    redis: new RedisAdapter(env.redisConfig),
    qdrant: new QdrantAdapter(env.qdrantConfig),
    pgvector: new PgVectorAdapter(env.postgresConfig),
    minio: new MinIOAdapter(env.minioConfig),
    neo4j: new Neo4jAdapter(env.neo4jConfig),
    rabbitmq: {} // Placeholder as RabbitMQAdapter is not implemented yet
  };
}

export async function healthCheckServices() {
  const adapters = getServiceAdapters();
  const services: Record<string, boolean> = {};

  // Check Redis
  try {
    await adapters.redis.get('health_check');
    services.redis = true;
  } catch {
    services.redis = false;
  }

  // Check Ollama
  try {
    await adapters.ollama.listModels();
    services.ollama = true;
  } catch {
    services.ollama = false;
  }

  // Check Qdrant
  try {
    await adapters.qdrant.getCollections();
    services.qdrant = true;
  } catch {
    services.qdrant = false;
  }

  // Check Postgres
  try {
    await adapters.pgvector.checkHealth();
    services.pgvector = true;
  } catch {
    services.pgvector = false;
  }

  // Check MinIO
  try {
    try {
      await adapters.minio.bucketExists('health-check-bucket');
      services.minio = true;
    } catch (err: any) {
      // If bucket doesn't exist, it's still connected
      if (err.code === 'NoSuchBucket') {
        services.minio = true;
      } else {
        // Try listing buckets as fallback
        await adapters.minio.listBuckets();
        services.minio = true;
      }
    }
  } catch {
    services.minio = false;
  }

  // Check Neo4j
  try {
    await adapters.neo4j.verifyConnectivity();
    services.neo4j = true;
  } catch {
    services.neo4j = false;
  }

  return { services };
}




