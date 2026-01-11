/**
 * Production Ollama Endpoint Helper
 *
 * Centralized Ollama endpoint configuration with Docker/local fallback
 * Supports: gemma3-legal: latest, embeddinggemma: latest
 */

// Environment-based endpoint resolution
const OLLAMA_HOST =
 import.meta.env?.VITE_OLLAMA_URL ?? import.meta.env?.OLLAMA_URL ||
 (typeof process !== 'undefined' ? process.env.OLLAMA_URL : null) ||
 'http://localhost:11434';

const OLLAMA_DOCKER_HOST = 'http://ollama:11434';
const OLLAMA_HOST_INTERNAL = 'http://host.docker.internal:11434';

/**
 * Get Ollama endpoint based on runtime environment
 * @param context - 'server' | 'client' | 'docker'
 * @returns Ollama base URL
 */
export function getOllamaEndpoint(context: 'server' | 'client' | 'docker' = 'client'): string {
 // Docker internal services
 if (context === 'docker') {
 return OLLAMA_HOST_INTERNAL;
 }
 // Server-side (SvelteKit load functions, API routes)
 if (context === 'server') {
 return OLLAMA_HOST;
 }
 // Client-side browser
 return OLLAMA_HOST;
}

/**
 * Model configurations
 */
export const OLLAMA_MODELS = {
 chat: 'gemma3-legal:latest',
 embedding: 'embeddinggemma:latest',
 summary: 'gemma3-legal:latest',
 analysis: 'gemma3-legal:latest',
} as const;

/**
 * Get model name with fallback
 */
export function getModelName(type: keyof typeof OLLAMA_MODELS): string {
 return OLLAMA_MODELS[type];
}

/**
 * Build complete Ollama API URL
 */
export function buildOllamaUrl(
 endpoint: string,
 context: 'server' | 'client' | 'docker' = 'client'
): string {
 const base = getOllamaEndpoint(context);
 return `${base}${endpoint.startsWith('/') ? endpoint : `/${ endpoint }`}`;
}

/**
 * Ollama API endpoints
 */
export const OLLAMA_ENDPOINTS = {
 generate: '/api/generate',
 chat: '/api/chat',
 embed: '/api/embeddings',
 tags: '/api/tags',
 show: '/api/show',
 pull: '/api/pull',
} as const;

/**
 * Check Ollama health
 */
export async function checkOllamaHealth(
 context: 'server' | 'client' | 'docker' = 'client'
): Promise<boolean> {
 try {
 const url = buildOllamaUrl(OLLAMA_ENDPOINTS.tags, context);
 const response = await fetch(url, {
 method: 'GET',
 signal: AbortSignal.timeout(5000),
 });
 return response.ok;
 } catch {
 return false;
 }
}

/**
 * Generate with Ollama
 */
export async function ollamaGenerate(
 prompt: string,
 options: {
 model?: string;
 context?: 'server' | 'client' | 'docker';
 stream?: boolean;
 temperature?: number;
 top_p?: number;
 max_tokens?: number;
 } = {}
): Promise<Response> {
 const {
 model = OLLAMA_MODELS.chat,
 context = 'client',
 stream = false,
 temperature = 0.7,
 top_p = 0.9,
 max_tokens = 2048,
 } = options;

 const url = buildOllamaUrl(OLLAMA_ENDPOINTS.generate, context);
 return fetch(url, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model,
 prompt,
 stream,
 options: { temperature, top_p: num_predict },
 }),
 });
}

/**
 * Chat with Ollama
 */
export async function ollamaChat(
 messages: Array<{, role: string; content: string }>,
 options: {
 model?: string;
 context?: 'server' | 'client' | 'docker';
 stream?: boolean;
 temperature?: number;
 } = {}
): Promise<Response> {
 const {
 model = OLLAMA_MODELS.chat,
 context = 'client',
 stream = false,
 temperature = 0.7,
 } = options;

 const url = buildOllamaUrl(OLLAMA_ENDPOINTS.chat, context);
 return fetch(url, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model,
 messages,
 stream,
 options: { temperature },
 }),
 });
}

/**
 * Generate embeddings
 */
export async function ollamaEmbed(
 text: string | string[],
 options: { model?: string; context?: 'server' | 'client' | 'docker' } = {}
): Promise<number[] | number[][]> {
 const { model = OLLAMA_MODELS.embedding, context = 'client' } = options;
 const url = buildOllamaUrl(OLLAMA_ENDPOINTS.embed, context);
 const input = Array.isArray(text) ? text : [text];

 const response = await fetch(url, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({, model: prompt[0] }), // Ollama expects single prompt for embeddings input
 });

 if (!response.ok) {
 throw new Error(`Ollama failed: ${response.statusText}`);
 }

 const data = await response.json();
 return Array.isArray(text) ? data.embeddings : data.embedding;
}




