/**
 * GSP-5 groundwork: deterministic replay identity for `graphify_edges` (the canonical structural-edge owner).
 *
 * Pure and DB-free. It does not write, does not own a table, and does not replace the surrogate `edge_id`; it derives the
 * SEMANTIC key a future unique arbiter would be built on, and classifies candidates that must stay outside the admitted
 * edge set. Layers (do not blur): graphify_edges = structural fact owner; PacketIncidenceLineageV1 = derived lineage
 * contract; HyperRAG = reader.
 *
 * Edge identity != evidence identity. The key covers WHAT is asserted (endpoints, predicate, revisions, producer).
 * Evidence (kind, span, confidence, refs) is carried separately and hashed into `evidenceChecksum`, so the same fact seen
 * at several call sites is ONE logical edge with several evidence entries. Excluded from the key: edge_id, timestamps,
 * confidence, evidence, insertion order.
 */
import { createHash } from 'node:crypto';
import type { GraphifyEdgeProjectionCandidateV1 } from './graphify-symbol-projection-v1.js';

export const GRAPHIFY_EDGE_REPLAY_KEY_SCHEMA_V1 = 'atlas.graphify-edge-replay-key.v2' as const;

export type GraphifyEdgeAdmissionV1 =
  | 'ADMITTED'
  | 'UNRESOLVED_SOURCE'
  | 'UNRESOLVED_TARGET'
  | 'SOURCE_REVISION_UNBOUND'
  | 'TARGET_REVISION_UNBOUND'
  | 'WORKSPACE_REVISION_MISMATCH'
  | 'EVIDENCE_UNBOUND';

