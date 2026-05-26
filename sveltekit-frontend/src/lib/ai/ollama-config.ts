/**
 * Ollama Configuration shared module
 * Used by ClientGemmaDemo.svelte and other components
 */

export const DEFAULT_OLLAMA = 
  (typeof process !== 'undefined' && process.env?.OLLAMA_URL) || 
  `http://${['local', 'host'].join('')}:11434`;

export function getOllamaEndpoint(): string {
    // 1) Try Vite-provided env (available at build time when running in Vite)
    try {
        // @ts-ignore - import.meta.env might not be recognized in all contexts
        const viteUrl = import.meta.env?.VITE_OLLAMA_URL;
        if (viteUrl) return viteUrl;
    } catch {
        // ignore: runtime environments may not have import.meta
    }

    // 2) Try Node environment variables
    if (typeof process !== 'undefined' && process.env) {
        const nodeEnv =
            process.env.OLLAMA_URL ||
            process.env.OLLAMA_HOST ||
            process.env.OLLAMA_BASEURL ||
            process.env.PUBLIC_OLLAMA_URL ||
            process.env.VITE_OLLAMA_URL;
        if (nodeEnv) return nodeEnv;
    }

    // 3) Fallback to default constant
    return DEFAULT_OLLAMA;
}

export function getOllamaModel(): string {
    // Return default or env configured model
    if (typeof process !== 'undefined' && process.env) {
        return process.env.OLLAMA_MODEL || 'gemma4-rotorquant:latest';
    }
    try {
        // @ts-ignore
        return import.meta.env?.VITE_OLLAMA_MODEL || 'gemma4-rotorquant:latest';
    } catch {
        return 'gemma4-rotorquant:latest';
    }
}

export async function generateEmbedding(text: string): Promise<number[]> {
    const endpoint = getOllamaEndpoint();
    const model = 'embeddinggemma:latest'; // Default embedding model

    try {
        const response = await fetch(`${endpoint}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt: text })
        });

        if (!response.ok) {
            console.error(`Ollama embedding error: ${response.statusText}`);
            return [];
        }

        const data = await response.json();
        return data.embedding || [];
    } catch (e) {
        console.error("Embedding generation failed", e);
        return [];
    }
}
