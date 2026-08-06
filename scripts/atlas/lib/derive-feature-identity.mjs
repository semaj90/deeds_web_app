/**
 * @fileoverview
 * Pure, deterministic feature-identity derivation for Parent Atlas.
 *
 * This module proposes semantic feature labels and IDs. It never mutates
 * canonical identity, performs database writes, or calls an LLM.
 *
 * @module derive-feature-identity
 */

const FEATURE_LABEL_VERSION = 'atlas.feature-label.v1';
const DEFAULT_FEATURE_NAMESPACE = 'feature';
const MAX_LABEL_LENGTH = 96;

export const FeatureLabelStatus = Object.freeze({
  CANONICAL: 'CANONICAL',
  DERIVED_HIGH_CONFIDENCE: 'DERIVED_HIGH_CONFIDENCE',
  DERIVED_PATH_FALLBACK: 'DERIVED_PATH_FALLBACK',
  GENERIC_REPLACEMENT_RECOMMENDED: 'GENERIC_REPLACEMENT_RECOMMENDED',
  GENERIC_CURRENT_COLLISION: 'GENERIC_CURRENT_COLLISION',
  DERIVED_ID_COLLISION: 'DERIVED_ID_COLLISION',
  VALID_FUNCTIONAL_GROUP: 'VALID_FUNCTIONAL_GROUP',
  AMBIGUOUS: 'AMBIGUOUS',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  REJECTED: 'REJECTED',
});

export const FeatureGroupingStatus = Object.freeze({
  UNRESOLVED: 'UNRESOLVED',
  VALID_FUNCTIONAL_GROUP: 'VALID_FUNCTIONAL_GROUP',
  COLLISION: 'COLLISION',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});

export const FeatureLabelSource = Object.freeze({
  OPENSPEC: 'openspec',
  EXPORTED_IDENTITY: 'exported_identity',
  SUMMARY: 'summary',
  CANONICAL_SOURCE_REF: 'canonical_source_ref',
  TITLE_ID: 'title_id',
  EXISTING_LABEL: 'existing_label',
  BASENAME: 'basename',
  NONE: 'none',
});

/**
 * @typedef {object} SourceRecord
 * @property {string=} packet_id
 * @property {string=} packet_key
 * @property {string=} summary_packet_key
 * @property {string=} title_id
 * @property {string=} title_id_source
 * @property {string=} feature_id
 * @property {string=} feature_label
 * @property {string=} summary
 * @property {string=} source_ref
 * @property {string=} canonical_source_ref
 * @property {string=} file_path
 * @property {string=} domain_class
 * @property {string[]|string=} used_concepts
 * @property {string=} model_name
 * @property {string|number=} source_revision
 * @property {string|number=} workspace_revision
 * @property {string=} content_hash
 * @property {Record<string, unknown>=} metadata
 */

/**
 * Optional evidence discovered outside the source row.
 *
 * @typedef {object} FeatureDerivationContext
 * @property {string=} openSpecFeatureLabel
 * @property {string=} openSpecFeatureId
 * @property {string=} exportedIdentity
 * @property {boolean=} currentFeatureCollision
 * @property {boolean=} proposedFeatureCollision
 * @property {boolean=} validFunctionalGroup
 */

/**
 * @typedef {object} DerivedFeatureIdentity
 * @property {string|null} titleId
 * @property {string|null} featureIdCurrent
 * @property {string|null} featureIdProposed
 * @property {string|null} featureLabelCurrent
 * @property {string|null} featureLabelDerived
 * @property {string|null} sourceBasename
 * @property {string} featureLabelSource
 * @property {typeof FEATURE_LABEL_VERSION} featureLabelVersion
 * @property {string} featureLabelStatus
 * @property {number} featureLabelConfidence
 * @property {string} groupingStatus
 * @property {string[]} reasons
 * @property {false} canonicalMutation
 */

/**
 * Derives a non-canonical semantic feature identity proposal.
 *
 * Priority:
 * 1. Explicit OpenSpec mapping
 * 2. Exported symbol or route operation
 * 3. Summary functional noun phrase
 * 4. Canonical path semantics
 * 5. title_id semantic fallback
 * 6. Existing non-generic feature label
 * 7. Basename fallback
 *
 * @param {SourceRecord} record
 * @param {FeatureDerivationContext} [context]
 * @returns {DerivedFeatureIdentity}
 */
