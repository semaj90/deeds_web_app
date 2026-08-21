import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const entityType = z.string().regex(/^[a-z][a-z0-9_.-]*$/);

export const STRUCTURAL_SYMBOL_KIND_VALUES = [
  'class',
  'constant',
  'enum',
  'enum_variant',
  'field',
  'function',
  'implementation',
  'interface',
  'macro',
  'method',
  'module',
  'namespace',
  'property',
  'type',
  'variable',
] as const;

export const STRUCTURAL_REFERENCE_KIND_VALUES = [
  'call',
  'class_ref',
  'implementation',
  'import',
  'export',
  'type_ref',
  'extends',
  'implements',
  'read',
  'write',
  'route_handler',
  'test_target',
] as const;

export const LANGEXTRACT_ALIGNMENT_STATUS_VALUES = [
  'match_exact',
  'match_greater',
  'match_lesser',
  'match_fuzzy',
] as const;

export const structuralSymbolKindSchema = z.enum(STRUCTURAL_SYMBOL_KIND_VALUES);
export const structuralReferenceKindSchema = z.enum(STRUCTURAL_REFERENCE_KIND_VALUES);
export const langExtractAlignmentStatusSchema = z.enum(LANGEXTRACT_ALIGNMENT_STATUS_VALUES);

/** Canonicalized view of Consiliency CodeChunk fields needed by Atlas. */
export const treesitterChunkerChunkSchema = z.object({
  upstream_node_id: id,
  upstream_file_id: id,
  upstream_symbol_id: id.nullable().optional(),
  upstream_chunk_id: id,
  source_ref: z.string().min(1),
  language: z.string().min(1),
  node_type: z.string().min(1),
  kind: z.string().min(1),
  symbol_name: z.string().min(1).optional(),
  parent_route: z.array(z.string()).default([]),
  parent_context: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  byte_start: z.number().int().nonnegative(),
  byte_end: z.number().int().nonnegative(),
  start_line: z.number().int().nonnegative(),
  end_line: z.number().int().nonnegative(),
  content_hash: sha256,
  calls: z.array(z.string()).default([]),
  imports: z.array(z.string()).default([]),
  exports: z.array(z.string()).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.byte_end < value.byte_start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['byte_end'], message: 'byte_end must be >= byte_start' });
  }
});

export const treesitterChunkerXrefEdgeSchema = z.object({
  src: id,
  dst: id,
  type: z.string().min(1),
  weight: z.number().finite().nonnegative().default(1),
}).strict();

/** ast-grep deterministic structural observation. */
export const astGrepObservationSchema = z.object({
  schema: z.literal('atlas.ast-grep-observation.v1').default('atlas.ast-grep-observation.v1'),
  observation_id: id,
  rule_id: id,
  source_ref: z.string().min(1),
  source_revision: revision,
  byte_start: z.number().int().nonnegative(),
  byte_end: z.number().int().nonnegative(),
  upstream_node_id: id.optional(),
  upstream_chunk_id: id.optional(),
  matched_text_hash: sha256,
  captures: z.record(z.string(), z.string()).default({}),
  observation_kind: z.string().min(1),
  confidence: z.number().finite().min(0).max(1),
  extractor_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.byte_end <= value.byte_start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['byte_end'], message: 'byte_end must be > byte_start' });
  }
});

/**
 * LangExtract observation with source grounding. `alignment_status` remains
 * observable because fuzzy/greater/lesser alignments are weaker evidence than
 * an exact source match even though all carry a character interval.
 */
export const groundedLangExtractObservationSchema = z.object({
  schema: z.literal('atlas.grounded-langextract-observation.v1').default('atlas.grounded-langextract-observation.v1'),
  extraction_id: id,
  source_ref: z.string().min(1),
  source_revision: revision,
  extraction_class: z.string().min(1),
  extraction_text: z.string().min(1),
  char_interval: z.object({
    start_pos: z.number().int().nonnegative(),
    end_pos: z.number().int().nonnegative(),
  }).strict(),
  alignment_status: langExtractAlignmentStatusSchema.nullable().optional(),
  alignment_exact: z.boolean().default(false),
  attributes: z.record(z.string(), z.string()).default({}),
  confidence: z.number().finite().min(0).max(1),
  extractor_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.char_interval.end_pos <= value.char_interval.start_pos) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['char_interval', 'end_pos'], message: 'end_pos must be > start_pos' });
  }
  if (value.alignment_exact && value.alignment_status !== 'match_exact') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['alignment_exact'], message: 'alignment_exact requires match_exact' });
  }
});

