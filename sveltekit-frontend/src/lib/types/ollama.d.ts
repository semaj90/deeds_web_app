// sveltekit-frontend/src/lib/types/ollama.d.ts

/**
 * Represents the structure of a request to the Ollama embeddings API.
 */
export interface EmbeddingRequest {
	model: string;
	prompt: string;
}

/**
 * Represents the structure of a response from the Ollama embeddings API.
 */
export interface EmbeddingResponse {
	embedding: number[];
}

/**
 * Represents the structure of a request to the Ollama generate API.
 */
export interface GenerateRequest {
	model: string;
	prompt: string;
	stream?: boolean;
}

/**
 * Represents the structure of a response from the Ollama generate API.
 * This can vary based on whether streaming is enabled.
 */
export interface GenerateResponse {
	model: string;
	created_at: string;
	response: string;
	done: boolean;
}
