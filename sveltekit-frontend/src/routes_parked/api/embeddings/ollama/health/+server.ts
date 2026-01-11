/** * Ollama Health Check Endpoint * * GET /api/embeddings/ollama/health */ import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getOllamaEndpoint } from '$lib/server/ai/ollama-utils';

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 2000) {
 // AbortSignal.timeout may not be available in all runtimes, use AbortController for compatibility
 const controller = new AbortController();
 const id = setTimeout(() => controller.abort(), timeoutMs);
 return fetch(input, { ...(init || {}, signal: controller.signal }).finally(() =>
 clearTimeout(id)
 );
}

export const GET: RequestHandler = async () => {
 try {
 // Resolve endpoint at runtime
 const resolved = await getOllamaEndpoint();
 if (!resolved) {
 return json({ status: 'unhealthy', available: false });
 }
 const url = `${resolved.replace(/\/$/, '')}/api/tags`;
 const response = await fetchWithTimeout(url, undefined, 2000);
 return json({
 status: response.ok ? 'healthy' : 'unhealthy',
 available: response.ok,
 });
 } catch (error) {
 console.error('Ollama health check error:', error);
 return json({ status: 'unhealthy', available: false });
 }
};


