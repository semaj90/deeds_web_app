import type { ENV } from '$lib/server/env.server';

export function OllamaGetEndpoint(model: 'gemma3-legal' | 'embeddinggemma') {
 return `${ENV.OLLAMA_BASE_URL}/api/generate?model=${model}:latest`;
}

export async function embedText(text: string) {
 const endpoint = OllamaGetEndpoint('embeddinggemma');

 const r = await fetch(endpoint, {
 method: 'POST',
 body: JSON.stringify({ prompt: text }),
 });

 return await r.json();
}

export async function generateLegalResponse(prompt: string) {
 const endpoint = OllamaGetEndpoint('gemma3-legal');

 const r = await fetch(endpoint, {
 method: 'POST',
 body: JSON.stringify({
 prompt,
 stream: false,
 }),
 });

 return await r.json();
}
