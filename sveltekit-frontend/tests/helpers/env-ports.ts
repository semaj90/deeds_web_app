import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Read .env.local or .env from project root
 * Priority: .env.local > .env
 */
function readEnvFile(): Record<string, string> {
	const envPaths = [
		path.resolve(__dirname, '../../.env.local'),
		path.resolve(__dirname, '../../.env'),
	];
	const result: Record<string, string> = {};
	for (const p of envPaths) {
		if (!fs.existsSync(p)) continue;
		for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
			const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
			if (m) result[m[1]] = m[2].replace(/^["']|["']$/g, '');
		}
		break; // stop at first found
	}
	return result;
}

const envFile = readEnvFile();

/**
 * Get env var from process.env > .env.local > .env > fallback
 */
export function env(key: string, fallback: string): string {
	return process.env[key] ?? envFile[key] ?? fallback;
}

/**
 * Common service URLs for Playwright tests
 * All ports configurable via .env files
 */
export const PORTS = {
	/** SvelteKit dev/preview server */
	APP_BASE: env('PLAYWRIGHT_BASE_URL', 'http://127.0.0.1:5173'),

	/** TurboQuant llama-server with --mmproj */
	TURBO_URL: env('TURBO_QUANT_URL', 'http://localhost:8090'),

	/** Ollama API */
	OLLAMA_URL: env('OLLAMA_BASE_URL', 'http://localhost:11434'),

	/** LiteRT fallback server */
	LITERT_URL: env('LITERT_URL', 'http://localhost:8070'),

	/** Qdrant vector database */
	QDRANT_URL: env('QDRANT_URL', 'http://localhost:6333'),

	/** Redis cache */
	REDIS_HOST: env('REDIS_HOST', 'localhost'),
	REDIS_PORT: env('REDIS_PORT', '6379'),

	/** PostgreSQL (deeds-postgres-prod-proxy) */
	PG_PORT: env('DATABASE_PORT', '5434'),

	/** MinIO object storage */
	MINIO_URL: env('MINIO_ENDPOINT', 'http://localhost:9000'),

	/** RabbitMQ message queue */
	RABBITMQ_URL: env('RABBITMQ_URL', 'amqp://localhost:5672'),

	/** LangExtract NER service */
	LANGEXTRACT_URL: env('LANGEXTRACT_URL', 'http://localhost:8095'),

	/** Go gRPC embedding server */
	GRPC_EMBED_URL: env('GRPC_EMBED_URL', 'localhost:50051'),
} as const;

/**
 * Backend liveness probe with configurable timeout
 * Returns true if service responds to HTTP GET within timeoutMs
 */
export async function probe(url: string, timeoutMs = 2000): Promise<boolean> {
	try {
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), timeoutMs);
		const res = await fetch(url, { signal: ctrl.signal });
		clearTimeout(t);
		return res.ok;
	} catch {
		return false;
	}
}
