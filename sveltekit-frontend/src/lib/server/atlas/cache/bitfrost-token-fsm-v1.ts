import { z } from 'zod';
import type { FanoutEvidenceBundleV1, FanoutEvidenceCandidateV1 } from '../context/fanout-evidence-bundle-v1.js';
import type { ContextManifestV1 } from '../graph/graph-runtime-contracts.js';
import { chooseCandidateBucket } from '../graph/graph-runtime-contracts.js';
import { computeOrderedSelectionChecksumV1, computeSelectedOrdinalSetChecksumV1 } from '../graph/context-manifest-v2.js';

/**
 * ============================================================================
 * Parent Atlas: BitFrost Candidate Token FSM & Contextual Engineering
 * ============================================================================
 *
 * Formalizes the 5 state transitions for BitFrost candidate tokens and GPU tiles.
 * Connects retrieval candidates, FanoutEvidenceBundleV1, BitFrost cache residency,
 * and ContextManifestV1 prompt context.
 *
 * Core rule:
 * Raw, un-ranked retrieval hits cannot bypass admission or jump directly to
 * RESIDENT. Prompt token knapsack only admits verified candidates from ADMITTED
 * state into RESIDENT.
 */

export const BITFROST_TOKEN_STATES = [
  'UNLOADED',
  'ADMITTED',
  'RESIDENT',
  'EVICTING',
  'PURGED',
] as const;

export type BitFrostTokenStateV1 = (typeof BITFROST_TOKEN_STATES)[number];

export const BitFrostTokenStateV1Schema = z.enum(BITFROST_TOKEN_STATES);

export interface BitFrostStateMeaningV1 {
  candidateMeaning: string;
  tokenPromptMeaning: string;
  gpuResidencyMeaning: string;
}

export const BITFROST_STATE_MEANINGS_V1: Record<BitFrostTokenStateV1, BitFrostStateMeaningV1> = {
  UNLOADED: {
    candidateMeaning: 'Canonical candidate known by candidateOrdinal, not in memory',
    tokenPromptMeaning: 'Not in prompt budget',
    gpuResidencyMeaning: 'No GPU tensor tile allocated',
  },
  ADMITTED: {
    candidateMeaning: 'Admitted to FanoutEvidenceBundleV1, revision verified',
    tokenPromptMeaning: 'Sized and eligible for token knapsack',
    gpuResidencyMeaning: 'CPU pinned buffer or candidate descriptor ready',
  },
  RESIDENT: {
    candidateMeaning: 'Active in BitFrost hot cache',
    tokenPromptMeaning: 'Emitted in ContextManifestV1 prompt context',
    gpuResidencyMeaning: 'Tile loaded in GPU cache (VRAM)',
  },
  EVICTING: {
    candidateMeaning: 'Demoted by ARC/LIRS policy, held for inflight turns',
    tokenPromptMeaning: 'Excluded from new prompts, preserved for active generation',
    gpuResidencyMeaning: 'Marked for overwrite in next GPU tile cycle',
  },
  PURGED: {
    candidateMeaning: 'Revision invalidated or replaced',
    tokenPromptMeaning: 'Token budget reclaimed',
    gpuResidencyMeaning: 'Memory released',
  },
};

/**
 * Top-K vs Pagination operation boundary contract across Parent Atlas operations.
 */
export interface OperationTopKBoundaryV1 {
  operation: string;
  needTopK: boolean;
  needPagination: boolean;
  implementation: string;
}

