import { createHash } from 'node:crypto';
import path from 'node:path';

const IDENTITY_SEPARATOR = '\x1f';
const FEATURE_HASH_LENGTH = 24;

/**
 * Normalize arbitrary text for canonical identity hashing.
 *
 * Important:
 * - NFKC removes equivalent Unicode representations.
 * - Case is intentionally ignored.
 * - Whitespace is canonicalized.
 * - Human punctuation differences at the edges do not create new identities.
 *
 * This is NOT the same as the human-readable slug.
 */
function normalizeIdentityText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.。]+$/u, '')
    .toLowerCase();
}

/**
 * Convert a canonical string into a deterministic readable slug.
 */
function slugify(value) {
  return normalizeIdentityText(value)
    .replace(/[`'"“”‘’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\bversus\b/g, ' vs ')
    .replace(/\bvs\.\b/g, ' vs ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * Extract the canonical source kind.
 *
 * Examples:
 *   todo:C:\repo\MASTER-FEATURE-TODO.md#line:313 -> todo
 *   openspec:changes/foo/spec.md                 -> openspec
 *   ../MASTER-FEATURE-TODO.md                    -> fallbackKind
 */
function extractSourceKind(value, fallbackKind = 'todo') {
  const source = String(value ?? '').trim();

  const match = source.match(/^([a-z][a-z0-9+.-]*):/i);

  // Do not accidentally interpret C:\... as scheme "c".
  if (match && match[1].length > 1) {
    return match[1].toLowerCase();
  }

  return fallbackKind;
}

/**
 * Remove provenance-only location information.
 *
 * The line fragment is NEVER part of canonical identity.
 */
function stripSourceLocation(value) {
  let source = String(value ?? '').trim();

  source = source.replace(/#line:\d+$/i, '');
  source = source.replace(/#L\d+(?:-L?\d+)?$/i, '');

  const schemeMatch = source.match(/^([a-z][a-z0-9+.-]*):(.*)$/i);

  // Avoid treating Windows C:\ as a semantic scheme.
  if (schemeMatch && schemeMatch[1].length > 1) {
    source = schemeMatch[2];
  }

  return source;
}

/**
 * Produce the stable source-document identity.
 *
 * Examples:
 *
 * todo:C:\...\MASTER-FEATURE-TODO-2026-05-20.md#line:313
 *
 * becomes:
 *
 * todo:master-feature-todo-2026-05-20
 *
 * Line numbers and absolute repository paths intentionally disappear.
 */
export function normalizeSource(value, options = {}) {
  const { sourceKind, fallbackKind = 'todo' } = options;

  const kind = sourceKind ?? extractSourceKind(value, fallbackKind);

  const withoutLocation = stripSourceLocation(value);

  const normalizedPath = withoutLocation.replace(/\\/g, '/');

  const basename = path.posix.basename(normalizedPath) || normalizedPath;

  const withoutExtension = basename.replace(/\.(md|markdown|mdx|txt|json|jsonl|ya?ml)$/i, '');

  const documentKey = slugify(withoutExtension);

  if (!documentKey) {
    throw new Error(`Cannot derive sourceKey from source: ${JSON.stringify(value)}`);
  }

  return `${kind}:${documentKey}`;
}

/**
 * Canonicalize section identity.
 *
 * Phase headings intentionally collapse to their stable phase number:
 *
 * "Phase 101A — Directory Analysis & Codebase Pruning"
 * ->
 * "phase-101a"
 *
 * This prevents harmless edits to a phase's descriptive heading from changing
 * every feature beneath that phase.
 *
 * Non-phase sections retain their full canonicalized heading.
 */
export function normalizeSection(value) {
  const normalized = normalizeIdentityText(value);

  if (!normalized) {
    return 'unsectioned';
  }

  const phaseMatch = normalized.match(/^phase\s+([0-9]+[a-z0-9.-]*)\b/i);

  if (phaseMatch) {
    return `phase-${slugify(phaseMatch[1])}`;
  }

  return slugify(normalized) || 'unsectioned';
}

/**
 * Canonical title used for hashing.
 *
 * Keep this conservative.
 *
 * We deliberately do NOT use LLM summarization, embeddings, stemming, or
 * semantic rewriting here. Identity derivation must produce exactly the same
 * answer offline on every machine.
 */
export function normalizeTitle(value) {
  const normalized = normalizeIdentityText(value);

  if (!normalized) {
    throw new Error('Cannot derive feature identity without a title');
  }

  return normalized;
}

/**
 * Human-readable title slug.
 *
 * This is presentation/debug identity, not the cryptographic identity input.
 */
export function normalizeTitleSlug(value) {
  const normalized = normalizeTitle(value);

  return slugify(normalized);
}

/**
 * Choose exactly one canonical source from the record.
 *
 * Priority:
 *
 * 1. record.source_ref / record.sourceRef
 * 2. record.source
 * 3. first sourceRefs entry
 *
 * Additional sourceRefs are provenance only and MUST NOT modify featureId.
 */
function resolveCanonicalSource(record) {
  const sourceRef = record?.source_ref ?? record?.sourceRef ?? null;

  if (sourceRef) {
    return sourceRef;
  }

  if (record?.source) {
    return record.source;
  }

  if (Array.isArray(record?.sourceRefs) && record.sourceRefs.length > 0) {
    return record.sourceRefs[0];
  }

  throw new Error(
    'Cannot derive feature identity without source_ref, sourceRef, source, or sourceRefs[0]'
  );
}

/**
 * Keep exact source provenance without allowing it into the identity hash.
 */
function resolveSourceRefs(record, canonicalSource) {
  const refs = [];

  const primary = record?.source_ref ?? record?.sourceRef ?? null;

  if (primary) {
    refs.push(String(primary));
  }

  if (Array.isArray(record?.sourceRefs)) {
    for (const ref of record.sourceRefs) {
      if (ref != null && String(ref).trim()) {
        refs.push(String(ref));
      }
    }
  }

  if (refs.length === 0 && canonicalSource) {
    refs.push(String(canonicalSource));
  }

  return [...new Set(refs)];
}

/**
 * Stable canonical feature identity.
 *
 * Canonical identity input:
 *
 * sourceKey
 *   \x1f
 * normalized section
 *   \x1f
 * normalized title
 *
 * SHA-256 -> first 24 hex characters.
 *
 * Example:
 *
 * feature:todo:0123456789abcdef01234567
 */
export function deriveFeatureIdentity(record) {
  if (!record || typeof record !== 'object') {
    throw new TypeError('deriveFeatureIdentity(record) requires an object');
  }

  const canonicalSource = resolveCanonicalSource(record);

  const sourceKind = extractSourceKind(canonicalSource, 'todo');

  const sourceKey = normalizeSource(canonicalSource, {
    sourceKind,
  });

  const canonicalSection = normalizeSection(record.section);

  const canonicalTitle = normalizeTitle(record.title ?? record.description);

  const titleSlug = normalizeTitleSlug(record.title ?? record.description);

  const identityInput = [sourceKey, canonicalSection, canonicalTitle].join(IDENTITY_SEPARATOR);

  const digest = createHash('sha256')
    .update(identityInput, 'utf8')
    .digest('hex')
    .slice(0, FEATURE_HASH_LENGTH);

  const featureId = `feature:${sourceKind}:${digest}`;

  const featureKey = `${canonicalSection}:${titleSlug}`;

  const sourceRefs = resolveSourceRefs(record, canonicalSource);

  const sourceRef = record.source_ref ?? record.sourceRef ?? sourceRefs[0] ?? null;

  return {
    featureId,
    feature_id: featureId,

    featureKey,

    sourceKey,

    sourceRef,
    source_ref: sourceRef,
    sourceRefs,

    normalizedSection: canonicalSection,
    normalizedTitle: canonicalTitle,

    /**
     * Useful for audit/debug/replay.
     *
     * Do not persist this if you consider canonical TODO title text sensitive.
     */
    identityInput,

    identityVersion: 'atlas.feature-identity.v1',
  };
}
