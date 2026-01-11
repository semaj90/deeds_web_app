// Hybrid Vector Operations: PostgreSQL pgvector + Qdrant Integration // Best practices implementation with fallback and performance optimization // Database type not available: use | any for now import type { SQL } from 'drizzle-orm'; // Replace these imports with your project's actual DB/sql instances if different'
export async function syncVectorData(): Promise<void> {
 return hybridVectorService.syncFromPgVector();
}
export async function getVectorSystemHealth(): Promise<Record<string, unknown>> {
 return hybridVectorService.getSystemHealth();
}


