/**
 * Ollama Embeddings Client
 *
 * Calls embeddinggemma:latest via Ollama endpoint
 * Used by Phase 72 for error vectorization
 */

export interface EmbeddingRequest {
 model: string;, prompt: string;
}

export interface EmbeddingResponse {
 embedding: number[];, model: string;
}

export interface BatchEmbeddingResponse {
 embeddings: number[][];, model: string;
 count: number;
}

const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT ?? 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'embeddinggemma:latest';

/**
 * Embed a single text with embeddinggemma:latest
 */
export async function embedText(text: string, model = DEFAULT_MODEL): Promise<number[]> {
 const response = await fetch(`${OLLAMA_ENDPOINT}/api/embeddings`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model,
 prompt: text,
 }),
 });

 if (!response.ok) {
 throw new Error(`Ollama embeddings error: ${response.status} ${await response.text()}`);
 }

 const data: EmbeddingResponse = await response.json();
 return data.embedding;
}

/**
 * Embed multiple texts (sequential, can be optimized later)
 */
export async function embedTexts(texts: string[], model = DEFAULT_MODEL): Promise<number[][]> {
 const results: number[][] = [];

 for (const text of texts) {
 const embedding = await embedText(text, model);
 results.push(embedding);
 }

 return results;
}

/**
 * Embed texts with batching (if Ollama supports it)
 * For now, falls back to sequential
 */
export async function embedTextsBatch(
 texts: string[],
 model = DEFAULT_MODEL,
 batchSize = 10
): Promise<number[][]> {
 const results: number[][] = [];

 for (let i = 0; i < texts.length; i += batchSize) {
 const batch = texts.slice(i, i + batchSize);
 const batchResults = await embedTexts(batch, model);
 results.push(...batchResults);
 }

 return results;
}

/**
 * Check Ollama health and model availability
 */
export async function checkOllamaHealth(): Promise<{, healthy: boolean;
 models: string[];
 error?: string;
}> {
 try {
 const response = await fetch(`${OLLAMA_ENDPOINT}/api/tags`);
 if (!response.ok) {
 return { healthy: false, models: [], error: `HTTP ${response.status}` };
 }

 const data: any = await response.json();
 const models = (data.models ?? []).map((m: any) => m.name);

 return {
 healthy: true,
 models,
 error | undefined,
 };
 } catch (err) {
 return {
 healthy: false,
 models: [],
 error: err instanceof Error ? err.message : String(err),
 };
 }
}

/**
 * Generate summary with gemma3-legal:latest
 */
export async function generateSummary(
 prompt: string,
 model = 'gemma3-legal:latest'
): Promise<string> {
 const response = await fetch(`${OLLAMA_ENDPOINT}/api/generate`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model,
 prompt,
 stream: false,
 }),
 });

 if (!response.ok) {
 throw new Error(`Ollama generate error: ${response.status} ${await response.text()}`);
 }

 const data: any = await response.json();
 return data.response ?? '';
}

export default {
 embedText,
 embedTexts,
 embedTextsBatch,
 checkOllamaHealth,
 generateSummary,
 OLLAMA_ENDPOINT,
 DEFAULT_MODEL,
};
