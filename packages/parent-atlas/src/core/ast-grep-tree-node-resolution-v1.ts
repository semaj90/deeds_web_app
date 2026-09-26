import { z } from 'zod';
import { astGrepObservationSchema, type AstGrepObservationV1 } from './structural-symbol.js';

/**
 * WFU-04: revision-qualified ast-grep evidence -> canonical treeNodeId, deterministic and fail-closed.
 *
 * Ownership: AstGrepObservationV1 is NONCANONICAL structural evidence. Canonical tree-occurrence identity belongs to the AST / tree-node owner
 * (`atlas_ast_nodes` / the revision-qualified AST snapshot). `atlas_callable_search` is a rebuildable downstream projection: it may corroborate a
 * resolution but never resolves one. This module is the ONE pure resolver; the AST symbol materializer's RESOLVED/UNRESOLVED/AMBIGUOUS bridge
 * (scripts/atlas/materialize-ast-symbol-versions.mjs) uses the same rules (source ref + revision + span [+ upstream id], 0/1/>1 candidates).
 *
 * Identity is exact, not probabilistic: no confidence, no name/symbol matching, no "best overlap" choice, never the first of several candidates.
 * NOTE: `adaptAstGrepMatches` fills `upstream_node_id` from its best-overlap chunk, so an upstream id on an observation is treated as a CLAIM that
 * must (a) exist in the candidate set for the same ref+revision and (b) have a span that contains the observation; a contradiction is a
 * LINEAGE_MISMATCH, never a fall-through to a weaker rule.
 */

export const AST_TREE_NODE_RESOLUTION_STATUSES = ['RESOLVED', 'UNRESOLVED', 'AMBIGUOUS', 'LINEAGE_MISMATCH'] as const;
export type AstTreeNodeResolutionStatus = (typeof AST_TREE_NODE_RESOLUTION_STATUSES)[number];
export type AstTreeNodeResolutionBasis = 'UPSTREAM_NODE_ID' | 'EXACT_SPAN' | 'UNIQUE_CONTAINING_NODE';

export type AstTreeNodeResolutionReason =
  | 'RESOLVED'
  | 'MISSING_OR_INVALID_SOURCE_REVISION'
  | 'NO_CANDIDATES_FOR_SOURCE_REF'
  | 'SOURCE_REVISION_MISMATCH'
  | 'UPSTREAM_NODE_ID_NOT_IN_CANDIDATES'
  | 'UPSTREAM_NODE_ID_SPAN_CONFLICT'
  | 'DUPLICATE_UPSTREAM_NODE_ID'
  | 'MULTIPLE_NODES_WITH_SAME_SPAN'
  | 'MULTIPLE_CONTAINING_NODES'
  | 'NO_NODE_MATCHES_SPAN';

/** One revision-qualified AST node (a row of the frozen AST snapshot / atlas_ast_nodes). */
export const astTreeNodeCandidateSchema = z.object({
  treeNodeId: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().positive(),
  upstreamNodeId: z.string().min(1).nullable().optional(),
}).strict().superRefine((row, ctx) => {
  if (row.endByte <= row.startByte) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endByte'], message: 'endByte must be greater than startByte' });
});
export type AstTreeNodeCandidateV1 = z.infer<typeof astTreeNodeCandidateSchema>;

export const astGrepObservationTreeNodeResolutionSchema = z.object({
  schema: z.literal('atlas.ast-grep-observation-tree-node-resolution.v1'),
  observationId: z.string().min(1),
  status: z.enum(AST_TREE_NODE_RESOLUTION_STATUSES),
  treeNodeId: z.string().min(1).nullable(),
  candidateCount: z.number().int().nonnegative(),
  resolutionBasis: z.enum(['UPSTREAM_NODE_ID', 'EXACT_SPAN', 'UNIQUE_CONTAINING_NODE']).nullable(),
  reason: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string(),
  candidateTreeNodeIds: z.array(z.string().min(1)),
  canonicalAuthority: z.literal(false),
}).strict().superRefine((row, ctx) => {
  if (row.status === 'RESOLVED' && (!row.treeNodeId || !row.resolutionBasis)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['treeNodeId'], message: 'RESOLVED requires treeNodeId and resolutionBasis' });
  }
  if (row.status !== 'RESOLVED' && (row.treeNodeId !== null || row.resolutionBasis !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['treeNodeId'], message: 'non-RESOLVED results cannot claim an identity' });
  }
});
export type AstGrepObservationTreeNodeResolutionV1 = z.infer<typeof astGrepObservationTreeNodeResolutionSchema>;

