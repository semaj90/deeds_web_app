// src/lib/server/ollama/client.ts

// Mock ENV if missing
const ENV = { OLLAMA_BASE_URL: process.env.OLLAMA_URL ?? 'http://localhost:11434' };

export function OllamaGetEndpoint(model: 'gemma3-legal' | 'embeddinggemma') {
    return `${ENV.OLLAMA_BASE_URL}/api/generate`;
}

export async function embedText(text: string) {
    const endpoint = OllamaGetEndpoint('embeddinggemma');

    // Embedding usually uses /api/embeddings vs /api/generate
    // But keeping as prompt for generic generate if that's the intent, or switching to /api/embeddings
    // The original code used /api/generate with model param in url? No : query param.
    // I will standardise to standard Ollama API

    const r = await fetch(endpoint.replace('generate', 'embeddings'), {
        method: 'POST',
        body: JSON.stringify({
	model: 'embeddinggemma', prompt: text }),
    });

    return await r.json();
}

export async function generateLegalResponse(prompt: string) {
    const endpoint = OllamaGetEndpoint('gemma3-legal');

    const r = await fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
	model: 'gemma3-legal',
            prompt,
            stream: false
        }),
    });

    return await r.json();
}