export const PARENT_ATLAS_TOPK_BOUNDARY_V1: Record<string, OperationTopKBoundaryV1> = {
  qdrant_ann: {
    operation: 'Qdrant ANN search',
    needTopK: true,
    needPagination: false, // Optional
    implementation: 'Retrieve bounded semantic candidates',
  },
  postgres_fts_trigram: {
    operation: 'PostgreSQL FTS and trigram',
    needTopK: true,
    needPagination: true,
    implementation: 'Lexical candidates for large result sets',
  },
  ast_ontology_traversal: {
    operation: 'AST ontology traversal',
    needTopK: true, // After or during traversal
    needPagination: true,
    implementation: 'Typed edge adjacency and visited set for bounded expansion',
  },
  global_pagerank: {
    operation: 'Global PageRank',
    needTopK: false,
    needPagination: false,
    implementation: 'CPU CSR NetworkX cuGraph chunked processing (not search result pagination)',
  },
  personalized_pagerank: {
    operation: 'Personalized PageRank',
    needTopK: true, // TopK output
    needPagination: false, // Optional for processing
    implementation: 'Seeded PageRank over an admitted graph',
  },
  kmeans_centroids: {
    operation: 'KMeans centroids',
    needTopK: false,
    needPagination: false,
    implementation: 'CuVS / scikit-learn batch processing',
  },
  bitfrost_cache_residency: {
    operation: 'BitFrost cache residency',
    needTopK: true, // TopK hot set
    needPagination: true, // Slab/block allocation
    implementation: 'LIRS / ARC over candidate descriptors',
  },
  context_prompt_tokens: {
    operation: 'Context prompt tokens',
    needTopK: true, // Knapsack / TopK tokens
    needPagination: true, // Chunk / card pagination
    implementation: 'Budget-bounded ContextManifest',
  },
  ornith_answer_generation: {
    operation: 'Ornith answer generation',
    needTopK: true, // Bounded context
    needPagination: true, // Sliding window if exceeding context
    implementation: 'One ContextManifest per turn',
  },
};

export const BitFrostCandidateSlotV1Schema = z.object({
  candidateOrdinal: z.number().int().nonnegative(),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  tokenCount: z.number().int().positive(),
  state: BitFrostTokenStateV1Schema,
  gpuTileId: z.string().nullable(),
  lastAccessTime: z.number().nonnegative(),
  admittedRevision: z.string().nullable(),
}).strict();

export type BitFrostCandidateSlotV1 = z.infer<typeof BitFrostCandidateSlotV1Schema>;

export const LEGAL_FSM_TRANSITIONS: ReadonlyMap<BitFrostTokenStateV1, ReadonlySet<BitFrostTokenStateV1>> = new Map([
  ['UNLOADED', new Set<BitFrostTokenStateV1>(['ADMITTED'])],
  ['ADMITTED', new Set<BitFrostTokenStateV1>(['RESIDENT', 'PURGED'])],
  ['RESIDENT', new Set<BitFrostTokenStateV1>(['EVICTING', 'PURGED'])],
  ['EVICTING', new Set<BitFrostTokenStateV1>(['PURGED', 'RESIDENT'])],
  ['PURGED', new Set<BitFrostTokenStateV1>(['UNLOADED'])],
]);

/**
 * A request-scoped reference to one slot. The slot generation is part of the identity, so a lease
 * taken before an ordinal was purged and reused cannot release the newer slot.
 */
export interface SlotLeaseV1 {
  leaseId: string;
  requestId: string;
  candidateOrdinal: number;
  slotGeneration: number;
  sourceRevision: string;
}

export class BitFrostTokenFsmManagerV1 {
  private slots = new Map<number, BitFrostCandidateSlotV1>();
  private activeTokenBudget: number;
  private maxSlots: number;
  private generations = new Map<number, number>();
  private leases = new Map<string, SlotLeaseV1>();
  private requestLeases = new Map<string, Set<string>>();
  private leaseRefs = new Map<string, number>();
  private pendingEviction = new Set<number>();
  private compiledRequests = new Set<string>();

  constructor(options?: { tokenBudget?: number; maxSlots?: number }) {
    this.activeTokenBudget = options?.tokenBudget ?? 8192;
    this.maxSlots = options?.maxSlots ?? 128;
  }

  getSlot(candidateOrdinal: number): BitFrostCandidateSlotV1 | undefined {
    return this.slots.get(candidateOrdinal);
  }

  getAllSlots(): BitFrostCandidateSlotV1[] {
    return Array.from(this.slots.values());
  }

  getResidentSlots(): BitFrostCandidateSlotV1[] {
    return this.getAllSlots().filter((s) => s.state === 'RESIDENT');
  }

