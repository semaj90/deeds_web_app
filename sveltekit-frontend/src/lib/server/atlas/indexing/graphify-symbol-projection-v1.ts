import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { StructuralExtractionFabricResultV1 } from '@deeds/parent-atlas';
import { normalizeGitSourceRefV1 } from './git-revision-semantics-v1.js';
import {
  buildExportsForSourceV1,
  parseImportStatementV1,
  resolveReferenceTargetV1,
  type ImportBindingV1,
} from './graphify-import-target-resolver-v1.js';

const nonEmpty = z.string().min(1);
const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const GRAPHIFY_SYMBOL_PROJECTION_MAPPER_REVISION_V1 =
  'atlas.graphify-symbol-projection-mapper.2026-09-12.v1' as const;

export const graphifyNativeSymbolCoordinateV1Schema = z.object({
  upstreamNodeId: nonEmpty,
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().nonnegative(),
  startRow: z.number().int().nonnegative(),
  endRow: z.number().int().nonnegative(),
  astFingerprint: sha256,
}).strict().superRefine((value, ctx) => {
  if (value.endByte < value.startByte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endByte'], message: 'endByte must be >= startByte' });
  }
  if (value.endRow < value.startRow) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endRow'], message: 'endRow must be >= startRow' });
  }
});

export type GraphifyNativeSymbolCoordinateV1 = z.infer<typeof graphifyNativeSymbolCoordinateV1Schema>;

export const graphifyReferenceEvidenceV1Schema = z.object({
  referenceId: nonEmpty,
  evidenceKind: nonEmpty,
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().nonnegative(),
  startRow: z.number().int().nonnegative(),
  endRow: z.number().int().nonnegative(),
  confidence: z.number().finite().min(0).max(1),
  evidenceRefs: z.array(nonEmpty).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.endByte < value.startByte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endByte'], message: 'endByte must be >= startByte' });
  }
  if (value.endRow < value.startRow) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endRow'], message: 'endRow must be >= startRow' });
  }
});

export type GraphifyReferenceEvidenceV1 = z.infer<typeof graphifyReferenceEvidenceV1Schema>;

export const graphifySymbolProjectionCandidateV1Schema = z.object({
  schema: z.literal('atlas.graphify-symbol-projection-candidate.v1'),
  fileId: uuid,
  workspaceRevision: nonEmpty,
  sourceRef: nonEmpty,
  sourceRevision: nonEmpty,
  stableSymbolKey: nonEmpty,
  symbolKind: nonEmpty,
  qualifiedName: nonEmpty,
  parentStableSymbolKey: nonEmpty.nullable().optional(),
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().nonnegative(),
  startRow: z.number().int().nonnegative(),
  endRow: z.number().int().nonnegative(),
  signatureText: z.string().nullable().optional(),
  sourceTextHash: sha256,
  astFingerprint: sha256,
  upstreamNodeId: nonEmpty,
  upstreamSymbolId: nonEmpty.nullable().optional(),
  upstreamChunkId: nonEmpty,
  extractorRevision: nonEmpty,
}).strict().superRefine((value, ctx) => {
  if (value.endByte < value.startByte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endByte'], message: 'endByte must be >= startByte' });
  }
  if (value.endRow < value.startRow) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endRow'], message: 'endRow must be >= startRow' });
  }
});

export type GraphifySymbolProjectionCandidateV1 = z.infer<typeof graphifySymbolProjectionCandidateV1Schema>;

export const graphifyEdgeEvidenceSpanV1Schema = z.object({
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().nonnegative(),
  startRow: z.number().int().nonnegative(),
  endRow: z.number().int().nonnegative(),
}).strict();

