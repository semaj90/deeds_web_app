import { Node, type Project, type SourceFile } from 'ts-morph';
import { z } from 'zod';

export const OrderedStructuredMemberKindV1Schema = z.enum([
  'PARAMETER',
  'ARGUMENT',
  'ARRAY_ELEMENT',
  'OBJECT_ENTRY',
  'TYPE_ARGUMENT',
  'TUPLE_ELEMENT',
]);
export type OrderedStructuredMemberKindV1 = z.infer<typeof OrderedStructuredMemberKindV1Schema>;

export const OrderedStructuredMemberV1Schema = z.object({
  schema: z.literal('atlas.ordered-structured-member.v1'),
  parentTreeNodeId: z.string().min(1).nullable(),
  treeNodeId: z.string().min(1).nullable(),
  sourceRef: z.string().min(1),
  filePath: z.string().min(1),
  kind: OrderedStructuredMemberKindV1Schema,
  ordinal: z.number().int().nonnegative(),
  keyText: z.string().nullable(),
  startChar: z.number().int().nonnegative(),
  endChar: z.number().int().nonnegative(),
  startByte: z.number().int().nonnegative().nullable(),
  endByte: z.number().int().nonnegative().nullable(),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  grammarRevision: z.string().min(1).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.endChar < value.startChar) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endChar'], message: 'endChar must be >= startChar' });
  }
  if (value.startByte !== null && value.endByte !== null && value.endByte < value.startByte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endByte'], message: 'endByte must be >= startByte' });
  }
});
export type OrderedStructuredMemberV1 = z.infer<typeof OrderedStructuredMemberV1Schema>;