  getResidentTokens(): number {
    return this.getResidentSlots().reduce((acc, s) => acc + s.tokenCount, 0);
  }

  /** Token headroom left under this FSM's ceiling after resident candidates. */
  availableTokens(): number {
    return this.activeTokenBudget - this.getResidentTokens();
  }

  /**
   * Adopts or registers a canonical candidate in UNLOADED state.
   */
  registerUnloaded(input: {
    candidateOrdinal: number;
    packetKey: string;
    sourceRef: string;
    sourceRevision: string;
    tokenCount: number;
  }): BitFrostCandidateSlotV1 {
    const slot: BitFrostCandidateSlotV1 = {
      candidateOrdinal: input.candidateOrdinal,
      packetKey: input.packetKey,
      sourceRef: input.sourceRef,
      sourceRevision: input.sourceRevision,
      tokenCount: input.tokenCount,
      state: 'UNLOADED',
      gpuTileId: null,
      lastAccessTime: Date.now(),
      admittedRevision: null,
    };
    this.slots.set(input.candidateOrdinal, slot);
    this.generations.set(input.candidateOrdinal, (this.generations.get(input.candidateOrdinal) ?? 0) + 1);
    this.pendingEviction.delete(input.candidateOrdinal);
    return slot;
  }

  getSlotGeneration(candidateOrdinal: number): number | undefined {
    return this.generations.get(candidateOrdinal);
  }

  isPendingEviction(candidateOrdinal: number): boolean {
    return this.pendingEviction.has(candidateOrdinal);
  }

  /** Number of live leases on the current generation of a slot. */
  activeLeaseCount(candidateOrdinal: number): number {
    const gen = this.generations.get(candidateOrdinal) ?? 0;
    return this.leaseRefs.get(`${candidateOrdinal}:${gen}`) ?? 0;
  }

  assertRequestNew(requestId: string): void {
    if (this.compiledRequests.has(requestId)) {
      throw new Error(`FSM_DUPLICATE_REQUEST: ${requestId} already compiled`);
    }
  }

  recordRequest(requestId: string): void {
    this.compiledRequests.add(requestId);
  }

  /**
   * Takes a request-scoped lease on an ADMITTED or RESIDENT slot. New leases are refused once a slot is
   * EVICTING or has a pending purge: such slots are no longer eligible for new work.
   */
  acquireLease(input: { requestId: string; candidateOrdinal: number }): SlotLeaseV1 {
    const slot = this.slots.get(input.candidateOrdinal);
    if (!slot) {
      throw new Error(`FSM_CANDIDATE_NOT_FOUND: ordinal ${input.candidateOrdinal}`);
    }
    if ((slot.state !== 'ADMITTED' && slot.state !== 'RESIDENT') || this.pendingEviction.has(input.candidateOrdinal)) {
      throw new Error(`FSM_LEASE_DENIED: ordinal ${input.candidateOrdinal} is ${slot.state}`);
    }
    const slotGeneration = this.generations.get(input.candidateOrdinal) ?? 0;
    const leaseId = `${input.requestId}:${input.candidateOrdinal}:${slotGeneration}`;
    if (this.leases.has(leaseId)) {
      throw new Error(`FSM_LEASE_ALREADY_EXISTS: ${leaseId}`);
    }
    const lease: SlotLeaseV1 = {
      leaseId,
      requestId: input.requestId,
      candidateOrdinal: input.candidateOrdinal,
      slotGeneration,
      sourceRevision: slot.admittedRevision ?? slot.sourceRevision,
    };
    this.leases.set(leaseId, lease);
    const byRequest = this.requestLeases.get(input.requestId) ?? new Set<string>();
    byRequest.add(leaseId);
    this.requestLeases.set(input.requestId, byRequest);
    const refKey = `${lease.candidateOrdinal}:${slotGeneration}`;
    this.leaseRefs.set(refKey, (this.leaseRefs.get(refKey) ?? 0) + 1);
    return lease;
  }

