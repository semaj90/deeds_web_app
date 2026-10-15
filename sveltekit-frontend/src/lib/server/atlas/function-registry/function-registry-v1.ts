import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { z } from 'zod';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i);

export const FunctionRegistryOwnerEvidenceV1Schema = z.object({
  stableSymbolId: z.string().trim().min(1),
  symbolVersionId: z.string().trim().min(1),
  packetKey: z.string().trim().min(1).nullable(),
  treeNodeId: z.string().trim().min(1).nullable(),
  sourceRef: z.string().trim().min(1),
  sourceRevision: z.string().trim().min(1),
  workspaceRevision: z.string().trim().min(1),
  qualifiedName: z.string().trim().min(1),
  byteStart: z.number().int().nonnegative(),
  byteEnd: z.number().int().positive(),
  signatureNormalized: z.string().nullable(),
  producerRevision: z.string().trim().min(1),
}).strict();

export const FunctionRegistryAstEvidenceV1Schema = z.object({
  sourceRef: z.string().trim().min(1),
  sourceRevision: z.string().trim().min(1),
  workspaceRevision: z.string().trim().min(1),
  qualifiedName: z.string().trim().min(1),
  language: z.string().trim().min(1),
  nodeType: z.string().trim().min(1),
  astPath: z.string().trim().min(1),
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().positive(),
  signature: z.string(),
  declarationText: z.string().min(1),
  parserRevision: z.string().trim().min(1),
}).strict();

export const FunctionRegistryEntryV1Schema = z.object({
  schema: z.literal('atlas.function-registry.v1'),
  canonicalId: z.string().min(1),
  symbolVersionId: z.string().min(1),
  packetKey: z.string().min(1),
  treeNodeId: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  sourceContentHash: sha256Schema,
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().positive(),
  language: z.string().min(1),
  qualifiedName: z.string().min(1),
  nodeType: z.string().min(1),
  astPath: z.string().min(1),
  signature: z.string(),
  signatureNormalized: z.string().nullable(),
  parserRevision: z.string().min(1),
  producerRevision: z.string().min(1),
  graphRevision: z.null(),
  resolvedCallTargetSymbolVersionIds: z.array(z.string().min(1)),
  unresolvedCallRefs: z.array(z.string().min(1)),
  summary: z.null(),
  summaryStatus: z.literal('pending'),
  summaryEvidenceRefs: z.array(z.string().min(1)),
  capabilityId: z.null(),
  toolRegistrationStatus: z.literal('none'),
  admission: z.literal('ADVISORY_ONLY'),
  canonicalAuthority: z.literal(false),
  writesAllowed: z.literal(false),
  evidenceChecksum: sha256Schema,
}).strict();

export type FunctionRegistryOwnerEvidenceV1 = z.infer<typeof FunctionRegistryOwnerEvidenceV1Schema>;
export type FunctionRegistryAstEvidenceV1 = z.infer<typeof FunctionRegistryAstEvidenceV1Schema>;
export type FunctionRegistryEntryV1 = z.infer<typeof FunctionRegistryEntryV1Schema>;

export type FunctionRegistryQualificationFailureV1 =
  | 'OWNER_EVIDENCE_INVALID'
  | 'AST_EVIDENCE_INVALID'
  | 'PACKET_KEY_UNRESOLVED'
  | 'TREE_NODE_UNRESOLVED'
  | 'SOURCE_HASH_MISMATCH'
  | 'SOURCE_SPAN_INVALID'
  | 'SOURCE_SPAN_MISMATCH'
  | 'IDENTITY_REVISION_MISMATCH';

export type FunctionRegistryQualificationResultV1 =
  | { status: 'QUALIFIED_ADVISORY'; entry: FunctionRegistryEntryV1; failures: [] }
  | { status: 'BLOCKED'; entry: null; failures: FunctionRegistryQualificationFailureV1[] };

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

function isByteArray(value: unknown): value is Uint8Array {
  return ArrayBuffer.isView(value)
    && 'BYTES_PER_ELEMENT' in value
    && value.BYTES_PER_ELEMENT === 1;
}

function sha256Json(value: Omit<FunctionRegistryEntryV1, 'evidenceChecksum'>): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

