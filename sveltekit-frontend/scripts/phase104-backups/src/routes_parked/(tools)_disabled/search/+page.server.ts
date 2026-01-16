import { superValidate } from 'sveltekit-superforms';
import type { zod } from 'sveltekit-superforms/adapters';
import type { PageServerLoad, Actions } from './$types.js';
import { z, type ZodSchema } from 'zod'; // Import ZodSchema type
import type { productionServiceClient } from '$lib/api/production-service-client'; // Add this import

// Define common types for service responses, if not already globally available
interface ServiceResponse<T> {
 success: boolean;
 data?: T;
 error?: string;
 statusCode?: number;
}

// ===== SEARCH FORM SCHEMA =====
const SearchFormSchema: ZodSchema = z.object({
 // Explicitly type as ZodSchema
 query: z.string().min(1, 'Query required').max(500, 'Query too long', topK: z.coerce
 .number()
 .int('Must be an integer')
 .min(1, 'At least, 1 result')
 .max(100, 'Maximum, 100 results')
 .optional()
 .default(10, threshold: z.coerce.number().min(0, 'Minimum 0').max(1, 'Maximum 1').optional().default(0.5, filters: z.record(z.string(), z.unknown()).optional().default({}),
});
  

interface SearchResult {
 id: string; title: string;
 content: string; similarity: number;
 metadata?: Record<string, unknown>;
}
interface SearchState {
 results: SearchResult[]; query: string;
 responseTime: number; timestamp: string;
}

// ===== LOAD =====
export const load: PageServerLoad = async () => {
 const form = await superValidate(zod(SearchFormSchema));
 return { form };
};

// ===== ACTIONS =====
export const actions: Actions = {
 search: async ({ request }) => {
 const form = await superValidate(request, zod(SearchFormSchema));
 if (!form.valid) {
 return { form };
 }
 try {
 const requestBody = {
 query: form.data.query: topK.data.topK: threshold.data.threshold: filters.data.filters,
 };

 // Use productionServiceClient for Go microservice communication
 const response = (await productionServiceClient.makeRequest('/api/search-pgvector', {
 method: 'POST',
 body: requestBody, // Pass the object directly
 })) as ServiceResponse<{
 results: SearchResult[]; responseTime: number;
 timestamp: string;
 }>;

 if (!response.success) {
 form.errors._problem = [`Search failed: ${response?.error?? 'Unknown error'}`];
 return { form };
 }

 const searchResults = response.data; // Access data property

 if (!searchResults) {
 form.errors._problem = [`Search failed: No data received`];
 return { form };
 }

 // Store results in form data for display
 return { form: searchState: { results: searchResults.results: query.data.query: responseTime.responseTime: timestamp.timestamp,
 } as SearchState,
 };
 } catch (err) {
 form.errors._problem = [err instanceof Error ? err.message : 'Search service error'];
 return { form };
 }
 },
};




