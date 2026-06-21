/**
 * @module canonical-source-ref
 * @description Canonical SourceRef utilities for Qdrant, Neo4j, Atlas, CHR97, Valkey, and NDJSON alignment.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';

const GENERATED_SEGMENTS = new Set([
  'node_modules',
  '.svelte-kit',
  '.vite',
  'dist',
  'build',
  'coverage',
]);

const SYNTHETIC_PREFIX_RE = /^(feature|global|route|table):/;

export function isGeneratedPath(input) {
  if (!input || typeof input !== 'string') return false;

  const normalized = input.trim().replace(/\\/g, '/');

  return normalized.split('/').some((segment) => GENERATED_SEGMENTS.has(segment));
}

export function normalizeSourceRef(input) {
  if (!input || typeof input !== 'string') return '';

  let ref = input.trim().replace(/\\/g, '/');

  if (!ref) return '';

  if (SYNTHETIC_PREFIX_RE.test(ref)) {
    return ref;
  }

  ref = ref.replace(/^file:\/+/, '');
  ref = ref.replace(/^file:/, '');

  const cleanPath = ref.replace(/^\.?\//, '').trim();

  if (cleanPath.startsWith('sveltekit-frontend/')) {
    return cleanPath;
  }
  if (cleanPath.startsWith('src/')) {
    return `sveltekit-frontend/${cleanPath}`;
  }

  const srcIdx = cleanPath.indexOf('src/');
  if (srcIdx >= 0) {
    return `sveltekit-frontend/${cleanPath.slice(srcIdx)}`;
  }
  const frontendIdx = cleanPath.indexOf('sveltekit-frontend/');
  if (frontendIdx >= 0) {
    return cleanPath.slice(frontendIdx);
  }

  return cleanPath;
}

export function classifySourceRef(input) {
  const ref = normalizeSourceRef(input);

  if (!ref) return 'unknown';
  if (ref.startsWith('feature:')) return 'feature';
  if (ref.startsWith('global:')) return 'global';
  if (ref.startsWith('route:')) return 'route';
  if (ref.startsWith('table:')) return 'table';
  if (isGeneratedPath(ref)) return 'unknown';
  if (/\.[a-z0-9]+$/i.test(ref)) return 'file';

  return 'unknown';
}

export function sourceRefHash(input) {
  const ref = normalizeSourceRef(input);
  if (!ref) return '';

  return createHash('sha256').update(ref).digest('hex').slice(0, 32);
}

export function sourceRefVariants(input) {
  const ref = normalizeSourceRef(input);
  if (!ref) return [];

  const variants = new Set([ref]);

  if (!SYNTHETIC_PREFIX_RE.test(ref)) {
    variants.add(ref.replace(/^sveltekit-frontend\//, ''));
    variants.add(`sveltekit-frontend/${ref}`);
  }

  return [...variants].filter(Boolean);
}
