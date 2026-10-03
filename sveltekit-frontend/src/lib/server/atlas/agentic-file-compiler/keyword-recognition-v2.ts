import { z } from 'zod';
import { sha256Stable } from './contracts.js';

/**
 * AFC-KW-01 (2026-09-27) -- "v2"-named for the same reason as
 * helper-registry-v2.ts (a concurrent write landed a different
 * implementation on the original `keyword-recognition-v1.ts` path).
 *
 * EXACT-ONLY keyword recognition. Deliberately no radix/prefix lookup yet
 * (AFC-KW-03, deferred per the reviewed design -- "prove the contract
 * before adding prefix lookup"). No camelCase/snake_case/kebab-case
 * normalization yet either (AFC-KW-02, deferred) -- this is plain
 * whitespace tokenization + lowercase, the simplest possible exact match,
 * so the contract itself can be proven first.
 */

export const KEYWORD_RECOGNITION_SCHEMA = 'atlas.keyword-recognition.v1' as const;

export const keywordVocabularyEntrySchema = z.object({
  term: z.string().min(1), // already-normalized (lowercase) form
  domainRefs: z.array(z.string().min(1)),
  helperRefs: z.array(z.string().min(1)).min(1),
}).strict();
export type KeywordVocabularyEntryV1 = z.infer<typeof keywordVocabularyEntrySchema>;

export const keywordMatchSchema = z.object({
  term: z.string().min(1),
  matchedText: z.string().min(1), // original span before normalization
  domainRefs: z.array(z.string().min(1)),
  helperRefs: z.array(z.string().min(1)),
}).strict();
export type KeywordMatchV1 = z.infer<typeof keywordMatchSchema>;

export const keywordRecognitionV1Schema = z.object({
  schema: z.literal(KEYWORD_RECOGNITION_SCHEMA),
  queryChecksum: z.string().length(64),
  vocabularyRevision: z.string().min(1),
  normalizationRevision: z.string().min(1),
  matches: z.array(keywordMatchSchema),
  unmatchedTokens: z.array(z.string().min(1)),
  checksum: z.string().length(64),
}).strict();
export type KeywordRecognitionV1 = z.infer<typeof keywordRecognitionV1Schema>;

/** AFC-KW-01: whitespace + punctuation-boundary tokenization only. No camelCase/snake_case splitting yet. */
export function normalizeQueryToken(token: string): string {
  return token.trim().toLowerCase();
}

function tokenize(query: string): string[] {
  return query
    .split(/[\s.,!?;:()[\]{}'"`]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export const NORMALIZATION_REVISION_V1 = 'keyword-normalization:v1:whitespace-lowercase-only';

export function recognizeKeywordsV1(input: {
  query: string;
  vocabulary: readonly KeywordVocabularyEntryV1[];
  vocabularyRevision: string;
}): KeywordRecognitionV1 {
  const queryChecksum = sha256Stable({ query: input.query });
  const vocabByTerm = new Map(input.vocabulary.map((v) => [v.term, v]));

  const rawTokens = tokenize(input.query);
  const matches: KeywordMatchV1[] = [];
  const unmatchedTokens: string[] = [];
  const seenTerms = new Set<string>();

  for (const raw of rawTokens) {
    const normalized = normalizeQueryToken(raw);
    const entry = vocabByTerm.get(normalized);
    if (entry) {
      if (!seenTerms.has(entry.term)) {
        seenTerms.add(entry.term);
        matches.push({ term: entry.term, matchedText: raw, domainRefs: entry.domainRefs, helperRefs: entry.helperRefs });
      }
    } else {
      unmatchedTokens.push(raw);
    }
  }

  matches.sort((a, b) => a.term.localeCompare(b.term));

  const body = {
    schema: KEYWORD_RECOGNITION_SCHEMA as typeof KEYWORD_RECOGNITION_SCHEMA,
    queryChecksum,
    vocabularyRevision: input.vocabularyRevision,
    normalizationRevision: NORMALIZATION_REVISION_V1,
    matches,
    unmatchedTokens,
  };
  return keywordRecognitionV1Schema.parse({ ...body, checksum: sha256Stable(body) });
}

/**
 * v1 seed vocabulary. Small and deliberately incomplete -- exact-only, per
 * the reviewed design's own instruction to prove the contract before
 * expanding. `ros2`/`callback`-style robotics/embedded terms are
 * intentionally NOT in this vocabulary (see the proof fixture's ROS2 query)
 * so the unmatched-token path is exercised by a real example, not assumed.
 */
export const DEFAULT_KEYWORD_VOCABULARY_V1: readonly KeywordVocabularyEntryV1[] = [
  { term: 'qdrant', domainRefs: ['retrieval'], helperRefs: ['semantic-768', 'postgres-fts'] },
  { term: 'cache', domainRefs: ['cache'], helperRefs: ['rg-exact'] },
  { term: 'cagra', domainRefs: ['retrieval', 'gpu'], helperRefs: ['docs-corpus-search', 'semantic-768'] },
  { term: 'hnsw', domainRefs: ['retrieval', 'database'], helperRefs: ['docs-corpus-search', 'postgres-fts', 'semantic-768'] },
  { term: 'postgres', domainRefs: ['database'], helperRefs: ['postgres-fts', 'postgres-trigram'] },
  { term: 'graphify', domainRefs: ['graph'], helperRefs: ['graph-ppr', 'docs-corpus-search'] },
  { term: 'docs', domainRefs: ['docs'], helperRefs: ['docs-corpus-search'] },
  { term: 'semanticrevision', domainRefs: ['retrieval'], helperRefs: ['semantic-768', 'docs-corpus-search'] },
  { term: 'references', domainRefs: ['retrieval', 'ast'], helperRefs: ['rg-exact', 'ast-grep-structural', 'lsp-references'] },
  { term: 'called', domainRefs: ['ast'], helperRefs: ['rg-exact', 'ast-grep-structural', 'lsp-references'] },
  { term: 'definition', domainRefs: ['ast'], helperRefs: ['lsp-definition', 'ast-grep-structural'] },
  { term: 'stale', domainRefs: ['cache'], helperRefs: ['rg-exact'] },
];

export const DEFAULT_VOCABULARY_REVISION_V1 = 'keyword-vocabulary:v1:seed-12-terms';
