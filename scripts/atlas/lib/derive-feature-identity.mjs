/**
 * Pure function to derive feature labels from row metadata.
 * No side effects, no DB access, deterministic.
 */

const GENERIC_BASENAMES = new Set([
  '+page.svelte',
  '+server.ts',
  '+layout.svelte',
  '+layout.server.ts',
  'index.ts',
  'index.js'
]);

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function titleCase(text) {
  return String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const match = word.match(/^([^A-Za-z0-9]*)([A-Za-z0-9].*)$/);
      if (!match) return word;
      const [, prefix, body] = match;
      const parts = body
        .split(/[-_]+/)
        .filter(Boolean)
        .map((segment) =>
          segment.replace(/[A-Za-z0-9]+/g, (chunk) => {
            if (/^[A-Z0-9]+$/.test(chunk)) return chunk;
            if (chunk.length === 1) return chunk.toUpperCase();
            return chunk[0].toUpperCase() + chunk.slice(1).toLowerCase();
          }),
        );
      return `${prefix}${parts.join(' ')}`;
    })
    .join(' ');
}

/**
 * Title-case a multi-word phrase while preserving all-caps acronyms
 * (e.g. "AI", "API") instead of lowercasing them.
 */
function capitalizeWords(text) {
  return text
    .split(/\s+/)
    .map(word => {
      if (/^[A-Z0-9]+$/.test(word)) return word; // preserve acronyms as-is
      const match = word.match(/^([^A-Za-z]*)([A-Za-z])(.*)$/);
      if (!match) return word;
      const [, prefix, firstLetter, rest] = match;
      return prefix + firstLetter.toUpperCase() + rest.toLowerCase();
    })
    .join(' ');
}

function getSourceBasename(canonical_source_ref, file_path) {
  const path = canonical_source_ref || file_path || '';
  return path.split('/').pop() || '';
}

function isFilenameDerivedLabel(label, sourceBasename) {
  if (!label || !sourceBasename) return false;
  const normalizedLabel = label.toLowerCase().trim();
  const normalizedBase = String(sourceBasename).toLowerCase().trim();
  const strippedBase = normalizedBase.replace(/\.[^.]+$/, '');
  if (!normalizedLabel || !strippedBase) return false;
  if (normalizedLabel === normalizedBase) return true;
  if (normalizedLabel === strippedBase) return true;
  if (normalizedLabel === strippedBase.replace(/[-_]+/g, ' ')) return true;
  return false;
}

/**
 * Extract a functional noun phrase from summary text.
 * Looks for patterns like:
 *   - "renders/provides/defines/implements [a/an/the] PHRASE"
 *   - "responsible for X"
 *   - "utilities for X"
 *   - "interface for X"
 *   - "endpoint/handler for X"
 */
function extractFunctionalNounPhrase(summary) {
  if (!summary) return null;

  // Pattern 1: renders/provides/defines/implements [article] PHRASE (stops at period, 'for', 'with', 'and')
  let match = summary.match(/(?:renders|provides|defines|implements)\s+(?:a|an|the)?\s*([A-Z][A-Za-z\s]+?)(?:\s+(?:for|with|and)|\.|\s{2,}|$)/i);
  if (match) {
    const phrase = capitalizeWords(match[1].trim());
    if (phrase.length > 2) return phrase;
  }

  // Pattern 2: starts with noun phrase followed by period, "and", "or"
  // e.g. "Cache event management and invalidation"
  match = summary.match(/^([A-Z][A-Za-z\s]+?)(?:\.|,|\s+(?:and|or)\s)/i);
  if (match) {
    const phrase = capitalizeWords(match[1].trim());
    if (phrase.length > 2) return phrase;
  }

  // Pattern 3: quoted phrases
  match = summary.match(/"([^"]+)"/);
  if (match) {
    const phrase = match[1].trim().replace(/[,;:.]+$/, '');
    if (phrase.length > 2) return phrase;
  }

  return null;
}

/**
 * Derive label from canonical path.
 * Strip src/routes/lib/components/server/api scaffolding, title-case remainder.
 * Only use the directory path component, not the filename (unless filename is meaningful).
 */