/** Extractors nominate path-affine symbols; GIS owns stable identity. */
export const structuralSymbolNominationSchema = z.object({
  schema: z.literal('atlas.structural-symbol-nomination.v1').default('atlas.structural-symbol-nomination.v1'),
  nomination_id: id,
  symbol_key: id,
  identity_status: z.literal('nominated').default('nominated'),
  role: z.literal('definition').default('definition'),
  kind: structuralSymbolKindSchema,
  language: z.string().min(1),
  name: z.string().min(1),
  qualified_name: z.string().min(1),
  container_qualified_name: z.string().min(1).nullable().optional(),
  source_ref: z.string().min(1),
  source_revision: revision,
  workspace_revision: revision,
  upstream_node_id: id,
  upstream_symbol_id: id.nullable().optional(),
  upstream_chunk_id: id,
  byte_start: z.number().int().nonnegative(),
  byte_end: z.number().int().nonnegative(),
  parent_route: z.array(z.string()).default([]),
  signature_normalized: z.string().nullable().optional(),
  declaration_hash: sha256,
  exported: z.boolean().default(false),
  export_name: z.string().min(1).nullable().optional(),
  extractor: z.enum(['treesitter_chunker', 'ast_grep', 'framework_adapter']),
  extractor_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.byte_end < value.byte_start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['byte_end'], message: 'byte_end must be >= byte_start' });
  }
});

export const symbolResolutionSchema = z.object({
  schema: z.literal('atlas.symbol-resolution.v1').default('atlas.symbol-resolution.v1'),
  nomination_id: id,
  symbol_key: id,
  status: z.enum(['canonical', 'degraded', 'ambiguous', 'unresolved']),
  stable_symbol_id: id.nullable().optional(),
  registry_revision: revision,
  resolution_basis: z.enum([
    'exact_symbol_key',
    'existing_alias',
    'explicit_rename',
    'explicit_move',
    'signature_and_container',
    'human_review',
    'unresolved',
  ]),
  candidate_symbol_ids: z.array(id).default([]),
  evidence_refs: z.array(id).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'canonical' && !value.stable_symbol_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stable_symbol_id'], message: 'canonical resolution requires stable_symbol_id' });
  }
  if (value.status !== 'canonical' && value.stable_symbol_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stable_symbol_id'], message: 'non-canonical resolution cannot claim stable_symbol_id' });
  }
});

export const symbolVersionSchema = z.object({
  schema: z.literal('atlas.symbol-version.v1').default('atlas.symbol-version.v1'),
  stable_symbol_id: id,
  symbol_version_id: id,
  symbol_key: id,
  source_ref: z.string().min(1),
  source_revision: revision,
  workspace_revision: revision,
  upstream_node_id: id,
  upstream_symbol_id: id.nullable().optional(),
  upstream_chunk_id: id,
  qualified_name: z.string().min(1),
  declaration_hash: sha256,
  signature_normalized: z.string().nullable().optional(),
  producer_revision: revision,
}).strict();

/** Calls/imports/exports/type refs are structural facts. */
export const structuralReferenceFactSchema = z.object({
  schema: z.literal('atlas.structural-reference-fact.v1').default('atlas.structural-reference-fact.v1'),
  reference_id: id,
  reference_kind: structuralReferenceKindSchema,
  source_ref: z.string().min(1),
  source_revision: revision,
  workspace_revision: revision,
  upstream_source_node_id: id,
  upstream_target_node_id: id.optional(),
  upstream_chunk_id: id,
  containing_stable_symbol_id: id.nullable().optional(),
  containing_symbol_version_id: id.nullable().optional(),
  target_text: z.string().min(1),
  target_stable_symbol_id: id.nullable().optional(),
  resolution_status: z.enum(['canonical', 'degraded', 'ambiguous', 'unresolved']),
  captures: z.record(z.string(), z.string()).default({}),
  evidence_refs: z.array(id).default([]),
  extractor: z.enum(['treesitter_chunker', 'ast_grep', 'framework_adapter']),
  extractor_revision: revision,
}).strict();

