import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const STRUCTURED_VALUE_KINDS = [
  'NULL',
  'BOOLEAN',
  'NUMBER',
  'STRING',
  'SOURCE_EXPRESSION',
  'ARRAY',
  'TUPLE',
  'OBJECT',
  'ARGUMENT_LIST',
  'PARAMETER_LIST',
] as const;

export const STRUCTURED_MEMBER_ROLES = [
  'ELEMENT',
  'ARGUMENT',
  'PARAMETER',
  'SPREAD',
] as const;

export const STRUCTURED_OBJECT_ENTRY_KINDS = [
  'PROPERTY',
  'SHORTHAND',
  'SPREAD',
  'METHOD',
  'COMPUTED',
] as const;

export const astPathStepSchema = z.object({
  named_child_index: z.number().int().nonnegative(),
  field_name: z.string().min(1).nullable().default(null),
  node_type: z.string().min(1),
}).strict();
export type AstPathStepV1 = z.infer<typeof astPathStepSchema>;

export const treeSitterAstProvenanceSchema = z.object({
  schema: z.literal('atlas.tree-sitter-ast-provenance.v1').default('atlas.tree-sitter-ast-provenance.v1'),
  source_ref: z.string().min(1),
  source_revision: revision,
  workspace_revision: revision,
  language: z.string().min(1),
  parser_name: z.enum(['NODE_TREE_SITTER', 'CONSILIENCY_TREE_SITTER']),
  parser_revision: revision,
  grammar_revision: revision,
  node_type: z.string().min(1),
  start_byte: z.number().int().nonnegative(),
  end_byte: z.number().int().nonnegative(),
  start_row: z.number().int().nonnegative(),
  start_column_bytes: z.number().int().nonnegative(),
  end_row: z.number().int().nonnegative(),
  end_column_bytes: z.number().int().nonnegative(),
  ast_path: z.array(astPathStepSchema).max(1024),
  source_span_checksum: checksum,
  tree_node_id: id.nullable().default(null),
  upstream_node_id: id.nullable().default(null),
  upstream_chunk_id: id.nullable().default(null),
  native_identity_span_checksum: checksum.nullable().default(null),
  identity_status: z.enum(['SPAN_ONLY', 'NATIVE_UPSTREAM', 'PARITY_PROVEN']),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.end_byte < value.start_byte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end_byte'], message: 'end_byte must be >= start_byte' });
  }
  const hasIdentity = value.tree_node_id !== null || value.upstream_node_id !== null || value.upstream_chunk_id !== null;
  if (value.identity_status === 'SPAN_ONLY' && hasIdentity) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['identity_status'], message: 'SPAN_ONLY cannot carry an upstream/native structural identity' });
  }
  if (value.identity_status !== 'SPAN_ONLY') {
    if (!hasIdentity) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['identity_status'], message: 'native/parity identity requires an upstream identity' });
    }
    if (value.native_identity_span_checksum !== value.source_span_checksum) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['native_identity_span_checksum'], message: 'native identity may attach only when its source span checksum exactly matches' });
    }
  } else if (value.native_identity_span_checksum !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['native_identity_span_checksum'], message: 'SPAN_ONLY cannot claim a native identity span checksum' });
  }
});
export type TreeSitterAstProvenanceV1 = z.infer<typeof treeSitterAstProvenanceSchema>;

export type StructuredMemberV1 = {
  ordinal: number;
  role: typeof STRUCTURED_MEMBER_ROLES[number];
  field_name: string | null;
  value: AtlasStructuredValueV1;
};

export type StructuredObjectEntryV1 = {
  ordinal: number;
  entry_kind: typeof STRUCTURED_OBJECT_ENTRY_KINDS[number];
  key_text: string | null;
  key_node_type: string | null;
  computed: boolean;
  spread: boolean;
  provenance: TreeSitterAstProvenanceV1;
  value: AtlasStructuredValueV1;
};

type StructuredValueBase = {
  value_id: string;
  kind: typeof STRUCTURED_VALUE_KINDS[number];
  source_text: string;
  provenance: TreeSitterAstProvenanceV1;
  canonical_authority: false;
};

