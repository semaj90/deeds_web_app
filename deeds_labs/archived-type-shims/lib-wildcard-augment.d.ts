/**
 * Wildcard $lib shim: expose common named exports as permissive "any" to reduce
 * large-volume errors during migration. Keep minimal and extend as needed.
 */
declare module '$lib/*' {
	const _any: any;
	export default _any;

	// Common high-noise named exports used across the repo
	export const cases: unknown;
	export const Evidence: unknown;
	export const AIFindResult: unknown;
	export const VectorService: unknown;
	export const ollamaService: unknown;
	export const db: unknown;
	export const generateEmbedding: unknown;
	export const generateBatchEmbeddings: unknown;
	export const logger: unknown;
	export const productionAPIClient: unknown;
	export const PROTOCOL_TIERS: unknown;
	export const productionServiceRegistry: unknown;

	// Database schema exports
	export const legalDocuments: unknown;
	export const documentChunks: unknown;
	export const autoTags: unknown;
	export const userAiQueries: unknown;
	export const document_chunks: unknown;

	// Service exports
	export const enhancedRAGStore: unknown;
	export const EventEmitter: unknown;
	export const LegalDocument: unknown;
	export const DocumentChunk: unknown;
	export const UserAiQuery: unknown;
	export const AutoTag: unknown;
	export const setCache: unknown;
	export const initializeQdrantCollection: unknown;
	export const resolveLibraryId: unknown;
	export const getLibraryDocs: unknown;
	export const analyzeCurrentErrors: unknown;
	export const crewAIService: unknown;
	export const phase13Stores: unknown;
}