export const frameworkEntityNominationSchema = z.object({
  schema: z.literal('atlas.framework-entity-nomination.v1').default('atlas.framework-entity-nomination.v1'),
  nomination_id: id,
  entity_type: entityType,
  entity_key: id,
  source_ref: z.string().min(1),
  source_revision: revision,
  workspace_revision: revision,
  upstream_node_ids: z.array(id).min(1),
  upstream_chunk_ids: z.array(id).min(1),
  observation_ids: z.array(id).default([]),
  attributes: z.record(z.string(), z.string()).default({}),
  extractor_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict();

export const structuralChunkProjectionSchema = z.object({
  schema: z.literal('atlas.structural-chunk-projection.v1').default('atlas.structural-chunk-projection.v1'),
  projection_chunk_id: id,
  upstream_chunk_ids: z.array(id).min(1),
  source_ref: z.string().min(1),
  source_revision: revision,
  byte_start: z.number().int().nonnegative(),
  byte_end: z.number().int().nonnegative(),
  stable_symbol_ids: z.array(id).default([]),
  symbol_version_ids: z.array(id).default([]),
  strategy: z.enum(['symbol', 'container', 'token_split', 'graph_cut', 'fallback']),
  content_hash: sha256,
  chunker_revision: revision,
  projection_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict();

export type TreesitterChunkerChunkV1 = z.infer<typeof treesitterChunkerChunkSchema>;
export type TreesitterChunkerXrefEdgeV1 = z.infer<typeof treesitterChunkerXrefEdgeSchema>;
export type AstGrepObservationV1 = z.infer<typeof astGrepObservationSchema>;
export type GroundedLangExtractObservationV1 = z.infer<typeof groundedLangExtractObservationSchema>;
export type StructuralSymbolNominationV1 = z.infer<typeof structuralSymbolNominationSchema>;
export type SymbolResolutionV1 = z.infer<typeof symbolResolutionSchema>;
export type SymbolVersionV1 = z.infer<typeof symbolVersionSchema>;
export type StructuralReferenceFactV1 = z.infer<typeof structuralReferenceFactSchema>;
export type FrameworkEntityNominationV1 = z.infer<typeof frameworkEntityNominationSchema>;
export type StructuralChunkProjectionV1 = z.infer<typeof structuralChunkProjectionSchema>;

function hash(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function deriveUpstreamSymbolNominationKey(input: {
  language: string;
  source_ref: string;
  kind: z.infer<typeof structuralSymbolKindSchema>;
  qualified_name: string;
  upstream_symbol_id?: string | null;
}): string {
  if (input.upstream_symbol_id) return `upstream-symbol:${input.upstream_symbol_id}`;
  return `symbol-key:${hash([
    input.language.toLowerCase(),
    input.source_ref.replaceAll('\\', '/').normalize('NFC'),
    input.kind,
    input.qualified_name.normalize('NFC'),
  ]).slice(0, 40)}`;
}

export function describeStructuralSymbolContract(): string {
  return [
    'Consiliency treesitter-chunker owns primary code structural/chunk/XRef evidence production.',
    'Its node_id, file_id, symbol_id and chunk_id remain upstream provenance/candidate join keys.',
    'ast-grep contributes deterministic byte-grounded structural observations and has no canonical authority.',
    'LangExtract contributes source-grounded semantic/entity/relation observations; alignment quality remains observable and has no code-identity authority.',
    'GIS/registry promotion alone assigns stable_symbol_id and symbol_version_id.',
    'Calls/imports/exports/type references are structural reference facts, not independent symbols by default.',
    'Chunks and graph cuts are replaceable retrieval projections and never canonical identity.',
  ].join(' ');
}
