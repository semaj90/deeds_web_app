import { createHash } from 'node:crypto';
import { z } from 'zod';

const NonEmptyString = z.string().min(1);
const NonNegativeInt = z.number().int().nonnegative();

export const AstNodeLocatorV1Schema = z.object({
  schema: z.literal('atlas.ast-node-locator.v1'),
  workspaceRevision: NonEmptyString,
  sourceRevision: NonEmptyString,
  sourceRef: NonEmptyString,
  parserName: NonEmptyString,
  parserVersion: NonEmptyString,
  grammarRevision: NonEmptyString,
  language: NonEmptyString,
  nodeType: NonEmptyString,
  nodeKind: NonEmptyString,
  named: z.boolean(),
  rawAstPath: z.array(NonNegativeInt).min(1),
  namedAstPath: z.array(NonNegativeInt).min(1),
  parentRawAstPath: z.array(NonNegativeInt).nullable(),
  parentNamedAstPath: z.array(NonNegativeInt).nullable(),
  parentNodeType: NonEmptyString.nullable(),
  childIndex: NonNegativeInt.nullable(),
  namedChildIndex: NonNegativeInt.nullable(),
  depth: NonNegativeInt,
  span: z.object({
    startByte: NonNegativeInt,
    endByte: NonNegativeInt,
    startLine: NonNegativeInt,
    startColumn: NonNegativeInt,
    endLine: NonNegativeInt,
    endColumn: NonNegativeInt,
  }).strict(),
  qualifiedSymbol: z.string(),
  normalizedSignature: z.string(),
}).strict().refine((value) => value.span.endByte >= value.span.startByte, {
  message: 'endByte must be >= startByte',
  path: ['span', 'endByte'],
});

export type AstNodeLocatorV1 = z.infer<typeof AstNodeLocatorV1Schema>;

export const StructuralIdentityV1Schema = z.object({
  schema: z.literal('atlas.structural-identity.v1'),
  astNodeId: NonEmptyString,
  structuralNodeId: NonEmptyString,
  symbolId: NonEmptyString,
  symbolVersionId: NonEmptyString,
  canonicalId: NonEmptyString,
  packetKeys: z.array(NonEmptyString),
  locator: AstNodeLocatorV1Schema,
  identityStatus: z.enum(['NEW_SYMBOL', 'NEW_VERSION', 'EXACT_EXISTING', 'ALIASED', 'AMBIGUOUS']),
  evidenceRefs: z.array(NonEmptyString),
  producerRevision: NonEmptyString,
}).strict();

export type StructuralIdentityV1 = z.infer<typeof StructuralIdentityV1Schema>;

function hash(prefix: string, parts: unknown[]): string {
  const payload = JSON.stringify(parts);
  return `${prefix}:${createHash('sha256').update(payload).digest('hex').slice(0, 32)}`;
}

export function deriveAstNodeId(locator: AstNodeLocatorV1): string {
  const value = AstNodeLocatorV1Schema.parse(locator);
  return hash('ast', [
    value.workspaceRevision,
    value.sourceRevision,
    value.sourceRef,
    value.parserName,
    value.parserVersion,
    value.grammarRevision,
    value.rawAstPath,
    value.nodeType,
    value.span.startByte,
    value.span.endByte,
  ]);
}

export function deriveStructuralNodeId(locator: AstNodeLocatorV1): string {
  const value = AstNodeLocatorV1Schema.parse(locator);
  return hash('struct', [
    value.sourceRef,
    value.language,
    value.nodeKind,
    value.qualifiedSymbol,
    value.parentNamedAstPath,
    value.normalizedSignature,
    value.namedAstPath,
  ]);
}

export function deriveSymbolId(locator: AstNodeLocatorV1, lexicalParentSymbolId: string | null): string {
  const value = AstNodeLocatorV1Schema.parse(locator);
  return hash('sym', [
    value.sourceRef,
    value.language,
    value.nodeKind,
    lexicalParentSymbolId,
    value.qualifiedSymbol,
    value.normalizedSignature,
  ]);
}

export function deriveSymbolVersionId(input: {
  symbolId: string;
  sourceRevision: string;
  normalizedSignature: string;
  astNodeId: string;
}): string {
  return hash('symv', [input.symbolId, input.sourceRevision, input.normalizedSignature, input.astNodeId]);
}

export function buildStructuralIdentity(input: {
  locator: AstNodeLocatorV1;
  lexicalParentSymbolId?: string | null;
  canonicalId?: string;
  packetKeys?: string[];
  identityStatus?: StructuralIdentityV1['identityStatus'];
  evidenceRefs?: string[];
  producerRevision: string;
}): StructuralIdentityV1 {
  const locator = AstNodeLocatorV1Schema.parse(input.locator);
  const astNodeId = deriveAstNodeId(locator);
  const structuralNodeId = deriveStructuralNodeId(locator);
  const symbolId = deriveSymbolId(locator, input.lexicalParentSymbolId ?? null);
  const symbolVersionId = deriveSymbolVersionId({
    symbolId,
    sourceRevision: locator.sourceRevision,
    normalizedSignature: locator.normalizedSignature,
    astNodeId,
  });
  return StructuralIdentityV1Schema.parse({
    schema: 'atlas.structural-identity.v1',
    astNodeId,
    structuralNodeId,
    symbolId,
    symbolVersionId,
    canonicalId: input.canonicalId ?? symbolId,
    packetKeys: [...new Set(input.packetKeys ?? [])],
    locator,
    identityStatus: input.identityStatus ?? 'NEW_VERSION',
    evidenceRefs: [...new Set(input.evidenceRefs ?? [locator.sourceRef])],
    producerRevision: input.producerRevision,
  });
}
