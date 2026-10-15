import { createHash } from 'node:crypto';
import { z } from 'zod';
import { FunctionRegistryEntryV1Schema } from './function-registry-v1.js';

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/i);

export const FunctionRegistryRelationshipV1Schema = z.object({
  relationKind: z.enum(['CALLS', 'IMPORTS', 'TESTS']),
  resolutionStatus: z.enum(['RESOLVED_SYMBOL', 'UNRESOLVED', 'EXTERNAL']),
  sourceSymbolVersionId: z.string().trim().min(1),
  targetSymbolVersionId: z.string().trim().min(1).nullable(),
  targetSourceRevision: z.string().trim().min(1).nullable(),
  targetRef: z.string().trim().min(1),
  sourceRef: z.string().trim().min(1),
  sourceRevision: z.string().trim().min(1),
  workspaceRevision: z.string().trim().min(1),
  evidenceKind: z.enum(['AST_REFERENCE', 'COMPILER_REFERENCE', 'GRAPH_EDGE']),
  graphRevision: z.string().trim().min(1).nullable(),
  evidenceRef: z.string().trim().min(1),
  producerRevision: z.string().trim().min(1),
}).strict().superRefine((value, context) => {
  if (value.resolutionStatus === 'RESOLVED_SYMBOL'
    && (!value.targetSymbolVersionId || !value.targetSourceRevision)) {
    context.addIssue({ code: 'custom', message: 'RESOLVED_RELATION_TARGET_REQUIRED' });
  }
  if (value.resolutionStatus !== 'RESOLVED_SYMBOL'
    && (value.targetSymbolVersionId !== null || value.targetSourceRevision !== null)) {
    context.addIssue({ code: 'custom', message: 'UNRESOLVED_RELATION_TARGET_MUST_BE_NULL' });
  }
  if (value.evidenceKind === 'GRAPH_EDGE' && !value.graphRevision) {
    context.addIssue({ code: 'custom', message: 'GRAPH_RELATION_REVISION_REQUIRED' });
  }
  if (value.evidenceKind !== 'GRAPH_EDGE' && value.graphRevision !== null) {
    context.addIssue({ code: 'custom', message: 'NON_GRAPH_RELATION_MUST_NOT_CLAIM_GRAPH_REVISION' });
  }
});

export const FunctionRegistryCapabilityV1Schema = z.object({
  symbolVersionId: z.string().trim().min(1),
  capabilityId: z.string().trim().min(1),
  toolName: z.string().trim().min(1),
  registrationStatus: z.enum(['DISCOVERED', 'VERIFIED', 'DISABLED']),
  toolRegistryRevision: z.string().trim().min(1),
  evidenceRef: z.string().trim().min(1),
  invocationAllowed: z.literal(false),
}).strict();

export const FunctionRegistryRepresentationRefV1Schema = z.object({
  symbolVersionId: z.string().trim().min(1),
  logicalLane: z.literal('semantic'),
  representationId: z.literal('semantic_768'),
  representationRevision: z.string().trim().min(1),
  modelRevision: z.string().trim().min(1),
  sourceContentHash: digestSchema,
  vectorContentHash: digestSchema,
  dimensions: z.literal(768),
  evidenceRef: z.string().trim().min(1),
}).strict();

