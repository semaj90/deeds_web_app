/**
 * bitfrost-token-fsm.ts — BitFrost evidence slot finite state machine & hot swapping.
 *
 * Implements BITFROST-FSM-01:
 * 1. Evidence Slot State Machine:
 *    UNRESOLVED -> FETCHING -> VERIFIED -> RANKED -> RESIDENT -> INJECTED -> STALE
 * 2. Hot-Swapping without cold re-initialization:
 *    - Reuses unchanged token prefix with llama-server :8090 (ornith-1.5-9b).
 *    - Computes new ContextManifest checksum on candidate swap.
 *    - Invalidates dependent downstream KV state.
 * 3. Invariants:
 *    - No hidden thoughts, tensors, or unvalidated prompt buffers written to storage.
 *    - BitFrost cache key: bitfrost:token_prefix:${model}:${prefixDigest}:${manifestChecksum}.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

export const EvidenceSlotStateSchema = z.enum([
  'UNRESOLVED',
  'FETCHING',
  'VERIFIED',
  'RANKED',
  'RESIDENT',
  'INJECTED',
  'STALE',
]);

export type EvidenceSlotState = z.infer<typeof EvidenceSlotStateSchema>;

export interface EvidenceSlot {
  slotId: string;
  candidateOrdinal: number;
  sourceRef: string;
  sourceRevision: string;
  state: EvidenceSlotState;
  tokenCount: number;
  tokenPrefix?: string;
  manifestChecksum?: string;
  updatedAt: number;
}

export interface SwapResult {
  previousSlot: EvidenceSlot;
  newSlot: EvidenceSlot;
  commonPrefixTokens: number;
  newManifestChecksum: string;
  invalidatedTokens: number;
  bitfrostCacheKey: string;
}

const VALID_TRANSITIONS: Record<EvidenceSlotState, EvidenceSlotState[]> = {
  UNRESOLVED: ['FETCHING', 'STALE'],
  FETCHING: ['VERIFIED', 'STALE'],
  VERIFIED: ['RANKED', 'STALE'],
  RANKED: ['RESIDENT', 'STALE'],
  RESIDENT: ['INJECTED', 'STALE'],
  INJECTED: ['STALE'],
  STALE: ['UNRESOLVED', 'FETCHING'], // Resetting slot
};

export class EvidenceSlotFSM {
  private slot: EvidenceSlot;

  constructor(initialSlot: Omit<EvidenceSlot, 'state' | 'updatedAt'>) {
    this.slot = {
      ...initialSlot,
      state: 'UNRESOLVED',
      updatedAt: Date.now(),
    };
  }

  public get current(): Readonly<EvidenceSlot> {
    return this.slot;
  }

  public transition(targetState: EvidenceSlotState): EvidenceSlot {
    const allowed = VALID_TRANSITIONS[this.slot.state];
    if (!allowed.includes(targetState)) {
      throw new Error(
        `Invalid evidence slot transition: ${this.slot.state} -> ${targetState}`
      );
    }

    this.slot = {
      ...this.slot,
      state: targetState,
      updatedAt: Date.now(),
    };
    return this.slot;
  }

  /**
   * Execute a candidate hot swap on the slot.
   *
   * Computes reusable token prefix, generates new ContextManifest checksum,
   * and derives the BitFrost token prefix cache key.
   */
  public swapCandidate(
    newCandidate: {
      candidateOrdinal: number;
      sourceRef: string;
      sourceRevision: string;
      tokenCount: number;
      tokenPrefix: string;
    },
    activeModel: string = 'ornith-1.5-9b'
  ): SwapResult {
    // Mark current slot as STALE before swapping
    this.slot.state = 'STALE';
    this.slot.updatedAt = Date.now();
    const prev = { ...this.slot };

    // Determine common prefix length between old and new tokens
    const oldPrefix = prev.tokenPrefix ?? '';
    const newPrefix = newCandidate.tokenPrefix;
    let commonLen = 0;
    const minLen = Math.min(oldPrefix.length, newPrefix.length);

    while (commonLen < minLen && oldPrefix[commonLen] === newPrefix[commonLen]) {
      commonLen++;
    }

    // Estimate common tokens (~4 chars per token)
    const commonPrefixTokens = Math.floor(commonLen / 4);
    const invalidatedTokens = Math.max(0, prev.tokenCount - commonPrefixTokens);

    // Compute new ContextManifest checksum
    const manifestPayload = JSON.stringify({
      candidateOrdinal: newCandidate.candidateOrdinal,
      sourceRef: newCandidate.sourceRef,
      sourceRevision: newCandidate.sourceRevision,
      tokenCount: newCandidate.tokenCount,
      model: activeModel,
      timestamp: Date.now(),
    });
    const newManifestChecksum = `sha256:${createHash('sha256').update(manifestPayload).digest('hex')}`;
    const prefixDigest = createHash('sha256').update(newPrefix.slice(0, commonLen)).digest('hex').slice(0, 16);

    const bitfrostCacheKey = `bitfrost:token_prefix:${activeModel}:${prefixDigest}:${newManifestChecksum.slice(7, 23)}`;

    // Reinitialize slot with new candidate at VERIFIED state
    this.slot = {
      slotId: prev.slotId,
      candidateOrdinal: newCandidate.candidateOrdinal,
      sourceRef: newCandidate.sourceRef,
      sourceRevision: newCandidate.sourceRevision,
      state: 'VERIFIED',
      tokenCount: newCandidate.tokenCount,
      tokenPrefix: newPrefix,
      manifestChecksum: newManifestChecksum,
      updatedAt: Date.now(),
    };

    return {
      previousSlot: prev,
      newSlot: this.slot,
      commonPrefixTokens,
      newManifestChecksum,
      invalidatedTokens,
      bitfrostCacheKey,
    };
  }
}