  /**
   * Idempotent: a second release of the same lease returns false and changes nothing. When the last live
   * lease on a pending-purge slot is released, the purge completes.
   */
  releaseLease(leaseId: string): boolean {
    const lease = this.leases.get(leaseId);
    if (!lease) return false;
    this.leases.delete(leaseId);

    const byRequest = this.requestLeases.get(lease.requestId);
    if (byRequest) {
      byRequest.delete(leaseId);
      if (byRequest.size === 0) this.requestLeases.delete(lease.requestId);
    }

    const refKey = `${lease.candidateOrdinal}:${lease.slotGeneration}`;
    const remaining = (this.leaseRefs.get(refKey) ?? 1) - 1;
    if (remaining <= 0) this.leaseRefs.delete(refKey);
    else this.leaseRefs.set(refKey, remaining);

    const currentGeneration = this.generations.get(lease.candidateOrdinal);
    if (remaining <= 0 && this.pendingEviction.has(lease.candidateOrdinal) && currentGeneration === lease.slotGeneration) {
      const slot = this.slots.get(lease.candidateOrdinal);
      if (slot) {
        this.pendingEviction.delete(lease.candidateOrdinal);
        this.executeTransition(slot, 'PURGED');
        slot.gpuTileId = null;
        slot.admittedRevision = null;
        slot.lastAccessTime = Date.now();
      }
    }
    return true;
  }

  /** Releases every lease a request holds. Safe to call from cancel, timeout, completion and shutdown paths. */
  releaseRequest(requestId: string): number {
    const ids = [...(this.requestLeases.get(requestId) ?? [])];
    let released = 0;
    for (const id of ids) {
      if (this.releaseLease(id)) released++;
    }
    return released;
  }

  /**
   * Transition candidate from UNLOADED to ADMITTED.
   * Requires verified sourceRevision and admission lineage.
   */
  admitCandidate(input: {
    candidateOrdinal: number;
    sourceRevision: string;
    expectedRevision: string;
  }): BitFrostCandidateSlotV1 {
    const slot = this.slots.get(input.candidateOrdinal);
    if (!slot) {
      throw new Error(`FSM_CANDIDATE_NOT_FOUND: ordinal ${input.candidateOrdinal}`);
    }
    if (slot.state !== 'UNLOADED') {
      throw new Error(`FSM_INVALID_TRANSITION: Cannot admit candidate in state ${slot.state}`);
    }
    if (input.sourceRevision !== input.expectedRevision) {
      throw new Error(`FSM_REVISION_MISMATCH: expected ${input.expectedRevision}, got ${input.sourceRevision}`);
    }

    this.executeTransition(slot, 'ADMITTED');
    slot.admittedRevision = input.sourceRevision;
    slot.lastAccessTime = Date.now();
    return slot;
  }

  /**
   * Promotes candidate from ADMITTED to RESIDENT.
   * Allocates prompt token budget and binds GPU tile ID.
   * Throws if budget would be exceeded.
   */
  promoteToResident(input: {
    candidateOrdinal: number;
    gpuTileId?: string;
    currentSourceRevision: string;
  }): BitFrostCandidateSlotV1 {
    const slot = this.slots.get(input.candidateOrdinal);
    if (!slot) {
      throw new Error(`FSM_CANDIDATE_NOT_FOUND: ordinal ${input.candidateOrdinal}`);
    }

    // Direct transition from UNLOADED -> RESIDENT is strictly forbidden
    if (slot.state === 'UNLOADED') {
      throw new Error('FSM_FORBIDDEN_RAW_INJECTION: Unadmitted candidate cannot jump directly to RESIDENT');
    }

    if (slot.state !== 'ADMITTED' && slot.state !== 'EVICTING') {
      throw new Error(`FSM_INVALID_TRANSITION: Cannot promote candidate in state ${slot.state} to RESIDENT`);
    }

    // FSM-02: the revision recorded at admission must still be the current source revision.
    if (input.currentSourceRevision !== slot.admittedRevision) {
      throw new Error(`FSM_REVISION_MISMATCH: admitted ${slot.admittedRevision}, current ${input.currentSourceRevision}`);
    }

    const currentResidentTokens = this.getResidentTokens();
    if (currentResidentTokens + slot.tokenCount > this.activeTokenBudget) {
      throw new Error(`FSM_TOKEN_BUDGET_EXCEEDED: required ${slot.tokenCount}, available ${this.activeTokenBudget - currentResidentTokens}`);
    }

    this.executeTransition(slot, 'RESIDENT');
    slot.gpuTileId = input.gpuTileId ?? `tile-gpu-${slot.candidateOrdinal}`;
    slot.lastAccessTime = Date.now();
    return slot;
  }

