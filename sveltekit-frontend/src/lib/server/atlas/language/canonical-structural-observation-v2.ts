import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  CanonicalStructuralObservationV1Schema,
  type CanonicalStructuralObservationV1,
} from './ast-canonical-coordinate-join.js';

/**
 * SV-4c: native Tree-sitter structural coordinate record.
 *
 * The v2 observation separates logical structural identity from volatile source
 * coordinates. `treeNodeId` is derived from the source-scoped symbolic/signature
 * identity when available; `coordinateChecksumSha256` includes source revision,
 * AST child-index path and byte span and is therefore revision/position specific.
 *
 * This is deliberately richer than the legacy V1 join shape. A projection back
 * to V1 is provided so existing ast-grep -> canonical-coordinate joins keep
 * working while downstream persistence migrates incrementally.
 */

export const TreeSitterAstPathSegmentV1Schema = z.object({
  childIndex: z.number().int().nonnegative(),
  namedChildIndex: z.number().int().nonnegative().nullable(),
  fieldName: z.string().min(1).nullable(),
  nodeType: z.string().min(1),
  named: z.boolean(),
}).strict();
export type TreeSitterAstPathSegmentV1 = z.infer<typeof TreeSitterAstPathSegmentV1Schema>;

export const StructuralIdentityModeV1Schema = z.enum([
  'SYMBOLIC_SIGNATURE',
  'ANONYMOUS_PATH_FALLBACK',
]);
export type StructuralIdentityModeV1 = z.infer<typeof StructuralIdentityModeV1Schema>;

export const CanonicalStructuralObservationV2Schema = z.object({
  schema: z.literal('atlas.canonical-structural-observation.v2'),
  repoId: z.string().min(1),
  sourceRef: z.string().min(1),
  filePath: z.string().min(1),
  language: z.string().min(1),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),

  parserName: z.literal('tree-sitter'),
  parserRevision: z.string().min(1),
  grammarName: z.string().min(1),
  grammarRevision: z.string().min(1),

  nodeType: z.string().min(1),
  namedNode: z.boolean(),
  parentNodeType: z.string().min(1).nullable(),
  astPath: z.array(TreeSitterAstPathSegmentV1Schema),
  parentAstPath: z.array(TreeSitterAstPathSegmentV1Schema),
  sourceOrdinal: z.number().int().nonnegative(),

  qualifiedSymbol: z.string(),
  parentQualifiedSymbol: z.string(),
  normalizedSignature: z.string(),
  identityMode: StructuralIdentityModeV1Schema,

  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().nonnegative(),
  startLine: z.number().int().nonnegative(),
  startColumn: z.number().int().nonnegative(),
  endLine: z.number().int().nonnegative(),
  endColumn: z.number().int().nonnegative(),

  treeNodeId: z.string().regex(/^[a-f0-9]{64}$/),
  coordinateChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  symbolVersionId: z.string().min(1).nullable(),
  identityStatus: z.literal('canonical_structural_identity'),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.endByte < value.startByte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endByte'], message: 'endByte must be >= startByte' });
  }
  if (value.parentAstPath.length !== Math.max(0, value.astPath.length - 1)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parentAstPath'], message: 'parentAstPath must equal astPath without the final segment' });
  }
  for (let i = 0; i < value.parentAstPath.length; i += 1) {
    if (JSON.stringify(value.parentAstPath[i]) !== JSON.stringify(value.astPath[i])) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parentAstPath', i], message: 'parentAstPath must be an exact prefix of astPath' });
      break;
    }
  }
});
export type CanonicalStructuralObservationV2 = z.infer<typeof CanonicalStructuralObservationV2Schema>;

export interface TreeSitterPointLike {
  row: number;
  column: number;
}

export interface TreeSitterNodeLike {
  type: string;
  isNamed: boolean;
  startIndex: number;
  endIndex: number;
  startPosition: TreeSitterPointLike;
  endPosition: TreeSitterPointLike;
  text: string;
  children: readonly TreeSitterNodeLike[];
  namedChildren?: readonly TreeSitterNodeLike[];
  fieldNameForChild?(childIndex: number): string | null;
}