export type AtlasStructuredValueV1 =
  | (StructuredValueBase & { kind: 'NULL'; value: null })
  | (StructuredValueBase & { kind: 'BOOLEAN'; value: boolean })
  | (StructuredValueBase & { kind: 'NUMBER'; value: number | null })
  | (StructuredValueBase & { kind: 'STRING'; value: string | null })
  | (StructuredValueBase & { kind: 'SOURCE_EXPRESSION'; expression_node_type: string })
  | (StructuredValueBase & { kind: 'ARRAY' | 'TUPLE' | 'ARGUMENT_LIST' | 'PARAMETER_LIST'; members: StructuredMemberV1[] })
  | (StructuredValueBase & { kind: 'OBJECT'; entries: StructuredObjectEntryV1[] });

const structuredValueBaseSchema = z.object({
  value_id: id,
  source_text: z.string(),
  provenance: treeSitterAstProvenanceSchema,
  canonical_authority: z.literal(false).default(false),
});

export const structuredMemberSchema: z.ZodType<StructuredMemberV1> = z.lazy(() => z.object({
  ordinal: z.number().int().nonnegative(),
  role: z.enum(STRUCTURED_MEMBER_ROLES),
  field_name: z.string().min(1).nullable().default(null),
  value: atlasStructuredValueSchema,
}).strict());

export const structuredObjectEntrySchema: z.ZodType<StructuredObjectEntryV1> = z.lazy(() => z.object({
  ordinal: z.number().int().nonnegative(),
  entry_kind: z.enum(STRUCTURED_OBJECT_ENTRY_KINDS),
  key_text: z.string().nullable().default(null),
  key_node_type: z.string().min(1).nullable().default(null),
  computed: z.boolean(),
  spread: z.boolean(),
  provenance: treeSitterAstProvenanceSchema,
  value: atlasStructuredValueSchema,
}).strict().superRefine((value, ctx) => {
  if (value.entry_kind === 'SPREAD' && !value.spread) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['spread'], message: 'SPREAD entry must set spread=true' });
  }
  if (value.entry_kind === 'COMPUTED' && !value.computed) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['computed'], message: 'COMPUTED entry must set computed=true' });
  }
}));

export const atlasStructuredValueSchema: z.ZodType<AtlasStructuredValueV1> = z.lazy(() => z.discriminatedUnion('kind', [
  structuredValueBaseSchema.extend({ kind: z.literal('NULL'), value: z.null() }).strict(),
  structuredValueBaseSchema.extend({ kind: z.literal('BOOLEAN'), value: z.boolean() }).strict(),
  structuredValueBaseSchema.extend({ kind: z.literal('NUMBER'), value: z.number().finite().nullable() }).strict(),
  structuredValueBaseSchema.extend({ kind: z.literal('STRING'), value: z.string().nullable() }).strict(),
  structuredValueBaseSchema.extend({ kind: z.literal('SOURCE_EXPRESSION'), expression_node_type: z.string().min(1) }).strict(),
  structuredValueBaseSchema.extend({ kind: z.literal('ARRAY'), members: z.array(structuredMemberSchema) }).strict(),
  structuredValueBaseSchema.extend({ kind: z.literal('TUPLE'), members: z.array(structuredMemberSchema) }).strict(),
  structuredValueBaseSchema.extend({ kind: z.literal('ARGUMENT_LIST'), members: z.array(structuredMemberSchema) }).strict(),
  structuredValueBaseSchema.extend({ kind: z.literal('PARAMETER_LIST'), members: z.array(structuredMemberSchema) }).strict(),
  structuredValueBaseSchema.extend({ kind: z.literal('OBJECT'), entries: z.array(structuredObjectEntrySchema) }).strict(),
]));

export const tsMorphDeclarationRefSchema = z.object({
  source_ref: z.string().min(1),
  start_byte: z.number().int().nonnegative(),
  end_byte: z.number().int().nonnegative(),
  kind: z.string().min(1),
  name: z.string().min(1).nullable().default(null),
}).strict();

export const tsMorphSignatureParameterSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  name: z.string().min(1),
  type_text: z.string().min(1),
  optional: z.boolean(),
  rest: z.boolean(),
  declaration_refs: z.array(tsMorphDeclarationRefSchema).default([]),
}).strict();

export const tsMorphResolvedSignatureSchema = z.object({
  parameters: z.array(tsMorphSignatureParameterSchema),
  return_type_text: z.string().min(1),
  type_parameter_texts: z.array(z.string().min(1)).default([]),
  declaration_refs: z.array(tsMorphDeclarationRefSchema).default([]),
}).strict();

