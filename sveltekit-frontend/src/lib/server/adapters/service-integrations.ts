/**
 * Server-Side Service Integration Adapters
 *
 * Production-ready helpers for:
 * - Ollama embeddings & chat (gemma4-rotorquant:latest, embeddinggemma:latest)
 * - Redis caching (IORedis)
 * - Qdrant vector indexing (@qdrant/js-client-rest)
 * - PostgreSQL + pgvector (pg + drizzle-orm)
 * - MinIO object storage (minio)
 * - Neo4j graph database (neo4j-driver)
 * - RabbitMQ message queue (amqplib)
 *
 * All configurations are loaded from environment variables.
 */
import { dev } from '$app/environment';
const privateEnv: Record<string, string | undefined> = process.env;
import { ENV } from '$lib/server/env.server.js';
import { VECTOR_CONFIG } from '$lib/server/config/vector-config.js';
import { getOllamaEndpoint, getOllamaEmbeddingEndpoint } from '$lib/server/utils/ollama-endpoint.js';
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
import { qdrant } from '$lib/server/vector/qdrant-manager.js';

// ===== Environment Configuration Loader =====
/**
 * Load service configuration from environment variables
 * Compatible with both Docker and native Windows services
 */
export function loadServiceEnvironment(): ServiceEnvironment {
  const databaseUrl = ENV.DATABASE_URL;
  const dbUrl = new URL(databaseUrl.replace('postgres://', 'postgresql://'));

  return {
    // Database
    databaseUrl,
    postgresConfig: {
      host: dbUrl.hostname,
      port: parseInt(dbUrl.port || '5432', 10),
      database: dbUrl.pathname.slice(1),
      user: dbUrl.username,
      password: dbUrl.password,
      ssl: process.env.NODE_ENV === 'production',
      max: 20,
      idleTimeoutMillis: 30000,
    },
    // Redis
    redisConfig: {
      url: ENV.REDIS_URL,
      password: privateEnv.REDIS_PASSWORD || undefined,
      host: new URL(ENV.REDIS_URL).hostname,
      port: new URL(ENV.REDIS_URL).port ? parseInt(new URL(ENV.REDIS_URL).port, 10) : 6379,
      db: 0,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    },
    // Qdrant
    qdrantConfig: {
      host: new URL(ENV.QDRANT_URL).hostname,
      port: new URL(ENV.QDRANT_URL).port ? parseInt(new URL(ENV.QDRANT_URL).port, 10) : 6333,
      apiKey: privateEnv.QDRANT_API_KEY,
      timeout: 30000,
    },
    // Ollama
    ollamaConfig: {
      baseUrl: getOllamaEndpoint(),
      embeddingModel: privateEnv.EMBEDDING_MODEL || 'embeddinggemma:latest',
      chatModel: privateEnv.CHAT_MODEL || 'gemma4-rotorquant:latest',
      gpuLayers: parseInt(privateEnv.OLLAMA_GPU_LAYERS || '30', 10),
      timeout: 60000,
    },
    // MinIO
    minioConfig: {
      endPoint: ENV.MINIO_ENDPOINT,
      port: parseInt(ENV.MINIO_PORT, 10),
      accessKey: ENV.MINIO_ACCESS_KEY,
      secretKey: ENV.MINIO_SECRET_KEY,
      useSSL: ENV.MINIO_USE_SSL === 'true',
      region: 'us-east-1',
    },
    // Neo4j
    neo4jConfig: {
      uri: ENV.NEO4J_URI,
      user: ENV.NEO4J_USER,
      password: ENV.NEO4J_PASSWORD,
      database: privateEnv.NEO4J_DATABASE || 'neo4j',
      maxConnectionPoolSize: 50,
    },
    // RabbitMQ
    rabbitmqConfig: {
      url: ENV.RABBITMQ_URL,
      enabled: privateEnv.RABBITMQ_ENABLED !== 'false',
      exchange: 'legal-ai-exchange',
      queuePrefix: 'legal-ai',
      heartbeat: 60,
    },
    // Development
    nodeEnv: (privateEnv.NODE_ENV || 'development') as 'development' | 'production' | 'test',
    devBypassAuth: dev,
    logLevel: (privateEnv.LOG_LEVEL || 'info') as 'error' | 'warn' | 'info' | 'debug',
  };
}