  /**
   * Demotes candidate from RESIDENT to EVICTING.
   * Candidate is excluded from new prompt assemblies but preserved for inflight turn generation.
   */
  demoteToEvicting(candidateOrdinal: number): BitFrostCandidateSlotV1 {
    const slot = this.slots.get(candidateOrdinal);
    if (!slot) {
      throw new Error(`FSM_CANDIDATE_NOT_FOUND: ordinal ${candidateOrdinal}`);
    }
    if (slot.state !== 'RESIDENT') {
      throw new Error(`FSM_INVALID_TRANSITION: Cannot demote candidate in state ${slot.state} to EVICTING`);
    }

    this.executeTransition(slot, 'EVICTING');
    slot.lastAccessTime = Date.now();
    return slot;
  }

  /**
   * Purges candidate from ADMITTED, RESIDENT, or EVICTING to PURGED.
   * Reclaims token budget and releases GPU tile.
   */
  purgeCandidate(candidateOrdinal: number): BitFrostCandidateSlotV1 {
    const slot = this.slots.get(candidateOrdinal);
    if (!slot) {
      throw new Error(`FSM_CANDIDATE_NOT_FOUND: ordinal ${candidateOrdinal}`);
    }

    if (slot.state === 'UNLOADED') {
      throw new Error('FSM_INVALID_TRANSITION: Cannot purge UNLOADED candidate');
    }

    // In-flight references keep their evidence: demote to EVICTING now, complete the purge when the last lease ends.
    if (this.activeLeaseCount(candidateOrdinal) > 0) {
      if (slot.state === 'RESIDENT') this.executeTransition(slot, 'EVICTING');
      this.pendingEviction.add(candidateOrdinal);
      slot.lastAccessTime = Date.now();
      return slot;
    }

    this.executeTransition(slot, 'PURGED');
    slot.gpuTileId = null;
    slot.admittedRevision = null;
    slot.lastAccessTime = Date.now();
    return slot;
  }

  /**
   * Resets PURGED candidate to UNLOADED state.
   */
  reclaimToUnloaded(candidateOrdinal: number): BitFrostCandidateSlotV1 {
    const slot = this.slots.get(candidateOrdinal);
    if (!slot) {
      throw new Error(`FSM_CANDIDATE_NOT_FOUND: ordinal ${candidateOrdinal}`);
    }
    if (slot.state !== 'PURGED') {
      throw new Error(`FSM_INVALID_TRANSITION: Cannot reclaim candidate in state ${slot.state}`);
    }

    this.executeTransition(slot, 'UNLOADED');
    slot.lastAccessTime = Date.now();
    return slot;
  }

  /**
   * Compensating step for a failed compile commit only. Undoes a promotion made in the same commit.
   * This bypasses the transition table on purpose and must not be called from anywhere else.
   */
  rollbackToAdmitted(candidateOrdinal: number): void {
    const slot = this.slots.get(candidateOrdinal);
    if (!slot || slot.state !== 'RESIDENT') return;
    slot.state = 'ADMITTED';
    slot.gpuTileId = null;
    slot.lastAccessTime = Date.now();
  }

  private executeTransition(slot: BitFrostCandidateSlotV1, targetState: BitFrostTokenStateV1): void {
    const allowed = LEGAL_FSM_TRANSITIONS.get(slot.state);
    if (!allowed || !allowed.has(targetState)) {
      throw new Error(`FSM_ILLEGAL_TRANSITION: ${slot.state} -> ${targetState}`);
    }
    slot.state = targetState;
  }
}