export function deriveFeatureIdentity(record, context = {}) {
  const safeRecord = isPlainObject(record) ? record : {};

  const titleId = normalizeNullableString(safeRecord.title_id);
  const featureIdCurrent = normalizeNullableString(safeRecord.feature_id);
  const featureLabelCurrent = normalizeNullableString(safeRecord.feature_label);

  const source =
    normalizeNullableString(safeRecord.canonical_source_ref) ??
    normalizeNullableString(safeRecord.source_ref) ??
    normalizeNullableString(safeRecord.file_path) ??
    '';

  const sourceBasename = getSourceBasename(source);

  const candidates = {
    openSpec: normalizeCandidateLabel(context.openSpecFeatureLabel),
    exported: normalizeCandidateLabel(context.exportedIdentity),
    summary: extractFunctionalNounPhrase(safeRecord.summary ?? ''),
    path: deriveLabelFromPath(source),
    title: deriveLabelFromTitleId(titleId ?? ''),
    existing:
      featureLabelCurrent && !isGenericFeatureLabel(featureLabelCurrent, sourceBasename)
        ? normalizeCandidateLabel(stripKnownExtension(featureLabelCurrent))
        : '',
    basename: deriveLabelFromBasename(sourceBasename),
  };

  const selected = selectBestCandidate(candidates);

  const featureLabelDerived = selected.label || null;

  const featureIdProposed =
    normalizeNullableString(context.openSpecFeatureId) ??
    (featureLabelDerived ? deriveProposedFeatureId(featureLabelDerived) : null);

  const featureLabelConfidence = scoreFeatureLabelConfidence({
    source: selected.source,
    record: safeRecord,
    selectedLabel: featureLabelDerived,
    summaryLabel: candidates.summary,
    pathLabel: candidates.path,
    titleLabel: candidates.title,
    currentFeatureCollision: Boolean(context.currentFeatureCollision),
    proposedFeatureCollision: Boolean(context.proposedFeatureCollision),
  });

  const groupingStatus = deriveGroupingStatus(context);

  const featureLabelStatus = deriveFeatureLabelStatus({
    featureLabelCurrent,
    featureLabelDerived,
    sourceBasename,
    selectedSource: selected.source,
    confidence: featureLabelConfidence,
    currentFeatureCollision: Boolean(context.currentFeatureCollision),
    proposedFeatureCollision: Boolean(context.proposedFeatureCollision),
    validFunctionalGroup: Boolean(context.validFunctionalGroup),
  });

  const reasons = buildReasons({
    currentLabel: featureLabelCurrent,
    derivedLabel: featureLabelDerived,
    sourceBasename,
    selectedSource: selected.source,
    confidence: featureLabelConfidence,
    candidates,
    context,
  });

  const result = {
    titleId,
    featureIdCurrent,
    featureIdProposed,
    featureLabelCurrent,
    featureLabelDerived,
    sourceBasename,
    featureLabelSource: selected.source,
    featureLabelVersion: FEATURE_LABEL_VERSION,
    featureLabelStatus,
    featureLabelConfidence,
    groupingStatus,
    reasons,
    canonicalMutation: false,
  };

  if (!validateDerivedFeatureIdentity(result)) {
    return {
      ...result,
      featureLabelStatus: FeatureLabelStatus.REJECTED,
      reasons: [...result.reasons, 'Derived identity failed structural validation.'],
    };
  }

  return result;
}

/**
 * Detects filename-like, framework-generic, or otherwise non-semantic labels.
 *
 * @param {unknown} label
 * @param {string|null} [sourceBasename]
 * @returns {boolean}
 */
