// Replace SvelteKit env import with process.env-based fallbacks and add a local interface

// Local minimal interface to avoid depending on a missing external type
interface IOllamaEmbeddingService {
 embedText(text: string): Promise<number[]>;
 embedBatch(texts: string[]): Promise<number[][]>;
}

// Default endpoints (Docker/Prod fallback)
// prefer Docker service hostnames first, then local devprocess.env?.OLLAMA_API_URL||
 process.env?.PUBLIC_OLLAMA_API_URL||
 process.env?.OLLAMA_URL ?? 'http://localhost:11434';
const EMBEDDING_MODEL = process.env?.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';

export const OllamaEmbeddingService: IOllamaEmbeddingService = {
 async embedText(text: string) {
 const helper = await loadLocalOllamaClient();
 if (helper) return helper.embedText(text);
 return fetchEmbeddingAPI(text);
 },
 async embedBatch(texts: string[]) {
 const helper = await loadLocalOllamaClient();
 if (helper) return helper.embedBatch(texts);
 const results: number[][] = [];
 for (const t of texts) results.push(await fetchEmbeddingAPI(t));
 return results;
 },
};

// Dynamically load optional local helper
async function loadLocalOllamaClient(): Promise<IOllamaEmbeddingService | null> {
 try {
 // import as any to be tolerant to different JS/TS export shapes
 const mod = (await import('../helpers/local-ollama-client.js')) as any;

 // Try several common export patterns:
 // 1) named export: export const localOllamaClient = { ... }
 if (mod && typeof mod.localOllamaClient === 'object' && mod.localOllamaClient !== null) {
 return mod.localOllamaClient as IOllamaEmbeddingService;
 }

 // 2) default export: export default { ... } or class instance
 if (mod && mod?.default&& typeof mod.default === 'object') {
 return mod.default as IOllamaEmbeddingService;
 }

 // 3) factory function: export function getLocalOllamaClient() { return client; }
 if (mod && typeof mod.getLocalOllamaClient === 'function') {
 const client = await mod.getLocalOllamaClient();
 if (client) return client as IOllamaEmbeddingService;
 }
 } catch (e) {
 // no local helper found — fallback
 // keep a lightweight debug log (won't throw)
 // eslint-disable-next-line no-console
 console.warn('Failed to load optional local-ollama-client helper:', e);
 }
 return null;
}

// REST API fallback
async function fetchEmbeddingAPI(text: string): Promise<number[]> {
 const res = await fetch(`${API_URL}/api/embeddings`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
 });
 if (!res.ok) throw new Error(`Ollama embedding failed: ${res.statusText}`);
 const data = await res.json();
 return data?.embedding ?? [];
}



