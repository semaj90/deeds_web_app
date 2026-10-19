import { createHash } from 'node:crypto';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import type { CandidateFeatureSnapshotV1 } from '../features/candidate-feature-snapshot-v1.js';
import {
  buildAceContextManifestAdmissionV1,
  type AceContextManifestAdmissionV1,
} from '../context/ace-context-manifest-admission-v1.js';
import type { TopKExecutionV1, TopKSelectionV1, TopKVerificationV1 } from './topk-execution-receipt-v1.js';

/**
 * Top-K -> exact source spans -> ContextManifest (DOC-ANALYSIS-TABLES-02).
 *
 * A retrieval/ranking hit only PROPOSES a chunk. It becomes `QualifiedEvidenceV1` only after the CURRENT source
 * bytes are read, hashed, and match the candidate's sealed `sourceRevision`, and the span is an exact, valid
 * UTF-8 slice. This module reads through injected callbacks (no DB, no network, no writes) and never fuses or
 * re-ranks: ordering and ranks come from the verified Top-K only. SearchRuntime remains the single fusion owner.
 */
export const QUALIFIED_EVIDENCE_SCHEMA = 'atlas.qualified-evidence.v1' as const;
export const TOPK_EVIDENCE_TARGET = 10 as const;

export type CandidateSourceSpanV1 =
  | { sourceRef: string; unit: 'bytes'; start: number; end: number }          // [start, end) in UTF-8 bytes
  | { sourceRef: string; unit: 'lines'; start: number; end: number };         // 1-based, inclusive

export interface SourceFetchPortV1 {
  /** Returns the CURRENT exact bytes of the source, or null if unreadable. */
  readBytes(sourceRef: string): Uint8Array | null;
  /** Returns the span recorded for this candidate, or null if none is recorded. */
  lookupSpan(candidate: { ordinal: number; canonicalId: string; packetKey: string | null; treeNodeId: string | null; symbolVersionId: string | null }): CandidateSourceSpanV1 | null;
}

export interface QualifiedEvidenceV1 {
  schema: typeof QUALIFIED_EVIDENCE_SCHEMA;
  qualification: 'QUALIFIED';
  rank: number;
  ordinal: number;
  canonicalId: string;
  sourceRef: string;
  sourceRevision: string;
  spanUnit: 'bytes' | 'lines';
  spanStart: number;
  spanEnd: number;
  byteStart: number;
  byteEnd: number;
  text: string;
  spanChecksum: string;
  evidenceRefs: string[];
  canonicalAuthority: false;
}

export type RejectedEvidenceReasonV1 =
  | 'UNRESOLVED_CANDIDATE' | 'DEGRADED_IDENTITY' | 'SPAN_UNAVAILABLE' | 'SOURCE_UNREADABLE'
  | 'SOURCE_REVISION_NOT_SHA256' | 'SOURCE_REVISION_STALE' | 'SPAN_OUT_OF_RANGE' | 'SPAN_NOT_UTF8_BOUNDARY' | 'SPAN_UNSAFE_PATH';

export interface RejectedEvidenceV1 { rank: number; ordinal: number; canonicalId: string; reason: RejectedEvidenceReasonV1 }

export function sourceRevisionOfBytes(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function spanChecksumOf(args: { sourceRevision: string; byteStart: number; byteEnd: number; text: string }): string {
  return canonicalSha256V1({ schema: 'atlas.qualified-evidence-span.v1', ...args });
}

function lineSpanToBytes(bytes: Uint8Array, startLine: number, endLine: number): { start: number; end: number } | null {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine) return null;
  let line = 1;
  let start = startLine === 1 ? 0 : -1;
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] === 0x0a) {
      if (line === endLine) return start < 0 ? null : { start, end: i + 1 };
      line += 1;
      if (line === startLine) start = i + 1;
    }
  }
  // last line without a trailing newline
  if (line === endLine && start >= 0) return { start, end: bytes.length };
  return null;
}

const SAFE_SOURCE_REF = /^(?!\/)(?!.*\.\.)(?![A-Za-z]:)[^\0\\]+$/;

/**
 * Resolves the verified Top-K selection to qualified evidence (at most `maxItems`, default 10) and returns every
 * rejected candidate with a reason. Order is exactly the Top-K rank order.
 */