export const OrderedStructuredMemberSemanticV1Schema = z.object({
  schema: z.literal('atlas.ordered-structured-member-semantic.v1'),
  structural: OrderedStructuredMemberV1Schema,
  nodeKind: z.string().min(1).nullable(),
  symbolName: z.string().min(1).nullable(),
  typeText: z.string().min(1).nullable(),
  optional: z.boolean(),
  rest: z.boolean(),
  hasInitializer: z.boolean(),
  semanticResolved: z.boolean(),
  ordinalPreserved: z.literal(true),
  structuralCoordinatesPreserved: z.literal(true),
  canonicalWritesAllowed: z.literal(false),
  logicalLaneVoteAdded: z.literal(false),
  semanticEngine: z.literal('TS_MORPH'),
  semanticEngineRevision: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict();
export type OrderedStructuredMemberSemanticV1 = z.infer<typeof OrderedStructuredMemberSemanticV1Schema>;

export const OrderedStructuredMemberBatchV1Schema = z.object({
  schema: z.literal('atlas.ordered-structured-member-batch.v1'),
  parentTreeNodeId: z.string().min(1).nullable(),
  sourceRef: z.string().min(1),
  members: z.array(OrderedStructuredMemberSemanticV1Schema),
  sourceOrderPreserved: z.literal(true),
  ordinalsContiguous: z.boolean(),
  treeSitterOwnsOrdinals: z.literal(true),
  semanticEnrichmentMayNotReorderMembers: z.literal(true),
  arrowProjectionShape: z.literal('LIST_STRUCT'),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type OrderedStructuredMemberBatchV1 = z.infer<typeof OrderedStructuredMemberBatchV1Schema>;

type OptionalReadable = Node & { isOptional?: () => boolean };
type RestReadable = Node & { isRestParameter?: () => boolean; getDotDotDotToken?: () => Node | undefined };
type InitializerReadable = Node & { getInitializer?: () => Node | undefined };

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function sourceFileFor(project: Project, filePath: string): SourceFile | undefined {
  const normalized = normalizePath(filePath);
  return project.getSourceFiles().find((file) => normalizePath(file.getFilePath()).endsWith(normalized));
}

function smallestContainingNode(sourceFile: SourceFile, startChar: number, endChar: number): Node | undefined {
  let best: Node | undefined;
  sourceFile.forEachDescendant((node) => {
    if (node.getStart() > startChar || node.getEnd() < endChar) return;
    if (!best || node.getWidth() < best.getWidth()) best = node;
  });
  return best;
}

function safeTypeText(node: Node | undefined): string | null {
  if (!node) return null;
  try {
    const value = node.getType().getText(node);
    return value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
}

function safeSymbolName(node: Node | undefined): string | null {
  if (!node) return null;
  try {
    return node.getSymbol()?.getName() ?? (Node.isIdentifier(node) ? node.getText() : null);
  } catch {
    return Node.isIdentifier(node) ? node.getText() : null;
  }
}

function isOptional(node: Node | undefined): boolean {
  if (!node) return false;
  try { return (node as OptionalReadable).isOptional?.() ?? false; } catch { return false; }
}

function isRest(node: Node | undefined): boolean {
  if (!node) return false;
  try {
    const readable = node as RestReadable;
    return readable.isRestParameter?.() ?? Boolean(readable.getDotDotDotToken?.());
  } catch {
    return false;
  }
}

function hasInitializer(node: Node | undefined): boolean {
  if (!node) return false;
  try { return Boolean((node as InitializerReadable).getInitializer?.()); } catch { return false; }
}

export function enrichOrderedStructuredMembers(input: {
  project: Project;
  members: readonly OrderedStructuredMemberV1[];
  semanticEngineRevision: string;
  producerRevision: string;
}): OrderedStructuredMemberBatchV1 {
  const parsed = input.members.map((member) => OrderedStructuredMemberV1Schema.parse(member));
  const sortedByOrdinal = [...parsed].sort((a, b) => a.ordinal - b.ordinal);

  // Tree-sitter/source syntax owns order. Reject duplicate ordinals instead of
  // letting a semantic engine silently choose an order.
  for (let i = 1; i < sortedByOrdinal.length; i += 1) {
    if (sortedByOrdinal[i - 1]!.ordinal === sortedByOrdinal[i]!.ordinal) {
      throw new Error(`DUPLICATE_STRUCTURAL_ORDINAL:${sortedByOrdinal[i]!.ordinal}`);
    }
  }

  const members = sortedByOrdinal.map((structural) => {
    const sourceFile = sourceFileFor(input.project, structural.filePath);
    const node = sourceFile ? smallestContainingNode(sourceFile, structural.startChar, structural.endChar) : undefined;
    const typeText = safeTypeText(node);
    const symbolName = safeSymbolName(node);

    return OrderedStructuredMemberSemanticV1Schema.parse({
      schema: 'atlas.ordered-structured-member-semantic.v1',
      structural,
      nodeKind: node?.getKindName() ?? null,
      symbolName,
      typeText,
      optional: isOptional(node),
      rest: isRest(node),
      hasInitializer: hasInitializer(node),
      semanticResolved: Boolean(node && (typeText || symbolName)),
      ordinalPreserved: true,
      structuralCoordinatesPreserved: true,
      canonicalWritesAllowed: false,
      logicalLaneVoteAdded: false,
      semanticEngine: 'TS_MORPH',
      semanticEngineRevision: input.semanticEngineRevision,
      producerRevision: input.producerRevision,
    });
  });

  const ordinalsContiguous = members.every((member, index) => member.structural.ordinal === index);
  const first = members[0]?.structural;

  return OrderedStructuredMemberBatchV1Schema.parse({
    schema: 'atlas.ordered-structured-member-batch.v1',
    parentTreeNodeId: first?.parentTreeNodeId ?? null,
    sourceRef: first?.sourceRef ?? 'empty:structured-members',
    members,
    sourceOrderPreserved: true,
    ordinalsContiguous,
    treeSitterOwnsOrdinals: true,
    semanticEnrichmentMayNotReorderMembers: true,
    arrowProjectionShape: 'LIST_STRUCT',
    canonicalWritesAllowed: false,
    producerRevision: input.producerRevision,
  });
}
