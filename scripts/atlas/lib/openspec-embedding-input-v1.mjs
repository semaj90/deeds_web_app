// OpenSpecEmbeddingInputV1: the canonical text a card contributes to semantic_768, with the
// workspace-revision decoration removed. The EvidenceCard stays the full audit artifact (it may
// carry `REVISION workspace=... source=...`); only this boundary strips it, so a revision-only
// bump changes neither the normalized text, nor its checksum, nor the embedding cache key.
//
// Single source for the recipe: the dirty-set and the embedding fixture/stage must both call this.
import { createHash } from 'node:crypto';

// Bump when the normalization or the title/text composition changes: every input is then dirty.
export const EMBEDDING_INPUT_RECIPE_REVISION = 'openspec-card-doc-v1:title=changeId|text=contextBlob-without-revision';

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
