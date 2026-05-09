const env: Record<string, string | undefined> = process.env;
import { ENV } from '$lib/server/env.server.js';

/**
 * Application Configuration
 * Centralized configuration for all services
 */

// ============================================================================
// MCP CONFIGURATION
// ============================================================================
export const MCP_CONFIG = {
	context7: {
	enabled: true,
		officialCommand: 'npx -y @upstash/context7-mcp',
		mockUrl: ENV.CONTEXT7_MCP_URL,
		useOfficial: process.env.USE_OFFICIAL_CONTEXT7 === 'true',
		timeout: 30000,
		retries: 3
	},
	multicore: {
	enabled: process.env.MCP_ENABLED === 'true',
		port: parseInt(process.env.MCP_PORT || '3001', 10),
		workers: parseInt(process.env.MCP_WORKERS || '4', 10),
		healthCheckInterval: 30000
	}
};

// ============================================================================
// AI SERVICES CONFIGURATION
// ============================================================================
export const AI_CONFIG = {
	// Primary: Ollama with Gemma models
	ollama: {
	baseUrl: ENV.OLLAMA_BASE_URL,
		models: {
	legal: process.env.GEMMA_LEGAL_MODEL || 'gemma4-legal:latest',
			embedding: process.env.GEMMA_EMBEDDING_MODEL || 'embeddinggemma:latest',
			fallback: process.env.EMBEDDING_FALLBACK_MODEL || 'nomic-embed-text'
		},
	timeout: 60000,
		maxRetries: 3,
		gemma: {
	contextWindow: 8192,
			temperature: 0.7,
			numCtx: 8192,
			numPredict: 2048,
			embeddingDimensions: 768,
			supportsFunctionCalling: true
		}
	},
	// Secondary: TensorRT-LLM with Triton Inference Server
	tensorrt: {
	enabled: process.env.TENSORRT_ENABLED === 'true',
		tritonUrl: ENV.TRITON_URL,
		modelName: process.env.TENSORRT_MODEL_NAME || 'gemma_legal_tensorrt',
		modelVersion: process.env.TENSORRT_MODEL_VERSION || '1',
		timeout: 30000,
		batchSize: parseInt(process.env.TENSORRT_BATCH_SIZE || '8', 10),
		maxTokens: 2048,
		optimization: {
	precision: (process.env.TENSORRT_PRECISION as 'fp16' | 'int8' | 'fp32') || 'fp16',
			maxBatchSize: parseInt(process.env.TENSORRT_MAX_BATCH || '8', 10),
			maxWorkspaceSize: parseInt(process.env.TENSORRT_WORKSPACE || '2147483648', 10),
			enableCudaGraph: process.env.TENSORRT_ENABLE_CUDA_GRAPH === 'true'
		}
	},
	// Tertiary: vLLM
	vllm: {
		enabled: process.env.VLLM_ENABLED === 'true',
		baseUrl: ENV.VLLM_URL,
		model: process.env.VLLM_MODEL || 'gemma-2b-it',
		timeout: 30000,
		maxTokens: 2048
	},
	// Fallback: OpenAI API
	openai: {
		enabled: env.OPENAI_ENABLED === 'true' || !!env.OPENAI_API_KEY,
		apiKey: env.OPENAI_API_KEY,
		model: env.OPENAI_MODEL || 'gpt-4',
		timeout: 30000,
		maxTokens: 2048
	},
	providerPriority: ['ollama', 'tensorrt', 'vllm', 'openai'] as const,
	functionCalling: {
		enabled: true,
		functions: {
			legal: [
				'extractCitations',
				'identifyLegalIssues',
				'analyzeContracts',
				'generateLegalSummary',
				'assessRisk',
				'findPrecedents'
			]
		}
	}
};

// ============================================================================
// VECTOR SEARCH CONFIGURATION
// ============================================================================
export const VECTOR_SEARCH_CONFIG = {
	pgvector: {
	enabled: process.env.PGVECTOR_ENABLED !== 'false',
		dimensions: parseInt(process.env.PGVECTOR_DIMENSIONS || '768', 10),
		indexType: 'hnsw' as const,
		hnsw: {
	efConstruction: parseInt(process.env.PGVECTOR_HNSW_EF_CONSTRUCTION || '200', 10),
			efSearch: parseInt(process.env.PGVECTOR_HNSW_EF_SEARCH || '40', 10),
			m: parseInt(process.env.PGVECTOR_HNSW_M || '16', 10)
		},
	ivf: {
	lists: parseInt(process.env.PGVECTOR_IVF_LISTS || '100', 10),
			probes: parseInt(process.env.PGVECTOR_IVF_PROBES || '10', 10)
		}
	},
	qdrant: {
	enabled: process.env.QDRANT_ENABLED === 'true',
		url: ENV.QDRANT_URL,
		apiKey: process.env.QDRANT_API_KEY,
		collectionName: process.env.QDRANT_COLLECTION || 'legal_documents',
		dimensions: parseInt(process.env.QDRANT_DIMENSIONS || '768', 10),
		timeout: 10000,
		vectorConfig: {
	distance: 'Cosine' as const,
			onDisk: process.env.QDRANT_ON_DISK === 'true'
		},
	quantization: {
	enabled: process.env.QDRANT_QUANTIZATION === 'true',
			type: (process.env.QDRANT_QUANT_TYPE as 'scalar' | 'binary') || 'scalar'
		}
	},
	hybrid: {
	pgvectorWeight: parseFloat(process.env.HYBRID_PGVECTOR_WEIGHT || '0.7'),
		qdrantWeight: parseFloat(process.env.HYBRID_QDRANT_WEIGHT || '0.3'),
		fusionMethod: (process.env.HYBRID_FUSION_METHOD as 'weighted' | 'rrf') || 'weighted',
		minSimilarity: parseFloat(process.env.HYBRID_MIN_SIMILARITY || '0.5'),
		fallbackToPgvectorOnly: process.env.HYBRID_FALLBACK_TO_PGVECTOR === 'true'
	}
};

