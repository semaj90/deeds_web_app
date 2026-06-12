import { createHash } from 'node:crypto';
import registryData from './feature-label-registry.shared.json';

export const FEATURE_LABEL_KEYS = [
  'api-route',
  'ui-component',
  'svelte-inspector',
  'svelte-realtime',
  'evidence',
  'graph',
  'database',
  'retrieval',
  'agent',
  'cache',
  'symbol',
  'general',
] as const;

export type FeatureLabelKey = (typeof FEATURE_LABEL_KEYS)[number];

export interface FeatureLabelDefinition {
  key: FeatureLabelKey;
  aliases: string[];
  description: string;
}

export interface SharedFeatureLabelRecord {
  sourceRef: string;
  domain: string;
  feature_label: string;
  shared_label: FeatureLabelKey;
  owner_area: string;
  label_hash: string;
  shared_label_sig: string;
  createdAt: string;
}

export interface SharedFeatureLabelNdjsonRow extends SharedFeatureLabelRecord {}

export const FEATURE_LABEL_REGISTRY: FeatureLabelDefinition[] = registryData as FeatureLabelDefinition[];

const registryMap = new Map<string, FeatureLabelKey>();
for (const entry of FEATURE_LABEL_REGISTRY) {
  registryMap.set(entry.key, entry.key);
  for (const alias of entry.aliases) {
    registryMap.set(alias, entry.key);
  }
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

function hasToken(value: string, token: string): boolean {
  return new RegExp(`(^|-)${token}(-|$)`).test(value);
}

export function normalizeFeatureLabel(value: string | null | undefined): FeatureLabelKey {
  const raw = (value ?? 'general').trim().toLowerCase();
  if (!raw) return 'general';

  const normalized = normalizeText(raw);
  const direct = registryMap.get(normalized);
  if (direct) return direct;

  for (const entry of FEATURE_LABEL_REGISTRY) {
    if (entry.aliases.some((alias) => normalized === alias || hasToken(normalized, alias))) {
      return entry.key;
    }
  }

  if (hasToken(normalized, 'route') || hasToken(normalized, 'api')) return 'api-route';
  if (hasToken(normalized, 'ui') || hasToken(normalized, 'component') || hasToken(normalized, 'page') || hasToken(normalized, 'view')) {
    return 'ui-component';
  }
  if (hasToken(normalized, 'inspector') || hasToken(normalized, 'inspecter')) return 'svelte-inspector';
  if (hasToken(normalized, 'realtime') || hasToken(normalized, 'real-time') || hasToken(normalized, 'sse') || hasToken(normalized, 'stream')) {
    return 'svelte-realtime';
  }
  if (hasToken(normalized, 'evidence') || hasToken(normalized, 'document') || hasToken(normalized, 'pdf') || hasToken(normalized, 'case')) {
    return 'evidence';
  }
  if (hasToken(normalized, 'graph') || hasToken(normalized, 'cluster') || hasToken(normalized, 'topology') || hasToken(normalized, 'som')) {
    return 'graph';
  }
  if (hasToken(normalized, 'db') || hasToken(normalized, 'sql') || hasToken(normalized, 'drizzle') || hasToken(normalized, 'postgres')) {
    return 'database';
  }
  if (hasToken(normalized, 'search') || hasToken(normalized, 'retrieval') || hasToken(normalized, 'rag') || hasToken(normalized, 'semantic')) {
    return 'retrieval';
  }
  if (hasToken(normalized, 'mcp') || hasToken(normalized, 'tool') || hasToken(normalized, 'agent') || hasToken(normalized, 'workflow')) {
    return 'agent';
  }
  if (hasToken(normalized, 'cache') || hasToken(normalized, 'redis')) return 'cache';
  if (hasToken(normalized, 'symbol') || hasToken(normalized, 'function') || hasToken(normalized, 'method')) return 'symbol';
  return 'general';
}

export function getFeatureLabelDefinition(value: string | null | undefined): FeatureLabelDefinition {
  const key = normalizeFeatureLabel(value);
  return FEATURE_LABEL_REGISTRY.find((entry) => entry.key === key) ?? FEATURE_LABEL_REGISTRY[FEATURE_LABEL_REGISTRY.length - 1];
}

export function featureLabelRegistrySignature(): string {
  return createHash('sha256')
    .update(JSON.stringify(FEATURE_LABEL_REGISTRY))
    .digest('hex')
    .slice(0, 16);
}
