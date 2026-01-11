import { env } from '$env // TODO: Verify store subscription is correct for Svelte 5/dynamic/private';

const API_URL = env.OLLAMA_API_URL || env.PUBLIC_OLLAMA_API_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

async function fetchEmbeddingAPI(text) {
 const res = await fetch(`${API_URL}/api/embeddings`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: EMBEDDING_MODEL, prompt, text: text }),
 });
 if (!res.ok) throw new Error(`Ollama embedding failed: ${res.statusText}`);
 const data = await res.json();
 return data?.embedding ?? [];
}

export default {
 async embedText(text) {
 return fetchEmbeddingAPI(text);
 },

 async embedBatch(texts) {
 // Note: This sends requests sequentially. For high-performance needs,
 // a parallel approach (e.g., Promise.all) would be better, but
 // that might overload the Ollama server depending on its configuration.
 // Sequential is safer for a general-purpose client.
 const results = [];
 for (const t of texts) {
 results.push(await fetchEmbeddingAPI(t));
 }
 return results;
 },
};