export function qualifyFunctionRegistryEvidenceV1(input: {
  owner: unknown;
  ast: unknown;
  sourceBytes: Uint8Array;
  expectedSourceContentHash: string;
}): FunctionRegistryQualificationResultV1 {
  const failures: FunctionRegistryQualificationFailureV1[] = [];
  const ownerResult = FunctionRegistryOwnerEvidenceV1Schema.safeParse(input.owner);
  const astResult = FunctionRegistryAstEvidenceV1Schema.safeParse(input.ast);

  if (!ownerResult.success) failures.push('OWNER_EVIDENCE_INVALID');
  if (!astResult.success) failures.push('AST_EVIDENCE_INVALID');
  if (!isByteArray(input.sourceBytes) || !sha256Schema.safeParse(input.expectedSourceContentHash).success) {
    failures.push('SOURCE_HASH_MISMATCH');
  }
  if (failures.length > 0 || !ownerResult.success || !astResult.success || !isByteArray(input.sourceBytes)) {
    return { status: 'BLOCKED', entry: null, failures: [...new Set(failures)] };
  }

  const owner = ownerResult.data;
  const ast = astResult.data;
  if (!owner.packetKey) failures.push('PACKET_KEY_UNRESOLVED');
  if (!owner.treeNodeId) failures.push('TREE_NODE_UNRESOLVED');
  if (sha256(input.sourceBytes) !== input.expectedSourceContentHash.toLowerCase()) failures.push('SOURCE_HASH_MISMATCH');

  const identityMatches = owner.sourceRef === ast.sourceRef
    && owner.sourceRevision === ast.sourceRevision
    && owner.workspaceRevision === ast.workspaceRevision
    && owner.qualifiedName === ast.qualifiedName
    && owner.byteStart === ast.startByte
    && owner.byteEnd === ast.endByte;
  if (!identityMatches) failures.push('IDENTITY_REVISION_MISMATCH');

  const spanIsValid = ast.startByte < ast.endByte && ast.endByte <= input.sourceBytes.byteLength;
  if (!spanIsValid) failures.push('SOURCE_SPAN_INVALID');
  if (spanIsValid) {
    const exactSpan = Buffer.from(input.sourceBytes.subarray(ast.startByte, ast.endByte)).toString('utf8');
    if (exactSpan !== ast.declarationText) failures.push('SOURCE_SPAN_MISMATCH');
  }

  if (failures.length > 0 || !owner.packetKey || !owner.treeNodeId) {
    return { status: 'BLOCKED', entry: null, failures: [...new Set(failures)] };
  }

  const entryWithoutChecksum = {
    schema: 'atlas.function-registry.v1' as const,
    canonicalId: owner.stableSymbolId,
    symbolVersionId: owner.symbolVersionId,
    packetKey: owner.packetKey,
    treeNodeId: owner.treeNodeId,
    sourceRef: owner.sourceRef,
    sourceRevision: owner.sourceRevision,
    workspaceRevision: owner.workspaceRevision,
    sourceContentHash: sha256(input.sourceBytes),
    startByte: owner.byteStart,
    endByte: owner.byteEnd,
    language: ast.language,
    qualifiedName: owner.qualifiedName,
    nodeType: ast.nodeType,
    astPath: ast.astPath,
    signature: ast.signature,
    signatureNormalized: owner.signatureNormalized,
    parserRevision: ast.parserRevision,
    producerRevision: owner.producerRevision,
    graphRevision: null,
    resolvedCallTargetSymbolVersionIds: [],
    unresolvedCallRefs: [],
    summary: null,
    summaryStatus: 'pending' as const,
    summaryEvidenceRefs: [],
    capabilityId: null,
    toolRegistrationStatus: 'none' as const,
    admission: 'ADVISORY_ONLY' as const,
    canonicalAuthority: false as const,
    writesAllowed: false as const,
  };

  const entry = FunctionRegistryEntryV1Schema.parse({
    ...entryWithoutChecksum,
    evidenceChecksum: sha256Json(entryWithoutChecksum),
  });
  return { status: 'QUALIFIED_ADVISORY', entry, failures: [] };
}