/**
 * Get all service URLs for health checks and debugging
 */
export function getServiceUrls(env: ServiceEnvironment): ServiceUrls {
  return {
    // Core Infrastructure
    postgres:
      'postgresql://' +
      env.postgresConfig.host +
      ':' +
      env.postgresConfig.port +
      '/' +
      env.postgresConfig.database,
    redis: env.redisConfig.url,
    qdrant: 'http://' + env.qdrantConfig.host + ':' + env.qdrantConfig.port,
    // AI Services
    ollama: env.ollamaConfig.baseUrl,
    ollamaEmbeddings: getOllamaEmbeddingEndpoint() + '/api/embeddings',
    // Storage & Processing
    minio:
      (env.minioConfig.useSSL ? 'https' : 'http') +
      '://' +
      env.minioConfig.endPoint +
      ':' +
      env.minioConfig.port,
    minioConsole:
      (env.minioConfig.useSSL ? 'https' : 'http') +
      '://' +
      env.minioConfig.endPoint +
      ':' +
      (env.minioConfig.port + 1),
    neo4j: env.neo4jConfig.uri,
    neo4jHttp: env.neo4jConfig.uri.replace('bolt://', 'http://').replace(':7687', ':7474'),
    rabbitmq: env.rabbitmqConfig.url,
    rabbitmqManagement: env.rabbitmqConfig.url
      .replace('amqp://', 'http://')
      .replace(':5672', ':15672'),
    // QUIC Microservices
    quicGateway: privateEnv.QUIC_GATEWAY_URL ?? '',
    quicVectorService: privateEnv.QUIC_VECTOR_SERVICE_URL ?? '',
    quicSearchService: privateEnv.QUIC_SEARCH_SERVICE_URL ?? '',
    // GPU Services
    tensorRTApi: privateEnv.TENSORRT_API_URL ?? '',
    tensorRTWs: privateEnv.TENSORRT_WS_URL ?? '',
    cudaService: privateEnv.CUDA_SERVICE_URL ?? '',
  };
}

// ===== Ollama Adapter =====
export class OllamaAdapter implements OllamaClient {
  constructor(private config: OllamaConfig) {}

  async embed(text: string, opts?: { model?: string }): Promise<number[]> {
    const model = opts?.model || this.config.embeddingModel;
    const url = this.config.baseUrl + '/api/embeddings';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model, prompt: text }),
      signal: AbortSignal.timeout(this.config.timeout || 60000),
    });

    if (!response.ok) {
      throw new Error('Ollama embed failed: ' + response.statusText);
    }

    const data = await response.json();
    return data.embedding;
  }

  async generateText(
    prompt: string,
    opts?: { model?: string; maxTokens?: number }
  ): Promise<string> {
    const model = opts?.model || this.config.chatModel;
    const url = this.config.baseUrl + '/api/generate';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        options: { num_predict: opts?.maxTokens || 512 },
      }),
      signal: AbortSignal.timeout(this.config.timeout || 60000),
    });

    if (!response.ok) {
      throw new Error('Ollama generate failed: ' + response.statusText);
    }

    const data = await response.json();
    return data.response;
  }

  async chat(
    messages: Array<{ role: string; content: string }>,
    opts?: { model?: string; stream?: boolean }
  ): Promise<string | AsyncIterable<string>> {
    const model = opts?.model || this.config.chatModel;
    const url = this.config.baseUrl + '/api/chat';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: opts?.stream || false,
      }),
      signal: AbortSignal.timeout(this.config.timeout || 60000),
    });

    if (!response.ok) {
      throw new Error('Ollama chat failed: ' + response.statusText);
    }

    if (opts?.stream) {
      return (async function* () {
        const reader = response.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(function (line) {
            return line.trim();
          });
          for (const line of lines) {
            try {
              const json = JSON.parse(line);
              if (json.message?.content) {
                yield json.message.content;
              }
            } catch {}
          }
        }
      })();
    }

    const data = await response.json();
    return data.message?.content || '';
  }
}

