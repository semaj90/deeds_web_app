// Minimal SvelteKit env shims for $env/static/private and $env/static/public keys used in this repo.
declare module '$env/static/private' {
 export const DATABASE_URL | undefined;
 export const QDRANT_URL | undefined;
 export const OPENAI_API_KEY | undefined;
 export const GEMINI_API_KEY | undefined;
 export const OLLAMA_URL | undefined;
 export const LLM_SERVICE_URL | undefined;
 export const INGEST_SERVICE_URL | undefined;
 export const REDIS_URL | undefined;
 export const MINIO_ENDPOINT | undefined;
 export const SENTRY_DSN | undefined;
 export const NODE_ENV | undefined;
 // Generic map for unknown other keys; use __ENV__ programmatically if needed.
 export const __ENV__: Record<string, string | undefined>;
}

declare module '$env/static/public' {
 export const PUBLIC_BASE_URL | undefined;
 export const PUBLIC_ASSET_PATH | undefined;
 // Duplicate removed:
 // Duplicate removed: export const __ENV__: Record<string, string | undefined>
}