export const tsMorphSemanticEnrichmentSchema = z.object({
  schema: z.literal('atlas.ts-morph-semantic-enrichment.v1').default('atlas.ts-morph-semantic-enrichment.v1'),
  enrichment_id: id,
  source_ref: z.string().min(1),
  source_revision: revision,
  workspace_revision: revision,
  start_byte: z.number().int().nonnegative(),
  end_byte: z.number().int().nonnegative(),
  source_span_checksum: checksum,
  tree_node_id: id.nullable().default(null),
  node_kind: z.string().min(1),
  ts_morph_revision: revision,
  typescript_revision: revision,
  project_revision: revision,
  tsconfig_ref: z.string().min(1).nullable().default(null),
  inferred_type_text: z.string().min(1).nullable().default(null),
  apparent_type_text: z.string().min(1).nullable().default(null),
  symbol_name: z.string().min(1).nullable().default(null),
  declaration_refs: z.array(tsMorphDeclarationRefSchema).default([]),
  reference_refs: z.array(tsMorphDeclarationRefSchema).default([]),
  resolved_signature: tsMorphResolvedSignatureSchema.nullable().default(null),
  exact_span_match: z.literal(true),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.end_byte < value.start_byte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end_byte'], message: 'end_byte must be >= start_byte' });
  }
});
export type TsMorphSemanticEnrichmentV1 = z.infer<typeof tsMorphSemanticEnrichmentSchema>;

export const enrichedStructuredValueSchema = z.object({
  schema: z.literal('atlas.enriched-structured-value.v1').default('atlas.enriched-structured-value.v1'),
  value: atlasStructuredValueSchema,
  semantic: tsMorphSemanticEnrichmentSchema.nullable().default(null),
  semantic_status: z.enum(['NOT_REQUESTED', 'NO_EXACT_SPAN_MATCH', 'ENRICHED']),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((record, ctx) => {
  if (record.semantic_status === 'ENRICHED' && record.semantic === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['semantic'], message: 'ENRICHED requires semantic enrichment' });
  }
  if (record.semantic_status !== 'ENRICHED' && record.semantic !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['semantic'], message: 'semantic enrichment is only allowed with ENRICHED status' });
  }
  if (record.semantic) {
    const provenance = record.value.provenance;
    if (record.semantic.source_ref !== provenance.source_ref ||
        record.semantic.source_revision !== provenance.source_revision ||
        record.semantic.start_byte !== provenance.start_byte ||
        record.semantic.end_byte !== provenance.end_byte ||
        record.semantic.source_span_checksum !== provenance.source_span_checksum ||
        record.semantic.tree_node_id !== provenance.tree_node_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['semantic'], message: 'ts-morph facts may attach only to the exact Tree-sitter source/span/revision identity' });
    }
  }
});
export type EnrichedStructuredValueV1 = z.infer<typeof enrichedStructuredValueSchema>;

export const consiliencyParityReceiptSchema = z.object({
  schema: z.literal('atlas.consiliency-structured-parity-receipt.v1').default('atlas.consiliency-structured-parity-receipt.v1'),
  receipt_id: id,
  source_ref: z.string().min(1),
  source_revision: revision,
  node_tree_sitter_revision: revision,
  consiliency_revision: revision,
  compared_node_count: z.number().int().nonnegative(),
  span_match_count: z.number().int().nonnegative(),
  node_type_match_count: z.number().int().nonnegative(),
  ordered_child_match_count: z.number().int().nonnegative(),
  upstream_id_match_count: z.number().int().nonnegative(),
  status: z.enum(['UNPROVEN', 'SPAN_PARITY', 'STRUCTURAL_PARITY', 'ID_PARITY']),
  diagnostics: z.array(z.string()).default([]),
  node_path_can_mint_consiliency_ids: z.literal(false).default(false),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  for (const [name, count] of [
    ['span_match_count', value.span_match_count],
    ['node_type_match_count', value.node_type_match_count],
    ['ordered_child_match_count', value.ordered_child_match_count],
    ['upstream_id_match_count', value.upstream_id_match_count],
  ] as const) {
    if (count > value.compared_node_count) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: `${name} cannot exceed compared_node_count` });
    }
  }
  if (value.status === 'ID_PARITY' && value.upstream_id_match_count !== value.compared_node_count) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'ID_PARITY requires every compared node to match a supplied upstream ID' });
  }
});
export type ConsiliencyParityReceiptV1 = z.infer<typeof consiliencyParityReceiptSchema>;

