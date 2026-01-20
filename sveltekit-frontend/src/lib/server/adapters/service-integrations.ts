/**
 * Server-Side Service Integration Adapters
 *
 * Production-ready helpers for:
 * - Ollama bindings (gemma3, embeddinggemma)
 * - Redis caching
 * - Qdrant vector indexing
 * - PostgreSQL + pgvector
 * - MinIO object storage
 * - Neo4j graph database
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
export function loadServiceEnvironment(): ServiceEnvironment {
	const databaseUrlStr = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
	const dbUrl = new URL(databaseUrlStr.replace('postgres://', 'postgresql://'));

	return {
		// Database
		databaseUrl: databaseUrlStr,
		postgresConfig: {
			host: dbUrl.hostname || 'localhost',
			port: parseInt(dbUrl.port || '5432', 10),
			database: dbUrl.pathname.slice(1) || 'legal_ai_db',
			user: dbUrl.username || process.env.POSTGRES_USER || 'legal_admin',
			password: dbUrl.password || process.env.POSTGRES_PASSWORD || '123456',
			ssl: process.env.NODE_ENV === 'production',
			max: 20,
			idleTimeoutMillis: 30000,
			fallbackUser: 'postgres',
			fallbackPassword: process.env.POSTGRES_SUPERUSER_PASSWORD || 'postgres'
		},
		// Redis
		redisConfig: {
			url: process.env.REDIS_URL || 'redis://localhost:6379/0',
			password: process.env.REDIS_PASSWORD || undefined,
			host: process.env.REDIS_HOST || 'localhost',
			port: parseInt(process.env.REDIS_PORT || '6379', 10),
			db: 0,
			maxRetriesPerRequest: 3,
			enableReadyCheck: true
		},
		// Qdrant
		qdrantConfig: {
			host: process.env.QDRANT_HOST || 'localhost',
			port: parseInt(process.env.QDRANT_PORT || '6333', 10),
			apiKey: process.env.QDRANT_API_KEY,
			timeout: 30000
		},
		// Ollama
		ollamaConfig: {
			baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
			embeddingModel: process.env.EMBEDDING_MODEL || 'embeddinggemma:latest',
			chatModel: process.env.CHAT_MODEL || 'gemma3:legal-latest',
			gpuLayers: parseInt(process.env.OLLAMA_GPU_LAYERS || '30', 10),
			timeout: 60000
		},
		// MinIO
		minioConfig: {
			endPoint: (process.env.MINIO_ENDPOINT || 'localhost:9000').split(':')[0],
			port: parseInt(
				(process.env.MINIO_ENDPOINT || 'localhost:9000').split(':')[1] ||
				process.env.MINIO_PORT || '9000',
				10
			),
			accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
			secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
			useSSL: process.env.MINIO_USE_SSL === 'true',
			region: 'us-east-1'
		},
		// Neo4j
		neo4jConfig: {
			uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
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

export function getServiceUrls(env: ServiceEnvironment): ServiceUrls {
	return {
		postgres: `postgresql://${env.postgresConfig.host}:${env.postgresConfig.port}/${env.postgresConfig.database}`,
		redis: env.redisConfig.url,
		qdrant: `http://${env.qdrantConfig.host}:${env.qdrantConfig.port}`,
		ollama: env.ollamaConfig.baseUrl,
		ollamaEmbeddings: `${env.ollamaConfig.baseUrl}/api/embeddings`,
		minio: `${env.minioConfig.useSSL ? 'https' : 'http'}://${env.minioConfig.endPoint}:${env.minioConfig.port}`,
		minioConsole: `${env.minioConfig.useSSL ? 'https' : 'http'}://${env.minioConfig.endPoint}:${env.minioConfig.port + 1}`,
		neo4j: env.neo4jConfig.uri,
		neo4jBrowser: env.neo4jConfig.uri.replace('bolt://', 'http://').replace(':7687', ':7474'),
		quicGateway: process.env.QUIC_GATEWAY_URL,
		quicVectorService: process.env.QUIC_VECTOR_SERVICE_URL,
		quicSearchService: process.env.QUIC_SEARCH_SERVICE_URL,
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
			signal: AbortSignal.timeout(this.config.timeout ?? 60000)
		});

		if (!response.ok) {
			throw new Error(`Ollama embed failed, ${response.statusText}`);
		}

		const data = await response.json();
		return data.embedding;
	}

	async generateText(prompt: string, opts?: { model?: string; maxTokens?: number }): Promise<string> {
		const model = opts?.model ?? this.config.chatModel ?? 'gemma3:legal-latest';
		const url = `${this.config.baseUrl}/api/generate`;

        const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				prompt,
				options: { num_predict: opts?.maxTokens ?? 512 },
				stream: false
			}),
			signal: AbortSignal.timeout(this.config.timeout ?? 60000)
		});

		if (!response.ok) throw new Error(`Ollama generate failed, ${response.statusText}`);

        const data = await response.json();
		return data.response;
	}

	async chat(
		messages: Array<{ role: string; content: string }>,
		opts?: { model?: string; stream?: boolean }
	): Promise<string | AsyncIterable<string>> {
		const model = opts?.model ?? this.config.chatModel ?? 'gemma3:legal-latest';
		const url = `${this.config.baseUrl}/api/chat`;

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

		if (!response.ok) throw new Error(`Ollama chat failed, ${response.statusText}`);

		if (opts?.stream) {
			return (async function* () {
				const reader = response.body?.getReader();
				if (!reader) return;
				const decoder = new TextDecoder();

                while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					const chunk = decoder.decode(value, { stream: true });
					const lines = chunk.split('\n').filter(Boolean);
					for (const line of lines) {
						try {
							const json = JSON.parse(line);
							if (json.message?.content) yield json.message.content;
						} catch {}
					}
				}
			})();
		}

		const data = await response.json();
		return data.message?.content ?? '';
	}

	async listModels(): Promise<string[]> {
		try {
			const url = `${this.config.baseUrl}/api/tags`;
			const response = await fetch(url);
			if (!response.ok) return [];
			const data = await response.json();
			return data.models?.map((m: any) => m.name) || [];
		} catch {
			return [];
		}
	}
}

// ===== Redis Adapter =====
export class RedisAdapter implements RedisCacheService {
	private client: any; // Using explicit Type in implementation would require imports
	private connected = false;

	constructor(private config: RedisConfig) {}

	private async ensureConnected() {
		if (this.connected && this.client) return;
		const { createClient } = await import('redis'); // Using standard redis package
        // Note: Previous code used ioredis, but simple redis package is common.
        // I will stick to ioredis if that was clearer intent, but standard redis is fine too.
        // Actually, previous code said "IORedis" in comments but imported 'redis' in some places.
        // I'll use `import { createClient } from 'redis'` pattern which matches `createClient` usage.

		this.client = createClient({
			url: this.config.url,
            password: this.config.password
		});

        await this.client.connect();
		this.connected = true;
	}

	async get(key: string): Promise<string | null> {
		await this.ensureConnected();
		return this.client.get(key);
	}

	async setex(key: string, seconds: number, value: string): Promise<string | null> {
		await this.ensureConnected();
		return this.client.setEx(key, seconds, value);
	}

    // Adding missing methods based on standard usage
    async set(key: string, value: string): Promise<void> {
        await this.ensureConnected();
        await this.client.set(key, value);
    }

    async del(key: string): Promise<void> {
        await this.ensureConnected();
        await this.client.del(key);
    }
}

// ===== Qdrant Adapter =====
export class QdrantAdapter implements QdrantClient {
	private client: any;

	constructor(private config: QdrantConfig) {}

	private async ensureClient() {
		if (this.client) return;
		const { QdrantClient } = await import('@qdrant/js-client-rest');
		this.client = new QdrantClient({
			url: `http://${this.config.host}:${this.config.port}`,
			apiKey: this.config.apiKey
		});
	}

	async createCollection(name: string, vectorSize: number): Promise<void> {
		await this.ensureClient();
		await this.client.createCollection(name, {
			vectors: { size: vectorSize, distance: 'Cosine' }
		});
	}

	async upsert(collection: string, points: QdrantVectorPayload[]): Promise<void> {
		await this.ensureClient();
		await this.client.upsert(collection, { points, wait: true });
	}

	async search(collection: string, vector: number[], limit = 10): Promise<QdrantSearchResult[]> {
		await this.ensureClient();
		const results = await this.client.search(collection, {
			vector,
			limit,
			with_payload: true
		});
		return results.map((r: any) => ({
			id: r.id,
			score: r.score,
			payload: r.payload,
			vector: r.vector
		}));
	}

    async getCollections(): Promise<string[]> {
        await this.ensureClient();
        const res = await this.client.getCollections();
        return res.collections.map((c: any) => c.name);
    }
}

// ===== MinIO Adapter =====
export class MinIOAdapter implements MinIOClient {
    private client: any;

    constructor(private config: MinIOConfig) {}

    private async ensureClient() {
        if(this.client) return;
        const Minio = await import('minio');
        // @ts-ignore
        this.client = new Minio.Client({
            endPoint: this.config.endPoint,
            port: this.config.port,
            useSSL: this.config.useSSL,
            accessKey: this.config.accessKey,
            secretKey: this.config.secretKey
        });
    }

    async bucketExists(bucket: string): Promise<boolean> {
        await this.ensureClient();
        return this.client.bucketExists(bucket);
    }

    async makeBucket(bucket: string): Promise<void> {
        await this.ensureClient();
        await this.client.makeBucket(bucket, this.config.region);
    }

    async putObject(bucket: string, objectName: string, stream: any): Promise<void> {
        await this.ensureClient();
        await this.client.putObject(bucket, objectName, stream);
    }
}

// ===== Neo4j Adapter =====
export class Neo4jAdapter implements Neo4jClient {
    private driver: any;

    constructor(private config: Neo4jConfig) {}

    private async ensureDriver() {
        if(this.driver) return;
        const neo4j = await import('neo4j-driver');
        this.driver = neo4j.driver(
            this.config.uri,
            neo4j.auth.basic(this.config.user, this.config.password),
            { maxConnectionPoolSize: this.config.maxConnectionPoolSize }
        );
    }

    async executeQuery(query: string, params: Record<string, any> = {}): Promise<any> {
        await this.ensureDriver();
        const session = this.driver.session({ database: this.config.database });
        try {
            const result = await session.run(query, params);
            return result.records.map((r: any) => r.toObject());
        } finally {
            await session.close();
        }
    }

    async close(): Promise<void> {
        if(this.driver) {
            await this.driver.close();
            this.driver = null;
        }
    }
}