export const graphifyEdgeProjectionCandidateV1Schema = z.object({
  schema: z.literal('atlas.graphify-edge-projection-candidate.v1'),
  workspaceId: uuid,
  workspaceRevision: nonEmpty,
  sourceRef: nonEmpty,
  sourceRevision: nonEmpty,
  subjectStableSymbolKey: nonEmpty,
  predicate: nonEmpty,
  objectStableSymbolKey: nonEmpty.nullable().optional(),
  objectSourceRef: nonEmpty.nullable().optional(),
  objectSourceRevision: nonEmpty.nullable().optional(),
  unresolvedTarget: nonEmpty.nullable().optional(),
  evidenceKind: nonEmpty,
  evidenceSpan: graphifyEdgeEvidenceSpanV1Schema,
  confidence: z.number().finite().min(0).max(1),
  evidenceRefs: z.array(nonEmpty).default([]),
  referenceId: nonEmpty,
}).strict().superRefine((value, ctx) => {
  const hasObject = Boolean(value.objectStableSymbolKey);
  const hasUnresolved = Boolean(value.unresolvedTarget);
  if (hasObject === hasUnresolved) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['objectStableSymbolKey'],
      message: 'exactly one of objectStableSymbolKey or unresolvedTarget is required',
    });
  }
  if (hasObject && (!value.objectSourceRef || !value.objectSourceRevision)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['objectSourceRevision'],
      message: 'resolved graph targets require their exact target source reference and revision',
    });
  }
  if (value.evidenceSpan.endByte < value.evidenceSpan.startByte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['evidenceSpan', 'endByte'], message: 'endByte must be >= startByte' });
  }
  if (value.evidenceSpan.endRow < value.evidenceSpan.startRow) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['evidenceSpan', 'endRow'], message: 'endRow must be >= startRow' });
  }
});

export type GraphifyEdgeProjectionCandidateV1 = z.infer<typeof graphifyEdgeProjectionCandidateV1Schema>;

export const graphifySymbolProjectionBatchV1Schema = z.object({
  schema: z.literal('atlas.graphify-symbol-projection-batch.v1'),
  workspaceId: uuid,
  workspaceRevision: nonEmpty,
  fileId: uuid,
  sourceRef: nonEmpty,
  sourceRevision: nonEmpty,
  symbols: z.array(graphifySymbolProjectionCandidateV1Schema),
  edges: z.array(graphifyEdgeProjectionCandidateV1Schema),
  inputChecksum: sha256,
  mapperRevision: nonEmpty,
  canonicalAuthority: z.literal(false),
  writesAllowed: z.literal(false),
}).strict();

export type GraphifySymbolProjectionBatchV1 = z.infer<typeof graphifySymbolProjectionBatchV1Schema>;

export const graphifySymbolProjectionReceiptV1Schema = z.object({
  schema: z.literal('atlas.graphify-symbol-projection-receipt.v1'),
  runId: uuid,
  executionId: uuid,
  workspaceId: uuid,
  workspaceRevision: nonEmpty,
  sourceCount: z.number().int().nonnegative(),
  symbolCandidateCount: z.number().int().nonnegative(),
  symbolInsertedCount: z.number().int().nonnegative(),
  symbolExistingIdenticalCount: z.number().int().nonnegative(),
  edgeCandidateCount: z.number().int().nonnegative(),
  edgeInsertedCount: z.number().int().nonnegative(),
  edgeExternalOrUnresolvedCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  revisionMismatchCount: z.number().int().nonnegative(),
  readbackMismatchCount: z.number().int().nonnegative(),
  inputChecksum: sha256,
  symbolReadbackChecksum: sha256,
  edgeReadbackChecksum: sha256,
  producerRevision: nonEmpty,
  canonicalAuthority: z.literal(false),
}).strict();

export type GraphifySymbolProjectionReceiptV1 = z.infer<typeof graphifySymbolProjectionReceiptV1Schema>;

type StructuralNomination = StructuralExtractionFabricResultV1['symbol_nominations'][number];
type StructuralReferenceFact = StructuralExtractionFabricResultV1['reference_facts'][number];

export type GraphifySymbolProjectionMapInputV1 = {
  workspaceId: string;
  fileId: string;
  workspaceRevision: string;
  sourceRef: string;
  sourceRevision: string;
  fabric: StructuralExtractionFabricResultV1;
  nativeCoordinatesByUpstreamNodeId: Readonly<Record<string, GraphifyNativeSymbolCoordinateV1>>;
  referenceEvidenceByReferenceId: Readonly<Record<string, GraphifyReferenceEvidenceV1>>;
  importResolutionContextBySourceRef?: ReadonlyMap<string, GraphifyImportResolutionContextV1>;
  parentStableSymbolKeyByNominationId?: Readonly<Record<string, string | null>>;
  mapperRevision?: string;
};

export type GraphifyImportResolutionContextV1 = {
  bindingsByLocalName: ReadonlyMap<string, ImportBindingV1>;
  knownSourceRefs: ReadonlySet<string>;
  exportsBySourceRef: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
  sourceRevisionBySourceRef: ReadonlyMap<string, string>;
};

export type GraphifyImportContextSourceV1 = {
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  fabric: StructuralExtractionFabricResultV1;
};

