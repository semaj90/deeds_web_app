import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * SEM-INPUT-01 (2026-09-27): the deterministic bridge between canonical
 * candidate identity and the embedding executor. Per CONTENT-POLICY-01's
 * design freeze (same session, `parent-atlas-repair-candidate-feature-matrix/
 * tasks.md`), a candidate's `contentSelectionRevision` must name WHICH bytes
 * were selected, not just which model embedded them -- two vectors from the
 * same model over different source-selection policies are different
 * representations, not the same one with noise.
 *
 * This does NOT require a live, request-time structural-search service
 * (Fabric B, confirmed absent by this session's OPS-06 census). It is an
 * offline compiler, exactly like every other real ast-grep consumer in this
 * repo (`scripts/atlas/lib/ast-grep-symbol-extraction.mjs` et al.) -- an
 * in-process @ast-grep/napi call, not a live SvelteKit route.
 */

export const SEMANTIC_INPUT_ARTIFACT_SCHEMA = 'atlas.semantic-input-artifact.v1' as const;
export const SEMANTIC_EMBEDDING_INPUT_SCHEMA = 'atlas.semantic-embedding-input.v1' as const;
export const SEMANTIC_EMBEDDING_INPUT_POLICY_REVISION =
  'semantic-embedding-input-v1:exact-selection-no-truncation:max-1800-tokens' as const;
export const SEMANTIC_EMBEDDING_INPUT_MAX_TOKENS = 1800 as const;

const sha256Prefixed = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const semanticInputSegmentKindSchema = z.enum([
  'SIGNATURE',
  'DECLARATION',
  'BODY',
  'IMPORT',
  'TYPE_CONTEXT',
  'HEADING',
  'TEXT',
  'WHOLE_FILE_FALLBACK', // explicit UNKNOWN-policy marker -- never a silent truncation
]);
export type SemanticInputSegmentKindV1 = z.infer<typeof semanticInputSegmentKindSchema>;

export const semanticInputSegmentSchema = z.object({
  kind: semanticInputSegmentKindSchema,
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().nonnegative(),
  checksum: sha256Prefixed,
}).strict().refine((s) => s.endByte > s.startByte, { message: 'endByte must be > startByte' });
export type SemanticInputSegmentV1 = z.infer<typeof semanticInputSegmentSchema>;

/**
 * Every distinct selection strategy this compiler can produce gets a stable,
 * named revision string -- never an implicit convention. Adding a new
 * strategy means adding a new named revision, not silently changing what an
 * existing revision string means.
 */
export const SELECTION_POLICY_REVISIONS = {
  TS_JS_TOP_LEVEL_DECLARATIONS: 'semantic-input-compiler-v1:ts-js-top-level-declarations',
  MARKDOWN_FIRST_HEADING_SECTION: 'semantic-input-compiler-v1:markdown-first-heading-section',
  WHOLE_FILE_FALLBACK_UNSUPPORTED_GRAMMAR: 'semantic-input-compiler-v1:whole-file-fallback-unsupported-grammar',
} as const;
export type SelectionPolicyRevision = (typeof SELECTION_POLICY_REVISIONS)[keyof typeof SELECTION_POLICY_REVISIONS];

export const semanticInputArtifactV1Schema = z.object({
  schema: z.literal(SEMANTIC_INPUT_ARTIFACT_SCHEMA),
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1).nullable(),
  sourceRef: z.string().min(1),
  sourceRevision: sha256Prefixed,
  selectionPolicyRevision: z.string().min(1),
  segments: z.array(semanticInputSegmentSchema).min(1),
  renderedTextChecksum: sha256Prefixed,
  tokenCount: z.number().int().nonnegative().nullable(),
}).strict();
export type SemanticInputArtifactV1 = z.infer<typeof semanticInputArtifactV1Schema>;

/** Exact bytes eligible for one embedding request; rejected inputs carry no sendable text. */
export const semanticEmbeddingInputV1Schema = z.object({
  schema: z.literal(SEMANTIC_EMBEDDING_INPUT_SCHEMA),
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1).nullable(),
  sourceRef: z.string().min(1),
  sourceRevision: sha256Prefixed,
  contentSelectionRevision: z.string().min(1),
  inputPolicyRevision: z.literal(SEMANTIC_EMBEDDING_INPUT_POLICY_REVISION),
  tokenizerRevision: z.string().min(1),
  maxInputTokens: z.literal(SEMANTIC_EMBEDDING_INPUT_MAX_TOKENS),
  renderedTextChecksum: sha256Prefixed,
  embeddedInputChecksum: sha256Prefixed,
  embeddedTokenCount: z.number().int().nonnegative(),
  status: z.enum(['ADMITTED', 'REJECTED_EMPTY', 'REJECTED_OVER_BUDGET']),
  inputText: z.string().nullable(),
}).strict().superRefine((value, ctx) => {
  const admitted = value.status === 'ADMITTED';
  if (admitted !== (value.inputText !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'inputText must exist if and only if status is ADMITTED' });
  }
  if (admitted && value.embeddedTokenCount > value.maxInputTokens) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'admitted input exceeds maxInputTokens' });
  }
  if (value.status === 'REJECTED_OVER_BUDGET' && value.embeddedTokenCount <= value.maxInputTokens) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'over-budget input must exceed maxInputTokens' });
  }
});
export type SemanticEmbeddingInputV1 = z.infer<typeof semanticEmbeddingInputV1Schema>;

export function sha256HexPrefixed(buf: Buffer | string): string {
  return 'sha256:' + createHash('sha256').update(buf).digest('hex');
}