function deriveLabelFromPath(canonical_source_ref) {
  if (!canonical_source_ref) return null;

  const SCAFFOLD = new Set(['src', 'routes', 'lib', 'components', 'server', 'api']);

  const parts = canonical_source_ref.split('/');

  // Extract meaningful directory components (skip scaffolding)
  const meaningful = parts.slice(0, -1)  // Exclude the filename
    .filter(seg => !SCAFFOLD.has(seg) && seg.length > 0);

  if (meaningful.length === 0) return null;

  // Take the last meaningful directory component
  const dirName = meaningful[meaningful.length - 1];
  return titleCase(dirName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
}

/**
 * Derive label from title_id.
 * Strip tokens like "title", "sveltekit", "frontend" and trailing hex, title-case remainder.
 */
function deriveLabelFromTitleId(title_id) {
  if (!title_id) return null;

  const tokens = title_id.split('.')
    .filter(t => !['title', 'sveltekit', 'frontend', 'backend', 'server', 'client'].includes(t.toLowerCase()))
    .map(t => t.replace(/[0-9a-f]{8}$/, '').trim())
    .filter(t => t.length > 0);

  if (tokens.length === 0) return null;

  return titleCase(tokens.join(' ').replace(/[-_]+/g, ' '));
}

/**
 * Derive feature identity from a row of metadata.
 *
 * @param {Object} row - { title_id, feature_id, feature_label, summary, canonical_source_ref, file_path }
 * @returns {Object} { featureId, featureLabel, featureLabelSource, featureLabelConfidence, sourceBasename }
 */
export function deriveFeatureIdentity(row) {
  const {
    title_id,
    feature_id: existing_feature_id,
    feature_label: existing_label,
    summary,
    canonical_source_ref,
    file_path
  } = row;

  const sourceBasename = getSourceBasename(canonical_source_ref, file_path);

  // A label is "generic" (non-meaningful) if it's a known scaffold basename,
  // or an echo of the file's own basename. Those should not block summary derivation.
  const isGenericLabel = Boolean(
    existing_label &&
    (GENERIC_BASENAMES.has(existing_label) || isFilenameDerivedLabel(existing_label, sourceBasename))
  );

  // If existing label is NOT generic, treat as canonical.
  if (existing_label && !isGenericLabel) {
    return {
      featureId: existing_feature_id || `sveltekit-frontend.${slugify(existing_label)}`,
      featureLabel: existing_label,
      featureLabelSource: 'canonical',
      featureLabelConfidence: 1.0,
      sourceBasename
    };
  }

  // Try derivation strategies in order
  let derivedLabel = extractFunctionalNounPhrase(summary);
  let source = 'summary';
  let confidence = 0.95;

  if (!derivedLabel) {
    derivedLabel = deriveLabelFromPath(canonical_source_ref);
    source = 'path';
    confidence = 0.7;
  }

  if (!derivedLabel) {
    derivedLabel = deriveLabelFromTitleId(title_id);
    source = 'title_id';
    confidence = 0.5;
  }

  if (!derivedLabel) {
    // Fallback: title-case basename without extension
    const cleanBasename = sourceBasename.replace(/\.[^.]+$/, '');
    derivedLabel = titleCase(cleanBasename);
    source = 'basename';
    confidence = 0.3;
  }

  return {
    featureId: `sveltekit-frontend.${slugify(derivedLabel)}`,
    featureLabel: derivedLabel,
    featureLabelSource: source,
    featureLabelConfidence: confidence,
    sourceBasename
  };
}

/**
 * Classify a deriveFeatureIdentity() result into a report-friendly status bucket.
 * Shared by every consumer (summary-index-ranker, envelope builder, ...) so the
 * bucket boundaries live in exactly one place.
 */
export function classifyFeatureLabelStatus(identity) {
  if (identity.featureLabelSource === 'canonical') return 'CANONICAL';
  if (identity.featureLabelConfidence >= 0.9) return 'DERIVED_HIGH_CONFIDENCE';
  if (identity.featureLabelConfidence >= 0.5) return 'DERIVED_PATH_FALLBACK';
  return 'GENERIC_REPLACEMENT_RECOMMENDED';
}
