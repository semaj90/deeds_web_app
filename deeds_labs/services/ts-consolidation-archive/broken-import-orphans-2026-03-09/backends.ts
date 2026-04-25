// @ts-ignore
import { registerBackend } from '$lib/services/providers/ollama/config';

// Stub if module missing
const safeRegister = (name: string, url: string) => {
    try { registerBackend(name, url); } catch {}
};

let initialized = false;

function env(name: string, fallback?: string): string {
    if (typeof process !== 'undefined' && process.env[name]) return String(process.env[name]);
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env?.[name] !== undefined) {
        // @ts-ignore
        return String(import.meta.env[name]);
    }
    return fallback ?? '';
}

export function initBackends(): void {
    if (initialized) return;

    const tensorrtUrl = env('PUBLIC_TENSORRT_URL', 'http://localhost:8001');
    const ollamaUrl = env('PUBLIC_OLLAMA_URL', 'http://localhost:11434');

    safeRegister('tensorrt', tensorrtUrl);
    safeRegister('ollama', ollamaUrl);
    safeRegister('webgpu', '/api/embeddings/webgpu');

    initialized = true;
}
