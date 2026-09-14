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

// All `kind:name` prefixes this repo's ast_symbols extractors emit (backfill-ast-symbols.mjs's
// declarationKinds map + the import/export cases). Found live 2026-09-13: this function only ever
// special-cased `import:`, so any OTHER prefix (`fn:`, `var:`, `export:`, `class:`, `method:`,
// `interface:`, `type:`, `enum:`) survived tokenization glued to the first word (`fn:determine`,
// not `fn` + `determine`) -- the actual root cause of `used_concepts` containing AST-symbol-noise
// look-alike strings, not a wrong-column bug like `entities` had.
const KNOWN_PREFIXES = ['import:', 'export:', 'fn:', 'var:', 'class:', 'method:', 'interface:', 'type:', 'enum:'];

/** Splits `camelCase` / `PascalCase` / `snake_case` / `kebab-case` into lowercase word tokens. */
export function tokenizeIdentifier(identifier) {
  const matchedPrefix = KNOWN_PREFIXES.find((prefix) => identifier.startsWith(prefix));
  const withoutPrefix = matchedPrefix ? identifier.slice(matchedPrefix.length) : identifier;
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
  // Fixed 2026-09-13 (same session as the used_concepts prefix-contamination fix): this used to
  // keep the full `kind:name` string verbatim (`fn:determineRequestType`), which is what made
  // sampled `atlas_packet_features.entities` rows look identical in shape to `ast_symbols` --
  // real signal (which symbol is this), but redundant with the column that already stores it.
  // Stripping the prefix here (name only, NOT word-tokenized like usedConcepts -- an entity is
  // one identifier, not a bag of words) makes this column carry distinct value from ast_symbols.
  const entities = [...new Set(
    symbols
      .filter((s) => !s.startsWith('import:'))
      .map((s) => {
        const matched = KNOWN_PREFIXES.find((prefix) => prefix !== 'import:' && s.startsWith(prefix));
        return matched ? s.slice(matched.length) : s;
      })
      .filter((s) => s.length > 0),
  )].sort();

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
