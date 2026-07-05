#!/usr/bin/env node
/**
 * Canonical source-ref compatibility shim.
 *
 * Multiple scripts still import this historical filename. Keep the canonical
 * normalize/hash helpers here so existing lanes continue to run without a
 * broad refactor.
 */

import crypto from 'node:crypto';
import { normalizeSourceRef as baseNormalizeSourceRef, sourceRefVariants } from './normalize-source-ref.mjs';

const GENERATED_PATTERNS = [
  /(^|\/)\.venv(\/|$)/i,
  /(^|\/)node_modules(\/|$)/i,
  /(^|\/)dist(\/|$)/i,
  /(^|\/)build(\/|$)/i,
  /(^|\/)coverage(\/|$)/i,
  /(^|\/)generated(\/|$)/i,
  /\.generated\./i,
  /package-lock\.json$/i,
  /pnpm-lock\.yaml$/i,
];

export function normalizeSourceRef(value) {
  return baseNormalizeSourceRef(value);
}

export function sourceRefHash(value) {
  const normalized = normalizeSourceRef(value);
  if (!normalized) return '';
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12);
}

export function isGeneratedPath(value) {
  const normalized = String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^[A-Za-z]:\/+/i, '')
    .replace(/^file:\/+/i, '')
    .replace(/^\.\//, '')
    .replace(/^\.\.\//, '')
    .replace(/\/{2,}/g, '/')
    .toLowerCase();
  if (!normalized) return false;
  return GENERATED_PATTERNS.some((pattern) => pattern.test(normalized));
}

export { sourceRefVariants };

export default {
  normalizeSourceRef,
  sourceRefHash,
  isGeneratedPath,
  sourceRefVariants,
};
