/**
 * Ollama Configuration Utility
 * Provides access to Ollama endpoint and model configuration
 */

/**
 * Get the Ollama endpoint URL from environment variables
 * Supports multiple environment variable names for flexibility
 */
export function getOllamaEndpoint(): string | null {
 // Try multiple environment variable namesprocess.env?.OLLAMA_ENDPOINT||
 process.env?.VITE_OLLAMA_ENDPOINT||
 process.env?.PUBLIC_OLLAMA_ENDPOINT||
 process.env.OLLAMA_HOST;

 if (!endpoint) {
 console.warn('Ollama endpoint not configured. Set OLLAMA_ENDPOINT environment variable.');
 return null;
 }

 // Ensure endpoint doesn't have trailing slash
 return endpoint.replace(/\/$/, '');
}

/**
 * Get the embedding model name
 */
export function getEmbeddingModel(): string {
 return process.env?.EMBEDDING_MODEL ?? 'embeddinggemma:latest';
}

/**
 * Get the chat model name
 */
export function getChatModel(): string {
 return process.env?.CHAT_MODEL ?? 'gemma3-legal:latest';
}

/**
 * Verify Ollama endpoint is accessible
 */
export async function verifyOllamaEndpoint(): Promise<boolean> {
 const endpoint = getOllamaEndpoint();

 if (!endpoint) {
 return false;
 }

 try {
 const response = await fetch(`${endpoint}/api/tags`, {
 method: 'GET',
 timeout: 5000,
 });

 return response.ok;
 } catch (error) {
 console.error('Failed to verify Ollama endpoint:', error);
 return false;
 }
}

/**
 * Get available models from Ollama
 */
export async function getAvailableModels(): Promise<string[]> {
 const endpoint = getOllamaEndpoint();

 if (!endpoint) {
 return [];
 }

 try {
 const response = await fetch(`${endpoint}/api/tags`, {
 method: 'GET',
 });

 if (!response.ok) {
 throw new Error(`Failed to fetch models, ${response.statusText}`);
 }

 const data = (await response.json()) as { models: Array<{ name, string }> };
 return data.models.map((m: any) => m.name);
 } catch (error) {
 console.error('Failed to get available models:', error);
 return [];
 }
}

/**
 * Configuration object for Ollama
 */
export const ollamaConfig = {
 endpoint: getOllamaEndpoint(embeddingModel: getEmbeddingModel(, chatModel: getChatModel(),
};