export function isGenericFeatureLabel(label, sourceBasename = null) {
  const normalized = normalizeNullableString(label);

  if (!normalized) {
    return true;
  }

  const lower = normalized.toLowerCase().trim();
  const basenameLower = sourceBasename?.toLowerCase().trim() ?? null;

  const genericLabels = new Set([
    '+page',
    '+page.svelte',
    'page',
    'page.svelte',
    '+server',
    '+server.ts',
    'server',
    'server.ts',
    '+layout',
    '+layout.svelte',
    '+layout.server',
    '+layout.server.ts',
    'layout',
    'layout.svelte',
    'index',
    'index.ts',
    'index.js',
    'index.mjs',
    'route',
    'route.ts',
    'handler',
    'handler.ts',
    'module',
    'module.ts',
    'component',
    'component.svelte',
    'unknown',
  ]);

  if (genericLabels.has(lower)) {
    return true;
  }

  if (basenameLower && lower === basenameLower) {
    return true;
  }

  if (basenameLower && stripKnownExtension(lower) === stripKnownExtension(basenameLower)) {
    return true;
  }

  const semanticTokens = tokenizeLabel(stripKnownExtension(lower)).filter(
    (token) => !GENERIC_TOKENS.has(token)
  );

  return semanticTokens.length === 0;
}

/**
 * Extracts a concise functional noun phrase from a summary.
 *
 * @param {unknown} text
 * @returns {string}
 */
export function extractFunctionalNounPhrase(text) {
  if (typeof text !== 'string') {
    return '';
  }

  const normalized = normalizeWhitespace(
    text
      .replace(/---\s*\*\*Final Output:\*\*/gi, ' ')
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
  );

  if (!normalized) {
    return '';
  }

  const quotedPatterns = [
    /\b(?:renders?|provides?|defines?|implements?|creates?|exposes?|contains?)\s+(?:an?\s+|the\s+)?["“]([^"”]{3,96})["”]/i,
    /\b(?:called|named|titled)\s+["“]([^"”]{3,96})["”]/i,
  ];

  for (const pattern of quotedPatterns) {
    const match = normalized.match(pattern);
    const candidate = normalizeCandidateLabel(match?.[1]);

    if (isUsefulFunctionalLabel(candidate)) {
      return candidate;
    }
  }

  const endpointMatch = normalized.match(
    /\b(?:defines?|implements?|provides?|exposes?)\s+(?:an?\s+|the\s+)?(?:API\s+)?endpoint(?:\s+handler)?(?:\s+for|\s+that\s+(?:handles?|performs?))\s+([^.!;]{3,96})/i
  );

  if (endpointMatch?.[1]) {
    const operation = cleanupFunctionalPhrase(endpointMatch[1]);
    const candidate = normalizeCandidateLabel(`${operation} API`);

    if (isUsefulFunctionalLabel(candidate)) {
      return candidate;
    }
  }

  const patterns = [
    /\b(?:renders?|provides?|defines?|implements?|creates?|exposes?|manages?|handles?|resolves?|performs?)\s+(?:an?\s+|the\s+)?([^.!;]{3,96})/i,
    /\b(?:responsible for|used for|utilities for|interface for|workflow for|support for)\s+([^.!;]{3,96})/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    const candidate = normalizeCandidateLabel(cleanupFunctionalPhrase(match[1]));

    if (isUsefulFunctionalLabel(candidate)) {
      return candidate;
    }
  }

  return '';
}

/**
 * Derives a readable label from meaningful path segments.
 *
 * @param {unknown} inputPath
 * @returns {string}
 */
export function deriveLabelFromPath(inputPath) {
  if (typeof inputPath !== 'string' || !inputPath.trim()) {
    return '';
  }

  const segments = normalizePath(inputPath)
    .split('/')
    .filter(Boolean)
    .filter((segment) => !segment.startsWith('('))
    .filter((segment) => !segment.startsWith('['));

  if (segments.length === 0) {
    return '';
  }

  const basename = segments.at(-1) ?? '';
  const basenameStem = stripKnownExtension(basename);
  const basenameIsGeneric = isGenericFeatureLabel(basename, basename);

  const meaningfulSegments = segments
    .slice(0, basenameIsGeneric ? -1 : undefined)
    .map(stripKnownExtension)
    .filter(Boolean)
    .filter((segment) => !PATH_SCAFFOLDING.has(segment.toLowerCase()))
    .filter((segment) => !segment.startsWith('+'));

  if (!basenameIsGeneric && basenameStem) {
    meaningfulSegments.push(basenameStem);
  }

  const selected = meaningfulSegments.slice(-3);

  if (selected.length === 0) {
    return '';
  }

  let label = normalizeCandidateLabel(selected.join(' '));

  if (segments.some((segment) => segment.toLowerCase() === 'api') && !/\bapi\b/i.test(label)) {
    label = `${label} API`;
  }

  return isUsefulFunctionalLabel(label) ? label : '';
}

