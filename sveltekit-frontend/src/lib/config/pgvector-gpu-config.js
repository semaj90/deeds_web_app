import {
	getCudaServiceUrl as getConfiguredCudaServiceUrl,
	getDatabaseUrl as getConfiguredDatabaseUrl,
	getOllamaUrl,
} from './env.server.js';

export const PGVECTOR_CONFIG = {
	database: {
		host: process.env.PGVECTOR_HOST,
		port: process.env.PGVECTOR_PORT ? Number(process.env.PGVECTOR_PORT) : undefined,
		database: process.env.PGVECTOR_DB,
		user: process.env.PGVECTOR_USER,
		password: process.env.PGVECTOR_PASSWORD,
		get url() {
			return getConfiguredDatabaseUrl();
		},
	},
	vector: {
		dimensions: 768,
		indexMethod: 'hnsw',
		metric: 'cosine',
		hnsw: {
			m: 16,
			efConstruction: 64,
			ef: 40,
		},
	},
	ollama: {
		url: getOllamaUrl(),
		models: {
			embedding: 'embeddinggemma:latest',
			fallback: ['embeddinggemma:latest'],
		},
	},
	cuda: {
		url: getConfiguredCudaServiceUrl(),
		endpoints: {
			health: '/api/v1/health',
			search: '/api/v1/search',
			submit: '/api/v1/submit',
			workers: '/api/v1/workers',
			metrics: '/api/v1/metrics',
		},
		gpu: {
			model: 'RTX 3060 Ti',
			cudaCores: 4864,
			tensorCores: 152,
			memoryGB: 8,
			computeCapability: '8.6',
		},
	},
	performance: {
		maxParallelWorkers: 8,
		vectorSearchLimit: 100,
		batchSize: 50,
		cacheEnabled: true,
		cacheTTL: 3600,
	},
};

export function getDatabaseUrl() {
	return getConfiguredDatabaseUrl();
}

export function getEmbeddingModel() {
	return PGVECTOR_CONFIG.ollama.models.embedding;
}

export function getCudaServiceUrl(endpoint = '') {
	const base = PGVECTOR_CONFIG.cuda.url.replace(/\/+$/, '');
	const servicePath = PGVECTOR_CONFIG.cuda.endpoints[endpoint] ?? endpoint;
	if (!servicePath) return base;
	return `${base}${servicePath.startsWith('/') ? servicePath : `/${servicePath}`}`;
}