/**
 * Contextual engineering compiler that reconciles FanoutEvidenceBundleV1
 * with BitFrostTokenFsmManagerV1 to produce a token-budgeted ContextManifestV1.
 *
 * Rules:
 * 1. Candidates must already be ADMITTED in the FSM.
 * 2. Knapsack algorithm selects top candidates by ordinal/evidence up to token budget.
 * 3. Selected candidates transition to RESIDENT and are emitted in ContextManifestV1.
 * 4. Excess candidates remain ADMITTED (not emitted in prompt).
 * 5. Returns ContextManifestV1 with selectedNodeKeys and evidenceRefs.
 */
export function compileFsmContextManifestV1(input: {
  fsm: BitFrostTokenFsmManagerV1;
  bundle: FanoutEvidenceBundleV1;
  tokenBudget: number;
  requestId: string;
  snapshotId: string;
  query: string;
  producerRevision: string;
  /** Test seam: runs after preflight and before commit. */
  beforeCommit?: () => void;
}): {
  manifest: ContextManifestV1;
  residentOrdinals: number[];
  unselectedOrdinals: number[];
  totalTokensUsed: number;
  selectedOrdinalSetChecksum: string;
  orderedSelectionChecksum: string;
  leaseIds: string[];
} {
  const { fsm, bundle, tokenBudget, requestId, snapshotId, query, producerRevision } = input;

  fsm.assertRequestNew(requestId);

  // Phase 1: preflight. Reads only; nothing in the FSM changes if this phase throws.
  let tokensRemaining = tokenBudget;
  let fsmHeadroom = fsm.availableTokens();
  const planned: Array<{ ordinal: number; tokenCount: number; sourceRevision: string; packetKey: string; evidenceIds: string[]; wasAdmitted: boolean }> = [];
  const unselectedOrdinals: number[] = [];

  for (const candidate of bundle.candidates) {
    const slot = fsm.getSlot(candidate.candidateOrdinal);
    if (!slot) {
      throw new Error(`FSM_COMPILER_ERROR: Candidate ordinal ${candidate.candidateOrdinal} missing in FSM`);
    }
    // FSM-03/04: EVICTING, PURGED and pending-purge candidates are excluded from new prompts, not treated as errors.
    if (slot.state === 'EVICTING' || slot.state === 'PURGED' || fsm.isPendingEviction(slot.candidateOrdinal)) {
      unselectedOrdinals.push(slot.candidateOrdinal);
      continue;
    }
    if (slot.state !== 'ADMITTED' && slot.state !== 'RESIDENT') {
      throw new Error(`FSM_COMPILER_ERROR: Candidate ordinal ${candidate.candidateOrdinal} is in ${slot.state}, must be ADMITTED`);
    }
    if (slot.admittedRevision !== candidate.sourceRevision) {
      throw new Error(`FSM_REVISION_MISMATCH: Candidate ordinal ${candidate.candidateOrdinal} admitted ${slot.admittedRevision}, bundle ${candidate.sourceRevision}`);
    }

    // FSM-07: the compile budget and the FSM ceiling both bind. Candidates that do not fit either are skipped.
    const needsFsmHeadroom = slot.state === 'ADMITTED' ? slot.tokenCount : 0;
    if (slot.tokenCount <= tokensRemaining && needsFsmHeadroom <= fsmHeadroom) {
      tokensRemaining -= slot.tokenCount;
      fsmHeadroom -= needsFsmHeadroom;
      planned.push({
        ordinal: slot.candidateOrdinal,
        tokenCount: slot.tokenCount,
        sourceRevision: candidate.sourceRevision,
        packetKey: candidate.packetKey,
        evidenceIds: candidate.evidence.map((ev) => ev.evidenceId),
        wasAdmitted: slot.state === 'ADMITTED',
      });
    } else {
      unselectedOrdinals.push(slot.candidateOrdinal);
    }
  }

  input.beforeCommit?.();

  // Phase 2: commit. Revalidate every planned slot, then mutate. A failure rolls back what was applied.
  for (const item of planned) {
    const slot = fsm.getSlot(item.ordinal);
    const stillValid =
      slot !== undefined &&
      (slot.state === 'ADMITTED' || slot.state === 'RESIDENT') &&
      slot.admittedRevision === item.sourceRevision &&
      !fsm.isPendingEviction(item.ordinal);
    if (!stillValid) {
      throw new Error(`FSM_COMMIT_REVALIDATION_FAILED: ordinal ${item.ordinal} changed between preflight and commit`);
    }
  }

  const promoted: number[] = [];
  const leaseIds: string[] = [];
  try {
    for (const item of planned) {
      if (item.wasAdmitted) {
        fsm.promoteToResident({ candidateOrdinal: item.ordinal, currentSourceRevision: item.sourceRevision });
        promoted.push(item.ordinal);
      }
    }
    for (const item of planned) {
      leaseIds.push(fsm.acquireLease({ requestId, candidateOrdinal: item.ordinal }).leaseId);
    }
  } catch (err) {
    for (const id of leaseIds) fsm.releaseLease(id);
    for (const ordinal of promoted) fsm.rollbackToAdmitted(ordinal);
    throw err;
  }

  const residentOrdinals = planned.map((p) => p.ordinal);
  const selectedNodeKeys = planned.map((p) => p.packetKey);
  const evidenceRefs = planned.flatMap((p) => p.evidenceIds);

  const manifest: ContextManifestV1 = {
    schema: 'atlas.context-manifest.v1',
    requestId,
    snapshotId,
    query,
    candidateBucket: chooseCandidateBucket(residentOrdinals.length),
    candidateCount: residentOrdinals.length,
    tokenBudget,
    selectedNodeKeys,
    evidenceRefs,
    producerRevision,
  };

  fsm.recordRequest(requestId);

  return {
    manifest,
    residentOrdinals,
    unselectedOrdinals,
    totalTokensUsed: tokenBudget - tokensRemaining,
    selectedOrdinalSetChecksum: computeSelectedOrdinalSetChecksumV1({
      snapshotId,
      ordinalMapChecksum: bundle.ordinalMapChecksum,
      selectedOrdinals: residentOrdinals,
    }),
    orderedSelectionChecksum: computeOrderedSelectionChecksumV1({
      ordinals: residentOrdinals,
      selectedNodeKeys,
      evidenceRefs,
    }),
    leaseIds,
  };
}

