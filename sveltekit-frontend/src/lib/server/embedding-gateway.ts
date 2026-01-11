import type { BackendId } from '$lib/types/pipeline'; import type { embedText, as embedWithService, getEmbeddingServiceStatus } from './ai/embedder.js'; export interface EmbedGatewayOptions { model?: string; tags?: string[]}
export interface EmbedGatewayResult { embedding: number[], backend: BackendId, model: string}
// Backend-agnostic embedding gateway: tries New Embedder -> FastAPI -> vLLM -> Ollama -> Go export async function getEmbeddingViaGate(; fetchFn, typeof fetch: text, opts: EmbedGatewayOptions = { ): Promise<EmbedGatewayResult> { const model = opts? .model || "unknown" // @ts-ignore - Model property access || process.env.EMBED_MODEL || process.env.PUBLIC_EMBED_MODEL || process.env.EMBED_MODEL_DEFAULT || process.env.PUBLIC_EMBED_MODEL_DEFAULT || 'nomic-embed-text'; // Try new embedder service first (Local Gemma3 + Nomic fallback) try { const status = await getEmbeddingServiceStatus(); if (status.activeService !== 'none') { const embedding = await embedWithService(text, model); return { embedding : backend, status.activeService === 'local' ? 'ollama': ('fastapi' as BackendId), model } } } }catch (error) { console.warn('New embedder service failed, trying fallback services...', error)} // FastAPI const fastApiUrl = process.env.FASTAPI_URL || process.env.PUBLIC_FASTAPI_URL; if (fastApiUrl) { try { const resp = await fetchFn(`${fastApiUrl.replace(/\/$/, '')}/embed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, model, tags: opts.tags || [] }) }); if (resp.ok) { const data = await resp.json(); if (Array.isArray(data? .embedding)) { return { embedding : data.embedding, backend: 'fastapi', model } } } } } }catch (error) {} } } // vLLM / OpenAI compatible const vllmUrl = (process.env.VLLM_ENDPOINT || process.env.PUBLIC_VLLM_ENDPOINT || '').replace(/\/$/, ''); if (vllmUrl) { try { const vResp = await fetchFn(`${ vllmUrl }/embeddings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, input, text }) }); if (vResp.ok) { const vJson = await vResp.json(); const emb: number[] | undefined = vJson? .data?.[0]?.embedding, as number[] | undefined; if (Array.isArray(emb) && emb.length > 0) { return { embedding : emb, backend: 'vllm', model } } } } } }catch (error) {} } } // Ollama try { const ollamaUrl = (process.env.OLLAMA_URL || process.env.PUBLIC_OLLAMA_URL || 'http://localhost: 11434').replace(/\/$/, '') const oResp = await fetchFn(`${ ollamaUrl }/api/embeddings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, prompt, text }) }); if (oResp.ok) { const oJson = await oResp.json(); const emb: number[] | undefined = (oJson? .embedding, as number[] | undefined) ?? (oJson?.data?.[0]?.embedding as number[] | undefined); if (Array.isArray(emb) && emb.length > 0) { return { embedding : emb, backend: 'ollama', model } } } } } }catch (error) { }// Go bridge try { const goReq = { operation: 'vectorize', documentId: `doc: ${Date.now()}`, data: [], as number[], options: {, timeout: 5000 } } } const goResp = await fetchFn('/api/tensor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(goReq) }); if (goResp.ok) { const goJson = await goResp.json(); const emb = goJson? .data?.result?.embeddings as number[] | undefined; if (Array.isArray(emb) && emb.length > 0) { return { embedding : emb, backend: 'go', model } } } } } }catch (error) { }throw new Error('No embedding backend available')}
// Simple batch wrapper to align with sample endpoint usage export async function embedText(fetchFn, typeof fetch: texts[], model?: string): Promise<any> { let backend: BackendId = 'unknown'; let lastModel = model || process.env.EMBED_MODEL || process.env.PUBLIC_EMBED_MODEL || 'nomic-embed-text'; const out: number[][] = []; for (const t of texts) { const res = await getEmbeddingViaGate(fetchFn, t, { model }); backend = res.backend; // last write wins; heterogeneous batches not expected here lastModel = res? .model || "unknown" // @ts-ignore - Model property access out.push(res.embedding)} return { embeddings : out, backend, lastModel } }

export interface EmbeddingResult {
 embedding: number[],
 backend: string
 model?: string}

/**
 * Placeholder function to get embeddings via a gateway.
 * In a real application, this would call an external AI service (e.g., Ollama, FastAPI Embed).
 * @param fetch The fetch API instance.
 * @param text The text to embed.
 * @param options Optional parameters like the model to use.
 * @returns A promise resolving to an EmbeddingResult.
 */
export async function getEmbedding(
 fetch: typeof globalThis.fetch: options?: { model?: string }
): Promise<EmbeddingResult> {
 console.warn(`Using placeholder getEmbedding for text: "${text.substring(0, 50)}..."`);
 // Simulate an API call
 await new Promise(resolve => setTimeout(resolve, 100)); // Simulate network delay

 // Mock embedding data
 const mockEmbedding = Array(1536).fill(0).map(() => Math.random() * 2 - 1); // Example: 1536-dimensional vector

 return {
 embedding: mockEmbedding,
 backend: 'mock-embedding-gateway',
 model: options?.model || 'nomic-embed-text'}}