/**
 * Uses semantic title_id tokens only as a late fallback.
 *
 * @param {unknown} titleId
 * @returns {string}
 */
export function deriveLabelFromTitleId(titleId) {
  if (typeof titleId !== 'string' || !titleId.trim()) {
    return '';
  }

  const parts = titleId
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !TITLE_ID_SCAFFOLDING.has(part.toLowerCase()))
    .filter((part) => !/^[a-f0-9]{8,64}$/i.test(part));

  const semanticParts = parts.filter((part) => !GENERIC_TOKENS.has(part.toLowerCase()));

  if (semanticParts.length === 0) {
    return '';
  }

  const candidate = normalizeCandidateLabel(semanticParts.join(' '));

  return isUsefulFunctionalLabel(candidate) ? candidate : '';
}

/**
 * Creates a proposed functional feature ID from a label.
 *
 * This is a proposal only. It is not automatically canonical.
 *
 * @param {unknown} labelOrRecord
 * @param {string} [namespace]
 * @returns {string|null}
 */
export function deriveProposedFeatureId(labelOrRecord, namespace = DEFAULT_FEATURE_NAMESPACE) {
  let label = '';

  if (typeof labelOrRecord === 'string') {
    label = labelOrRecord;
  } else if (isPlainObject(labelOrRecord)) {
    label =
      extractFunctionalNounPhrase(labelOrRecord.summary ?? '') ||
      deriveLabelFromPath(
        labelOrRecord.canonical_source_ref ??
          labelOrRecord.source_ref ??
          labelOrRecord.file_path ??
          ''
      ) ||
      deriveLabelFromTitleId(labelOrRecord.title_id ?? '') ||
      normalizeCandidateLabel(labelOrRecord.feature_label ?? '');
  }

  const slug = slugify(label);

  if (!slug || GENERIC_SLUGS.has(slug)) {
    return null;
  }

  const safeNamespace = slugify(namespace).replaceAll('-', '.') || DEFAULT_FEATURE_NAMESPACE;

  return `${safeNamespace}.${slug}`;
}

/**
 * Scores evidence supporting a derived feature label.
 *
 * @param {{
 *   source?: string,
 *   record?: SourceRecord,
 *   selectedLabel?: string|null,
 *   summaryLabel?: string,
 *   pathLabel?: string,
 *   titleLabel?: string,
 *   currentFeatureCollision?: boolean,
 *   proposedFeatureCollision?: boolean
 * }} input
 * @returns {number}
 */
export function scoreFeatureLabelConfidence(input = {}) {
  const {
    source = FeatureLabelSource.NONE,
    record = {},
    selectedLabel = null,
    summaryLabel = '',
    pathLabel = '',
    titleLabel = '',
    currentFeatureCollision = false,
    proposedFeatureCollision = false,
  } = input;

  const baseScores = {
    [FeatureLabelSource.OPENSPEC]: 0.99,
    [FeatureLabelSource.EXPORTED_IDENTITY]: 0.95,
    [FeatureLabelSource.SUMMARY]: 0.92,
    [FeatureLabelSource.CANONICAL_SOURCE_REF]: 0.82,
    [FeatureLabelSource.TITLE_ID]: 0.65,
    [FeatureLabelSource.EXISTING_LABEL]: 0.8,
    [FeatureLabelSource.BASENAME]: 0.2,
    [FeatureLabelSource.NONE]: 0,
  };

  let score = baseScores[source] ?? 0;

  if (!selectedLabel) {
    return 0;
  }

  if (summaryLabel && pathLabel && labelsSemanticallyAgree(summaryLabel, pathLabel)) {
    score += 0.04;
  }

  if (summaryLabel && pathLabel && !labelsSemanticallyAgree(summaryLabel, pathLabel)) {
    score -= 0.08;
  }

  if (titleLabel && selectedLabel && labelsSemanticallyAgree(titleLabel, selectedLabel)) {
    score += 0.02;
  }

  if (hasRepeatedSummaryBoilerplate(record.summary)) {
    score -= 0.12;
  }

  if (typeof record.summary === 'string' && record.summary.trim().split(/\s+/).length < 8) {
    score -= 0.08;
  }

  if (!normalizeNullableString(record.model_name)) {
    score -= 0.03;
  }

  if (currentFeatureCollision) {
    score -= 0.05;
  }

  if (proposedFeatureCollision) {
    score -= 0.25;
  }

  if (!isUsefulFunctionalLabel(selectedLabel)) {
    score = Math.min(score, 0.2);
  }

  return roundConfidence(clamp(score, 0, 1));
}

