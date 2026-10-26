import { describe, it, expect } from 'vitest';
import { EvidenceSlotFSM, EvidenceSlotStateSchema } from './bitfrost-token-fsm.js';

describe('EvidenceSlotFSM (BITFROST-FSM-01)', () => {
  it('follows valid state transition ladder UNRESOLVED -> FETCHING -> VERIFIED -> RANKED -> RESIDENT -> INJECTED', () => {
    const fsm = new EvidenceSlotFSM({
      slotId: 'slot_01',
      candidateOrdinal: 42,
      sourceRef: 'src/lib/server/db/client.ts',
      sourceRevision: 'sha256:abc12345',
      tokenCount: 120,
    });

    expect(fsm.current.state).toBe('UNRESOLVED');

    fsm.transition('FETCHING');
    expect(fsm.current.state).toBe('FETCHING');

    fsm.transition('VERIFIED');
    expect(fsm.current.state).toBe('VERIFIED');

    fsm.transition('RANKED');
    expect(fsm.current.state).toBe('RANKED');

    fsm.transition('RESIDENT');
    expect(fsm.current.state).toBe('RESIDENT');

    fsm.transition('INJECTED');
    expect(fsm.current.state).toBe('INJECTED');

    // Transitions to STALE when superseded
    fsm.transition('STALE');
    expect(fsm.current.state).toBe('STALE');
  });

  it('rejects illegal transitions fail-closed', () => {
    const fsm = new EvidenceSlotFSM({
      slotId: 'slot_02',
      candidateOrdinal: 10,
      sourceRef: 'src/lib/server/db/schema.ts',
      sourceRevision: 'sha256:def456',
      tokenCount: 80,
    });

    // Cannot jump directly from UNRESOLVED to INJECTED
    expect(() => fsm.transition('INJECTED')).toThrow(/Invalid evidence slot transition/);
  });

  it('hot swaps candidates, reuses prefix tokens, and produces new manifest checksum', () => {
    const fsm = new EvidenceSlotFSM({
      slotId: 'slot_03',
      candidateOrdinal: 1,
      sourceRef: 'src/lib/server/db/client.ts',
      sourceRevision: 'sha256:rev1',
      tokenCount: 100,
    });

    // Advance to INJECTED
    fsm.transition('FETCHING');
    fsm.transition('VERIFIED');
    fsm.transition('RANKED');
    fsm.transition('RESIDENT');
    fsm.transition('INJECTED');

    // Swap candidate with shared prefix
    const sharedText = 'export const db = drizzle(pool);';
    const swapResult = fsm.swapCandidate({
      candidateOrdinal: 2,
      sourceRef: 'src/lib/server/db/pool.ts',
      sourceRevision: 'sha256:rev2',
      tokenCount: 150,
      tokenPrefix: `${sharedText} export const pool = new Pool();`,
    }, 'ornith-1.5-9b');

    expect(swapResult.previousSlot.state).toBe('STALE');
    expect(swapResult.newSlot.state).toBe('VERIFIED');
    expect(swapResult.newSlot.candidateOrdinal).toBe(2);
    expect(swapResult.newManifestChecksum).toMatch(/^sha256:/);
    expect(swapResult.bitfrostCacheKey).toContain('ornith-1.5-9b');
  });
});