export function resolveTopKEvidenceV1(params: {
  ordinalMap: CandidateOrdinalMapV1;
  selected: readonly TopKSelectionV1[];
  port: SourceFetchPortV1;
  maxItems?: number;
}): { qualified: QualifiedEvidenceV1[]; rejected: RejectedEvidenceV1[] } {
  const map = candidateOrdinalMapV1Schema.parse(params.ordinalMap);
  assertCandidateOrdinalMapIntegrityV1(map);
  const maxItems = params.maxItems ?? TOPK_EVIDENCE_TARGET;
  const qualified: QualifiedEvidenceV1[] = [];
  const rejected: RejectedEvidenceV1[] = [];
  const decoder = new TextDecoder('utf-8', { fatal: true });

  for (const pick of [...params.selected].sort((a, b) => a.rank - b.rank)) {
    if (qualified.length >= maxItems) break;
    const reject = (reason: RejectedEvidenceReasonV1) => { rejected.push({ rank: pick.rank, ordinal: pick.ordinal, canonicalId: pick.canonicalId, reason }); };
    const candidate = map.candidates[pick.ordinal];
    if (!candidate || candidate.candidateOrdinal !== pick.ordinal || candidate.canonicalId !== pick.canonicalId) { reject('UNRESOLVED_CANDIDATE'); continue; }
    if (candidate.degradedIdentity) { reject('DEGRADED_IDENTITY'); continue; }
    if (!/^sha256:[a-f0-9]{64}$/.test(candidate.sourceRevision)) { reject('SOURCE_REVISION_NOT_SHA256'); continue; }

    const span = params.port.lookupSpan({
      ordinal: pick.ordinal, canonicalId: candidate.canonicalId, packetKey: candidate.packetKey ?? null,
      treeNodeId: candidate.treeNodeId ?? null, symbolVersionId: candidate.symbolVersionId ?? null,
    });
    if (!span) { reject('SPAN_UNAVAILABLE'); continue; }
    if (!SAFE_SOURCE_REF.test(span.sourceRef)) { reject('SPAN_UNSAFE_PATH'); continue; }
    const bytes = params.port.readBytes(span.sourceRef);
    if (!bytes) { reject('SOURCE_UNREADABLE'); continue; }
    if (sourceRevisionOfBytes(bytes) !== candidate.sourceRevision) { reject('SOURCE_REVISION_STALE'); continue; }

    const range = span.unit === 'bytes' ? { start: span.start, end: span.end } : lineSpanToBytes(bytes, span.start, span.end);
    if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end <= range.start || range.end > bytes.length) { reject('SPAN_OUT_OF_RANGE'); continue; }
    let text: string;
    try { text = decoder.decode(bytes.subarray(range.start, range.end)); } catch { reject('SPAN_NOT_UTF8_BOUNDARY'); continue; }

    qualified.push({
      schema: QUALIFIED_EVIDENCE_SCHEMA,
      qualification: 'QUALIFIED',
      rank: pick.rank,
      ordinal: pick.ordinal,
      canonicalId: candidate.canonicalId,
      sourceRef: span.sourceRef,
      sourceRevision: candidate.sourceRevision,
      spanUnit: span.unit,
      spanStart: span.start,
      spanEnd: span.end,
      byteStart: range.start,
      byteEnd: range.end,
      text,
      spanChecksum: spanChecksumOf({ sourceRevision: candidate.sourceRevision, byteStart: range.start, byteEnd: range.end, text }),
      evidenceRefs: [...candidate.evidenceRefs],
      canonicalAuthority: false,
    });
  }
  return { qualified, rejected };
}

/** Re-derives the checksum so a hand-built object cannot masquerade as qualified evidence. */
export function isGenuineQualifiedEvidenceV1(value: unknown): value is QualifiedEvidenceV1 {
  const e = value as Partial<QualifiedEvidenceV1> | null;
  if (!e || typeof e !== 'object') return false;
  if (e.schema !== QUALIFIED_EVIDENCE_SCHEMA || e.qualification !== 'QUALIFIED' || e.canonicalAuthority !== false) return false;
  if (typeof e.text !== 'string' || typeof e.sourceRevision !== 'string' || !Number.isInteger(e.byteStart) || !Number.isInteger(e.byteEnd)) return false;
  if (new TextEncoder().encode(e.text).length !== (e.byteEnd as number) - (e.byteStart as number)) return false;
  return e.spanChecksum === spanChecksumOf({ sourceRevision: e.sourceRevision, byteStart: e.byteStart as number, byteEnd: e.byteEnd as number, text: e.text });
}

export type GraphifyLifecycleV1 = 'COMPLETED' | 'NOT_COMPLETED' | 'UNKNOWN';

