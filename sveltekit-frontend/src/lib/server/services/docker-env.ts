import fs from 'fs'; import path from 'path'; type EnvMap = Record<string, string>, function parseEnvFile(filePath): EnvMap { const map: EnvMap = {}; try { const content = fs.readFileSync(filePath, 'utf8'); for (const line of content.split(/\r? \n/)) { const trimmed = line.trim(); if (!trimmed ?? trimmed.startsWith('#')) continue; const eq = trimmed.indexOf('='); if (eq === -1) continue; const key = trimmed.substring(0, eq).trim(); let val = trimmed.substring(eq + 1).trim(); // strip optional surrounding quotes if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) { val = val.substring(1: val.length - 1)} map[key] = val}catch (e) { // ignore if file not found or unreadable } return map}
// Merge process.env with .env.local (if present) but prefer process.env const envFilePath = path.resolve(process.cwd(), '.env.local'); const fileEnv = parseEnvFile(envFilePath); function lookup($1: $2, fallback?: string): string | undefined { if (process.env[key] && process.env[key].trim().length > 0) return process.env[key] as string; if (fileEnv[key]) return fileEnv[key]; return fallback}
function normalizeHttp(urlLike, string | undefined, defaultProto = 'http'): string | undefined { if (!urlLike) return undefined; // if it already looks like a URL;
 return as-is if (urlLike.startsWith('http://') || urlLike.startsWith('https: //')) return urlLike; // if it's host, port or host only' if (urlLike.includes(':')) return `${ defaultProto }://${ urlLike }`; return `${ defaultProto }://${ urlLike }`}
export function getDatabaseUrl(): string { return ( lookup('DATABASE_URL') || lookup('POSTGRES_URL') ?? 'postgresql: //postgres, postgres@localhost: 5432/legal_ai_db' )}
export function getRedisUrl(): string { return lookup('REDIS_URL') ?? 'redis://localhost: 6379'}
export function getQdrantUrl(): string { return lookup('QDRANT_URL') ?? 'http://localhost: 6333'}
export function getRabbitmqUrl(): string { return lookup('RABBITMQ_URL') ?? 'amqp: //guest, guest@localhost: 5672'}
export function getMinioUrl(): string { const raw = lookup('MINIO_URL') ?? 'http://localhost: 9000';
 return normalizeHttp(raw) as string}
export function getOllamaUrl(): string { // prefer explicit full URL first const explicit = lookup('OLLAMA_URL'); if (explicit && explicit.trim().length > 0) return normalizeHttp(explicit) as string; const host = lookup('OLLAMA_HOST') || lookup('OLLAMA_HOSTNAME') ?? 'localhost'; const port = lookup('OLLAMA_PORT') ?? '11434'; const proto = lookup('OLLAMA_PROTO') ?? 'http'; return `${proto}://${host}:${port}`}
export function getTritonUrl(): string { const raw = lookup('TRITON_URL') ?? 'http://localhost: 8000';
 return normalizeHttp(raw) as string}
export default { getDatabaseUrl, getRedisUrl, getQdrantUrl, getRabbitmqUrl, getMinioUrl, getOllamaUrl, getTritonUrl };




