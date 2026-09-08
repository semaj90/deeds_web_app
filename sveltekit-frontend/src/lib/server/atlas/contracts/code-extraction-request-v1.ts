/**
 * CodeExtractionRequestV1 — input contract for the code-domain grounded-extraction lane.
 *
 * Per `openspec/changes/parent-atlas-code-langextract-evidence-lane/design.md` section 3.2: this is
 * the request shape a future `POST /v1/extract/code(/batch)` endpoint on the existing
 * `miniforge-nlp-sidecar` (:8095) would accept — NOT implemented by this contract, which only
 * defines and validates the shape. Nothing in this file calls a network endpoint.
 *
 * Hard invariant (design.md section 2, "What CodeLangExtractV1 should extract — and what it must
 * NOT re-derive"): the extraction call must never be asked to rediscover symbols, declarations,
 * signatures, imports, calls, or exports — those come from Tree-sitter/ast-grep and MUST already be
 * present as `astFacts`/`symbolFacts` on the request. `assertRequestHasStructuralFacts()` enforces
 * this for any non-trivial candidate text before a caller is allowed to dispatch the request.
 */

import { z } from 'zod';

export const CODE_EXTRACTION_PROFILE_VALUES = [
  'RERANK_EVIDENCE',
  'ERROR_FIXING',
  'API_ANALYSIS',
  'TEST_ANALYSIS',
] as const;

export const CodeExtractionProfileSchema = z.enum(CODE_EXTRACTION_PROFILE_VALUES);
export type CodeExtractionProfile = z.infer<typeof CodeExtractionProfileSchema>;

export const AstFactV1Schema = z.object({
  symbol: z.string().min(1),
  kind: z.string().min(1),
  signature: z.string().optional(),
  calls: z.array(z.string()).default([]),
  imports: z.array(z.string()).default([]),
  exports: z.array(z.string()).default([]),
  startByte: z.number().int().nonnegative().optional(),
  endByte: z.number().int().nonnegative().optional(),
}).strict();

export type AstFactV1 = z.infer<typeof AstFactV1Schema>;

export const CodeExtractionRequestV1Schema = z.object({
  schema: z.literal('atlas.code-extraction-request.v1').default('atlas.code-extraction-request.v1'),
  candidateId: z.string().min(1),
  sourceRevision: z.string().min(1),
  language: z.string().min(1),
  sourceText: z.string().min(1),
  astFacts: z.array(AstFactV1Schema).default([]),
  symbolFacts: z.array(AstFactV1Schema).default([]),
  ontologyHints: z.array(z.string()).default([]),
  profile: CodeExtractionProfileSchema,
}).strict();

export type CodeExtractionRequestV1 = z.infer<typeof CodeExtractionRequestV1Schema>;

/**
 * Trivial-length threshold below which a request may legitimately carry no structural facts (e.g. a
 * one-line constant or a stub). Above this length, a request with empty astFacts AND symbolFacts is
 * almost certainly a caller that skipped the AST/ast-grep pass rather than a genuinely fact-free
 * candidate, and must be rejected before any LLM call is made.
 */
export const CODE_EXTRACTION_TRIVIAL_TEXT_LENGTH = 40;

export function assertRequestHasStructuralFacts(request: CodeExtractionRequestV1): void {
  if (request.sourceText.length <= CODE_EXTRACTION_TRIVIAL_TEXT_LENGTH) return;
  if (request.astFacts.length === 0 && request.symbolFacts.length === 0) {
    throw new Error(
      `CodeExtractionRequestV1 for candidate=${request.candidateId} has non-trivial sourceText ` +
        `(${request.sourceText.length} chars) but no astFacts/symbolFacts. The extraction call must ` +
        `never be asked to rediscover structural facts Tree-sitter/ast-grep already produce — run ` +
        `structural extraction first and attach its output before dispatching this request.`
    );
  }
}
