// SvelteKit $env shims for common static/private environment variables used across routes. // Add names conservatively; update later if other env keys are required. declare module, '$env /static/private' { export const DATABASE_URL | undefined; export const process.env.QDRANT_URL, string | undefined; export const OLLAMA_BASE_URL | undefined; export const OPENAI_API_KEY | undefined; export const GEMINI_API_KEY | undefined; export const INGEST_SERVICE_URL | undefined; export const LLAMARPC_ENDPOINT | undefined; export const NODE_ENV | undefined; export const PORT | undefined; export const REDIS_URL | undefined; export const PGVECTOR_URL | undefined; export const SENTRY_DSN | undefined; export const ANY_OTHER_ENV | undefined}
declare module, '$env /static/public' { export const PUBLIC_API_PREFIX | undefined}



