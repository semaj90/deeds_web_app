/**
 * GSP-5 groundwork: deterministic replay identity for `graphify_edges` (the canonical structural-edge owner).
 *
 * Pure and DB-free. It does not write, does not own a table, and does not replace the surrogate `edge_id`; it derives the
 * SEMANTIC key a future unique arbiter would be built on, and classifies candidates that must stay outside the admitted
 * edge set. Layers (do not blur): graphify_edges = structural fact owner; PacketIncidenceLineageV1 = derived lineage
 * contract; HyperRAG = reader. Excluded from the key: edge_id, timestamps, confidence, evidenceRefs order, insertion order.
 */
import { createHash } from 'node:crypto';
import type { GraphifyEdgeProjectionCandidateV1 } from './graphify-symbol-projection-v1.js';

export const GRAPHIFY_EDGE_REPLAY_KEY_SCHEMA_V1 = 'atlas.graphify-edge-replay-key.v1' as const;

export type GraphifyEdgeAdmissionV1 =
  | 'ADMITTED'
  | 'UNRESOLVED_SOURCE'
  | 'UNRESOLVED_TARGET'
  | 'SOURCE_REVISION_UNBOUND'
  | 'TARGET_REVISION_UNBOUND';

export interface GraphifyEdgeReplayContextV1 {
  /** The one immutable graph snapshot these candidates belong to (GraphRevisionSnapshotV1.graphRevision). */
  graphRevision: string;
  producerRevision: string;
  /**
   * Source revision of the file that owns the OBJECT symbol. For a same-file edge pass the candidate's own
   * sourceRevision explicitly; null/undefined means the target revision is unknown and the edge is not admitted.
   */
  targetSourceRevisionOf?: (objectStableSymbolKey: string) => string | null | undefined;
}

const SHA256_REVISION = /^sha256:[a-f0-9]{64}$/;
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export interface GraphifyEdgeReplayVerdictV1 {
  admission: GraphifyEdgeAdmissionV1;
  /** Present only when ADMITTED: `sha256:<hex>` over the canonical semantic tuple. */
  edgeKey: string | null;
  /** Present only when ADMITTED: checksum of the non-key payload (confidence, evidence refs) for drift detection. */
  payloadChecksum: string | null;
  targetSourceRevision: string | null;
}

/** Classify one extractor candidate and, only when admitted, derive its replay key. No fuzzy fallback. */
export function deriveGraphifyEdgeReplayVerdictV1(
  edge: GraphifyEdgeProjectionCandidateV1,
  ctx: GraphifyEdgeReplayContextV1,
): GraphifyEdgeReplayVerdictV1 {
  const reject = (admission: GraphifyEdgeAdmissionV1, targetSourceRevision: string | null = null): GraphifyEdgeReplayVerdictV1 => ({
    admission, edgeKey: null, payloadChecksum: null, targetSourceRevision,
  });
  if (!nonEmpty(ctx.graphRevision) || !nonEmpty(ctx.producerRevision)) throw new Error('GRAPHIFY_EDGE_REPLAY_CONTEXT_INVALID');
  if (!nonEmpty(edge.subjectStableSymbolKey)) return reject('UNRESOLVED_SOURCE');
  if (!SHA256_REVISION.test(edge.sourceRevision)) return reject('SOURCE_REVISION_UNBOUND');
  const object = edge.objectStableSymbolKey?.trim() ? edge.objectStableSymbolKey : null;
  if (!object) return reject('UNRESOLVED_TARGET');
  const targetRevision = ctx.targetSourceRevisionOf?.(object) ?? null;
  if (!targetRevision || !SHA256_REVISION.test(targetRevision)) return reject('TARGET_REVISION_UNBOUND');

  const tuple = {
    schema: GRAPHIFY_EDGE_REPLAY_KEY_SCHEMA_V1,
    workspaceRevision: edge.workspaceRevision,
    graphRevision: ctx.graphRevision,
    subject: edge.subjectStableSymbolKey,
    predicate: edge.predicate,
    object,
    sourceRevision: edge.sourceRevision,
    targetSourceRevision: targetRevision,
    evidenceKind: edge.evidenceKind,
    evidenceSpan: edge.evidenceSpan,
    producerRevision: ctx.producerRevision,
  };
  return {
    admission: 'ADMITTED',
    edgeKey: `sha256:${sha256(canonicalJson(tuple))}`,
    payloadChecksum: `sha256:${sha256(canonicalJson({ confidence: edge.confidence, evidenceRefs: [...new Set(edge.evidenceRefs)].sort() }))}`,
    targetSourceRevision: targetRevision,
  };
}

