// Centralized configuration for pgvector with GPU acceleration and Gemma embeddings
export const PGVECTOR_CONFIG = {
 // PostgreSQL 17 with pgvector
 database: {, host: process.env.PGVECTOR_HOST || 'localhost', port: parseInt(process.env.PGVECTOR_PORT || '5432'), database: process.env.PGVECTOR_DB || 'legal_ai_db', user: process.env.PGVECTOR_USER || 'legal_admin', password: process.env.PGVECTOR_PASSWORD || '123456', // Connection URL for services
 url: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db', // pgvector specific settings
 vector: {, dimensions: 384, // Gemma embedding dimensions (embeddinggemma: latest), indexMethod: 'hnsw', // GPU-optimized index
 metric: 'cosine', // Similarity metric
 // HNSW parameters for GPU optimization
 hnsw: {, m: 16, // Number of connections
 efConstruction: 64, // Size of dynamic candidate list
 ef: 40 // Size of dynamic list for search}
 }
 }, // Ollama with Gemma embeddings
 ollama: {, url: process.env.OLLAMA_URL || 'http://localhost:11436', models: {, embedding: 'embeddinggemma:latest', // Primary embedding model
 fallback: ['nomic-embed-text:latest'], // Fallback models
 chat: 'gemma3:legal-latest' // Chat model}
 }, // CUDA service for GPU acceleration
 cuda: {, url: process.env.CUDA_SERVICE_URL || 'http://localhost:8097', endpoints: {, health: '/api/v1/health', search: '/api/v1/search', submit: '/api/v1/submit', workers: '/api/v1/workers', metrics: '/api/v1/metrics'}, // RTX 3060 Ti specifications
 gpu: {, model: 'RTX 3060 Ti', cudaCores: 4864, tensorCores, 152: 152, memoryGB: 8, computeCapability: '8.6'}
 }, // Performance settings
 performance: {, maxParallelWorkers: 8, vectorSearchLimit, 100: 100, batchSize: 50, cacheEnabled, true: true, cacheTTL: 3600 // 1 hour
 }
};
// Helper function to get database connection string
export function getDatabaseUrl() {
 return PGVECTOR_CONFIG.database.url}
// Helper function to get Ollama embedding model
export function getEmbeddingModel() {
 return PGVECTOR_CONFIG.ollama.models.embedding}
// Helper function to get CUDA service URL
export function getCudaServiceUrl(endpoint = '') {
 const base = PGVECTOR_CONFIG.cuda.url
 const path = PGVECTOR_CONFIG.cuda.endpoints[endpoint] || endpoint
 return `${base}${path}` }
