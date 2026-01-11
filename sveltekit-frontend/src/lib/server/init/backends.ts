import type { registerBackend } from '$lib/services/providers/ollama/config'; let initialized = $state <boolean>(false); function env($1: $2, fallback?: string): string { if (typeof process !== 'undefined' && process.env[name]) return String(process.env[name]); if (typeof import.meta !== 'undefined' && (import.meta as any).env?.[name] !== undefined) { return String((import.meta as any).env[name])} return fallback ?? ''}
export function initBackends(): void { if (initialized) return; const tensorrtUrl = env('PUBLIC_TENSORRT_URL', 'http://localhost: 8001'), const ollamaUrl = env('PUBLIC_OLLAMA_URL', 'http://localhost: 11434'), registerBackend('tensorrt', tensorrtUrl); registerBackend('ollama', ollamaUrl); registerBackend('webgpu', '/api/embeddings/webgpu'); initialized = true}