export interface CanonicalStructuralTraversalContextV1 {
  repoId: string;
  sourceRef: string;
  filePath: string;
  language: string;
  workspaceRevision: string;
  sourceRevision: string;
  parserRevision: string;
  grammarName: string;
  grammarRevision: string;
  producerRevision: string;
  symbolVersionIdForNode?: (node: TreeSitterNodeLike) => string | null;
  qualifiedSymbolForNode?: (node: TreeSitterNodeLike, ancestors: readonly TreeSitterNodeLike[]) => string | null;
  normalizedSignatureForNode?: (node: TreeSitterNodeLike, ancestors: readonly TreeSitterNodeLike[]) => string | null;
}

function sha256(parts: readonly string[]): string {
  const digest = createHash('sha256');
  for (const part of parts) {
    digest.update(part, 'utf8');
    digest.update('\0');
  }
  return digest.digest('hex');
}

function normalizedSourceRef(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\/+/, '').toLowerCase();
}

function compactWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function defaultSignature(node: TreeSitterNodeLike): string {
  const firstLine = node.text.split(/\r?\n/, 1)[0] ?? '';
  return compactWhitespace(firstLine).slice(0, 512);
}

function pathKey(path: readonly TreeSitterAstPathSegmentV1[]): string {
  return path.map((segment) => [
    segment.childIndex,
    segment.namedChildIndex ?? '-',
    segment.fieldName ?? '-',
    segment.nodeType,
    segment.named ? 1 : 0,
  ].join(':')).join('/');
}

function namedChildIndex(parent: TreeSitterNodeLike, child: TreeSitterNodeLike): number | null {
  const named = parent.namedChildren ?? parent.children.filter((node) => node.isNamed);
  const index = named.indexOf(child);
  return index >= 0 ? index : null;
}

function parentQualifiedSymbol(
  ancestors: readonly TreeSitterNodeLike[],
  resolver: CanonicalStructuralTraversalContextV1['qualifiedSymbolForNode'],
): string {
  if (!resolver || ancestors.length === 0) return '';
  for (let i = ancestors.length - 1; i >= 0; i -= 1) {
    const parentAncestors = ancestors.slice(0, i);
    const symbol = compactWhitespace(resolver(ancestors[i]!, parentAncestors) ?? '');
    if (symbol) return symbol;
  }
  return '';
}

function logicalTreeNodeId(input: {
  context: CanonicalStructuralTraversalContextV1;
  node: TreeSitterNodeLike;
  astPath: readonly TreeSitterAstPathSegmentV1[];
  qualifiedSymbol: string;
  parentQualifiedSymbol: string;
  normalizedSignature: string;
}): { treeNodeId: string; identityMode: StructuralIdentityModeV1 } {
  const common = [
    input.context.repoId,
    normalizedSourceRef(input.context.sourceRef),
    input.context.language.toLowerCase(),
    input.context.grammarRevision,
    input.node.type,
  ];

  if (input.qualifiedSymbol || input.normalizedSignature) {
    return {
      identityMode: 'SYMBOLIC_SIGNATURE',
      treeNodeId: sha256([
        ...common,
        input.parentQualifiedSymbol,
        input.qualifiedSymbol,
        input.normalizedSignature,
      ]),
    };
  }

  // Anonymous syntax has no source-stable symbolic key. Falling back to the
  // structural path is explicit and machine-readable rather than pretending
  // the path has symbol-level stability across sibling insertions.
  return {
    identityMode: 'ANONYMOUS_PATH_FALLBACK',
    treeNodeId: sha256([...common, pathKey(input.astPath)]),
  };
}

function coordinateChecksum(input: {
  context: CanonicalStructuralTraversalContextV1;
  node: TreeSitterNodeLike;
  astPath: readonly TreeSitterAstPathSegmentV1[];
  sourceOrdinal: number;
}): string {
  return sha256([
    input.context.repoId,
    normalizedSourceRef(input.context.sourceRef),
    input.context.sourceRevision,
    input.context.grammarRevision,
    pathKey(input.astPath),
    String(input.sourceOrdinal),
    String(input.node.startIndex),
    String(input.node.endIndex),
  ]);
}

/**
 * Deterministic pre-order traversal producing source-ordered structural
 * observations. The root itself receives astPath=[] and sourceOrdinal=0.
 */