export interface GraphifyEdgeReplayPlanV1 {
  admitted: { edge: GraphifyEdgeProjectionCandidateV1; edgeKey: string; payloadChecksum: string; targetSourceRevision: string }[];
  rejected: { edge: GraphifyEdgeProjectionCandidateV1; admission: Exclude<GraphifyEdgeAdmissionV1, 'ADMITTED'> }[];
  /** Same edgeKey with a different payloadChecksum: a replay would silently change a fact, so it is surfaced, never merged. */
  conflicts: { edgeKey: string; payloadChecksums: string[] }[];
  counts: Record<GraphifyEdgeAdmissionV1, number> & { total: number; duplicatesCollapsed: number };
  /** Order-independent: sha256 over the sorted admitted edge keys and their payload checksums. */
  planChecksum: string;
}

/** Plan a batch deterministically: input order never changes the admitted set, the conflicts or the planChecksum. */
export function planGraphifyEdgeReplayV1(
  edges: readonly GraphifyEdgeProjectionCandidateV1[],
  ctx: GraphifyEdgeReplayContextV1,
): GraphifyEdgeReplayPlanV1 {
  const counts = { ADMITTED: 0, UNRESOLVED_SOURCE: 0, UNRESOLVED_TARGET: 0, SOURCE_REVISION_UNBOUND: 0, TARGET_REVISION_UNBOUND: 0, total: edges.length, duplicatesCollapsed: 0 };
  const byKey = new Map<string, GraphifyEdgeReplayPlanV1['admitted'][number]>();
  const payloadsByKey = new Map<string, Set<string>>();
  const rejected: GraphifyEdgeReplayPlanV1['rejected'] = [];
  for (const edge of edges) {
    const v = deriveGraphifyEdgeReplayVerdictV1(edge, ctx);
    counts[v.admission] += 1;
    if (v.admission !== 'ADMITTED') {
      rejected.push({ edge, admission: v.admission });
      continue;
    }
    const set = payloadsByKey.get(v.edgeKey!) ?? new Set<string>();
    set.add(v.payloadChecksum!);
    payloadsByKey.set(v.edgeKey!, set);
    if (byKey.has(v.edgeKey!)) counts.duplicatesCollapsed += 1;
    else byKey.set(v.edgeKey!, { edge, edgeKey: v.edgeKey!, payloadChecksum: v.payloadChecksum!, targetSourceRevision: v.targetSourceRevision! });
  }
  const conflicts = [...payloadsByKey.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([edgeKey, set]) => ({ edgeKey, payloadChecksums: [...set].sort() }))
    .sort((a, b) => a.edgeKey.localeCompare(b.edgeKey));
  const conflicted = new Set(conflicts.map((c) => c.edgeKey));
  const admitted = [...byKey.values()].filter((a) => !conflicted.has(a.edgeKey)).sort((a, b) => a.edgeKey.localeCompare(b.edgeKey));
  const planChecksum = `sha256:${sha256(canonicalJson({
    admitted: admitted.map((a) => [a.edgeKey, a.payloadChecksum]),
    conflicts,
  }))}`;
  return { admitted, rejected, conflicts, counts, planChecksum };
}
