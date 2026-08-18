import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
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

export const structuralSymbolKindSchema = z.enum(STRUCTURAL_SYMBOL_KIND_VALUES);
export const structuralReferenceKindSchema = z.enum(STRUCTURAL_REFERENCE_KIND_VALUES);

export const astPathSegmentSchema = z.object({
  node_type: z.string().min(1),
  named_index: z.number().int().nonnegative(),
  field_name: z.string().min(1).nullable().optional(),
}).strict();

/**
 * Revision-scoped structural coordinate. tree_node_id is reproducible for a
 * pinned source+grammar revision, but it is NOT a cross-revision symbol ID.
 */
export const treeNodeCoordinateSchema = z.object({
  schema: z.literal('atlas.tree-node-coordinate.v1').default('atlas.tree-node-coordinate.v1'),
  tree_node_id: id,
  source_ref: z.string().min(1),
  source_revision: revision,
  language: z.string().min(1),
  grammar_revision: revision,
  parser_revision: revision,
  node_type: z.string().min(1),
  named: z.boolean(),
  ast_path: z.array(astPathSegmentSchema),
  parent_ast_path: z.array(astPathSegmentSchema),
  parent_node_type: z.string().min(1).nullable().optional(),
  start_byte: z.number().int().nonnegative(),
  end_byte: z.number().int().nonnegative(),
  start_row: z.number().int().nonnegative(),
  start_column: z.number().int().nonnegative(),
  end_row: z.number().int().nonnegative(),
  end_column: z.number().int().nonnegative(),
  node_text_hash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((value, ctx) => {
  if (value.end_byte < value.start_byte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'end_byte must be >= start_byte', path: ['end_byte'] });
  }
});

/**
 * Extractors nominate a path-affine symbol key. They do not manufacture the
 * canonical stable_symbol_id. Canonical promotion resolves the nomination
 * against the symbol registry, aliases, rename/move evidence and revisions.
 */
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
  grammar_revision: revision,
  parser_revision: revision,
  tree_node: treeNodeCoordinateSchema,
  signature_normalized: z.string().nullable().optional(),
  declaration_hash: z.string().regex(/^[a-f0-9]{64}$/),
  exported: z.boolean().default(false),
  export_name: z.string().min(1).nullable().optional(),
  doc_hash: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
  extractor: z.enum(['tree_sitter_tags', 'tree_sitter_query', 'ast_grep', 'framework_adapter']),
  extractor_revision: revision,
}).strict();

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
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'canonical resolution requires stable_symbol_id', path: ['stable_symbol_id'] });
  }
  if (value.status !== 'canonical' && value.stable_symbol_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'non-canonical resolution cannot claim stable_symbol_id', path: ['stable_symbol_id'] });
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
  grammar_revision: revision,
  parser_revision: revision,
  tree_node_id: id,
  signature_hash: z.string().regex(/^[a-f0-9]{64}$/),
  declaration_hash: z.string().regex(/^[a-f0-9]{64}$/),
  producer_revision: revision,
}).strict();

/**
 * Calls/imports/exports/type refs are evidence/reference facts, not symbols by
 * default. target_text is what syntax proves; target_stable_symbol_id is only
 * populated after canonical reference resolution.
 */
export const structuralReferenceFactSchema = z.object({
  schema: z.literal('atlas.structural-reference-fact.v1').default('atlas.structural-reference-fact.v1'),
  reference_id: id,
  reference_kind: structuralReferenceKindSchema,
  source_ref: z.string().min(1),
  source_revision: revision,
  workspace_revision: revision,
  grammar_revision: revision,
  source_tree_node_id: id,
  containing_stable_symbol_id: id.nullable().optional(),
  containing_symbol_version_id: id.nullable().optional(),
  target_text: z.string().min(1),
  target_stable_symbol_id: id.nullable().optional(),
  resolution_status: z.enum(['canonical', 'degraded', 'ambiguous', 'unresolved']),
  captures: z.record(z.string(), z.string()).default({}),
  evidence_refs: z.array(id).default([]),
  extractor: z.enum(['tree_sitter_tags', 'tree_sitter_query', 'ast_grep', 'framework_adapter']),
  extractor_revision: revision,
}).strict();

/**
 * Code chunks are retrieval projections over byte spans. They may be rebuilt
 * by another chunker without changing stable_symbol_id or symbol_version_id.
 */
export const structuralChunkProjectionSchema = z.object({
  schema: z.literal('atlas.structural-chunk-projection.v1').default('atlas.structural-chunk-projection.v1'),
  chunk_id: id,
  source_ref: z.string().min(1),
  source_revision: revision,
  start_byte: z.number().int().nonnegative(),
  end_byte: z.number().int().nonnegative(),
  strategy: z.enum(['symbol', 'container', 'token_split', 'fallback']),
  primary_tree_node_id: id.nullable().optional(),
  stable_symbol_ids: z.array(id).default([]),
  symbol_version_ids: z.array(id).default([]),
  token_count: z.number().int().nonnegative().nullable().optional(),
  chunker: z.enum(['atlas_tree_sitter', 'treesitter_chunker', 'other']),
  chunker_revision: revision,
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.end_byte < value.start_byte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'end_byte must be >= start_byte', path: ['end_byte'] });
  }
});