/**
 * Performs structural validation of a derived proposal.
 *
 * @param {unknown} proposedIdentity
 * @returns {boolean}
 */
export function validateDerivedFeatureIdentity(proposedIdentity) {
  if (!isPlainObject(proposedIdentity)) {
    return false;
  }

  if (proposedIdentity.canonicalMutation !== false) {
    return false;
  }

  if (proposedIdentity.featureLabelVersion !== FEATURE_LABEL_VERSION) {
    return false;
  }

  if (
    typeof proposedIdentity.featureLabelConfidence !== 'number' ||
    !Number.isFinite(proposedIdentity.featureLabelConfidence) ||
    proposedIdentity.featureLabelConfidence < 0 ||
    proposedIdentity.featureLabelConfidence > 1
  ) {
    return false;
  }

  if (!Object.values(FeatureLabelStatus).includes(proposedIdentity.featureLabelStatus)) {
    return false;
  }

  if (!Object.values(FeatureGroupingStatus).includes(proposedIdentity.groupingStatus)) {
    return false;
  }

  if (!Array.isArray(proposedIdentity.reasons)) {
    return false;
  }

  const derivedLabel = normalizeNullableString(proposedIdentity.featureLabelDerived);

  const proposedId = normalizeNullableString(proposedIdentity.featureIdProposed);

  if (proposedIdentity.featureLabelStatus === FeatureLabelStatus.REJECTED) {
    return true;
  }

  if (!derivedLabel || !isUsefulFunctionalLabel(derivedLabel)) {
    return false;
  }

  if (!proposedId || !/^feature\.[a-z0-9]+(?:-[a-z0-9]+)*$/.test(proposedId)) {
    return false;
  }

  return true;
}

function selectBestCandidate(candidates) {
  const ordered = [
    [FeatureLabelSource.OPENSPEC, candidates.openSpec],
    [FeatureLabelSource.EXPORTED_IDENTITY, candidates.exported],
    [FeatureLabelSource.SUMMARY, candidates.summary],
    [FeatureLabelSource.CANONICAL_SOURCE_REF, candidates.path],
    [FeatureLabelSource.TITLE_ID, candidates.title],
    [FeatureLabelSource.EXISTING_LABEL, candidates.existing],
    [FeatureLabelSource.BASENAME, candidates.basename],
  ];

  for (const [source, candidate] of ordered) {
    if (isUsefulFunctionalLabel(candidate)) {
      return {
        source,
        label: candidate,
      };
    }
  }

  return {
    source: FeatureLabelSource.NONE,
    label: '',
  };
}

function deriveFeatureLabelStatus({
  featureLabelCurrent,
  featureLabelDerived,
  sourceBasename,
  selectedSource,
  confidence,
  currentFeatureCollision,
  proposedFeatureCollision,
  validFunctionalGroup,
}) {
  if (!featureLabelDerived) {
    return FeatureLabelStatus.MANUAL_REVIEW;
  }

  if (validFunctionalGroup) {
    return FeatureLabelStatus.VALID_FUNCTIONAL_GROUP;
  }

  if (proposedFeatureCollision) {
    return FeatureLabelStatus.DERIVED_ID_COLLISION;
  }

  if (currentFeatureCollision) {
    return FeatureLabelStatus.GENERIC_CURRENT_COLLISION;
  }

  const currentIsGeneric = isGenericFeatureLabel(featureLabelCurrent, sourceBasename);

  if (!currentIsGeneric && labelsSemanticallyAgree(featureLabelCurrent, featureLabelDerived)) {
    return FeatureLabelStatus.CANONICAL;
  }

  if (currentIsGeneric && confidence >= 0.8) {
    return FeatureLabelStatus.GENERIC_REPLACEMENT_RECOMMENDED;
  }

  if (
    selectedSource === FeatureLabelSource.CANONICAL_SOURCE_REF ||
    selectedSource === FeatureLabelSource.TITLE_ID ||
    selectedSource === FeatureLabelSource.BASENAME
  ) {
    return confidence >= 0.55
      ? FeatureLabelStatus.DERIVED_PATH_FALLBACK
      : FeatureLabelStatus.MANUAL_REVIEW;
  }

  if (confidence >= 0.85) {
    return FeatureLabelStatus.DERIVED_HIGH_CONFIDENCE;
  }

  if (confidence >= 0.55) {
    return FeatureLabelStatus.AMBIGUOUS;
  }

  return FeatureLabelStatus.MANUAL_REVIEW;
}

