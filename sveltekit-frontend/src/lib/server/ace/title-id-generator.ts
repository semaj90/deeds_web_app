/**
 * Title Identity Generator — Deterministic Semantic Labels
 *
 * Generates stable semantic titles for canonical packets.
 * title_id is stable per packet_key + generator version.
 * Summary mutations do NOT change title_id.
 * Rerank scores do NOT change title_id.
 *
 * Evidence priority (in order):
 *   1. Existing feature_label (highest priority)
 *   2. Symbol name (function/class/type name)
 *   3. Exported identifier
 *   4. Domain + symbol kind (e.g., "auth handler", "cache layer")
 *   5. Summary keywords (skip generic first words)
 *   6. Source filename fallback
 *
 * title_id invariant: same packet_key + same generator version → same title_id always
 */

import { createHash } from 'node:crypto';
import type { FeatureEnvelope } from './feature-envelope.js';

// Canonical version for the title identity algorithm.
// Keep this as the single source of truth in the runtime until a shared package is genuinely needed.
export const TITLE_GENERATOR_VERSION = 'semantic-title-v2';

/**
 * Generated title artifact with all provenance
 */
export interface GeneratedTitle {
  titleId: string;
  title: string;
  slug: string;
  generatorVersion: string;
}

/**
 * Normalize slug to safe URL-like format
 * - lowercase
 * - replace non-alphanumeric with hyphens
 * - trim leading/trailing hyphens
 * - max 64 chars
 */
function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * Extract keywords from text, skipping generic opener words
 */
function extractKeywords(text: string, maxKeywords: number = 3): string[] {
  const genericOpeners = new Set([
    'this',
    'function',
    'class',
    'interface',
    'type',
    'returns',
    'handles',
    'manages',
    'provides',
    'creates',
    'implements',
    'defines',
    'represents',
    'contains',
    'module',
    'component',
    'service',
    'utility',
    'helper',
  ]);

  const words = text
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 2 && !genericOpeners.has(w))
    .slice(0, maxKeywords);

  return words;
}

/**
 * Generate stable title identity from packet evidence
 *
 * Core principle: title_id is stable per packet_key + generator_version
 * - packet_key is the canonical source-derived identity (immutable)
 * - title_id is deterministic: hash(packet_key + generator_version), not summary
 * - Human-readable slug comes from evidence priority (feature_label → symbol → domain+kind → filename)
 * - Summary wording changes do NOT affect title_id
 * - Rerank scores do NOT affect title_id
 *
 * title_id format: title:<hash8>
 *   where hash8 is sha256(packet_key + generator_version)[:8]
 */
export function generateTitleIdentity(
  packetKey: string,
  options: {
    featureLabel?: string;
    symbolName?: string;
    symbolKind?: string;
    domain?: string;
    summary?: string;
    sourceFilename?: string;
  }
): GeneratedTitle {
  // Evidence priority: use first available source for human-readable slug
  // (Do NOT use summary content — it's mutable)
  let title: string | undefined;

  if (options.featureLabel) {
    title = options.featureLabel;
  } else if (options.symbolName) {
    if (options.symbolKind && options.symbolKind !== 'variable') {
      title = `${options.symbolName} (${options.symbolKind})`;
    } else {
      title = options.symbolName;
    }
  } else if (options.domain && options.symbolKind) {
    title = `${options.domain} ${options.symbolKind}`;
  } else if (options.sourceFilename) {
    // Fallback: use filename stem (stable)
    title = options.sourceFilename.replaceAll('\\', '/').split('/').pop()?.split('.')[0] || 'untitled';
  } else if (options.summary) {
    // Last resort: extract keywords from summary (but use sparingly, as summary is mutable)
    const keywords = extractKeywords(options.summary);
    if (keywords.length > 0) {
      title = keywords.join(' ');
    }
  }

  title = title || 'untitled';

  // Normalize to slug format
  const slug = normalizeSlug(title);

  // Stable hash suffix: ONLY packet_key + generator version
  // Summary/rerank/other query-specific data is NOT included
  // This ensures: same packet_key + same generator → same title_id always
  const suffix = createHash('sha256')
    .update(`${packetKey}\0${TITLE_GENERATOR_VERSION}`)
    .digest('hex')
    .slice(0, 8);

  return {
    titleId: `title:${suffix}`,
    title,
    slug,
    generatorVersion: TITLE_GENERATOR_VERSION,
  };
}

/**
 * Generate title from a FeatureEnvelope
 * Requires packet_key to be already assigned
 */
export function generateTitleFromEnvelope(envelope: FeatureEnvelope): GeneratedTitle | null {
  if (!envelope.packet_key) {
    return null; // Cannot generate without stable packet_key
  }

  return generateTitleIdentity(envelope.packet_key, {
    featureLabel: envelope.feature_id,
    symbolName: envelope.ast?.symbol,
    symbolKind: envelope.ast?.kind,
    domain: envelope.domain_class,
    summary: envelope.summary,
    sourceFilename: envelope.source_ref,
  });
}