/** Framework entities such as SvelteKit routes are derived from structural facts. */
export const frameworkEntityNominationSchema = z.object({
  schema: z.literal('atlas.framework-entity-nomination.v1').default('atlas.framework-entity-nomination.v1'),
  nomination_id: id,
  entity_type: entityType,
  entity_key: id,
  source_ref: z.string().min(1),
  source_revision: revision,
  workspace_revision: revision,
  evidence_tree_node_ids: z.array(id).min(1),
  evidence_reference_ids: z.array(id).default([]),
  attributes: z.record(z.string(), z.string()).default({}),
  extractor_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict();

export type AstPathSegmentV1 = z.infer<typeof astPathSegmentSchema>;
export type TreeNodeCoordinateV1 = z.infer<typeof treeNodeCoordinateSchema>;
export type StructuralSymbolNominationV1 = z.infer<typeof structuralSymbolNominationSchema>;
export type SymbolResolutionV1 = z.infer<typeof symbolResolutionSchema>;
export type SymbolVersionV1 = z.infer<typeof symbolVersionSchema>;
export type StructuralReferenceFactV1 = z.infer<typeof structuralReferenceFactSchema>;
export type StructuralChunkProjectionV1 = z.infer<typeof structuralChunkProjectionSchema>;
export type FrameworkEntityNominationV1 = z.infer<typeof frameworkEntityNominationSchema>;

function hash(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function cleanSourceRef(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').normalize('NFC');
}

/**
 * Reproducible only for the same source revision + grammar revision. This is a
 * structural coordinate, not stable symbol identity.
 */
export function deriveTreeNodeId(input: {
  source_ref: string;
  source_revision: string;
  grammar_revision: string;
  node_type: string;
  ast_path: AstPathSegmentV1[];
}): string {
  return `tree:${hash([
    cleanSourceRef(input.source_ref),
    input.source_revision,
    input.grammar_revision,
    input.node_type,
    input.ast_path,
  ]).slice(0, 40)}`;
}

/**
 * Path-affine nomination key. It deliberately excludes workspace_revision and
 * byte offsets so ordinary edits do not create a new symbol key. File moves and
 * renames still require explicit canonical registry reconciliation.
 */
export function deriveSymbolKey(input: {
  language: string;
  source_ref: string;
  kind: z.infer<typeof structuralSymbolKindSchema>;
  qualified_name: string;
}): string {
  return `symbol-key:${hash([
    input.language.toLowerCase(),
    cleanSourceRef(input.source_ref),
    input.kind,
    input.qualified_name.normalize('NFC'),
  ]).slice(0, 40)}`;
}

export function deriveSymbolNominationId(input: {
  symbol_key: string;
  source_revision: string;
  grammar_revision: string;
  declaration_hash: string;
}): string {
  return `symbol-nomination:${hash([
    input.symbol_key,
    input.source_revision,
    input.grammar_revision,
    input.declaration_hash,
  ]).slice(0, 40)}`;
}

/** symbol_version_id is revision-qualified; stable_symbol_id comes from registry promotion. */
export function deriveSymbolVersionId(input: {
  stable_symbol_id: string;
  source_revision: string;
  grammar_revision: string;
  signature_hash: string;
  declaration_hash: string;
}): string {
  return `symbol-version:${hash([
    input.stable_symbol_id,
    input.source_revision,
    input.grammar_revision,
    input.signature_hash,
    input.declaration_hash,
  ]).slice(0, 40)}`;
}

export function deriveReferenceId(input: {
  source_tree_node_id: string;
  reference_kind: z.infer<typeof structuralReferenceKindSchema>;
  target_text: string;
  extractor_revision: string;
}): string {
  return `reference:${hash([
    input.source_tree_node_id,
    input.reference_kind,
    input.target_text.normalize('NFC'),
    input.extractor_revision,
  ]).slice(0, 40)}`;
}

export function describeStructuralSymbolContract(): string {
  return [
    'Tree-sitter owns revision-scoped structural coordinates and definition/reference captures.',
    'Extractors nominate symbol_key values; only canonical registry promotion may assign stable_symbol_id.',
    'symbol_version_id is revision-qualified and references a canonical stable_symbol_id.',
    'Calls/imports/exports/type references are structural reference facts, not independent symbols by default.',
    'Framework entities such as routes are derived nominations supported by structural evidence.',
    'Chunks are replaceable retrieval projections over source spans and never canonical identity.',
  ].join(' ');
}
