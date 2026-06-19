#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');

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

export function loadEnvFiles(filePaths) {
  const env = {};
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

export function loadRepoEnv(base = process.env) {
  return {
    ...loadEnvFiles([
      path.join(REPO_ROOT, '.env'),
      path.join(REPO_ROOT, '.env.local'),
      path.join(FRONTEND_ROOT, '.env'),
      path.join(FRONTEND_ROOT, '.env.local'),
    ]),
    ...base,
  };
}

export function normalizeConnectionHost(rawValue, fallbackHost = '127.0.0.1') {
  const raw = String(rawValue ?? '').trim();
  if (!raw || raw === '0.0.0.0') return fallbackHost;
  if (raw.toLowerCase() === 'localhost' || raw === '::1') return '127.0.0.1';
  return raw;
}

export function normalizeRedisUrl(rawValue, fallbackHost = DEFAULT_REDIS.host, fallbackPort = DEFAULT_REDIS.port) {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return `redis://${fallbackHost}:${fallbackPort}`;
  if (/^rediss?:\/\//i.test(raw)) return raw;
  if (/^[^:/?#]+:\d+(?:\/\d+)?$/.test(raw)) {
    const [hostPort, dbPart] = raw.split('/', 2);
    const [host, port] = hostPort.split(':', 2);
    return `redis://${normalizeConnectionHost(host, fallbackHost)}:${port || fallbackPort}${dbPart ? `/${dbPart}` : ''}`;
  }
  if (/^[^:/?#]+$/.test(raw)) return `redis://${normalizeConnectionHost(raw, fallbackHost)}:${fallbackPort}`;
  return `redis://${fallbackHost}:${fallbackPort}`;
}

export function resolveRedisConfig(env = process.env) {
  const rawUrl = String(env.REDIS_URL ?? env.VALKEY_URL ?? '').trim();
  let urlHost = '';
  let urlPort = '';
  let urlPassword = '';

  if (rawUrl) {
    try {
      const parsed = new URL(normalizeRedisUrl(rawUrl));
      urlHost = parsed.hostname;
      urlPort = parsed.port;
      urlPassword = parsed.password ? decodeURIComponent(parsed.password) : '';
    } catch {
      // fall through to host/port envs
    }
  }

  const host = normalizeConnectionHost(env.REDIS_HOST ?? env.VALKEY_HOST ?? urlHost ?? DEFAULT_REDIS.host, DEFAULT_REDIS.host);
  const port = Number(env.REDIS_PORT ?? env.VALKEY_PORT ?? urlPort ?? DEFAULT_REDIS.port) || Number(DEFAULT_REDIS.port);
  const password = String(
    env.REDIS_PASSWORD ??
    env.REDIS_PASS ??
    env.VALKEY_PASSWORD ??
    env.VALKEY_PASS ??
    urlPassword ??
    ''
  ).trim() || undefined;
  return {
    host,
    port,
    password,
    url: `redis://${host}:${port}`,
  };
}

export function resolveRedisUrl(env = process.env, defaults = DEFAULT_REDIS) {
  const config = resolveRedisConfig(env);
  const rawUrl = String(env.REDIS_URL ?? env.VALKEY_URL ?? '').trim();

  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === 'redis:' || parsed.protocol === 'rediss:') {
        if ((!parsed.password || parsed.password.length === 0) && config.password) {
          parsed.password = config.password;
        }
        if (!parsed.hostname) parsed.hostname = config.host || defaults.host;
        if (!parsed.port) parsed.port = String(config.port || defaults.port);
        return parsed.toString();
      }
    } catch {
      // fall back to synthesized URL below
    }
  }

  const password = config.password ? encodeURIComponent(config.password) : '';
  const auth = password ? `:${password}@` : '';
  return `redis://${auth}${config.host || defaults.host}:${config.port || defaults.port}`;
}

export function resolveDatabaseUrl(env = process.env, defaults = DEFAULT_POSTGRES) {
  const raw = String(env.DATABASE_URL ?? env.ADMIN_DATABASE_URL ?? '').trim();
  if (raw) {
    if (/^postgres(?:ql)?:\/\//i.test(raw)) return raw;
    if (/^[^:/?#]+:\d+(?:\/[^/]+)?$/.test(raw)) {
      const [hostPort, dbPart] = raw.split('/', 2);
      const [host, port] = hostPort.split(':', 2);
      return `postgresql://${encodeURIComponent(String(env.DB_USER ?? env.POSTGRES_USER ?? defaults.user))}:${encodeURIComponent(String(env.DB_PASSWORD ?? env.POSTGRES_PASSWORD ?? defaults.password))}@${normalizeConnectionHost(host, defaults.host)}:${port || defaults.port}/${dbPart || defaults.database}`;
    }
  }

  const host = normalizeConnectionHost(env.DB_HOST ?? env.POSTGRES_HOST ?? defaults.host, defaults.host);
  const port = String(env.DB_PORT ?? env.POSTGRES_PORT ?? defaults.port).trim() || defaults.port;
  const user = String(env.DB_USER ?? env.POSTGRES_USER ?? defaults.user).trim() || defaults.user;
  const password = String(env.DB_PASSWORD ?? env.POSTGRES_PASSWORD ?? defaults.password).trim() || defaults.password;
  const database = String(env.DB_NAME ?? env.POSTGRES_DB ?? defaults.database).trim() || defaults.database;
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}
