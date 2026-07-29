import { tokenizeCodeAware } from './tokenization.mjs';

export class SparseVocabularyRegistry {
  constructor(revision = 'lexical_v1') {
    this.revision = revision;
    this.tokenToId = new Map();
    this.documentFrequencyMap = new Map();
    this.corpusDocumentCount = 0;
    this.entries = [];
    this.vocabulary_revision = revision;
    this.corpus_document_count = 0;
  }

  observeDocument(text) {
    const seen = new Set(tokenizeCodeAware(text));
    this.corpusDocumentCount++;
    for (const token of seen) {
      this.documentFrequencyMap.set(token, (this.documentFrequencyMap.get(token) ?? 0) + 1);
    }
    return seen.size;
  }

  finalize() {
    const entries = [...this.documentFrequencyMap.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([token, document_frequency], index) => ({
        token_id: index + 1,
        token_text: token,
        document_frequency,
        corpus_document_count: this.corpusDocumentCount,
        token_kind: inferTokenKind(token),
        collision_state: 'NONE',
      }));

    this.tokenToId.clear();
    for (const entry of entries) {
      this.tokenToId.set(entry.token_text, entry.token_id);
    }
    this.entries = entries;
    this.vocabulary_revision = this.revision;
    this.corpus_document_count = this.corpusDocumentCount;
    return this;
  }

  resolveTokenId(token) {
    if (!this.tokenToId.has(token)) {
      const id = this.tokenToId.size + 1;
      this.tokenToId.set(token, id);
      if (!this.documentFrequencyMap.has(token)) {
        this.documentFrequencyMap.set(token, 0);
      }
    }
    return this.tokenToId.get(token);
  }

  documentFrequency(token) {
    return this.documentFrequencyMap.get(token) ?? 0;
  }
}

export function inferTokenKind(token) {
  if (/^[A-Z0-9_]+$/.test(token)) return 'full_identifier';
  if (token.includes('/') || token.includes('.')) return 'path_segment';
  if (/^[a-z0-9_-]+$/.test(token)) return 'identifier_part';
  return 'natural_language';
}

export function buildVocabularyFromSamples(samples, revision = 'lexical_v1') {
  const registry = new SparseVocabularyRegistry(revision);
  for (const sample of samples) {
    registry.observeDocument(sample);
  }
  return registry.finalize();
}
