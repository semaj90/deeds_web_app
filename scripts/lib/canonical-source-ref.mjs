#!/usr/bin/env node
/**
 * canonical-source-ref.mjs
 *
 * Cross-system identity normalisation for source references.
 *
 * All four systems (Qdrant, Valkey/Karpathy, Neo4j, Atlas candidates) store
 * the same file identity under different field names and path formats:
 *
 *   Qdrant:     sourceRef = "src/lib/server/db/client.ts"
 *               file_path  = "sveltekit-frontend/src/lib/server/db/client.ts"
 *               relativePath = "src/lib/server/db/client.ts"
 *   Karpathy:   key        = "src/lib/server/db/client.ts"
 *   Neo4j:      filePath   = "sveltekit-frontend/src/lib/server/db/client.ts" (66%)
 *                         or "src/lib/server/db/client.ts" (34%)
 *   Candidates: file       = "file:src/lib/server/db/client.ts"
 *
 * This module provides a single normalisation surface so join logic can
 * produce a canonical form and enumerate all variants for fuzzy matching.
 */

import { createHash } from 'node:crypto';

// Prefixes that must be stripped to reach the bare relative path.
const STRIP_PREFIXES = [
  'file:',
  'sveltekit-frontend/',
  'sveltekit-frontend\\',
  'src/', // do NOT strip this — it IS canonical for frontend files
];

// Roots that indicate a generated / build artefact rather than a source file.
const GENERATED_ROOTS = [
  '.svelte-kit/',
  'build/',
  'node_modules/',
  '.opencode/',
  'scripts/atlas/out/',
  '.tmp/',
  'dist/',
  'coverage/',
];

/**
 * normalizeSourceRef(input) → string
 *
 * Returns the canonical form: a forward-slash relative path with no leading
 * slash and no `file:` / `sveltekit-frontend/` prefix.
 *
 * Examples:
 *   "file:src/lib/server/db/client.ts"            → "src/lib/server/db/client.ts"
 *   "sveltekit-frontend/src/lib/server/db/client.ts" → "src/lib/server/db/client.ts"
 *   "src/lib/server/db/client.ts"                 → "src/lib/server/db/client.ts"
 *   "/abs/path/src/lib/server/db/client.ts"       → "src/lib/server/db/client.ts"
 *   "C:\\path\\sveltekit-frontend\\src\\foo.ts"   → "src/foo.ts"
 */
export function normalizeSourceRef(input) {
  if (!input || typeof input !== 'string') return '';

  // Normalise backslashes to forward slashes.
  let s = input.replace(/\\/g, '/');

  // Strip Windows drive letter prefix (C:/...)
  s = s.replace(/^[A-Za-z]:\//, '');

  // Strip leading slash(es).
  s = s.replace(/^\/+/, '');

  // Clean file: prefix
  s = s.replace(/^file:/, '');

  const cleanPath = s.replace(/^\.?\//, '').trim();

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

/**
 * sourceRefVariants(input) → string[]
 *
 * Returns ALL known representations of a source ref so callers can query
 * Qdrant / Neo4j / Valkey using any variant and expect a hit.
 *
 * Order: canonical first, then sveltekit-frontend-prefixed, then file:-prefixed.
 */
export function sourceRefVariants(input) {
  const canonical = normalizeSourceRef(input);
  if (!canonical) return [];

  const variants = new Set([canonical]);

  // sveltekit-frontend prefix variants
  if (canonical.startsWith('src/')) {
    variants.add('sveltekit-frontend/' + canonical);
    variants.add('file:' + canonical);
    variants.add('file:sveltekit-frontend/' + canonical);
  } else {
    variants.add('sveltekit-frontend/' + canonical);
    variants.add('file:' + canonical);
  }

  // Without extension (for feature-level matches)
  const noExt = canonical.replace(/\.[^/.]+$/, '');
  if (noExt !== canonical) variants.add(noExt);

  return [...variants];
}

/**
 * sourceRefHash(input) → string (12-char hex)
 *
 * Stable, short hash of the canonical form for use as a Valkey key suffix
 * or a Neo4j property. Deterministic across processes.
 */
export function sourceRefHash(input) {
  const canonical = normalizeSourceRef(input);
  if (!canonical) return '';
  return createHash('sha256').update(canonical).digest('hex').slice(0, 12);
}

/**
 * isGeneratedPath(input) → boolean
 *
 * Returns true if the path points to a build artefact, cache file, or
 * generated directory rather than a hand-authored source file.
 */
export function isGeneratedPath(input) {
  const canonical = normalizeSourceRef(input);
  if (!canonical) return false;

  for (const root of GENERATED_ROOTS) {
    if (canonical.startsWith(root)) return true;
  }

  // Common generated file patterns
  if (/\.(d\.ts|js\.map|css\.map)$/.test(canonical)) return true;
  if (canonical.includes('/__generated__/')) return true;
  if (canonical.includes('/.svelte-kit/')) return true;

  return false;
}