export interface GraphifyEdgeReplayContextV1 {
  /** The admitted workspace snapshot key (GraphRevisionSnapshotV1.workspaceRevisionKey); candidates must carry the same. */
  workspaceRevisionKey: string;
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

export interface GraphifyEdgeEvidenceEntryV1 {
  evidenceKind: string;
  evidenceSpan: GraphifyEdgeProjectionCandidateV1['evidenceSpan'];
  confidence: number;
  evidenceRefs: string[];
}

export function evidenceEntryOfV1(edge: GraphifyEdgeProjectionCandidateV1): GraphifyEdgeEvidenceEntryV1 {
  return {
    evidenceKind: edge.evidenceKind,
    evidenceSpan: edge.evidenceSpan,
    confidence: edge.confidence,
    evidenceRefs: [...new Set(edge.evidenceRefs)].sort(),
  };
}

/** Checksum of an evidence SET: order- and duplicate-independent. */
export function evidenceChecksumV1(entries: readonly GraphifyEdgeEvidenceEntryV1[]): string {
  const unique = new Map(entries.map((e) => [canonicalJson(e), e]));
  return `sha256:${sha256(canonicalJson([...unique.keys()].sort()))}`;
}

export interface GraphifyEdgeReplayVerdictV1 {
  admission: GraphifyEdgeAdmissionV1;
  /** Present only when ADMITTED: `sha256:<hex>` over the canonical semantic tuple (no evidence). */
  edgeKey: string | null;
  targetSourceRevision: string | null;
}

/** Classify one extractor candidate and, only when admitted, derive its replay key. No fuzzy fallback. */
export function deriveGraphifyEdgeReplayVerdictV1(
  edge: GraphifyEdgeProjectionCandidateV1,
  ctx: GraphifyEdgeReplayContextV1,
): GraphifyEdgeReplayVerdictV1 {
  const reject = (admission: GraphifyEdgeAdmissionV1, targetSourceRevision: string | null = null): GraphifyEdgeReplayVerdictV1 => ({
    admission, edgeKey: null, targetSourceRevision,
  });
  if (!nonEmpty(ctx.workspaceRevisionKey) || !nonEmpty(ctx.graphRevision) || !nonEmpty(ctx.producerRevision)) {
    throw new Error('GRAPHIFY_EDGE_REPLAY_CONTEXT_INVALID');
  }
  if (!nonEmpty(edge.subjectStableSymbolKey)) return reject('UNRESOLVED_SOURCE');
  if (!SHA256_REVISION.test(edge.sourceRevision)) return reject('SOURCE_REVISION_UNBOUND');
  const object = edge.objectStableSymbolKey?.trim() ? edge.objectStableSymbolKey : null;
  if (!object) return reject('UNRESOLVED_TARGET');
  const targetRevision = ctx.targetSourceRevisionOf?.(object) ?? null;
  if (!targetRevision || !SHA256_REVISION.test(targetRevision)) return reject('TARGET_REVISION_UNBOUND');
  if (edge.workspaceRevision !== ctx.workspaceRevisionKey) return reject('WORKSPACE_REVISION_MISMATCH', targetRevision);
  if (!edge.evidenceRefs.some(nonEmpty) && !(edge.evidenceSpan.endByte > edge.evidenceSpan.startByte)) return reject('EVIDENCE_UNBOUND', targetRevision);

  const tuple = {
    schema: GRAPHIFY_EDGE_REPLAY_KEY_SCHEMA_V1,
    workspaceRevisionKey: ctx.workspaceRevisionKey,
    graphRevision: ctx.graphRevision,
    subject: edge.subjectStableSymbolKey,
    predicate: edge.predicate,
    object,
    sourceRevision: edge.sourceRevision,
    targetSourceRevision: targetRevision,
    producerRevision: ctx.producerRevision,
  };
  return { admission: 'ADMITTED', edgeKey: `sha256:${sha256(canonicalJson(tuple))}`, targetSourceRevision: targetRevision };
}

export interface GraphifyAdmittedEdgeV1 {
  edgeKey: string;
  subject: string;
  predicate: string;
  object: string;
  sourceRevision: string;
  targetSourceRevision: string;
  /** Sorted, de-duplicated evidence entries for this logical edge (several call sites = one edge, many entries). */
  evidence: GraphifyEdgeEvidenceEntryV1[];
  evidenceChecksum: string;
}

export interface GraphifyEdgeReplayPlanV1 {
  admitted: GraphifyAdmittedEdgeV1[];
  rejected: { edge: GraphifyEdgeProjectionCandidateV1; admission: Exclude<GraphifyEdgeAdmissionV1, 'ADMITTED'> }[];
  /**
   * EDGE_KEY_COLLISION: the same key claims two different semantic tuples (a hash collision or a key-derivation bug).
   * Never merged, never admitted.
   */
  collisions: { edgeKey: string }[];
  counts: Record<GraphifyEdgeAdmissionV1, number> & { total: number; mergedEvidenceEntries: number; collisions: number };
  /** Order-independent: sha256 over the sorted admitted edge keys and their evidence checksums. */
  planChecksum: string;
}

/** Plan a batch deterministically: input order never changes the admitted set, the evidence sets or the planChecksum. */
export function planGraphifyEdgeReplayV1(
  edges: readonly GraphifyEdgeProjectionCandidateV1[],
  ctx: GraphifyEdgeReplayContextV1,
): GraphifyEdgeReplayPlanV1 {
  const counts = {
    ADMITTED: 0, UNRESOLVED_SOURCE: 0, UNRESOLVED_TARGET: 0, SOURCE_REVISION_UNBOUND: 0, TARGET_REVISION_UNBOUND: 0,
    WORKSPACE_REVISION_MISMATCH: 0, EVIDENCE_UNBOUND: 0, total: edges.length, mergedEvidenceEntries: 0, collisions: 0,
  };
  const groups = new Map<string, { tuple: string; base: Omit<GraphifyAdmittedEdgeV1, 'evidence' | 'evidenceChecksum' | 'edgeKey'>; evidence: Map<string, GraphifyEdgeEvidenceEntryV1> }>();
  const collided = new Set<string>();
  const rejected: GraphifyEdgeReplayPlanV1['rejected'] = [];
  for (const edge of edges) {
    const v = deriveGraphifyEdgeReplayVerdictV1(edge, ctx);
    counts[v.admission] += 1;
    if (v.admission !== 'ADMITTED') {
      rejected.push({ edge, admission: v.admission as Exclude<GraphifyEdgeAdmissionV1, 'ADMITTED'> });
      continue;
    }
    const tuple = canonicalJson([edge.subjectStableSymbolKey, edge.predicate, edge.objectStableSymbolKey, edge.sourceRevision, v.targetSourceRevision]);
    const entry = evidenceEntryOfV1(edge);
    const entryKey = canonicalJson(entry);
    const existing = groups.get(v.edgeKey!);
    if (!existing) {
      groups.set(v.edgeKey!, {
        tuple,
        base: { subject: edge.subjectStableSymbolKey, predicate: edge.predicate, object: edge.objectStableSymbolKey!, sourceRevision: edge.sourceRevision, targetSourceRevision: v.targetSourceRevision! },
        evidence: new Map([[entryKey, entry]]),
      });
    } else if (existing.tuple !== tuple) {
      collided.add(v.edgeKey!);
    } else if (existing.evidence.has(entryKey)) {
      counts.mergedEvidenceEntries += 1;
    } else {
      existing.evidence.set(entryKey, entry);
      counts.mergedEvidenceEntries += 1;
    }
  }
  counts.collisions = collided.size;
  const admitted: GraphifyAdmittedEdgeV1[] = [...groups.entries()]
    .filter(([key]) => !collided.has(key))
    .map(([edgeKey, g]) => {
      const evidence = [...g.evidence.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, e]) => e);
      return { edgeKey, ...g.base, evidence, evidenceChecksum: evidenceChecksumV1(evidence) };
    })
    .sort((a, b) => a.edgeKey.localeCompare(b.edgeKey));
  const collisions = [...collided].sort().map((edgeKey) => ({ edgeKey }));
  const planChecksum = `sha256:${sha256(canonicalJson({ admitted: admitted.map((a) => [a.edgeKey, a.evidenceChecksum]), collisions }))}`;
  return { admitted, rejected, collisions, counts, planChecksum };
}
