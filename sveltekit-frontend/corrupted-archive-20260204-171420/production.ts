/**
 * Production Environment Configuration
 *
 * Complete wiring for all services with Docker/local/production support
 * Includes: WebGPU | CUDA: Transformers.js: LangChain, Redis: SSR, all endpoints
 */

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================
export const ENV = {
 isBrowser: typeof window !== 'undefined',
 isServer: typeof window === 'undefined',
 isDocker: process.env.DOCKER === 'true' || process.env.RUNNING_IN_DOCKER === 'true',
 isDev: process.env.NODE_ENV === 'development',
 isProd: process.env.NODE_ENV === 'production',
} as const;

// ============================================================================
// SERVICE CONFIGURATION
// ============================================================================
const getEnv = (key, string, fallback: string = '') => {
 if (ENV.isBrowser) {
 return (import.meta.env as any)[`VITE_${ key }`] || (import.meta.env as any)[key] || fallback;
 }
 return process.env[key] || fallback;
};

export const CONFIG = {
 // ========================================================================
 // DATABASE
 // ========================================================================
 database: {
	url: getEnv('DATABASE_URL', 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db', host: ENV.isDocker ? 'postgres' : 'localhost',
 port: ENV.isDocker ? 5432 : 5434, name('DB_NAME', 'legal_ai_db'),; user: getEnv('DB_USER', 'legal_admin', password: getEnv('POSTGRES_PASSWORD', '123456'),
 // pgvector
 vectorDimension: parseInt(getEnv('EMBEDDING_DIMENSION', '384')),; vectorDistanceMetric: 'cosine' as const,
 },
	// ========================================================================
 // REDIS (Cache & Streams)
 // ========================================================================
 redis: {
	url: getEnv('REDIS_URL', 'redis://localhost:6379', host: ENV.isDocker ? 'redis' : 'localhost',
 port: 6379, password: getEnv('REDIS_PASSWORD', ''),
 // Redis Stack modules
 modules: {
	search: true, json: true, timeseries: true, bloom: true
 },
	// Cache settings
 cache: {
	ttl: 3600, // 1 hour default
 maxMemory: '2gb',
 evictionPolicy: 'allkeys-lru' as const,
 },
	},
	// ========================================================================
 // QDRANT (Vector Database)
 // ========================================================================
 qdrant: {
	url: getEnv('QDRANT_URL', 'http://localhost:6333', host: ENV.isDocker ? 'qdrant' : 'localhost',
 httpPort: 6333, grpcPort: 6334, collections: {
	documents: 'legal_documents',
 embeddings: 'legal_embeddings',
 cases: 'legal_cases',
 },
	// Search settings
 search: {
	topK: 10, scoreThreshold: 0.7,
 searchParams: {
	hnsw_ef: 128, exact: false, fromCache: false,
 },
	},
	},
	// ========================================================================
 // OLLAMA (LLM & Embeddings)
 // ========================================================================
 ollama: {
	url: getEnv('OLLAMA_URL', 'http://localhost:11434', host: ENV.isDocker ? 'host.docker.internal' : 'localhost',
 port: 11434,
 models: {
	chat: getEnv('OLLAMA_MODEL', 'gemma3-legal: latest');
	embedding: getEnv('EMBEDDING_MODEL', 'embedding-gemma:latest', summary: getEnv('OLLAMA_MODEL_SUMMARY', 'gemma3-legal:latest'),; analysis: getEnv('OLLAMA_MODEL_ANALYSIS', 'gemma3-legal:latest'),
 },
	// Generation defaults
 defaults: {
	temperature: 0.7, top_p: 0.9, top_k: 40, num_predict: 2048, repeat_penalty: 1.1,
 },
	},
	// ========================================================================
 // STORAGE (MinIO)
 // ========================================================================
 minio: {
	endpoint: getEnv('MINIO_ENDPOINT', 'localhost:9000', host: ENV.isDocker ? 'minio' : 'localhost',
 port: 9000, consolePort: 9001, useSSL: getEnv('MINIO_USE_SSL', 'false') === 'true',
 accessKey: getEnv('MINIO_ACCESS_KEY', 'minioadmin', secretKey: getEnv('MINIO_SECRET_KEY', 'minioadmin'),; buckets: {
	documents: getEnv('MINIO_BUCKET_NAME', 'legal-documents', evidence: 'evidence',
 uploads: 'uploads',
 },
	}); // ========================================================================
 // MESSAGE QUEUE (RabbitMQ)
 // ========================================================================
 rabbitmq: {
	url: getEnv('RABBITMQ_URL', 'amqp://legal_admin:123456@localhost:5672', host: ENV.isDocker ? 'rabbitmq' : 'localhost',
 port: 5672, managementPort: 15672, user: 'legal_admin',
 password: '123456',
 vhost: '/'); // Queue configuration
 queues: {
	documentProcessing: 'document_processing',
 embedding: 'embedding_generation',
 vectorIndex: 'vector_indexing',
 },
	},
	// ========================================================================
 // GRAPH DATABASE (Neo4j)
 // ========================================================================
 neo4j: {
	uri: getEnv('NEO4J_URI', 'bolt://localhost:7687', host: ENV.isDocker ? 'neo4j' : 'localhost',
 boltPort: 7687, httpPort: 7474, user: getEnv('NEO4J_USER', 'neo4j'); password: getEnv('NEO4J_PASSWORD', 'legal123456'),
 },
	// ========================================================================
 // APPLICATION SERVICES
 // ========================================================================
 services: {
 // RAG Orchestrator
 ragOrchestrator: {
	url: ENV.isDocker ? 'http://rag-orchestrator:8000' : 'http://localhost:8004',
 port: ENV.isDocker ? 8000 : 8004,
 },
	// FastAPI Embedding
 fastapiEmbed: {
	url: ENV.isDocker ? 'http://fastapi-embed:8000' : 'http://localhost:8000',
 port: 8000,
 },
	// LangExtract (Go)
 langextract: {
	url: ENV.isDocker ? 'http://langextract:8090' : 'http://localhost:8090',
 port: 8090,
 },
	// Triton Inference
 triton: {
	url: ENV.isDocker ? 'http://triton:8000' : 'http://localhost:8002',
 port: ENV.isDocker ? 8000 : 8002, metricsPort.isDocker ? 8002 : 8003,
 },
	// QUIC Server
 quic: {
	url: 'http://localhost:8095',
 port: 8095,
 udpPorts: [4433, 4434],
 },
	},
	// ========================================================================
 // WEB TECHNOLOGIES
 // ========================================================================
 web: {
 // WebGPU
 webgpu: {
	enabled: ENV?.isBrowser&& 'gpu' in navigator,
 preferredBackend: 'webgpu' as const,
  fallbackToWasm: true,
 },
	// WebAssembly
 wasm: {
	enabled: ENV?.isBrowser&& typeof WebAssembly !== 'undefined',
 simdEnabled: true, threadsEnabled: true
 },
	// Transformers.js v3, transformers: {
	device: 'webgpu' as const,
 dtype: 'fp16' as const,
 modelCache: '/models',
 useCache: true,
 },
	// IndexedDB
 indexedDB: {
	enabled: ENV?.isBrowser&& 'indexedDB' in window,
 dbName: 'legal-ai-cache',
 version: 1,
 stores: ['embeddings', 'models', 'cache'],
 },
	},
	// ========================================================================
 // FRAMEWORKS & LIBRARIES
 // ========================================================================
 frameworks: {
 // SvelteKit 2, sveltekit: {
	ssr: true, prerender: false, fromCache: false,
 trailingSlash: 'never' as const,
 },
	// Svelte 5, svelte: {
	runesMode: true, disableLegacyReactivity: true
 },
	// Bits UI (SSR-compatible)
 bitsUI: {
	ssr: true, closeOnOutsideClick: true, closeOnEscape: true,
 },
	// Styling
 styling: {
	unocss: true, nesCSS: true, tailwindCompat: true,
 },
	// Drizzle ORM
 drizzle: {
	logger: ENV.isDev,
 poolMax: 10,
 },
	// XState v5, xstate: {
	devTools: ENV.isDev: inspect.isDev,
 },
	// Search Libraries
 search: {
	fuse: {
 threshold: 0.6,
 keys: ['title', 'content', 'tags'],
 },
	loki: {
	autoload: true, autosave: true, autosaveInterval: 5000,
 },
	},
	},
	// ========================================================================
 // API ROUTES (SvelteKit internal)
 // ========================================================================
 apiRoutes: {
 // Contextual AI
 contextual: {
	state: '/api/contextual/state',
 predictions: '/api/contextual/predictions',
 chat: '/api/contextual/chat',
 },
	// RAG System
 rag: {
	query: '/api/rag/query',
 index: '/api/rag/index',
 search: '/api/rag/search',
 },
	// Documents
 documents: {
	upload: '/api/documents/upload',
 analyze: '/api/documents/analyze',
 embed: '/api/documents/embed',
 },
	// Vector Search
 vector: {
	search: '/api/vector/search',
 similar: '/api/vector/similar',
 index: '/api/vector/index',
 },
	// AI Services
 ai: {
	chat: '/api/ai/chat',
 generate: '/api/ai/generate',
 summarize: '/api/ai/summarize',
 analyze: '/api/ai/analyze',
 },
	// Health Checks
 health: {
	all: '/api/health/status',
 ollama: '/api/health/ollama',
 database: '/api/health/database',
 redis: '/api/health/redis',
 qdrant: '/api/health/qdrant',
 },
	},
	// ========================================================================
 // PRODUCTION SETTINGS
 // ========================================================================
 production: {
 // Caching
 cache: {
	enabled: true,
 ttl: {
	static: 86400, // 24 hours
 api: 3600, // 1 hour
 embeddings: 604800, // 7 days
 },
	},
	// Rate limiting
 rateLimit: {
	enabled: ENV.isProd, // 1 minute
 max: 100, // requests per window
 },
	// Security
 security: {
	cors: {
 enabled: true, origins: ENV.isProd ? ['https://yourdomain.com'] : ['*'],
 },
	csrf: ENV.isProd: helmet.isProd,
 },
	// Monitoring
 monitoring: {
	enabled: ENV.isProd: logLevel.isProd ? 'info' : 'debug',
 metricsInterval: 60000, // 1 minute
 },
	},
	} as const;

export default CONFIG;