function normalizeGraphifyImportSourceRef(sourceRef: string): string {
  try {
    return normalizeGitSourceRefV1(sourceRef);
  } catch {
    throw new Error('GRAPHIFY_IMPORT_CONTEXT_SOURCE_REF_INVALID');
  }
}

export type GraphifyImportResolutionContextsV1 = {
  schema: 'atlas.graphify-import-resolution-contexts.v1';
  workspaceRevision: string;
  contextsBySourceRef: ReadonlyMap<string, GraphifyImportResolutionContextV1>;
  ambiguousLocalNamesBySourceRef: ReadonlyMap<string, readonly string[]>;
  unparsedImportReferenceIds: string[];
  checksum: string;
  canonicalAuthority: false;
  writesPerformed: false;
};

export function buildGraphifyImportResolutionContextsV1(
  sources: readonly GraphifyImportContextSourceV1[],
): GraphifyImportResolutionContextsV1 {
  if (sources.length === 0) throw new Error('GRAPHIFY_IMPORT_CONTEXT_SOURCES_REQUIRED');
  const workspaceRevisions = new Set(sources.map((source) => source.workspaceRevision));
  if (workspaceRevisions.size !== 1 || !/^sha256:[a-f0-9]{64}$/i.test(sources[0]!.workspaceRevision)) {
    throw new Error('GRAPHIFY_IMPORT_CONTEXT_WORKSPACE_REVISION_MISMATCH');
  }
  const workspaceRevision = sources[0]!.workspaceRevision;
  const bySourceRef = new Map<string, GraphifyImportContextSourceV1>();
  for (const source of sources) {
    const sourceRef = normalizeGraphifyImportSourceRef(source.sourceRef);
    if (!/^sha256:[a-f0-9]{64}$/i.test(source.sourceRevision)) {
      throw new Error(`GRAPHIFY_IMPORT_CONTEXT_SOURCE_REVISION_INVALID:${sourceRef}`);
    }
    if (bySourceRef.has(sourceRef)) throw new Error(`GRAPHIFY_IMPORT_CONTEXT_SOURCE_REF_DUPLICATE:${sourceRef}`);
    if (normalizeGraphifyImportSourceRef(source.fabric.receipt.source_ref) !== sourceRef
      || source.fabric.receipt.source_revision !== source.sourceRevision
      || source.fabric.receipt.workspace_revision !== workspaceRevision) {
      throw new Error(`GRAPHIFY_IMPORT_CONTEXT_FABRIC_BINDING_MISMATCH:${sourceRef}`);
    }
    for (const record of [...source.fabric.symbol_nominations, ...source.fabric.reference_facts]) {
      if (normalizeGraphifyImportSourceRef(record.source_ref) !== sourceRef
        || record.source_revision !== source.sourceRevision
        || record.workspace_revision !== workspaceRevision) {
        throw new Error(`GRAPHIFY_IMPORT_CONTEXT_FACT_BINDING_MISMATCH:${sourceRef}`);
      }
    }
    bySourceRef.set(sourceRef, source);
  }

  const knownSourceRefs = new Set(bySourceRef.keys());
  const sourceRevisionBySourceRef = new Map([...bySourceRef.entries()].map(([ref, source]) => [ref, source.sourceRevision]));
  const exportsBySourceRef = new Map<string, ReadonlyMap<string, readonly string[]>>();
  for (const [sourceRef, source] of bySourceRef) {
    exportsBySourceRef.set(sourceRef, buildExportsForSourceV1(source.fabric.symbol_nominations.map((nomination) => ({
      name: nomination.name,
      symbol_key: nomination.symbol_key,
      parent_route: nomination.parent_route,
    }))));
  }

  const contextsBySourceRef = new Map<string, GraphifyImportResolutionContextV1>();
  const ambiguousLocalNamesBySourceRef = new Map<string, readonly string[]>();
  const unparsedImportReferenceIds: string[] = [];
  for (const [sourceRef, source] of bySourceRef) {
    const bindingsByLocalName = new Map<string, ImportBindingV1>();
    const ambiguous = new Set<string>();
    for (const fact of source.fabric.reference_facts) {
      if (fact.reference_kind !== 'import') continue;
      const parsed = parseImportStatementV1(fact.target_text);
      if (!parsed) {
        unparsedImportReferenceIds.push(fact.reference_id);
        continue;
      }
      for (const binding of parsed.bindings) {
        if (ambiguous.has(binding.localName)) continue;
        const previous = bindingsByLocalName.get(binding.localName);
        if (!previous) {
          bindingsByLocalName.set(binding.localName, binding);
          continue;
        }
        if (JSON.stringify(previous) !== JSON.stringify(binding)) {
          bindingsByLocalName.delete(binding.localName);
          ambiguous.add(binding.localName);
        }
      }
    }
    if (ambiguous.size > 0) ambiguousLocalNamesBySourceRef.set(sourceRef, [...ambiguous].sort());
    contextsBySourceRef.set(sourceRef, { bindingsByLocalName, knownSourceRefs, exportsBySourceRef, sourceRevisionBySourceRef });
  }

  const checksumInput = [...contextsBySourceRef.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([sourceRef, context]) => ({
    sourceRef,
    sourceRevision: bySourceRef.get(sourceRef)!.sourceRevision,
    workspaceRevision,
    imports: [...context.bindingsByLocalName.entries()].sort(([left], [right]) => left.localeCompare(right)),
    ambiguousLocalNames: ambiguousLocalNamesBySourceRef.get(sourceRef) ?? [],
    knownSourceRefs: [...context.knownSourceRefs].sort(),
    exports: [...context.exportsBySourceRef.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([ref, exports]) => ({
      sourceRef: ref,
      names: [...exports.entries()].sort(([left], [right]) => left.localeCompare(right)),
    })),
  }));
  return {
    schema: 'atlas.graphify-import-resolution-contexts.v1',
    workspaceRevision,
    contextsBySourceRef,
    ambiguousLocalNamesBySourceRef,
    unparsedImportReferenceIds: unparsedImportReferenceIds.sort(),
    checksum: checksum({ workspaceRevision, contexts: checksumInput }),
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

function normalizeSourceRef(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function assertSourceBinding(input: GraphifySymbolProjectionMapInputV1): void {
  const expectedSourceRef = normalizeSourceRef(input.sourceRef);
  for (const nomination of input.fabric.symbol_nominations) {
    if (normalizeSourceRef(nomination.source_ref) !== expectedSourceRef) {
      throw new Error(`GRAPHIFY_SYMBOL_SOURCE_REF_MISMATCH:${nomination.nomination_id}`);
    }
    if (nomination.source_revision !== input.sourceRevision) {
      throw new Error(`GRAPHIFY_SYMBOL_SOURCE_REVISION_MISMATCH:${nomination.nomination_id}`);
    }
    if (nomination.workspace_revision !== input.workspaceRevision) {
      throw new Error(`GRAPHIFY_SYMBOL_WORKSPACE_REVISION_MISMATCH:${nomination.nomination_id}`);
    }
  }
  for (const fact of input.fabric.reference_facts) {
    if (normalizeSourceRef(fact.source_ref) !== expectedSourceRef) {
      throw new Error(`GRAPHIFY_EDGE_SOURCE_REF_MISMATCH:${fact.reference_id}`);
    }
    if (fact.source_revision !== input.sourceRevision) {
      throw new Error(`GRAPHIFY_EDGE_SOURCE_REVISION_MISMATCH:${fact.reference_id}`);
    }
    if (fact.workspace_revision !== input.workspaceRevision) {
      throw new Error(`GRAPHIFY_EDGE_WORKSPACE_REVISION_MISMATCH:${fact.reference_id}`);
    }
  }
}

function coordinateFor(
  nomination: StructuralNomination,
  coordinates: Readonly<Record<string, GraphifyNativeSymbolCoordinateV1>>,
): GraphifyNativeSymbolCoordinateV1 {
  const raw = coordinates[nomination.upstream_node_id];
  if (!raw) {
    throw new Error(`GRAPHIFY_SYMBOL_AST_FINGERPRINT_MISSING:${nomination.nomination_id}`);
  }
  const coordinate = graphifyNativeSymbolCoordinateV1Schema.parse(raw);
  if (coordinate.upstreamNodeId !== nomination.upstream_node_id) {
    throw new Error(`GRAPHIFY_SYMBOL_COORDINATE_NODE_MISMATCH:${nomination.nomination_id}`);
  }
  if (coordinate.startByte !== nomination.byte_start || coordinate.endByte !== nomination.byte_end) {
    throw new Error(`GRAPHIFY_SYMBOL_COORDINATE_SPAN_MISMATCH:${nomination.nomination_id}`);
  }
  return coordinate;
}

function toSymbolCandidate(
  input: GraphifySymbolProjectionMapInputV1,
  nomination: StructuralNomination,
): GraphifySymbolProjectionCandidateV1 {
  const coordinate = coordinateFor(nomination, input.nativeCoordinatesByUpstreamNodeId);
  return graphifySymbolProjectionCandidateV1Schema.parse({
    schema: 'atlas.graphify-symbol-projection-candidate.v1',
    fileId: input.fileId,
    workspaceRevision: input.workspaceRevision,
    sourceRef: normalizeSourceRef(input.sourceRef),
    sourceRevision: input.sourceRevision,
    stableSymbolKey: nomination.symbol_key,
    symbolKind: nomination.kind,
    qualifiedName: nomination.qualified_name,
    parentStableSymbolKey: input.parentStableSymbolKeyByNominationId?.[nomination.nomination_id] ?? null,
    startByte: coordinate.startByte,
    endByte: coordinate.endByte,
    startRow: coordinate.startRow,
    endRow: coordinate.endRow,
    signatureText: nomination.signature_normalized ?? null,
    sourceTextHash: nomination.declaration_hash,
    astFingerprint: coordinate.astFingerprint,
    upstreamNodeId: nomination.upstream_node_id,
    upstreamSymbolId: nomination.upstream_symbol_id ?? null,
    upstreamChunkId: nomination.upstream_chunk_id,
    extractorRevision: nomination.extractor_revision,
  });
}

function factSubjectKey(
  fact: StructuralReferenceFact,
  byUpstreamNodeId: ReadonlyMap<string, string>,
): string {
  const key = byUpstreamNodeId.get(fact.upstream_source_node_id);
  if (!key) throw new Error(`GRAPHIFY_EDGE_SUBJECT_SYMBOL_UNMAPPED:${fact.reference_id}`);
  return key;
}

function referenceEvidenceFor(
  fact: StructuralReferenceFact,
  evidence: Readonly<Record<string, GraphifyReferenceEvidenceV1>>,
): GraphifyReferenceEvidenceV1 {
  const raw = evidence[fact.reference_id];
  if (!raw) throw new Error(`GRAPHIFY_EDGE_EVIDENCE_SPAN_MISSING:${fact.reference_id}`);
  const parsed = graphifyReferenceEvidenceV1Schema.parse(raw);
  if (parsed.referenceId !== fact.reference_id) {
    throw new Error(`GRAPHIFY_EDGE_EVIDENCE_REFERENCE_MISMATCH:${fact.reference_id}`);
  }
  return parsed;
}

function toEdgeCandidate(
  input: GraphifySymbolProjectionMapInputV1,
  fact: StructuralReferenceFact,
  byUpstreamNodeId: ReadonlyMap<string, string>,
): GraphifyEdgeProjectionCandidateV1 {
  const evidence = referenceEvidenceFor(fact, input.referenceEvidenceByReferenceId);
  const nativeTargetStableSymbolKey = fact.upstream_target_node_id
    ? byUpstreamNodeId.get(fact.upstream_target_node_id) ?? null
    : null;
  const importContext = input.importResolutionContextBySourceRef?.get(normalizeSourceRef(input.sourceRef));
  const importTarget = !nativeTargetStableSymbolKey && importContext
    ? resolveReferenceTargetV1({
      targetText: fact.target_text,
      fromSourceRef: normalizeSourceRef(input.sourceRef),
      ...importContext,
    })
    : null;
  const importTargetRevision = importTarget?.status === 'RESOLVED_SYMBOL' && importTarget.targetSourceRef
    ? importContext?.sourceRevisionBySourceRef.get(importTarget.targetSourceRef) ?? null
    : null;
  const qualifiedImportTarget = importTarget?.status === 'RESOLVED_SYMBOL'
    && importTarget.targetSourceRef
    && importTargetRevision
    && /^sha256:[a-f0-9]{64}$/i.test(importTargetRevision);
  const objectStableSymbolKey = nativeTargetStableSymbolKey
    ?? (qualifiedImportTarget ? importTarget.targetSymbolKey : null);
  const objectSourceRef = nativeTargetStableSymbolKey
    ? normalizeSourceRef(input.sourceRef)
    : qualifiedImportTarget ? importTarget.targetSourceRef : null;
  const objectSourceRevision = nativeTargetStableSymbolKey
    ? input.sourceRevision
    : qualifiedImportTarget ? importTargetRevision : null;

  return graphifyEdgeProjectionCandidateV1Schema.parse({
    schema: 'atlas.graphify-edge-projection-candidate.v1',
    workspaceId: input.workspaceId,
    workspaceRevision: input.workspaceRevision,
    sourceRef: normalizeSourceRef(input.sourceRef),
    sourceRevision: input.sourceRevision,
    subjectStableSymbolKey: factSubjectKey(fact, byUpstreamNodeId),
    predicate: fact.reference_kind,
    objectStableSymbolKey,
    objectSourceRef,
    objectSourceRevision,
    unresolvedTarget: objectStableSymbolKey ? null : fact.target_text,
    evidenceKind: evidence.evidenceKind,
    evidenceSpan: {
      startByte: evidence.startByte,
      endByte: evidence.endByte,
      startRow: evidence.startRow,
      endRow: evidence.endRow,
    },
    confidence: evidence.confidence,
    evidenceRefs: evidence.evidenceRefs,
    referenceId: fact.reference_id,
  });
}

/**
 * GSP-2 pure mapper.
 *
 * This function never writes, opens a transaction, infers canonical authority,
 * creates embeddings, or manufactures missing structural evidence. Missing AST
 * fingerprints, row coordinates, reference spans, or source/revision parity are
 * hard failures that a later preflight can surface as explicit BLOCKED states.
 */
export function mapStructuralFabricToGraphifyProjectionV1(
  input: GraphifySymbolProjectionMapInputV1,
): GraphifySymbolProjectionBatchV1 {
  const workspaceId = uuid.parse(input.workspaceId);
  const fileId = uuid.parse(input.fileId);
  const workspaceRevision = nonEmpty.parse(input.workspaceRevision);
  const sourceRef = normalizeSourceRef(nonEmpty.parse(input.sourceRef));
  const sourceRevision = nonEmpty.parse(input.sourceRevision);
  const mapperRevision = nonEmpty.parse(input.mapperRevision ?? GRAPHIFY_SYMBOL_PROJECTION_MAPPER_REVISION_V1);

  assertSourceBinding({ ...input, workspaceId, fileId, workspaceRevision, sourceRef, sourceRevision });

  const symbols = input.fabric.symbol_nominations
    .map((nomination) => toSymbolCandidate(
      { ...input, workspaceId, fileId, workspaceRevision, sourceRef, sourceRevision, mapperRevision },
      nomination,
    ))
    .sort((a, b) => a.startByte - b.startByte || a.stableSymbolKey.localeCompare(b.stableSymbolKey));

  const duplicateKeys = new Set<string>();
  const seen = new Set<string>();
  for (const symbol of symbols) {
    const key = `${symbol.fileId}\0${symbol.stableSymbolKey}`;
    if (seen.has(key)) duplicateKeys.add(key);
    seen.add(key);
  }
  if (duplicateKeys.size > 0) {
    throw new Error(`GRAPHIFY_SYMBOL_DUPLICATE_STABLE_KEY:${duplicateKeys.size}`);
  }

  const byUpstreamNodeId = new Map<string, string>();
  for (const nomination of input.fabric.symbol_nominations) {
    const previous = byUpstreamNodeId.get(nomination.upstream_node_id);
    if (previous && previous !== nomination.symbol_key) {
      throw new Error(`GRAPHIFY_SYMBOL_UPSTREAM_NODE_AMBIGUOUS:${nomination.upstream_node_id}`);
    }
    byUpstreamNodeId.set(nomination.upstream_node_id, nomination.symbol_key);
  }

  const edges = input.fabric.reference_facts
    .map((fact) => toEdgeCandidate(
      { ...input, workspaceId, fileId, workspaceRevision, sourceRef, sourceRevision, mapperRevision },
      fact,
      byUpstreamNodeId,
    ))
    .sort((a, b) =>
      a.subjectStableSymbolKey.localeCompare(b.subjectStableSymbolKey)
      || a.predicate.localeCompare(b.predicate)
      || (a.objectStableSymbolKey ?? a.unresolvedTarget ?? '').localeCompare(b.objectStableSymbolKey ?? b.unresolvedTarget ?? '')
      || a.referenceId.localeCompare(b.referenceId));

  const inputChecksum = checksum({
    workspaceId,
    workspaceRevision,
    fileId,
    sourceRef,
    sourceRevision,
    mapperRevision,
    symbols,
    edges,
  });

  return graphifySymbolProjectionBatchV1Schema.parse({
    schema: 'atlas.graphify-symbol-projection-batch.v1',
    workspaceId,
    workspaceRevision,
    fileId,
    sourceRef,
    sourceRevision,
    symbols,
    edges,
    inputChecksum,
    mapperRevision,
    canonicalAuthority: false,
    writesAllowed: false,
  });
}