export type TopKContextAdmissionV1 =
  | {
      status: 'ADMITTED';
      admission: AceContextManifestAdmissionV1;
      admittedOrdinals: number[];
      droppedOrdinals: number[];
      /** Graph-derived ranking promotion stays blocked unless the Graphify lifecycle receipt is COMPLETED. */
      productionPromotion: 'ELIGIBLE' | 'BLOCKED_GRAPHIFY_LIFECYCLE';
      canonicalAuthority: false;
      writesPerformed: false;
    }
  | { status: 'BLOCKED'; reason: string; admission: null; admittedOrdinals: []; droppedOrdinals: number[]; productionPromotion: 'BLOCKED_GRAPHIFY_LIFECYCLE' | 'ELIGIBLE'; canonicalAuthority: false; writesPerformed: false };

/**
 * Connects verified Top-K evidence to the EXISTING ContextManifest builder
 * (`buildAceContextManifestAdmissionV1`). Admission requires: a VERIFIED_PASS replay verdict for this exact
 * execution, snapshot/map agreement, and genuine qualified evidence for every admitted ordinal. Raw hits have no
 * path in: the only accepted evidence type is `QualifiedEvidenceV1`.
 */
export function admitTopKEvidenceToContextManifestV1(params: {
  execution: TopKExecutionV1;
  verification: TopKVerificationV1;
  qualified: readonly QualifiedEvidenceV1[];
  snapshot: CandidateFeatureSnapshotV1;
  requestId: string;
  tokenBudget: number;
  retrievalPolicyRevision: string;
  acePlaybookRevision: string;
  representationRevision: string | null;
  graphRevision: string | null;
  graphifyLifecycle: GraphifyLifecycleV1;
}): TopKContextAdmissionV1 {
  const promotion = params.graphifyLifecycle === 'COMPLETED' ? 'ELIGIBLE' : 'BLOCKED_GRAPHIFY_LIFECYCLE';
  const dropped = params.execution.selected.map((s) => s.ordinal);
  const block = (reason: string): TopKContextAdmissionV1 => ({
    status: 'BLOCKED', reason, admission: null, admittedOrdinals: [], droppedOrdinals: dropped,
    productionPromotion: promotion, canonicalAuthority: false, writesPerformed: false,
  });

  if (params.verification.status !== 'VERIFIED_PASS') return block('RECEIPT_NOT_VERIFIED');
  if (params.verification.executionId !== params.execution.executionId) return block('VERIFICATION_EXECUTION_MISMATCH');
  if (params.snapshot.ordinalMapChecksum !== params.execution.ordinalMapDigest) return block('SNAPSHOT_ORDINAL_MAP_MISMATCH');
  if (params.snapshot.candidateSnapshotRevision !== params.execution.candidateSnapshotRevision) return block('SNAPSHOT_REVISION_MISMATCH');
  if (params.snapshot.workspaceRevision !== params.execution.workspaceRevision) return block('SNAPSHOT_WORKSPACE_MISMATCH');
  if (params.snapshot.featureRevision !== params.execution.representationRevision) return block('SNAPSHOT_FEATURE_REVISION_MISMATCH');

  const selectedOrdinals = new Set(params.execution.selected.map((s) => s.ordinal));
  const genuine: QualifiedEvidenceV1[] = [];
  for (const evidence of params.qualified) {
    if (!isGenuineQualifiedEvidenceV1(evidence)) return block('EVIDENCE_NOT_QUALIFIED');
    if (!selectedOrdinals.has(evidence.ordinal)) return block('EVIDENCE_NOT_IN_VERIFIED_TOPK');
    genuine.push(evidence);
  }
  if (genuine.length === 0) return block('NO_QUALIFIED_EVIDENCE');

  const rowByOrdinal = new Map(params.snapshot.rows.map((row) => [row.candidateOrdinal, row]));
  for (const evidence of genuine) {
    const row = rowByOrdinal.get(evidence.ordinal);
    if (!row || row.canonicalId !== evidence.canonicalId || row.sourceRevision !== evidence.sourceRevision) return block('EVIDENCE_SNAPSHOT_ROW_MISMATCH');
  }

  const admittedOrdinals = genuine.map((e) => e.ordinal).sort((a, b) => a - b);
  const admission = buildAceContextManifestAdmissionV1({
    snapshot: params.snapshot,
    requestId: params.requestId,
    selectedOrdinals: admittedOrdinals,
    tokenBudget: params.tokenBudget,
    retrievalPolicyRevision: params.retrievalPolicyRevision,
    acePlaybookRevision: params.acePlaybookRevision,
    representationRevision: params.representationRevision,
    graphRevision: params.graphRevision,
  });
  return {
    status: 'ADMITTED',
    admission,
    admittedOrdinals,
    droppedOrdinals: dropped.filter((ordinal) => !admittedOrdinals.includes(ordinal)),
    productionPromotion: promotion,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
