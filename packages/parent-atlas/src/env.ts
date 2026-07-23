import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PACKAGE_ROOT = path.resolve(__dirname, '..');
export const REPO_ROOT = path.resolve(PACKAGE_ROOT, '../..');
export const SCRIPTS_ATLAS = path.resolve(REPO_ROOT, 'scripts', 'atlas');
export const EXPORTS_DIR = path.resolve(REPO_ROOT, 'memory', 'exports');

const DEFAULT_POSTGRES = {
  host: '127.0.0.1',
  port: '5434',
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db',
};

const DEFAULT_REDIS = {
  host: '127.0.0.1',
  port: '6379',
};

type Env = Record<string, string | undefined>;

export function loadEnvFiles(filePaths: string[]): Env {
  const env: Env = {};
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  }
  return env;
}

export function loadRepoEnv(base: Env = process.env as Env): Env {
  const frontendRoot = path.join(REPO_ROOT, 'sveltekit-frontend');
  return {
    ...loadEnvFiles([
      path.join(REPO_ROOT, '.env'),
      path.join(REPO_ROOT, '.env.local'),
      path.join(frontendRoot, '.env'),
      path.join(frontendRoot, '.env.local'),
    ]),
    ...base,
  };
}

function normalizeHost(raw: string | undefined, fallback: string): string {
  const s = String(raw ?? '').trim();
  if (!s || s === '0.0.0.0') return fallback;
  return s;
}

export function resolveRedisConfig(env: Env = process.env as Env): {
  host: string;
  port: number;
  password?: string;
  url: string;
} {
  const rawUrl = String(env.REDIS_URL ?? '').trim();
  let urlHost = '';
  let urlPort = '';
  let urlPassword = '';

  if (rawUrl && /^rediss?:\/\//i.test(rawUrl)) {
    try {
      const parsed = new URL(rawUrl);
      urlHost = parsed.hostname;
      urlPort = parsed.port;
      urlPassword = parsed.password ? decodeURIComponent(parsed.password) : '';
    } catch {}
  }

  const host = normalizeHost(env.REDIS_HOST ?? urlHost, DEFAULT_REDIS.host);
  const port = Number(env.REDIS_PORT ?? urlPort ?? DEFAULT_REDIS.port) || Number(DEFAULT_REDIS.port);
  const password = String(env.REDIS_PASSWORD ?? urlPassword ?? '').trim() || undefined;
  return { host, port, password, url: `redis://${host}:${port}` };
}

export function resolveDatabaseUrl(env: Env = process.env as Env): string {
  const raw = String(env.DATABASE_URL ?? env.ADMIN_DATABASE_URL ?? '').trim();
  if (raw && /^postgres(?:ql)?:\/\//i.test(raw)) return raw;

  const host = normalizeHost(env.DB_HOST ?? env.POSTGRES_HOST, DEFAULT_POSTGRES.host);
  const port = String(env.DB_PORT ?? env.POSTGRES_PORT ?? DEFAULT_POSTGRES.port).trim() || DEFAULT_POSTGRES.port;
  const user = String(env.DB_USER ?? env.POSTGRES_USER ?? DEFAULT_POSTGRES.user).trim() || DEFAULT_POSTGRES.user;
  const password = String(env.DB_PASSWORD ?? env.POSTGRES_PASSWORD ?? DEFAULT_POSTGRES.password).trim() || DEFAULT_POSTGRES.password;
  const database = String(env.DB_NAME ?? env.POSTGRES_DB ?? DEFAULT_POSTGRES.database).trim() || DEFAULT_POSTGRES.database;
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}
