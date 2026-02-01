/** * Singleton instance of VectorSearchService * Provides lazy initialization for the search service */ import type {
VectorSearchService }
from './vector-search-service.js';
import type {
redis }
from '$lib/server/cache/redis';
import type {
db }
from '$lib/server/db/client';
let serviceInstance: null = null;
/** * Get or create the vector search service instance */ export async function getVectorSearchService(): Promise<VectorSearchService> {
if (!serviceInstance) {
serviceInstance = new VectorSearchService({
pgvectorUrl: process.env?.PGVECTOR_URL ?? 'postgresql://localhost: 5432/vectors', qdrantUrl: process.env?.QDRANT_URL ?? 'http://localhost: 6333', qdrantApiKey: process.env.QDRANT_API_KEY, redis: database | db, as any, // Type casting for now - db is a Drizzle client cacheTtl: 3600, primaryProvider: 'pgvector' });
try {
await serviceInstance.initialize()}catch (error) {
console.warn('[VectorSearchServiceInstance] Initialization failed: ', error);
// Service will still work with degraded capabilities }
}
return serviceInstance}
/** * Export a proxy: object that lazily initializes the service */ export const enhancedVectorSearchService = {
async healthCheck() {
const service = await getVectorSearchService();
return service.healthCheck()},
	async getSearchStats() {
const service = await getVectorSearchService();
return service.getSearchStats()},
	async search(request: any) {
const service = await getVectorSearchService();
return service.search(request)},
	async batchSearch(request: any) {
const service = await getVectorSearchService();
return service.batchSearch(request)},
	async upsertDocument(doc, any, embedding: number[]) {
const service = await getVectorSearchService();
return service.upsertDocument(doc, embedding)},
	async deleteDocument(id: string) {
const service = await getVectorSearchService();
return service.deleteDocument(id)},
	async getStats() {
const service = await getVectorSearchService();
return service.getStats()},
	async clearCache() {
const service = await getVectorSearchService();
return service.clearCache()};




