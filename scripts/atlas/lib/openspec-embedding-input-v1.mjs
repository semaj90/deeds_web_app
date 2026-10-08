// OpenSpecEmbeddingInputV1: the canonical text a card contributes to semantic_768, with the
// workspace-revision decoration removed. The EvidenceCard stays the full audit artifact (it may
// carry `REVISION workspace=... source=...`); only this boundary strips it, so a revision-only
// bump changes neither the normalized text, nor its checksum, nor the embedding cache key.
//
// Single source for the recipe: the dirty-set and the embedding fixture/stage must both call this.
import { createHash } from 'node:crypto';

// Bump when the normalization or the title/text composition changes: every input is then dirty.
export const EMBEDDING_INPUT_RECIPE_REVISION = 'openspec-card-doc-v1:title=changeId|text=contextBlob-without-revision';
export const TASK_CARD_EMBEDDING_INPUT_RECIPE_REVISION = 'openspec-task-card-doc-v1:title=changeId|text=claim';

// Tolerates a suffix truncated by the card compiler's token budget (the workspace hash cut short,
// or the `source=` clause missing or partial): 75 of 11,024 generated cards are cut this way.
const REVISION_SUFFIX = /\s*REVISION workspace=\S*(?:\s+source=\S*)?/;
// Cut inside the word itself at the very end of the blob (REVISI / REVISIO / REVISION). A bare
// trailing "RE" is NOT stripped: it is indistinguishable from the end of a real word.
const REVISION_WORD_CUT = /\s+REVISI(?:ON?)?$/;

const sha256 = (text) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;

