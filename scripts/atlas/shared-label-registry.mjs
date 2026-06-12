import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REGISTRY_PATH = path.join(
  REPO_ROOT,
  'sveltekit-frontend',
  'src',
  'lib',
  'server',
  'labels',
  'feature-label-registry.shared.json',
);

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

function hasToken(value, token) {
  return new RegExp(`(^|-)${token}(-|$)`).test(value);
}

export function loadSharedLabelRegistry() {
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
  return JSON.parse(raw);
}

export const SHARED_LABEL_REGISTRY = loadSharedLabelRegistry();

const REGISTRY_MAP = new Map();
for (const entry of SHARED_LABEL_REGISTRY) {
  const normalizedKey = normalizeText(entry.key);
  REGISTRY_MAP.set(normalizedKey, entry.key);
  for (const alias of entry.aliases ?? []) {
    REGISTRY_MAP.set(normalizeText(alias), entry.key);
  }
}

export function normalizeSharedLabel(value) {
  const raw = normalizeText(value || 'general');
  if (!raw) return 'general';
  const direct = REGISTRY_MAP.get(raw);
  if (direct) return direct;
  for (const entry of SHARED_LABEL_REGISTRY) {
    if ((entry.aliases ?? []).some((alias) => raw === normalizeText(alias) || hasToken(raw, normalizeText(alias)))) {
      return entry.key;
    }
  }
  if (hasToken(raw, 'route') || hasToken(raw, 'api')) return 'api-route';
  if (hasToken(raw, 'ui') || hasToken(raw, 'component') || hasToken(raw, 'page') || hasToken(raw, 'view')) return 'ui-component';
  if (hasToken(raw, 'inspector')) return 'svelte-inspector';
  if (hasToken(raw, 'realtime') || hasToken(raw, 'sse') || hasToken(raw, 'stream')) return 'svelte-realtime';
  if (hasToken(raw, 'evidence') || hasToken(raw, 'document') || hasToken(raw, 'pdf') || hasToken(raw, 'case')) return 'evidence';
  if (hasToken(raw, 'graph') || hasToken(raw, 'cluster') || hasToken(raw, 'topology') || hasToken(raw, 'som')) return 'graph';
  if (hasToken(raw, 'db') || hasToken(raw, 'sql') || hasToken(raw, 'drizzle') || hasToken(raw, 'postgres')) return 'database';
  if (hasToken(raw, 'search') || hasToken(raw, 'retrieval') || hasToken(raw, 'rag') || hasToken(raw, 'semantic')) return 'retrieval';
  if (hasToken(raw, 'mcp') || hasToken(raw, 'tool') || hasToken(raw, 'agent') || hasToken(raw, 'workflow')) return 'agent';
  if (hasToken(raw, 'cache') || hasToken(raw, 'redis')) return 'cache';
  if (hasToken(raw, 'symbol') || hasToken(raw, 'function') || hasToken(raw, 'method')) return 'symbol';
  return 'general';
}

export function sharedLabelRegistrySignature() {
  return createHash('sha256').update(JSON.stringify(SHARED_LABEL_REGISTRY)).digest('hex').slice(0, 16);
}
