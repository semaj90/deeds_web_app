import { z } from 'zod';

const sha256Revision = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const astMiniRecordV1Schema = z.object({
  schema: z.literal('atlas.ast-mini-record.v1'),
  identity: z.object({
    sourceRef: z.string().min(1),
    sourceRevision: sha256Revision,
    workspaceRevision: sha256Revision,
    sourceContentDigest: sha256Revision,
  }).strict(),
  node: z.object({
    treeNodeId: z.string().min(1),
    upstreamNodeId: z.string().min(1).nullable(),
    parentTreeNodeId: z.string().min(1).nullable(),
    nodeKind: z.string().min(1),
    qualifiedSymbol: z.string().min(1),
    startByte: z.number().int().nonnegative(),
    endByte: z.number().int().positive(),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  }).strict(),
  flags: z.object({
    declaration: z.boolean(),
    callable: z.boolean(),
    import: z.boolean(),
    export: z.boolean(),
    type: z.boolean(),
    literal: z.boolean(),
  }).strict(),
  producer: z.object({ name: z.string().min(1), version: z.string().min(1) }).strict(),
  canonicalAuthority: z.literal(false),
}).strict().superRefine((record, ctx) => {
  if (record.node.endByte <= record.node.startByte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['node', 'endByte'], message: 'endByte must be greater than startByte' });
  }
  if (record.node.endLine < record.node.startLine) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['node', 'endLine'], message: 'endLine must not precede startLine' });
  }
});

export type AstMiniRecordV1 = z.infer<typeof astMiniRecordV1Schema>;

const DECLARATION_KINDS = new Set([
  'class', 'class_declaration', 'constant', 'enum', 'enum_declaration', 'function',
  'function_declaration', 'interface', 'interface_declaration', 'method', 'module',
  'namespace', 'property', 'type', 'type_alias', 'variable',
]);
const CALLABLE_KINDS = new Set(['function', 'function_declaration', 'method', 'constructor', 'callable']);
const TYPE_KINDS = new Set([
  'class', 'class_declaration', 'enum', 'enum_declaration', 'interface', 'interface_declaration',
  'type', 'type_alias', 'type_declaration', 'struct', 'union',
]);

function normalizedKind(value: string): string {
  return value.trim().toLowerCase().replace(/[ -]+/g, '_');
}

/**
 * Project one existing revision-qualified AST row into a compact feature record.
 * treeNodeId is carried only as the existing AST-row locator; this record is not identity authority.
 */
export function buildAstMiniRecordV1(input: {
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  sourceContentDigest: string;
  treeNodeId: string;
  upstreamNodeId?: string | null;
  parentTreeNodeId?: string | null;
  nodeKind: string;
  qualifiedSymbol: string;
  startByte: number;
  endByte: number;
  startLine: number;
  endLine: number;
  producerName: string;
  producerVersion: string;
}): AstMiniRecordV1 {
  const kind = normalizedKind(input.nodeKind);
  return astMiniRecordV1Schema.parse({
    schema: 'atlas.ast-mini-record.v1',
    identity: {
      sourceRef: input.sourceRef,
      sourceRevision: input.sourceRevision,
      workspaceRevision: input.workspaceRevision,
      sourceContentDigest: input.sourceContentDigest,
    },
    node: {
      treeNodeId: input.treeNodeId,
      upstreamNodeId: input.upstreamNodeId ?? null,
      parentTreeNodeId: input.parentTreeNodeId ?? null,
      nodeKind: input.nodeKind,
      qualifiedSymbol: input.qualifiedSymbol,
      startByte: input.startByte,
      endByte: input.endByte,
      startLine: input.startLine,
      endLine: input.endLine,
    },
    flags: {
      declaration: DECLARATION_KINDS.has(kind),
      callable: CALLABLE_KINDS.has(kind),
      import: kind === 'import' || kind === 'import_declaration',
      export: kind === 'export' || kind === 'export_declaration',
      type: TYPE_KINDS.has(kind),
      literal: kind === 'literal' || kind.endsWith('_literal'),
    },
    producer: { name: input.producerName, version: input.producerVersion },
    canonicalAuthority: false,
  });
}