export function enumerateCanonicalStructuralObservationsV2(
  root: TreeSitterNodeLike,
  context: CanonicalStructuralTraversalContextV1,
): CanonicalStructuralObservationV2[] {
  const output: CanonicalStructuralObservationV2[] = [];
  let ordinal = 0;

  function visit(
    node: TreeSitterNodeLike,
    ancestors: readonly TreeSitterNodeLike[],
    astPath: readonly TreeSitterAstPathSegmentV1[],
  ): void {
    const sourceOrdinal = ordinal;
    ordinal += 1;
    const qualifiedSymbol = compactWhitespace(context.qualifiedSymbolForNode?.(node, ancestors) ?? '');
    const normalizedSignature = compactWhitespace(
      context.normalizedSignatureForNode?.(node, ancestors) ?? defaultSignature(node),
    );
    const parentSymbol = parentQualifiedSymbol(ancestors, context.qualifiedSymbolForNode);
    const identity = logicalTreeNodeId({
      context,
      node,
      astPath,
      qualifiedSymbol,
      parentQualifiedSymbol: parentSymbol,
      normalizedSignature,
    });

    const parent = ancestors.at(-1) ?? null;
    const parentAstPath = astPath.slice(0, Math.max(0, astPath.length - 1));
    output.push(CanonicalStructuralObservationV2Schema.parse({
      schema: 'atlas.canonical-structural-observation.v2',
      repoId: context.repoId,
      sourceRef: normalizedSourceRef(context.sourceRef),
      filePath: normalizedSourceRef(context.filePath),
      language: context.language,
      workspaceRevision: context.workspaceRevision,
      sourceRevision: context.sourceRevision,
      parserName: 'tree-sitter',
      parserRevision: context.parserRevision,
      grammarName: context.grammarName,
      grammarRevision: context.grammarRevision,
      nodeType: node.type,
      namedNode: node.isNamed,
      parentNodeType: parent?.type ?? null,
      astPath,
      parentAstPath,
      sourceOrdinal,
      qualifiedSymbol,
      parentQualifiedSymbol: parentSymbol,
      normalizedSignature,
      identityMode: identity.identityMode,
      startByte: node.startIndex,
      endByte: node.endIndex,
      startLine: node.startPosition.row,
      startColumn: node.startPosition.column,
      endLine: node.endPosition.row,
      endColumn: node.endPosition.column,
      treeNodeId: identity.treeNodeId,
      coordinateChecksumSha256: coordinateChecksum({ context, node, astPath, sourceOrdinal }),
      symbolVersionId: context.symbolVersionIdForNode?.(node) ?? null,
      identityStatus: 'canonical_structural_identity',
      canonicalWritesAllowed: false,
      producerRevision: context.producerRevision,
    }));

    const named = node.namedChildren ?? node.children.filter((child) => child.isNamed);
    for (let childIndex = 0; childIndex < node.children.length; childIndex += 1) {
      const child = node.children[childIndex]!;
      const nextSegment = TreeSitterAstPathSegmentV1Schema.parse({
        childIndex,
        namedChildIndex: child.isNamed ? namedChildIndex(node, child) : null,
        fieldName: node.fieldNameForChild?.(childIndex) ?? null,
        nodeType: child.type,
        named: child.isNamed,
      });
      visit(child, [...ancestors, node], [...astPath, nextSegment]);
    }
  }

  visit(root, [], []);
  return output;
}

/** Existing join remains V1 during migration. */
export function projectCanonicalStructuralObservationV2ToV1(
  value: CanonicalStructuralObservationV2,
): CanonicalStructuralObservationV1 {
  const row = CanonicalStructuralObservationV2Schema.parse(value);
  return CanonicalStructuralObservationV1Schema.parse({
    schema: 'atlas.canonical-structural-observation.v1',
    sourceRef: row.sourceRef,
    sourceRevision: row.sourceRevision,
    treeNodeId: row.treeNodeId,
    symbolVersionId: row.symbolVersionId,
    identityStatus: row.identityStatus,
    nodeKind: row.nodeType,
    qualifiedSymbol: row.qualifiedSymbol,
    startByte: row.startByte,
    endByte: row.endByte,
    grammarRevision: row.grammarRevision,
    producerRevision: row.producerRevision,
  });
}