// ===== Redis Adapter (IORedis) =====
export class RedisAdapter implements RedisCacheService {
  private client: any;
  private connected = false;

  constructor(private config: RedisConfig) {}

  private async ensureConnected() {
    if (this.connected) return;
    const Redis = (await import('ioredis')).default;
    this.client = new Redis(this.config.url, {
      password: this.config.password,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest || 3,
      enableReadyCheck: this.config.enableReadyCheck !== false,
      lazyConnect: false,
    });
    await this.client.connect();
    this.connected = true;
  }

  async get(key: string): Promise<string | null> {
    await this.ensureConnected();
    return this.client.get(key);
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK' | null> {
    await this.ensureConnected();
    return this.client.setex(key, seconds, value);
  }

  async hset(key: string, data: Record<string, string>): Promise<number> {
    await this.ensureConnected();
    return this.client.hset(key, data);
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
  private client: any;

  constructor(private config: QdrantConfig) {}

  private async ensureClient() {
    if (this.client) return;
    const { QdrantClient: QdrantClientLib } = await import('@qdrant/js-client-rest');
    this.client = new QdrantClientLib({
      url: 'http://' + this.config.host + ':' + this.config.port,
      apiKey: this.config.apiKey,
      timeout: this.config.timeout || 30000,
    });
  }

  async createCollection(name: string, vectorSize: number): Promise<void> {
    await this.ensureClient();
    await this.client.createCollection(name, {
      vectors: { size: vectorSize, distance: 'Cosine' },
      hnsw_config: VECTOR_CONFIG.QDRANT_HNSW,
      quantization_config: VECTOR_CONFIG.QDRANT_QUANTIZATION,
    });
  }

  async indexCollection(name: string, vectors: QdrantVectorPayload[]): Promise<void> {
    await this.ensureClient();
    const points = vectors.map(function (v) {
      return {
        id: v.id,
        vector: v.vector,
        payload: v.payload || {},
      };
    });
    // Use the centralized qdrant upsert wrapper to enforce dimension checks
    await qdrant.upsert({ collection: name, points: points } as any);
  }

  async search(
    collection: string,
    vector: number[],
    limit?: number
  ): Promise<QdrantSearchResult<any>[]> {
    await this.ensureClient();
    const results = await this.client.search(collection, {
      vector: vector,
      limit: limit || 10,
      with_payload: true,
      with_vector: false,
    });
    return results.map(function (r: any) {
      return {
        id: r.id,
        score: r.score,
        payload: r.payload,
        vector: r.vector,
      };
    });
  }

  async upsert(collection: string, points: QdrantVectorPayload[]): Promise<void> {
    await this.ensureClient();
    // Delegate to central qdrant wrapper to get validation, batching and cache invalidation
    await qdrant.upsert({ collection, points } as any);
  }

  async deleteCollection(name: string): Promise<void> {
    await this.ensureClient();
    await this.client.deleteCollection(name);
  }
}

// ===== PostgreSQL + pgvector Adapter =====
export class PgVectorAdapter implements PgVectorClient {
	private pool: any;

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

	async query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> {
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
	): Promise<Array<{ id: string; similarity: number; metadata: Record<string, unknown> }>> {
		const vectorStr = '[' + vector.join(',') + ']';
		const sql = [
			'SELECT id, 1 - (embedding <=> $1::vector) as similarity, metadata',
			'FROM ' + collection,
			'ORDER BY embedding <=> $1::vector',
			'LIMIT $2'
		].join('\n');
		const result = await this.query(sql, [vectorStr, limit || 10]);
		return result.rows;
	}