// ============================================================================
// DATABASE CONFIGURATION
// ============================================================================
const _dbUrl = (() => { try { return new URL(ENV.DATABASE_URL.replace(/^postgres:\/\//, 'postgresql://')); } catch { return null; } })();
export const DATABASE_CONFIG = {
  url: ENV.DATABASE_URL,
  postgres: {
	  host: _dbUrl?.hostname || env.DATABASE_HOST || new URL(ENV.DATABASE_URL).hostname,
    port: parseInt(_dbUrl?.port || env.DATABASE_PORT || '5434', 10),
    database: (_dbUrl?.pathname.slice(1)) || env.DATABASE_NAME || 'legal_ai_db',
    username: _dbUrl?.username || env.DATABASE_USER || 'legal_admin',
    password: _dbUrl?.password || env.DATABASE_PASSWORD || '',
    max: parseInt(process.env.DATABASE_MAX_CONNECTIONS || '20', 10),
    idleTimeout: parseInt(process.env.DATABASE_IDLE_TIMEOUT || '20', 10),
    connectionTimeout: parseInt(process.env.DATABASE_CONNECT_TIMEOUT || '10', 10),
    ssl: process.env.NODE_ENV === 'production' ? ('require' as const) : (false as const),
  },
};

// ============================================================================
// REDIS CONFIGURATION
// ============================================================================
const _redisUrl = (() => { try { return new URL(ENV.REDIS_URL); } catch { return null; } })();
export const REDIS_CONFIG = {
	url: ENV.REDIS_URL,
	host: _redisUrl?.hostname || env.REDIS_HOST || new URL(ENV.REDIS_URL).hostname,
	port: parseInt(_redisUrl?.port || env.REDIS_PORT || '6379', 10),
	password: process.env.REDIS_PASSWORD || undefined,
	db: parseInt(process.env.REDIS_DB || '0', 10),
	keyPrefix: process.env.REDIS_KEY_PREFIX || 'legal-ai:',
	cacheTtl: {
	embeddings: parseInt(process.env.REDIS_TTL_EMBEDDINGS || '86400', 10),
		search: parseInt(process.env.REDIS_TTL_SEARCH || '3600', 10),
		docs: parseInt(process.env.REDIS_TTL_DOCS || '7200', 10),
		sessions: parseInt(process.env.REDIS_TTL_SESSIONS || '1800', 10)
	},
	maxRetriesPerRequest: 3,
	enableReadyCheck: true,
	lazyConnect: false
};

// ============================================================================
// RAG PIPELINE CONFIGURATION
// ============================================================================
export const RAG_CONFIG = {
	chunking: {
	chunkSize: parseInt(process.env.RAG_CHUNK_SIZE || '1500', 10),
		chunkOverlap: parseInt(process.env.RAG_CHUNK_OVERLAP || '300', 10),
		strategy: (process.env.RAG_CHUNK_STRATEGY as 'legal-aware' | 'semantic' | 'fixed') || 'legal-aware'
	},
	search: {
	maxSources: parseInt(process.env.RAG_MAX_SOURCES || '10', 10),
		similarityThreshold: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.5'),
		hybridSearch: process.env.RAG_HYBRID_SEARCH !== 'false',
		rerankResults: process.env.RAG_RERANK_RESULTS !== 'false'
	},
	processing: {
	enableCaching: process.env.RAG_ENABLE_CACHING !== 'false',
		enableAutoTagging: process.env.RAG_ENABLE_AUTOTAGGING !== 'false',
		batchSize: parseInt(process.env.RAG_BATCH_SIZE || '10', 10),
		parallelProcessing: process.env.RAG_PARALLEL_PROCESSING !== 'false'
	},
	rateLimiting: {
	enabled: process.env.RAG_RATE_LIMITING !== 'false',
		perMinute: parseInt(process.env.RAG_RATE_LIMIT_PER_MINUTE || '60', 10),
		perHour: parseInt(process.env.RAG_RATE_LIMIT_PER_HOUR || '1000', 10),
		perDay: parseInt(process.env.RAG_RATE_LIMIT_PER_DAY || '10000', 10)
	},
	security: {
	maxInputLength: parseInt(process.env.RAG_MAX_INPUT_LENGTH || '10000', 10),
		maxDocumentSize: parseInt(process.env.RAG_MAX_DOCUMENT_SIZE || '10485760', 10),
		allowedDocumentTypes: ['contract', 'statute', 'case_law', 'brief', 'memo', 'evidence'],
		sanitization: {
	removeHtmlTags: true,
			removeSqlChars: true,
			maxLineLength: 2000
		}
	}
};

// ============================================================================
// HEALTH MONITORING CONFIGURATION
// ============================================================================
export const HEALTH_CONFIG = {
	checkInterval: 30000,
	timeout: 5000,
	retries: 3,
	endpoints: {
	ollama: '/api/tags',
		tensorrt: '/v2/health/ready',
		qdrant: '/health',
		postgres: true,
		redis: true
	},
	circuitBreaker: {
	failureThreshold: 3,
		successThreshold: 2,
		timeout: 60000,
		halfOpenRequests: 1
	},
	failover: {
	enabled: true,
		retryDelay: 1000,
		maxRetries: 3,
		backoffMultiplier: 2
	}
};

// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================
export const METRICS_CONFIG = {
	enabled: true,
	collectInterval: 30000,
	retentionPeriod: 86400000,
	collect: {
	aiProviderLatency: true,
		vectorSearchPerformance: true,
		cacheHitRates: true,
		errorRates: true,
		throughput: true
	}
};

// ============================================================================
// LEGACY EXPORTS (for backward compatibility)
// ============================================================================
export const OLLAMA_CONFIG = AI_CONFIG.ollama;

// ============================================================================
// TYPE EXPORTS
// ============================================================================
export type AIProvider = 'ollama' | 'tensorrt' | 'vllm' | 'openai';
export type VectorSearchProvider = 'pgvector' | 'qdrant' | 'hybrid';
export type ChunkingStrategy = 'legal-aware' | 'semantic' | 'fixed';
export type FusionMethod = 'weighted' | 'rrf';

// ============================================================================
// CONFIGURATION VALIDATOR
// ============================================================================
export function validateConfig(): {
	valid: boolean, errors: string[] } {
	const errors: string[] = [];

	// Validate at least one AI provider is available
	const hasProvider =
		!!AI_CONFIG.ollama?.baseUrl ||
		AI_CONFIG.tensorrt?.enabled ||
		AI_CONFIG.vllm?.enabled ||
		AI_CONFIG.openai.enabled;

	if (!hasProvider) {
		errors.push('No AI provider configured');
	}

	// Validate vector search
	if (!VECTOR_SEARCH_CONFIG.pgvector?.enabled && !VECTOR_SEARCH_CONFIG.qdrant.enabled) {
		errors.push('No vector search provider enabled');
	}

	// Validate dimension consistency
	const embeddingDim = AI_CONFIG.ollama.gemma.embeddingDimensions;
	if (VECTOR_SEARCH_CONFIG.pgvector?.enabled && VECTOR_SEARCH_CONFIG.pgvector.dimensions !== embeddingDim) {
		errors.push('Embedding dimensions mismatch between Ollama gemma and pgvector');
	}

	if (VECTOR_SEARCH_CONFIG.qdrant?.enabled && VECTOR_SEARCH_CONFIG.qdrant.dimensions !== embeddingDim) {
		errors.push('Embedding dimensions mismatch between Ollama gemma and Qdrant');
	}

	return { valid: errors.length === 0, errors };
}

// ============================================================================
// CONFIGURATION SUMMARY
// ============================================================================
export function getConfigSummary() {
	return {
		aiProviders: {
	ollama: AI_CONFIG.ollama?.baseUrl || 'disabled',
			tensorrt: AI_CONFIG.tensorrt.enabled ? AI_CONFIG.tensorrt.tritonUrl : 'disabled',
			vllm: AI_CONFIG.vllm.enabled ? AI_CONFIG.vllm.baseUrl : 'disabled',
			openai: AI_CONFIG.openai.enabled ? 'enabled' : 'disabled'
		},
	vectorSearch: {
	pgvector: VECTOR_SEARCH_CONFIG.pgvector.enabled,
			qdrant: VECTOR_SEARCH_CONFIG.qdrant.enabled,
			hybrid: VECTOR_SEARCH_CONFIG.hybrid
		},
	gemmaModels: {
	legal: AI_CONFIG.ollama.models.legal,
			embedding: AI_CONFIG.ollama.models.embedding,
			dimensions: AI_CONFIG.ollama.gemma.embeddingDimensions
		},
	healthMonitoring: {
	enabled: HEALTH_CONFIG.circuitBreaker.failureThreshold > 0,
			interval: HEALTH_CONFIG.checkInterval,
			failover: HEALTH_CONFIG.failover.enabled
		}
	};
}
