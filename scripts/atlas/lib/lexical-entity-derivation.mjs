/**
 * lexical-entity-derivation.mjs
 *
 * NE-07 (openspec/changes/parent-atlas-neural-prefill-encoder): emit
 * deterministic lexical keyword classes and preserve raw terms.
 *
 * `atlas_packet_features.entities` / `.used_concepts` / `.lexical_features`
 * are all plain `text[]` columns (drizzle/0043_atlas_packet_features_schema.sql,
 * drizzle/0020_fix_packet_feature_metrics_schema.sql). Only `ast_symbols` has
 * a live writer (`phase1-ast-grep-extraction.mjs`'s regex extractor); the
 * other three columns have zero writers anywhere in the repo, which is why
 * "entity coverage" reads 0% in `autoencoder-dataset-readiness.mjs` despite
 * ast_symbols itself being populated.
 *
 * This module is a pure, deterministic derivation from `ast_symbols` alone —
 * no LLM call, no LangExtract grounding, no domain/ontology validation. It
 * is explicitly a lexical-heuristic stand-in for `used_concepts`, NOT the
 * validated domain-classifier/ontology-linked concept NE-08 calls for.
 * Replacing it with a real domain-classifier + ontology-proposal pipeline is
 * still open work, not done by this module.
 */

const STOPWORD_TOKENS = new Set([
  'get', 'set', 'new', 'the', 'and', 'for', 'with', 'from', 'this', 'that',
  'default', 'export', 'import', 'const', 'let', 'var', 'function', 'class',
  'type', 'interface', 'return', 'async', 'await',
]);

/** Splits `camelCase` / `PascalCase` / `snake_case` / `kebab-case` into lowercase word tokens. */
export function tokenizeIdentifier(identifier) {
  const withoutPrefix = identifier.startsWith('import:') ? identifier.slice('import:'.length) : identifier;
  const withSpaces = withoutPrefix
    .replace(/[/_.\-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return withSpaces
    .split(/\s+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 0);
}

/**
 * Pure derivation: astSymbols (string[], as written by phase1-ast-grep-extraction.mjs)
 * -> { entities, lexicalFeatures, usedConcepts } (all string[], deduped + sorted for
 * determinism — identical input always produces an identical, order-independent output).
 */
export function deriveEntityLexicalFeatures(astSymbols) {
  const symbols = Array.isArray(astSymbols) ? astSymbols.filter((s) => typeof s === 'string' && s.length > 0) : [];

  // "entities": the actual named code entities, excluding raw import-path pseudo-symbols.
  const entities = [...new Set(symbols.filter((s) => !s.startsWith('import:')))].sort();

  // "lexicalFeatures": raw terms preserved (NE-07) plus their tokenized word forms.
  const lexicalFeatureSet = new Set();
  for (const symbol of symbols) {
    lexicalFeatureSet.add(symbol); // raw term preserved verbatim
    for (const token of tokenizeIdentifier(symbol)) lexicalFeatureSet.add(token);
  }
  const lexicalFeatures = [...lexicalFeatureSet].sort();

  // "usedConcepts": a bounded, stopword-filtered subset of the tokenized terms.
  // Explicitly a lexical heuristic — not a validated domain/ontology concept (NE-08 remains open).
  const conceptCandidates = [...new Set(
    symbols.flatMap((s) => tokenizeIdentifier(s)).filter((t) => t.length >= 3 && !STOPWORD_TOKENS.has(t)),
  )].sort();
  const usedConcepts = conceptCandidates.slice(0, 32);

  return { entities, lexicalFeatures, usedConcepts };
}