/** Canonical text: revision decoration removed, NFC, LF line endings, trimmed. */
export function normalizeCardText(contextBlob) {
  return String(contextBlob ?? '')
    .replace(REVISION_SUFFIX, '')
    .replace(REVISION_WORD_CUT, '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .trim();
}

/**
 * The document string handed to the executor: EmbeddingGemma document recipe
 * `title: {title} | text: {normalizedText}`. Kept here so the fixture and the future stage
 * cannot drift from the text the dirty-set hashed.
 */
export function documentString(input) {
  return `title: ${input.title} | text: ${input.normalizedText}`;
}

/**
 * @param card an `atlas.openspec-evidence-card.v1` object
 * @param opts.modelArtifactRevision optional; when given it is part of the cache key so a model
 *        change invalidates cached vectors without changing the text identity.
 */
export function buildEmbeddingInputV1(card, { modelArtifactRevision = null, recipeRevision = EMBEDDING_INPUT_RECIPE_REVISION } = {}) {
  const normalizedText = normalizeCardText(card.contextBlob);
  const normalizedTextChecksum = sha256(normalizedText);
  const title = card.taskIdentity?.changeId ?? '';
  return {
    sourceCardId: card.cardId ?? null,
    sourceCardRevision: card.revisions?.workspaceRevision ?? null,
    sourceCardChecksum: card.checksum ?? null,
    representationRecipeRevision: recipeRevision,
    title,
    normalizedText,
    normalizedTextChecksum,
    // Deliberately excludes cardId / card checksum / revisions: those change with the workspace.
    embeddingCacheKey: sha256(`${recipeRevision}\0${title}\0${normalizedTextChecksum}\0${modelArtifactRevision ?? ''}`)
  };
}

export function buildTaskCardEmbeddingInputV1(card, corpus, { modelArtifactRevision = null, recipeRevision = TASK_CARD_EMBEDDING_INPUT_RECIPE_REVISION } = {}) {
  if (corpus?.schema !== 'atlas.openspec-task-card-corpus.v1' || corpus.cardSchema !== 'atlas.openspec-task-card.v1') {
    throw new Error('TASK_CARD_CORPUS_SCHEMA_INVALID');
  }
  if (!card || card.canonicalAuthority !== false) throw new Error('TASK_CARD_NONCANONICAL_PROJECTION_REQUIRED');
  if (typeof card.stableKey !== 'string' || !card.stableKey.trim()) throw new Error('TASK_CARD_STABLE_KEY_REQUIRED');
  if (typeof card.changeId !== 'string' || !card.changeId.trim()) throw new Error('TASK_CARD_CHANGE_ID_REQUIRED');
  if (typeof card.taskRevision !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(card.taskRevision)) {
    throw new Error('TASK_CARD_REVISION_INVALID');
  }
  if (typeof card.sourcePath !== 'string' || !card.sourcePath.trim() || card.sourcePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(card.sourcePath)) {
    throw new Error('TASK_CARD_SOURCE_PATH_INVALID');
  }
  if (card.sourcePath.split(/[\\/]/).includes('..') || card.sourcePath.includes('\0')) throw new Error('TASK_CARD_SOURCE_PATH_INVALID');
  if (!Number.isSafeInteger(card.sourceLine) || card.sourceLine < 1 || card.sourceCoordinateRole !== 'LOCATOR_ONLY') {
    throw new Error('TASK_CARD_SOURCE_LOCATOR_INVALID');
  }

  const workspaceRevision = corpus.source?.workspaceRevision;
  const sourceRevision = corpus.source?.taskFileHashes?.[card.sourcePath];
  if (typeof workspaceRevision !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(workspaceRevision)) {
    throw new Error('TASK_CARD_WORKSPACE_REVISION_INVALID');
  }
  if (typeof sourceRevision !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(sourceRevision)) {
    throw new Error('TASK_CARD_SOURCE_REVISION_UNBOUND');
  }
  if (card.workspaceRevision && card.workspaceRevision !== workspaceRevision) {
    throw new Error('TASK_CARD_WORKSPACE_REVISION_MISMATCH');
  }
  if (card.sourceFileRevision && card.sourceFileRevision !== sourceRevision) {
    throw new Error('TASK_CARD_SOURCE_REVISION_MISMATCH');
  }
  if (modelArtifactRevision !== null && (typeof modelArtifactRevision !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(modelArtifactRevision))) {
    throw new Error('TASK_CARD_MODEL_ARTIFACT_REVISION_INVALID');
  }

  const normalizedText = String(card.claim ?? '').normalize('NFC').replace(/\r\n?/g, '\n').trim();
  if (!normalizedText) throw new Error('TASK_CARD_CLAIM_REQUIRED');
  const normalizedTextChecksum = sha256(normalizedText);
  const cacheKey = modelArtifactRevision
    ? sha256(`${recipeRevision}\0${card.changeId}\0${normalizedTextChecksum}\0${modelArtifactRevision}`)
    : null;

  return {
    schema: 'atlas.openspec-task-card-embedding-input.v1',
    canonicalAuthority: false,
    taskKey: card.stableKey,
    taskRevision: card.taskRevision,
    sourceRef: {
      filePath: card.sourcePath,
      line: card.sourceLine,
      role: 'LOCATOR_ONLY',
      sourceRevision,
      workspaceRevision,
    },
    retrievalState: card.retrievalState ?? 'UNKNOWN',
    evidenceState: card.evidenceState ?? 'UNKNOWN',
    representationRecipeRevision: recipeRevision,
    modelArtifactRevision,
    title: card.changeId,
    normalizedText,
    normalizedTextChecksum,
    embeddingCacheKey: cacheKey,
    cacheKeyBound: cacheKey !== null,
  };
}

export function buildTaskCardEmbeddingInputBatchV1(corpus, options = {}) {
  if (corpus?.schema !== 'atlas.openspec-task-card-corpus.v1' || !Array.isArray(corpus.cards)) {
    throw new Error('TASK_CARD_CORPUS_SCHEMA_INVALID');
  }
  const workspaceRevision = corpus.source?.workspaceRevision;
  if (typeof workspaceRevision !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(workspaceRevision)) {
    throw new Error('TASK_CARD_WORKSPACE_REVISION_INVALID');
  }
  const sourceFileHashes = Object.fromEntries(Object.entries(corpus.source?.taskFileHashes ?? {})
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
  const rows = corpus.cards.map((card) => {
    const input = buildTaskCardEmbeddingInputV1(card, corpus, options);
    return {
      taskKey: input.taskKey,
      taskRevision: input.taskRevision,
      sourcePath: input.sourceRef.filePath,
      sourceLine: input.sourceRef.line,
      retrievalState: input.retrievalState,
      evidenceState: input.evidenceState,
      title: input.title,
      normalizedTextChecksum: input.normalizedTextChecksum,
      embeddingCacheKey: input.embeddingCacheKey,
      cacheKeyBound: input.cacheKeyBound,
    };
  }).sort((left, right) => left.taskKey < right.taskKey ? -1 : left.taskKey > right.taskKey ? 1 : 0);
  if (new Set(rows.map((row) => row.taskKey)).size !== rows.length) throw new Error('TASK_CARD_KEY_DUPLICATE');
  const sourcePopulationChecksum = corpus.source?.sourcePopulationChecksum ?? null;
  if (typeof sourcePopulationChecksum !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(sourcePopulationChecksum)) {
    throw new Error('TASK_CARD_SOURCE_POPULATION_CHECKSUM_INVALID');
  }
  const rowBindingChecksum = sha256(JSON.stringify({
    workspaceRevision,
    sourcePopulationChecksum,
    sourceFileHashes,
    rows: rows.map(({ taskKey, taskRevision, sourcePath, sourceLine }) => ({
      taskKey,
      taskRevision,
      sourcePath,
      sourceLine,
      sourceRevision: sourceFileHashes[sourcePath],
    })),
  }));
  return {
    schema: 'atlas.openspec-task-card-embedding-input-manifest.v1',
    canonicalAuthority: false,
    workspaceRevision,
    sourcePopulationChecksum,
    sourceFileHashes,
    representationRecipeRevision: options.recipeRevision ?? TASK_CARD_EMBEDDING_INPUT_RECIPE_REVISION,
    modelArtifactRevision: options.modelArtifactRevision ?? null,
    rowCount: rows.length,
    rowBindings: rows,
    rowBindingChecksum,
    inputSetChecksum: sha256(JSON.stringify({ rowBindingChecksum, rows })),
    indexPromotionAllowed: false,
    vectorWritesPerformed: false,
  };
}