/**
 * Same normalization the AST bridge already uses (`canonicalAstSourceRef` in materialize-ast-symbol-versions.mjs): backslashes -> '/', and a leading
 * `sveltekit-frontend/` is dropped. Case is preserved (no lowercasing). LIMITATION: the prefix strip loses root identity if a repo holds both
 * `x` and `sveltekit-frontend/x`; such a collision surfaces as >1 candidates (AMBIGUOUS), it is never silently disambiguated.
 */
export function canonicalAstSourceRefV1(value: string): string {
  return String(value ?? '').replaceAll('\\', '/').replace(/^sveltekit-frontend\//, '');
}

const SHA256_HEX = /^[a-f0-9]{64}$/;
/** `sha256:<hex>` and bare `<hex>` are the only accepted equivalent encodings (as in the materializer's `comparableRevision`); anything else is invalid. */
export function comparableSourceRevisionV1(value: string | null | undefined): string | null {
  const stripped = String(value ?? '').replace(/^sha256:/, '');
  return SHA256_HEX.test(stripped) ? stripped : null;
}

type ObservationEvidence = Pick<AstGrepObservationV1, 'observation_id' | 'source_ref' | 'source_revision' | 'byte_start' | 'byte_end' | 'upstream_node_id'>;

function result(
  obs: ObservationEvidence,
  status: AstTreeNodeResolutionStatus,
  reason: AstTreeNodeResolutionReason,
  ids: readonly string[],
  chosen: { id: string; basis: AstTreeNodeResolutionBasis } | null,
): AstGrepObservationTreeNodeResolutionV1 {
  return astGrepObservationTreeNodeResolutionSchema.parse({
    schema: 'atlas.ast-grep-observation-tree-node-resolution.v1',
    observationId: obs.observation_id,
    status,
    treeNodeId: chosen?.id ?? null,
    candidateCount: ids.length,
    resolutionBasis: chosen?.basis ?? null,
    reason,
    sourceRef: obs.source_ref,
    sourceRevision: obs.source_revision ?? '',
    candidateTreeNodeIds: [...ids].sort(),
    canonicalAuthority: false,
  });
}

/**
 * Resolve ONE observation against ONE frozen revision-qualified candidate set. Precedence (strongest evidence first, no fall-through past a failed
 * explicit upstream id): source ref -> source revision -> upstream_node_id -> exact span -> unique containing node (if admitted).
 * Spans are UTF-8 byte offsets on both sides. `admitContainment` freezes whether the UNIQUE_CONTAINING_NODE rule is allowed (default true).
 */
export function resolveAstGrepObservationTreeNodeV1(
  observationInput: ObservationEvidence,
  candidateInput: readonly AstTreeNodeCandidateV1[],
  options: { admitContainment?: boolean } = {},
): AstGrepObservationTreeNodeResolutionV1 {
  const obs = observationInput;
  const admitContainment = options.admitContainment ?? true;
  const wantRevision = comparableSourceRevisionV1(obs.source_revision);
  if (wantRevision === null) return result(obs, 'LINEAGE_MISMATCH', 'MISSING_OR_INVALID_SOURCE_REVISION', [], null);

  const wantRef = canonicalAstSourceRefV1(obs.source_ref);
  const sameRef = candidateInput.filter((c) => canonicalAstSourceRefV1(c.sourceRef) === wantRef);
  if (sameRef.length === 0) return result(obs, 'UNRESOLVED', 'NO_CANDIDATES_FOR_SOURCE_REF', [], null);

  const pool = sameRef.filter((c) => comparableSourceRevisionV1(c.sourceRevision) === wantRevision);
  if (pool.length === 0) return result(obs, 'LINEAGE_MISMATCH', 'SOURCE_REVISION_MISMATCH', [], null);

  const contains = (c: AstTreeNodeCandidateV1) => c.startByte <= obs.byte_start && obs.byte_end <= c.endByte;

  if (obs.upstream_node_id) {
    const byId = pool.filter((c) => c.upstreamNodeId === obs.upstream_node_id);
    const ids = byId.map((c) => c.treeNodeId);
    if (byId.length === 0) return result(obs, 'UNRESOLVED', 'UPSTREAM_NODE_ID_NOT_IN_CANDIDATES', [], null);
    if (byId.length > 1) return result(obs, 'AMBIGUOUS', 'DUPLICATE_UPSTREAM_NODE_ID', ids, null);
    if (!contains(byId[0]!)) return result(obs, 'LINEAGE_MISMATCH', 'UPSTREAM_NODE_ID_SPAN_CONFLICT', ids, null);
    return result(obs, 'RESOLVED', 'RESOLVED', ids, { id: byId[0]!.treeNodeId, basis: 'UPSTREAM_NODE_ID' });
  }

  const exact = pool.filter((c) => c.startByte === obs.byte_start && c.endByte === obs.byte_end);
  if (exact.length === 1) return result(obs, 'RESOLVED', 'RESOLVED', [exact[0]!.treeNodeId], { id: exact[0]!.treeNodeId, basis: 'EXACT_SPAN' });
  if (exact.length > 1) return result(obs, 'AMBIGUOUS', 'MULTIPLE_NODES_WITH_SAME_SPAN', exact.map((c) => c.treeNodeId), null);

  if (admitContainment) {
    const containing = pool.filter(contains);
    if (containing.length === 1) {
      return result(obs, 'RESOLVED', 'RESOLVED', [containing[0]!.treeNodeId], { id: containing[0]!.treeNodeId, basis: 'UNIQUE_CONTAINING_NODE' });
    }
    if (containing.length > 1) return result(obs, 'AMBIGUOUS', 'MULTIPLE_CONTAINING_NODES', containing.map((c) => c.treeNodeId), null);
  }
  return result(obs, 'UNRESOLVED', 'NO_NODE_MATCHES_SPAN', [], null);
}

/** Batch form: parses each observation with the shared schema and resolves it against the same frozen candidate set. Order-preserving, deterministic. */
export function resolveAstGrepObservationTreeNodesV1(input: {
  observations: readonly AstGrepObservationV1[];
  candidates: readonly AstTreeNodeCandidateV1[];
  admitContainment?: boolean;
}): AstGrepObservationTreeNodeResolutionV1[] {
  const candidates = input.candidates.map((row) => astTreeNodeCandidateSchema.parse(row));
  return input.observations.map((row) =>
    resolveAstGrepObservationTreeNodeV1(astGrepObservationSchema.parse(row), candidates, { admitContainment: input.admitContainment }));
}

/* ---------------------------------------------------------------------------------------------------------------------------------------------
 * Backward-compatible exact-span wrapper (the earlier in-flight API, kept so its callers/tests keep working). It is NOT a second algorithm: it maps
 * the legacy candidate shape onto the core resolver with containment disabled and re-labels the outcome with the legacy status names.
 * ------------------------------------------------------------------------------------------------------------------------------------------- */

const treeNodeCandidateV1Schema = z.object({
  tree_node_id: z.string().min(1),
  relative_path: z.string().min(1),
  source_revision: z.string().min(1),
  start_byte: z.number().int().nonnegative(),
  end_byte: z.number().int().positive(),
}).strict().superRefine((row, ctx) => {
  if (row.end_byte <= row.start_byte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end_byte'], message: 'end_byte must be greater than start_byte' });
  }
});

export const astGrepTreeNodeResolutionV1Schema = z.object({
  schema: z.literal('atlas.ast-grep-tree-node-resolution.v1'),
  observationId: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  byteStart: z.number().int().nonnegative(),
  byteEnd: z.number().int().positive(),
  status: z.enum(['EXACT', 'PATH_MISMATCH', 'REVISION_MISMATCH', 'SPAN_MISMATCH', 'AMBIGUOUS']),
  treeNodeId: z.string().min(1).optional(),
  candidateTreeNodeIds: z.array(z.string().min(1)),
  canonicalAuthority: z.literal(false),
}).strict().superRefine((result, ctx) => {
  if (result.status === 'EXACT' && !result.treeNodeId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['treeNodeId'], message: 'EXACT requires a tree node id' });
  }
  if (result.status !== 'EXACT' && result.treeNodeId !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['treeNodeId'], message: 'non-exact results cannot claim a tree node id' });
  }
});