	async insert(
		collection: string,
		vectors: Array<{ id: string; vector: number[]; metadata?: Record<string, unknown> }>
	): Promise<void> {
		const values = vectors
			.map(function(_v, i) {
				return '($' + (i * 3 + 1) + ', $' + (i * 3 + 2) + '::vector, $' + (i * 3 + 3) + '::jsonb)';
			})
			.join(',');
		const params: any[] = [];
		vectors.forEach(function(v) {
			params.push(v.id, '[' + v.vector.join(',') + ']', JSON.stringify(v.metadata || {}));
		});

		const sql = [
			'INSERT INTO ' + collection + ' (id, embedding, metadata)',
			'VALUES ' + values,
			'ON CONFLICT (id) DO UPDATE SET',
			'embedding = EXCLUDED.embedding,',
			'metadata = EXCLUDED.metadata'
		].join('\n');
		await this.query(sql, params);
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
	private client: any;

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
	): Promise<{ etag: string }> {
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
	): Promise<Array<{ name: string; size: number; etag: string }>> {
		await this.ensureClient();
		const stream = this.client.listObjects(bucket, prefix, true);
		const objects: Array<{ name: string; size: number; etag: string }> = [];
		return new Promise(function(resolve, reject) {
			stream.on('data', function(obj: any) {
				objects.push({ name: obj.name, size: obj.size, etag: obj.etag });
			});
			stream.on('end', function() { resolve(objects); });
			stream.on('error', reject);
		});
	}
}

// ===== Neo4j Adapter =====
export class Neo4jAdapter implements Neo4jClient {
	private driver: any;
	private session: any;

	constructor(private config: Neo4jConfig) {}

	private async ensureDriver() {
		if (this.driver) return;
		const neo4j = await import('neo4j-driver');
		this.driver = neo4j.default.driver(
			this.config.uri,
			neo4j.default.auth.basic(this.config.user, this.config.password),
			{ maxConnectionPoolSize: this.config.maxConnectionPoolSize || 50 }
		);
		this.session = this.driver.session({ database: this.config.database || 'neo4j' });
	}

	async run(
		cypher: string,
		params?: Record<string, unknown>
	): Promise<{ records: Array<{ toObject(): any }> }> {
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

// Singleton — pg/ioredis/neo4j drivers maintain internal connection pools.
// Constructing fresh adapters per request leaks connections and exhausts pools.
let _adapters: ReturnType<typeof buildAdapters> | null = null;

function buildAdapters() {
	const env = loadServiceEnvironment();
	const urls = getServiceUrls(env);
	return {
		env: urls,
		ollama: new OllamaAdapter(env.ollamaConfig),
		redis: new RedisAdapter(env.redisConfig),
		qdrant: new QdrantAdapter(env.qdrantConfig),
		pgvector: new PgVectorAdapter(env.postgresConfig),
		minio: new MinIOAdapter(env.minioConfig),
		neo4j: new Neo4jAdapter(env.neo4jConfig),
		rabbitmq: { url: env.rabbitmqConfig.url, enabled: env.rabbitmqConfig.enabled }
	};
}

export function getServiceAdapters() {
	if (!_adapters) _adapters = buildAdapters();
	return _adapters;
}

export async function healthCheckServices() {
	const adapters = getServiceAdapters();
	const services: Record<string, boolean> = {};

	// Check Redis
	try {
		await adapters.redis.get('health_check');
		services.redis = true;
	} catch (e) {
		services.redis = false;
	}

	// Check Ollama
	try {
		await adapters.ollama.embed('test');
		services.ollama = true;
	} catch (e) {
		services.ollama = false;
	}

	// Check Qdrant — probe collection list endpoint instead of forcing a search
	// against a fixed collection/dim that may not exist. The /collections endpoint
	// is the canonical Qdrant liveness check.
	try {
		const url = 'http://' + adapters.env.qdrant.split('://')[1];
		const res = await fetch(url + '/collections', { signal: AbortSignal.timeout(3_000) });
		services.qdrant = res.ok;
	} catch {
		services.qdrant = false;
	}

	// Check Postgres
	try {
		await adapters.pgvector.query('SELECT 1');
		services.pgvector = true;
	} catch (e) {
		services.pgvector = false;
	}

	// Check SeaweedFS / legacy MinIO adapter
	try {
		await adapters.minio.bucketExists('health-check-bucket');
		services.minio = true;
	} catch (e) {
		services.minio = false;
	}

	// Check Neo4j
	try {
		await adapters.neo4j.verifyConnectivity();
		services.neo4j = true;
	} catch (e) {
		services.neo4j = false;
	}

	return { services };
}
