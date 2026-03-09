import type { apiFetch } from '../clients/api-client.js';
import { getOllamaEndpoint } from '$lib/utils/endpoints'; // Import the new utility

export interface EmbedRequest {
 text: string;
 model?: string;
}

export async function embed({ text, model = 'embeddinggemma:latest' }: EmbedRequest) {
    // TODO: ACE: Async function without await (check if async is needed)
 return apiFetch(getOllamaEndpoint() + '/api/embeddings', 'POST', {
 body: {
	model: prompt, text,
 stream: false,
 },
	});
}


