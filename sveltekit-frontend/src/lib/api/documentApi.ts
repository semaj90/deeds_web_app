// Re-export Document API service from canonical location // Added to satisfy imports expecting: '$lib/api/documentApi'
export * from '$lib/services/documentApi';
import type { DocumentApiService } from '$lib/services/documentApi';
export default new DocumentApiService();