export interface BitFrostProceduralKeyInputV1 {
  modelName: string;
  artifactChecksum: string;
  representationRevision: string;
  slotIndex?: number;
}

/**
 * Builds the canonical Valkey/BitFrost procedural cache key keyed strictly by
 * (model_name, artifact_checksum, representation_revision).
 */
export function buildBitFrostProceduralKeyV1(input: BitFrostProceduralKeyInputV1): string {
  const base = `bitfrost:procedural:${input.modelName}:${input.artifactChecksum}:${input.representationRevision}`;
  return input.slotIndex !== undefined ? `${base}:slot_${input.slotIndex}` : base;
}

export interface BitFrostProceduralDescriptorV1 {
  schema: 'atlas.bitfrost-procedural-descriptor.v1';
  proceduralKey: string;
  modelName: string;
  artifactChecksum: string;
  representationRevision: string;
  kvCachePersisted: false;
  hiddenThoughtsPersisted: false;
  rawTensorPersisted: false;
}

/**
 * Enforces procedural memory boundaries: FSM token states, residency descriptors,
 * and context plans are cached in BitFrost/Valkey keyed by (model_name, artifact_checksum, representation_revision).
 * Strictly guarantees that no hidden thoughts, KV cache tensors, or raw prompt buffers are persisted.
 */
export function buildBitFrostProceduralDescriptorV1(
  input: BitFrostProceduralKeyInputV1
): BitFrostProceduralDescriptorV1 {
  return {
    schema: 'atlas.bitfrost-procedural-descriptor.v1',
    proceduralKey: buildBitFrostProceduralKeyV1(input),
    modelName: input.modelName,
    artifactChecksum: input.artifactChecksum,
    representationRevision: input.representationRevision,
    kvCachePersisted: false,
    hiddenThoughtsPersisted: false,
    rawTensorPersisted: false,
  };
}