function deriveGroupingStatus(context) {
  if (context.validFunctionalGroup) {
    return FeatureGroupingStatus.VALID_FUNCTIONAL_GROUP;
  }

  if (context.currentFeatureCollision || context.proposedFeatureCollision) {
    return FeatureGroupingStatus.COLLISION;
  }

  return FeatureGroupingStatus.UNRESOLVED;
}

function buildReasons({
  currentLabel,
  derivedLabel,
  sourceBasename,
  selectedSource,
  confidence,
  candidates,
  context,
}) {
  const reasons = [];

  if (isGenericFeatureLabel(currentLabel, sourceBasename)) {
    reasons.push('Current feature label is generic or filename-derived.');
  } else if (currentLabel) {
    reasons.push('Current feature label is non-generic.');
  }

  if (derivedLabel) {
    reasons.push(`Selected "${derivedLabel}" from ${selectedSource}.`);
  } else {
    reasons.push('No safe deterministic feature label was found.');
  }

  if (candidates.summary) {
    reasons.push(`Summary candidate: "${candidates.summary}".`);
  }

  if (candidates.path) {
    reasons.push(`Path candidate: "${candidates.path}".`);
  }

  if (
    candidates.summary &&
    candidates.path &&
    labelsSemanticallyAgree(candidates.summary, candidates.path)
  ) {
    reasons.push('Summary and path evidence agree.');
  }

  if (context.currentFeatureCollision) {
    reasons.push('Current feature identity collides across records.');
  }

  if (context.proposedFeatureCollision) {
    reasons.push('Proposed feature identity collides across records.');
  }

  if (context.validFunctionalGroup) {
    reasons.push('Multiple records are validated as one functional feature group.');
  }

  reasons.push(`Confidence: ${confidence.toFixed(3)}.`);

  return reasons;
}

function deriveLabelFromBasename(sourceBasename) {
  if (!sourceBasename) {
    return '';
  }

  if (isGenericFeatureLabel(sourceBasename, sourceBasename)) {
    return '';
  }

  const candidate = normalizeCandidateLabel(stripKnownExtension(sourceBasename));

  return isUsefulFunctionalLabel(candidate) ? candidate : '';
}

function getSourceBasename(inputPath) {
  if (typeof inputPath !== 'string' || !inputPath.trim()) {
    return null;
  }

  const normalized = normalizePath(inputPath);
  return normalized.split('/').filter(Boolean).at(-1) ?? null;
}

function cleanupFunctionalPhrase(value) {
  return normalizeWhitespace(
    String(value)
      .replace(/\b(?:that|which|while|using|with)\b.*$/i, '')
      .replace(/\b(?:such as|including|for example)\b.*$/i, '')
      .replace(/^(?:a|an|the)\s+/i, '')
      .replace(/^(?:component|module|utility|function|class|code)\s+(?:for|that)\s+/i, '')
      .replace(/\b(?:allowing|accepting|passing|featuring)\b.*$/i, '')
  );
}