export const okfStructuredValueDomainProjectionSchema = z.object({
  schema: z.literal('atlas.okf-structured-value-domain-projection.v1').default('atlas.okf-structured-value-domain-projection.v1'),
  domain_id: z.literal('atlas.structured-value'),
  domain_revision: revision,
  status: z.enum(['active', 'draft']),
  ontology_authority: z.literal('.okf'),
  behavioral_authority: z.literal('openspec'),
  canonical_runtime_store: z.literal('postgresql18'),
  syntax_owner: z.literal('tree-sitter'),
  typescript_semantic_enricher: z.literal('ts-morph'),
  upstream_chunk_identity_owner: z.literal('treesitter-chunker'),
  arrow_projection_is_canonical: z.literal(false),
  ts_morph_enrichment_is_canonical: z.literal(false),
  node_tree_sitter_can_mint_consiliency_ids: z.literal(false),
  source_refs: z.array(z.string().min(1)).min(1),
}).strict();
export type OkfStructuredValueDomainProjectionV1 = z.infer<typeof okfStructuredValueDomainProjectionSchema>;

export type SyntaxNodeLike = {
  type: string;
  startIndex: number;
  endIndex: number;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  namedChildCount: number;
  namedChild(index: number): SyntaxNodeLike | null;
  fieldNameForNamedChild?(index: number): string | null;
  childForFieldName?(fieldName: string): SyntaxNodeLike | null;
};