export const FunctionRegistrySnapshotV1Schema = z.object({
  schema: z.literal('atlas.function-registry-snapshot.v1'),
  workspaceRevision: z.string().trim().min(1),
  symbolRegistryRevision: z.string().trim().min(1),
  parserRevision: z.string().trim().min(1),
  graphRevision: z.string().trim().min(1).nullable(),
  toolRegistryRevision: z.string().trim().min(1).nullable(),
  entries: z.array(FunctionRegistryEntryV1Schema),
  relationships: z.array(FunctionRegistryRelationshipV1Schema),
  capabilities: z.array(FunctionRegistryCapabilityV1Schema),
  representations: z.array(FunctionRegistryRepresentationRefV1Schema),
  status: z.literal('ADVISORY_ONLY'),
  canonicalAuthority: z.literal(false),
  writesAllowed: z.literal(false),
  snapshotChecksum: digestSchema,
}).strict().superRefine((snapshot, context) => {
  const entriesByVersion = new Map<string, (typeof snapshot.entries)[number]>();
  for (const [index, entry] of snapshot.entries.entries()) {
    if (entriesByVersion.has(entry.symbolVersionId)) {
      context.addIssue({ code: 'custom', path: ['entries', index, 'symbolVersionId'], message: 'DUPLICATE_SYMBOL_VERSION' });
    }
    entriesByVersion.set(entry.symbolVersionId, entry);
    if (entry.workspaceRevision !== snapshot.workspaceRevision) {
      context.addIssue({ code: 'custom', path: ['entries', index, 'workspaceRevision'], message: 'ENTRY_WORKSPACE_REVISION_MISMATCH' });
    }
  }

  for (const [index, relation] of snapshot.relationships.entries()) {
    const source = entriesByVersion.get(relation.sourceSymbolVersionId);
    if (!source
      || source.sourceRef !== relation.sourceRef
      || source.sourceRevision !== relation.sourceRevision
      || relation.workspaceRevision !== snapshot.workspaceRevision) {
      context.addIssue({ code: 'custom', path: ['relationships', index], message: 'RELATION_SOURCE_LINEAGE_MISMATCH' });
    }
    if (relation.resolutionStatus === 'RESOLVED_SYMBOL') {
      const target = relation.targetSymbolVersionId
        ? entriesByVersion.get(relation.targetSymbolVersionId)
        : undefined;
      if (!target || target.sourceRevision !== relation.targetSourceRevision) {
        context.addIssue({ code: 'custom', path: ['relationships', index], message: 'RELATION_TARGET_LINEAGE_MISMATCH' });
      }
    }
    if (relation.evidenceKind === 'GRAPH_EDGE' && relation.graphRevision !== snapshot.graphRevision) {
      context.addIssue({ code: 'custom', path: ['relationships', index, 'graphRevision'], message: 'RELATION_GRAPH_REVISION_MISMATCH' });
    }
  }

  for (const [index, capability] of snapshot.capabilities.entries()) {
    if (!entriesByVersion.has(capability.symbolVersionId)
      || capability.toolRegistryRevision !== snapshot.toolRegistryRevision) {
      context.addIssue({ code: 'custom', path: ['capabilities', index], message: 'CAPABILITY_REGISTRY_LINEAGE_MISMATCH' });
    }
  }

  for (const [index, representation] of snapshot.representations.entries()) {
    const entry = entriesByVersion.get(representation.symbolVersionId);
    if (!entry || entry.sourceContentHash !== representation.sourceContentHash) {
      context.addIssue({ code: 'custom', path: ['representations', index], message: 'REPRESENTATION_SOURCE_LINEAGE_MISMATCH' });
    }
  }
});

export type FunctionRegistryRelationshipV1 = z.infer<typeof FunctionRegistryRelationshipV1Schema>;
export type FunctionRegistryCapabilityV1 = z.infer<typeof FunctionRegistryCapabilityV1Schema>;
export type FunctionRegistryRepresentationRefV1 = z.infer<typeof FunctionRegistryRepresentationRefV1Schema>;
export type FunctionRegistrySnapshotV1 = z.infer<typeof FunctionRegistrySnapshotV1Schema>;

type FunctionRegistrySnapshotInputV1 = Omit<FunctionRegistrySnapshotV1, 'snapshotChecksum'>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function compareByKey<T>(key: (value: T) => string) {
  return (left: T, right: T): number => key(left).localeCompare(key(right));
}

export function buildFunctionRegistrySnapshotV1(input: FunctionRegistrySnapshotInputV1): FunctionRegistrySnapshotV1 {
  const normalized: FunctionRegistrySnapshotInputV1 = {
    ...input,
    entries: [...input.entries].sort(compareByKey((entry) => entry.symbolVersionId)),
    relationships: [...input.relationships].sort(compareByKey((relation) => [
      relation.sourceSymbolVersionId,
      relation.relationKind,
      relation.targetSymbolVersionId ?? relation.targetRef,
      relation.evidenceRef,
    ].join('\0'))),
    capabilities: [...input.capabilities].sort(compareByKey((capability) => [capability.symbolVersionId, capability.capabilityId].join('\0'))),
    representations: [...input.representations].sort(compareByKey((representation) => [
      representation.symbolVersionId,
      representation.representationRevision,
    ].join('\0'))),
  };
  const snapshotChecksum = sha256(canonicalJson(normalized));
  return FunctionRegistrySnapshotV1Schema.parse({ ...normalized, snapshotChecksum });
}

export function verifyFunctionRegistrySnapshotV1(snapshot: unknown): boolean {
  const parsed = FunctionRegistrySnapshotV1Schema.safeParse(snapshot);
  if (!parsed.success) return false;
  const { snapshotChecksum, ...content } = parsed.data;
  return sha256(canonicalJson(content)) === snapshotChecksum;
}