function normalizeCandidateLabel(value) {
  const normalized = normalizeNullableString(value);

  if (!normalized) {
    return '';
  }

  const cleaned = normalizeWhitespace(
    normalized
      .replace(/["“”'`]/g, '')
      .replace(/\([^)]{40,}\)/g, '')
      .replace(/[.:;,]+$/g, '')
  );

  if (!cleaned) {
    return '';
  }

  return preserveKnownAcronyms(toTitleCase(cleaned)).slice(0, MAX_LABEL_LENGTH);
}

function isUsefulFunctionalLabel(label) {
  if (typeof label !== 'string') {
    return false;
  }

  const normalized = normalizeWhitespace(label);

  if (normalized.length < 3 || normalized.length > MAX_LABEL_LENGTH) {
    return false;
  }

  if (/[.!?]\s+\w/.test(normalized)) {
    return false;
  }

  if (GENERIC_PHRASES.has(normalized.toLowerCase())) {
    return false;
  }

  const tokens = tokenizeLabel(normalized);
  const semanticTokens = tokens.filter((token) => !GENERIC_TOKENS.has(token));

  return semanticTokens.length > 0;
}

function labelsSemanticallyAgree(left, right) {
  const leftTokens = new Set(tokenizeLabel(left).filter((token) => !GENERIC_TOKENS.has(token)));

  const rightTokens = new Set(tokenizeLabel(right).filter((token) => !GENERIC_TOKENS.has(token)));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return false;
  }

  let overlap = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.min(leftTokens.size, rightTokens.size) >= 0.5;
}

function hasRepeatedSummaryBoilerplate(summary) {
  if (typeof summary !== 'string') {
    return false;
  }

  const normalized = normalizeWhitespace(summary).toLowerCase();

  const midpoint = Math.floor(normalized.length / 2);
  if (midpoint < 20) {
    return false;
  }

  const firstHalf = normalized.slice(0, midpoint);
  const secondHalf = normalized.slice(midpoint);

  return secondHalf.includes(firstHalf.slice(0, 24));
}

function preserveKnownAcronyms(value) {
  return value
    .replace(/\bApi\b/g, 'API')
    .replace(/\bAi\b/g, 'AI')
    .replace(/\bUi\b/g, 'UI')
    .replace(/\bUx\b/g, 'UX')
    .replace(/\bUrl\b/g, 'URL')
    .replace(/\bUri\b/g, 'URI')
    .replace(/\bHttp\b/g, 'HTTP')
    .replace(/\bHttps\b/g, 'HTTPS')
    .replace(/\bSql\b/g, 'SQL')
    .replace(/\bJson\b/g, 'JSON')
    .replace(/\bCsv\b/g, 'CSV')
    .replace(/\bPdf\b/g, 'PDF')
    .replace(/\bLlm\b/g, 'LLM')
    .replace(/\bGpu\b/g, 'GPU')
    .replace(/\bCpu\b/g, 'CPU')
    .replace(/\bKv\b/g, 'KV')
    .replace(/\bN64\b/gi, 'N64');
}

function toTitleCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b[a-z0-9]/g, (character) => character.toUpperCase());
}

function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function tokenizeLabel(value) {
  return slugify(value).split('-').filter(Boolean);
}

function stripKnownExtension(value) {
  return String(value ?? '').replace(
    /\.(?:svelte|tsx?|jsx?|mjs|cjs|json|md|py|sql|cu|cuh|cpp|cc|h|hpp)$/i,
    ''
  );
}

function normalizePath(value) {
  return String(value ?? '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/\/+/g, '/');
}

function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNullableString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = normalizeWhitespace(value);
  return normalized || null;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundConfidence(value) {
  return Number(value.toFixed(3));
}

const GENERIC_TOKENS = new Set([
  'app',
  'api',
  'src',
  'lib',
  'route',
  'routes',
  'page',
  'server',
  'layout',
  'component',
  'components',
  'module',
  'handler',
  'index',
  'frontend',
  'backend',
  'svelte',
  'sveltekit',
  'typescript',
  'javascript',
  'code',
  'file',
]);

const PATH_SCAFFOLDING = new Set([
  'src',
  'lib',
  'routes',
  'route',
  'components',
  'component',
  'server',
  'client',
  'shared',
  'common',
  'utils',
  'utilities',
  'app',
]);

const TITLE_ID_SCAFFOLDING = new Set([
  'title',
  'sveltekit',
  'frontend',
  'backend',
  'src',
  'lib',
  'page',
  'server',
  'layout',
  'route',
  'component',
]);

const GENERIC_PHRASES = new Set([
  'this component',
  'the component',
  'this module',
  'the module',
  'this code',
  'the code',
  'provides utilities',
  'utility',
  'utilities',
  'page',
  'server',
  'module',
  'handler',
  'component',
]);

const GENERIC_SLUGS = new Set([
  'page',
  'server',
  'module',
  'handler',
  'component',
  'index',
  'unknown',
]);
