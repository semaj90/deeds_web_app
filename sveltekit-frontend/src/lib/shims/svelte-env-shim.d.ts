// SvelteKit $env shims for common static/private environment variables used across routes.
// Add names conservatively; update later if other env keys are required.
declare module '$env/static/private' {
	export const DATABASE_URL: string | undefined;
	export const QDRANT_URL: string | undefined;
	export const OLLAMA_BASE_URL: string | undefined;
	export const OPENAI_API_KEY: string | undefined;
	export const INGEST_SERVICE_URL: string | undefined;
	export const LLAMARPC_ENDPOINT: string | undefined;
	export const NODE_ENV: string | undefined;
	export const PORT: string | undefined;
	export const REDIS_URL: string | undefined;
	export const PGVECTOR_URL: string | undefined;
	export const SENTRY_DSN: string | undefined;
	export const ANY_OTHER_ENV: string | undefined;
}

declare module '$env/static/public' {
	export const PUBLIC_API_PREFIX: string | undefined;
}