export type NativeStructuralIdentityV1 = {
  tree_node_id?: string | null;
  upstream_node_id?: string | null;
  upstream_chunk_id?: string | null;
  start_byte: number;
  end_byte: number;
  source_span_checksum: string;
  parity_proven?: boolean;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function structuredValueChecksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function sliceUtf8Bytes(sourceText: string, startByte: number, endByte: number): string {
  return Buffer.from(sourceText, 'utf8').subarray(startByte, endByte).toString('utf8');
}

function decodeStringLiteral(sourceText: string): string | null {
  if (sourceText.length < 2) return null;
  if (sourceText.startsWith('"') && sourceText.endsWith('"')) {
    try { return JSON.parse(sourceText) as string; } catch { return null; }
  }
  if (sourceText.startsWith("'") && sourceText.endsWith("'")) {
    const body = sourceText.slice(1, -1);
    if (!body.includes('\\')) return body;
  }
  return null;
}

function parseNumberLiteral(sourceText: string): number | null {
  const normalized = sourceText.replaceAll('_', '');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export type TreeSitterStructuredValueAdapterOptions = {
  source_ref: string;
  source_revision: string;
  workspace_revision: string;
  language: string;
  parser_revision: string;
  grammar_revision: string;
  resolve_native_identity?: (node: SyntaxNodeLike) => NativeStructuralIdentityV1 | null | undefined;
};

function makeProvenance(
  node: SyntaxNodeLike,
  sourceText: string,
  path: AstPathStepV1[],
  options: TreeSitterStructuredValueAdapterOptions,
): TreeSitterAstProvenanceV1 {
  const spanText = sliceUtf8Bytes(sourceText, node.startIndex, node.endIndex);
  const sourceSpanChecksum = createHash('sha256').update(Buffer.from(spanText, 'utf8')).digest('hex');
  const native = options.resolve_native_identity?.(node) ?? null;
  if (native) {
    if (native.start_byte !== node.startIndex || native.end_byte !== node.endIndex || native.source_span_checksum !== sourceSpanChecksum) {
      throw new Error(`STRUCTURED_VALUE_NATIVE_ID_SPAN_MISMATCH:${options.source_ref}:${node.startIndex}:${node.endIndex}`);
    }
  }
  return treeSitterAstProvenanceSchema.parse({
    source_ref: options.source_ref,
    source_revision: options.source_revision,
    workspace_revision: options.workspace_revision,
    language: options.language,
    parser_name: 'NODE_TREE_SITTER',
    parser_revision: options.parser_revision,
    grammar_revision: options.grammar_revision,
    node_type: node.type,
    start_byte: node.startIndex,
    end_byte: node.endIndex,
    start_row: node.startPosition.row,
    start_column_bytes: node.startPosition.column,
    end_row: node.endPosition.row,
    end_column_bytes: node.endPosition.column,
    ast_path: path,
    source_span_checksum: sourceSpanChecksum,
    tree_node_id: native?.tree_node_id ?? null,
    upstream_node_id: native?.upstream_node_id ?? null,
    upstream_chunk_id: native?.upstream_chunk_id ?? null,
    native_identity_span_checksum: native ? sourceSpanChecksum : null,
    identity_status: native ? (native.parity_proven ? 'PARITY_PROVEN' : 'NATIVE_UPSTREAM') : 'SPAN_ONLY',
    canonical_authority: false,
  });
}

function valueId(provenance: TreeSitterAstProvenanceV1): string {
  return `structured:${structuredValueChecksum({
    source_ref: provenance.source_ref,
    source_revision: provenance.source_revision,
    start_byte: provenance.start_byte,
    end_byte: provenance.end_byte,
    node_type: provenance.node_type,
    ast_path: provenance.ast_path,
    source_span_checksum: provenance.source_span_checksum,
  }).slice(0, 48)}`;
}

function namedChildren(node: SyntaxNodeLike): Array<{ node: SyntaxNodeLike; index: number; field_name: string | null }> {
  const children: Array<{ node: SyntaxNodeLike; index: number; field_name: string | null }> = [];
  for (let index = 0; index < node.namedChildCount; index += 1) {
    const child = node.namedChild(index);
    if (!child) continue;
    children.push({ node: child, index, field_name: node.fieldNameForNamedChild?.(index) ?? null });
  }
  return children;
}

function childPath(path: AstPathStepV1[], child: SyntaxNodeLike, index: number, fieldName: string | null): AstPathStepV1[] {
  return [...path, { named_child_index: index, field_name: fieldName, node_type: child.type }];
}

function memberRole(containerKind: AtlasStructuredValueV1['kind'], childType: string): StructuredMemberV1['role'] {
  if (childType === 'spread_element' || childType === 'rest_pattern') return 'SPREAD';
  if (containerKind === 'ARGUMENT_LIST') return 'ARGUMENT';
  if (containerKind === 'PARAMETER_LIST') return 'PARAMETER';
  return 'ELEMENT';
}

function adaptNode(
  node: SyntaxNodeLike,
  sourceText: string,
  path: AstPathStepV1[],
  options: TreeSitterStructuredValueAdapterOptions,
): AtlasStructuredValueV1 {
  const provenance = makeProvenance(node, sourceText, path, options);
  const source = sliceUtf8Bytes(sourceText, node.startIndex, node.endIndex);
  const base = { value_id: valueId(provenance), source_text: source, provenance, canonical_authority: false as const };

  if (node.type === 'null') return atlasStructuredValueSchema.parse({ ...base, kind: 'NULL', value: null });
  if (node.type === 'true' || node.type === 'false') return atlasStructuredValueSchema.parse({ ...base, kind: 'BOOLEAN', value: node.type === 'true' });
  if (['number', 'number_literal'].includes(node.type)) return atlasStructuredValueSchema.parse({ ...base, kind: 'NUMBER', value: parseNumberLiteral(source) });
  if (['string', 'string_fragment'].includes(node.type)) return atlasStructuredValueSchema.parse({ ...base, kind: 'STRING', value: decodeStringLiteral(source) });

  const collectionKinds: Record<string, 'ARRAY' | 'TUPLE' | 'ARGUMENT_LIST' | 'PARAMETER_LIST'> = {
    array: 'ARRAY',
    array_pattern: 'ARRAY',
    tuple_type: 'TUPLE',
    arguments: 'ARGUMENT_LIST',
    formal_parameters: 'PARAMETER_LIST',
  };
  const collectionKind = collectionKinds[node.type];
  if (collectionKind) {
    const members = namedChildren(node).map(({ node: child, index, field_name }, ordinal) => ({
      ordinal,
      role: memberRole(collectionKind, child.type),
      field_name,
      value: adaptNode(child, sourceText, childPath(path, child, index, field_name), options),
    }));
    return atlasStructuredValueSchema.parse({ ...base, kind: collectionKind, members });
  }

  if (['object', 'object_pattern'].includes(node.type)) {
    const entries = namedChildren(node).map(({ node: child, index, field_name }, ordinal): StructuredObjectEntryV1 => {
      const entryPath = childPath(path, child, index, field_name);
      const entryProvenance = makeProvenance(child, sourceText, entryPath, options);
      if (child.type === 'spread_element') {
        const target = child.namedChild(0) ?? child;
        return {
          ordinal,
          entry_kind: 'SPREAD',
          key_text: null,
          key_node_type: null,
          computed: false,
          spread: true,
          provenance: entryProvenance,
          value: adaptNode(target, sourceText, childPath(entryPath, target, 0, null), options),
        };
      }
      if (['shorthand_property_identifier', 'shorthand_property_identifier_pattern'].includes(child.type)) {
        const text = sliceUtf8Bytes(sourceText, child.startIndex, child.endIndex);
        return {
          ordinal,
          entry_kind: 'SHORTHAND',
          key_text: text,
          key_node_type: child.type,
          computed: false,
          spread: false,
          provenance: entryProvenance,
          value: adaptNode(child, sourceText, entryPath, options),
        };
      }
      if (child.type === 'pair') {
        const keyNode = child.childForFieldName?.('key') ?? child.namedChild(0);
        const valueNode = child.childForFieldName?.('value') ?? child.namedChild(Math.max(0, child.namedChildCount - 1));
        const keyText = keyNode ? sliceUtf8Bytes(sourceText, keyNode.startIndex, keyNode.endIndex) : null;
        const computed = keyNode?.type === 'computed_property_name';
        const value = valueNode
          ? adaptNode(valueNode, sourceText, childPath(entryPath, valueNode, Math.max(0, child.namedChildCount - 1), 'value'), options)
          : atlasStructuredValueSchema.parse({ ...base, value_id: `${base.value_id}:missing:${ordinal}`, kind: 'SOURCE_EXPRESSION', expression_node_type: 'missing' });
        return {
          ordinal,
          entry_kind: computed ? 'COMPUTED' : 'PROPERTY',
          key_text: keyText,
          key_node_type: keyNode?.type ?? null,
          computed,
          spread: false,
          provenance: entryProvenance,
          value,
        };
      }
      const text = sliceUtf8Bytes(sourceText, child.startIndex, child.endIndex);
      return {
        ordinal,
        entry_kind: child.type.includes('method') ? 'METHOD' : 'PROPERTY',
        key_text: text,
        key_node_type: child.type,
        computed: false,
        spread: false,
        provenance: entryProvenance,
        value: adaptNode(child, sourceText, entryPath, options),
      };
    });
    return atlasStructuredValueSchema.parse({ ...base, kind: 'OBJECT', entries });
  }

  return atlasStructuredValueSchema.parse({ ...base, kind: 'SOURCE_EXPRESSION', expression_node_type: node.type });
}

export class TreeSitterStructuredValueAdapter {
  readonly options: TreeSitterStructuredValueAdapterOptions;

  constructor(options: TreeSitterStructuredValueAdapterOptions) {
    this.options = options;
  }

  adapt(root: SyntaxNodeLike, sourceText: string): AtlasStructuredValueV1 {
    if (root.startIndex < 0 || root.endIndex < root.startIndex || root.endIndex > Buffer.byteLength(sourceText, 'utf8')) {
      throw new Error('STRUCTURED_VALUE_ROOT_SPAN_INVALID');
    }
    return adaptNode(root, sourceText, [], this.options);
  }
}

export function attachTsMorphSemanticEnrichment(input: {
  value: AtlasStructuredValueV1;
  semantic: TsMorphSemanticEnrichmentV1 | null;
  status: EnrichedStructuredValueV1['semantic_status'];
}): EnrichedStructuredValueV1 {
  return enrichedStructuredValueSchema.parse({
    value: input.value,
    semantic: input.semantic,
    semantic_status: input.status,
    canonical_authority: false,
  });
}

export function describeStructuredValueAst(): string {
  return [
    'Node Tree-sitter owns TS/JS syntax spans, child ordering, grammar fields and AST paths; the adapter does not synthesize Consiliency or Atlas tree identities.',
    'A native tree_node_id/upstream node/chunk ID may attach only when the supplied upstream span and source-span checksum exactly match the Tree-sitter node.',
    'ts-morph enrichment is an exact-span TypeScript semantic overlay: types, symbols, declarations, references and resolved call signatures cannot alter syntax provenance or canonical identity.',
    'Unknown or non-literal syntax becomes SOURCE_EXPRESSION with exact source text rather than being guessed into a semantic value.',
    '.okf remains ontology/domain vocabulary authority, OpenSpec owns behavioral semantics, PostgreSQL owns promoted canonical materialization, and Arrow remains a noncanonical projection.',
  ].join(' ');
}