export type AstGrepTreeNodeResolutionV1 = z.infer<typeof astGrepTreeNodeResolutionV1Schema>;
export type TreeNodeCandidateV1 = z.infer<typeof treeNodeCandidateV1Schema>;

const LEGACY_STATUS: Record<AstTreeNodeResolutionReason, AstGrepTreeNodeResolutionV1['status']> = {
  RESOLVED: 'EXACT',
  MISSING_OR_INVALID_SOURCE_REVISION: 'REVISION_MISMATCH',
  NO_CANDIDATES_FOR_SOURCE_REF: 'PATH_MISMATCH',
  SOURCE_REVISION_MISMATCH: 'REVISION_MISMATCH',
  UPSTREAM_NODE_ID_NOT_IN_CANDIDATES: 'SPAN_MISMATCH',
  UPSTREAM_NODE_ID_SPAN_CONFLICT: 'SPAN_MISMATCH',
  DUPLICATE_UPSTREAM_NODE_ID: 'AMBIGUOUS',
  MULTIPLE_NODES_WITH_SAME_SPAN: 'AMBIGUOUS',
  MULTIPLE_CONTAINING_NODES: 'AMBIGUOUS',
  NO_NODE_MATCHES_SPAN: 'SPAN_MISMATCH',
};

/** Exact path + source-revision + UTF-8-span join (legacy names); never fuzzy-matches identity. */
export function resolveAstGrepTreeNodeIdsV1(input: {
  observations: readonly AstGrepObservationV1[];
  candidates: readonly TreeNodeCandidateV1[];
}): AstGrepTreeNodeResolutionV1[] {
  const candidates = input.candidates.map((row) => treeNodeCandidateV1Schema.parse(row)).map((row): AstTreeNodeCandidateV1 => ({
    treeNodeId: row.tree_node_id, sourceRef: row.relative_path, sourceRevision: row.source_revision, startByte: row.start_byte, endByte: row.end_byte,
  }));
  return input.observations.map((row) => {
    const observation = astGrepObservationSchema.parse(row);
    // The legacy contract is span-only: ignore any upstream id so its behavior is unchanged.
    const core = resolveAstGrepObservationTreeNodeV1({ ...observation, upstream_node_id: undefined }, candidates, { admitContainment: false });
    const status = LEGACY_STATUS[core.reason as AstTreeNodeResolutionReason];
    return astGrepTreeNodeResolutionV1Schema.parse({
      schema: 'atlas.ast-grep-tree-node-resolution.v1',
      observationId: observation.observation_id,
      sourceRef: observation.source_ref,
      sourceRevision: observation.source_revision,
      byteStart: observation.byte_start,
      byteEnd: observation.byte_end,
      status,
      ...(status === 'EXACT' ? { treeNodeId: core.treeNodeId! } : {}),
      candidateTreeNodeIds: status === 'EXACT' || status === 'AMBIGUOUS' ? core.candidateTreeNodeIds : [],
      canonicalAuthority: false,
    });
  });
}
