import { describe, expect, it } from 'vitest';
import {
  BITFROST_STATE_MEANINGS_V1,
  BitFrostTokenFsmManagerV1,
  compileFsmContextManifestV1,
  PARENT_ATLAS_TOPK_BOUNDARY_V1,
} from './bitfrost-token-fsm-v1.js';
import { buildFanoutEvidenceBundleV1, type FanoutEvidenceBundleV1 } from '../context/fanout-evidence-bundle-v1.js';
import {
  buildContextManifestV2,
  computeOrderedSelectionChecksumV1,
  computeSelectedOrdinalSetChecksumV1,
  verifyContextManifestV2Selection,
} from '../graph/context-manifest-v2.js';

describe('BitFrost Candidate Token FSM & Contextual Engineering (bitfrost-token-fsm-v1)', () => {
  it('formalizes the 5 state meanings matching the canonical specification', () => {
    expect(BITFROST_STATE_MEANINGS_V1.UNLOADED).toEqual({
      candidateMeaning: 'Canonical candidate known by candidateOrdinal, not in memory',
      tokenPromptMeaning: 'Not in prompt budget',
      gpuResidencyMeaning: 'No GPU tensor tile allocated',
    });
    expect(BITFROST_STATE_MEANINGS_V1.ADMITTED).toEqual({
      candidateMeaning: 'Admitted to FanoutEvidenceBundleV1, revision verified',
      tokenPromptMeaning: 'Sized and eligible for token knapsack',
      gpuResidencyMeaning: 'CPU pinned buffer or candidate descriptor ready',
    });
    expect(BITFROST_STATE_MEANINGS_V1.RESIDENT).toEqual({
      candidateMeaning: 'Active in BitFrost hot cache',
      tokenPromptMeaning: 'Emitted in ContextManifestV1 prompt context',
      gpuResidencyMeaning: 'Tile loaded in GPU cache (VRAM)',
    });
    expect(BITFROST_STATE_MEANINGS_V1.EVICTING).toEqual({
      candidateMeaning: 'Demoted by ARC/LIRS policy, held for inflight turns',
      tokenPromptMeaning: 'Excluded from new prompts, preserved for active generation',
      gpuResidencyMeaning: 'Marked for overwrite in next GPU tile cycle',
    });
    expect(BITFROST_STATE_MEANINGS_V1.PURGED).toEqual({
      candidateMeaning: 'Revision invalidated or replaced',
      tokenPromptMeaning: 'Token budget reclaimed',
      gpuResidencyMeaning: 'Memory released',
    });
  });

  it('verifies Top-K vs pagination boundaries across all 9 Parent Atlas operations', () => {
    const b = PARENT_ATLAS_TOPK_BOUNDARY_V1;
    expect(b.qdrant_ann.needTopK).toBe(true);
    expect(b.postgres_fts_trigram.needPagination).toBe(true);
    expect(b.ast_ontology_traversal.needTopK).toBe(true);
    expect(b.global_pagerank.needTopK).toBe(false);
    expect(b.personalized_pagerank.needTopK).toBe(true);
    expect(b.kmeans_centroids.needTopK).toBe(false);
    expect(b.bitfrost_cache_residency.needTopK).toBe(true);
    expect(b.context_prompt_tokens.needTopK).toBe(true);
    expect(b.ornith_answer_generation.needTopK).toBe(true);
  });

  it('enforces legal state transitions: UNLOADED -> ADMITTED -> RESIDENT -> EVICTING -> PURGED -> UNLOADED', () => {
    const fsm = new BitFrostTokenFsmManagerV1({ tokenBudget: 1000 });

    fsm.registerUnloaded({
      candidateOrdinal: 1,
      packetKey: 'pkg:core/db/client.ts',
      sourceRef: 'src/lib/server/db/client.ts',
      sourceRevision: 'sha256:abc1234567890123456789012345678901234567890123456789012345678901',
      tokenCount: 200,
    });

    expect(fsm.getSlot(1)?.state).toBe('UNLOADED');

    // 1. Admit candidate
    fsm.admitCandidate({
      candidateOrdinal: 1,
      sourceRevision: 'sha256:abc1234567890123456789012345678901234567890123456789012345678901',
      expectedRevision: 'sha256:abc1234567890123456789012345678901234567890123456789012345678901',
    });
    expect(fsm.getSlot(1)?.state).toBe('ADMITTED');

    // 2. Promote to resident
    fsm.promoteToResident({
      candidateOrdinal: 1,
      gpuTileId: 'tile-001',
      currentSourceRevision: 'sha256:abc1234567890123456789012345678901234567890123456789012345678901',
    });
    expect(fsm.getSlot(1)?.state).toBe('RESIDENT');
    expect(fsm.getSlot(1)?.gpuTileId).toBe('tile-001');
    expect(fsm.getResidentTokens()).toBe(200);

    // 3. Demote to evicting
    fsm.demoteToEvicting(1);
    expect(fsm.getSlot(1)?.state).toBe('EVICTING');

    // 4. Purge candidate
    fsm.purgeCandidate(1);
    expect(fsm.getSlot(1)?.state).toBe('PURGED');
    expect(fsm.getSlot(1)?.gpuTileId).toBeNull();
    expect(fsm.getResidentTokens()).toBe(0);

    // 5. Reclaim to unloaded
    fsm.reclaimToUnloaded(1);
    expect(fsm.getSlot(1)?.state).toBe('UNLOADED');
  });

  it('strictly blocks direct raw retrieval hit injection (UNLOADED -> RESIDENT)', () => {
    const fsm = new BitFrostTokenFsmManagerV1({ tokenBudget: 1000 });

    fsm.registerUnloaded({
      candidateOrdinal: 2,
      packetKey: 'pkg:core/search.ts',
      sourceRef: 'src/lib/server/search.ts',
      sourceRevision: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      tokenCount: 150,
    });

    expect(() => {
      fsm.promoteToResident({
        candidateOrdinal: 2,
        currentSourceRevision: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      });
    }).toThrow('FSM_FORBIDDEN_RAW_INJECTION');
  });

  it('rejects candidate admission when sourceRevision mismatches', () => {
    const fsm = new BitFrostTokenFsmManagerV1({ tokenBudget: 1000 });

    fsm.registerUnloaded({
      candidateOrdinal: 3,
      packetKey: 'pkg:core/cache.ts',
      sourceRef: 'src/lib/server/cache.ts',
      sourceRevision: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
      tokenCount: 100,
    });

    expect(() => {
      fsm.admitCandidate({
        candidateOrdinal: 3,
        sourceRevision: 'sha256:STALE_REVISION_XXXX',
        expectedRevision: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
      });
    }).toThrow('FSM_REVISION_MISMATCH');
  });

  it('enforces token budget limit when promoting to RESIDENT', () => {
    const fsm = new BitFrostTokenFsmManagerV1({ tokenBudget: 250 });

    fsm.registerUnloaded({
      candidateOrdinal: 4,
      packetKey: 'pkg:core/big.ts',
      sourceRef: 'src/lib/server/big.ts',
      sourceRevision: 'sha256:3333333333333333333333333333333333333333333333333333333333333333',
      tokenCount: 300, // Exceeds 250
    });

    fsm.admitCandidate({
      candidateOrdinal: 4,
      sourceRevision: 'sha256:3333333333333333333333333333333333333333333333333333333333333333',
      expectedRevision: 'sha256:3333333333333333333333333333333333333333333333333333333333333333',
    });

    expect(() => {
      fsm.promoteToResident({
        candidateOrdinal: 4,
        currentSourceRevision: 'sha256:3333333333333333333333333333333333333333333333333333333333333333',
      });
    }).toThrow('FSM_TOKEN_BUDGET_EXCEEDED');
  });

  it('compiles token-budgeted ContextManifestV1 via knapsack over admitted FanoutEvidenceBundleV1', () => {
    const fsm = new BitFrostTokenFsmManagerV1({ tokenBudget: 500 });

    // Prepare 3 candidates in FSM
    const rev1 = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';
    const rev2 = 'sha256:2222222222222222222222222222222222222222222222222222222222222222';
    const rev3 = 'sha256:3333333333333333333333333333333333333333333333333333333333333333';

    fsm.registerUnloaded({ candidateOrdinal: 1, packetKey: 'pkg:cand1', sourceRef: 'src/cand1.ts', sourceRevision: rev1, tokenCount: 200 });
    fsm.registerUnloaded({ candidateOrdinal: 2, packetKey: 'pkg:cand2', sourceRef: 'src/cand2.ts', sourceRevision: rev2, tokenCount: 250 });
    fsm.registerUnloaded({ candidateOrdinal: 3, packetKey: 'pkg:cand3', sourceRef: 'src/cand3.ts', sourceRevision: rev3, tokenCount: 300 });

    // Admit candidates 1, 2, 3
    fsm.admitCandidate({ candidateOrdinal: 1, sourceRevision: rev1, expectedRevision: rev1 });
    fsm.admitCandidate({ candidateOrdinal: 2, sourceRevision: rev2, expectedRevision: rev2 });
    fsm.admitCandidate({ candidateOrdinal: 3, sourceRevision: rev3, expectedRevision: rev3 });

    // Build FanoutEvidenceBundleV1
    const bundle: FanoutEvidenceBundleV1 = buildFanoutEvidenceBundleV1({
      schema: 'atlas.fanout-evidence-bundle.v1',
      workspaceRevision: 'sha256:ws11111111111111111111111111111111111111111111111111111111111111',
      candidateSnapshotRevision: 'snap-001',
      ordinalMapChecksum: 'ord-001',
      representationRevisions: { semantic_768: 'rep-001' },
      edgePolicyRevision: 'edge-001',
      maxHopDepth: 2,
      candidates: [
        {
          candidateOrdinal: 1,
          packetKey: 'pkg:cand1',
          sourceRef: 'src/cand1.ts',
          sourceRevision: rev1,
          evidence: [
            {
              evidenceId: 'ev-1',
              kind: 'SEMANTIC',
              sourceRef: 'src/cand1.ts',
              sourceRevision: rev1,
              extractorRevision: 'ext-01',
              text: 'evidence text 1',
              startByte: 0,
              endByte: 50,
              confidence: 0.95,
            },
          ],
        },
        {
          candidateOrdinal: 2,
          packetKey: 'pkg:cand2',
          sourceRef: 'src/cand2.ts',
          sourceRevision: rev2,
          evidence: [
            {
              evidenceId: 'ev-2',
              kind: 'STRUCTURAL',
              sourceRef: 'src/cand2.ts',
              sourceRevision: rev2,
              extractorRevision: 'ext-01',
              text: 'evidence text 2',
              startByte: 10,
              endByte: 60,
              confidence: 0.88,
            },
          ],
        },
        {
          candidateOrdinal: 3,
          packetKey: 'pkg:cand3',
          sourceRef: 'src/cand3.ts',
          sourceRevision: rev3,
          evidence: [
            {
              evidenceId: 'ev-3',
              kind: 'LEXICAL',
              sourceRef: 'src/cand3.ts',
              sourceRevision: rev3,
              extractorRevision: 'ext-01',
              text: 'evidence text 3',
              startByte: 5,
              endByte: 45,
              confidence: 0.75,
            },
          ],
        },
      ],
      summary: {
        tokenizerRevision: 'ornith-1.5-9b:tokenizer-unverified',
        tokenBudget: 1000,
        text: 'combined evidence text',
        evidenceOrder: ['ev-1', 'ev-2', 'ev-3'],
        checksum: 'sum-001',
      },
      canonicalAuthority: false,
    });

    // Compile with token budget of 500:
    // candidate 1 takes 200 -> remaining 300
    // candidate 2 takes 250 -> remaining 50
    // candidate 3 needs 300 -> exceeds 50, stays ADMITTED
    const result = compileFsmContextManifestV1({
      fsm,
      bundle,
      tokenBudget: 500,
      requestId: 'req-101',
      snapshotId: 'snap-001',
      query: 'test query',
      producerRevision: 'prod-001',
    });

    expect(result.residentOrdinals).toEqual([1, 2]);
    expect(result.unselectedOrdinals).toEqual([3]);
    expect(result.totalTokensUsed).toBe(450);

    // Verify FSM states
    expect(fsm.getSlot(1)?.state).toBe('RESIDENT');
    expect(fsm.getSlot(2)?.state).toBe('RESIDENT');
    expect(fsm.getSlot(3)?.state).toBe('ADMITTED');

    // Verify ContextManifestV1
    expect(result.manifest.schema).toBe('atlas.context-manifest.v1');
    expect(result.manifest.candidateCount).toBe(2);
    expect(result.manifest.selectedNodeKeys).toEqual(['pkg:cand1', 'pkg:cand2']);
    expect(result.manifest.evidenceRefs).toEqual(['ev-1', 'ev-2']);
  });

  // FSM-02. Contract: promotion must re-check the current source revision,
  // not only the revision recorded at admission.
  it('FSM-02: blocks promotion to RESIDENT when the current source revision differs from the admitted revision', () => {
    const fsm = new BitFrostTokenFsmManagerV1({ tokenBudget: 1000 });
    const revA = 'sha256:aaaa000000000000000000000000000000000000000000000000000000000000';
    const revB = 'sha256:bbbb000000000000000000000000000000000000000000000000000000000000';

    fsm.registerUnloaded({ candidateOrdinal: 5, packetKey: 'pkg:stale', sourceRef: 'src/stale.ts', sourceRevision: revA, tokenCount: 100 });
    fsm.admitCandidate({ candidateOrdinal: 5, sourceRevision: revA, expectedRevision: revA });

    // Source changed on disk after admission: current revision is revB.
    expect(() => fsm.promoteToResident({ candidateOrdinal: 5, currentSourceRevision: revB })).toThrow('FSM_REVISION_MISMATCH');
    expect(fsm.getSlot(5)?.state).toBe('ADMITTED');
  });

  // FSM-07. Contract: compile must honour the FSM's own token ceiling. A compile budget
  // larger than the FSM budget must skip candidates that do not fit, not throw mid-compile.
  it('FSM-07: compile skips candidates that exceed the FSM token ceiling instead of throwing mid-compile', () => {
    const fsm = new BitFrostTokenFsmManagerV1({ tokenBudget: 500 });
    const rev1 = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';
    const rev2 = 'sha256:2222222222222222222222222222222222222222222222222222222222222222';
    const rev3 = 'sha256:3333333333333333333333333333333333333333333333333333333333333333';

    fsm.registerUnloaded({ candidateOrdinal: 1, packetKey: 'pkg:cand1', sourceRef: 'src/cand1.ts', sourceRevision: rev1, tokenCount: 200 });
    fsm.registerUnloaded({ candidateOrdinal: 2, packetKey: 'pkg:cand2', sourceRef: 'src/cand2.ts', sourceRevision: rev2, tokenCount: 250 });
    fsm.registerUnloaded({ candidateOrdinal: 3, packetKey: 'pkg:cand3', sourceRef: 'src/cand3.ts', sourceRevision: rev3, tokenCount: 300 });
    fsm.admitCandidate({ candidateOrdinal: 1, sourceRevision: rev1, expectedRevision: rev1 });
    fsm.admitCandidate({ candidateOrdinal: 2, sourceRevision: rev2, expectedRevision: rev2 });
    fsm.admitCandidate({ candidateOrdinal: 3, sourceRevision: rev3, expectedRevision: rev3 });

    const bundle: FanoutEvidenceBundleV1 = buildFanoutEvidenceBundleV1({
      schema: 'atlas.fanout-evidence-bundle.v1',
      workspaceRevision: 'sha256:ws22222222222222222222222222222222222222222222222222222222222222',
      candidateSnapshotRevision: 'snap-002',
      ordinalMapChecksum: 'ord-002',
      representationRevisions: { semantic_768: 'rep-002' },
      edgePolicyRevision: 'edge-002',
      maxHopDepth: 2,
      candidates: [1, 2, 3].map((n) => ({
        candidateOrdinal: n,
        packetKey: `pkg:cand${n}`,
        sourceRef: `src/cand${n}.ts`,
        sourceRevision: [rev1, rev2, rev3][n - 1],
        evidence: [
          {
            evidenceId: `ev-${n}`,
            kind: 'SEMANTIC' as const,
            sourceRef: `src/cand${n}.ts`,
            sourceRevision: [rev1, rev2, rev3][n - 1],
            extractorRevision: 'ext-01',
            text: `evidence text ${n}`,
            startByte: 0,
            endByte: 50,
            confidence: 0.9,
          },
        ],
      })),
      summary: {
        tokenizerRevision: 'ornith-1.5-9b:tokenizer-unverified',
        tokenBudget: 1000,
        text: 'combined evidence text',
        evidenceOrder: ['ev-1', 'ev-2', 'ev-3'],
        checksum: 'sum-002',
      },
      canonicalAuthority: false,
    });

    let result: ReturnType<typeof compileFsmContextManifestV1> | undefined;
    expect(() => {
      result = compileFsmContextManifestV1({
        fsm,
        bundle,
        tokenBudget: 1000,
        requestId: 'req-budget',
        snapshotId: 'snap-budget',
        query: 'budget probe',
        producerRevision: 'producer-budget',
      });
    }).not.toThrow();
    expect(result?.residentOrdinals).toEqual([1, 2]);
    expect(result?.unselectedOrdinals).toEqual([3]);
    expect(fsm.getResidentTokens()).toBeLessThanOrEqual(500);
  });

  // FSM-03 / FSM-04. Contract (BITFROST_STATE_MEANINGS_V1): EVICTING and PURGED candidates are
  // excluded from new prompt assemblies. Exclusion must not abort the whole compile.
  it('FSM-03/04: excludes EVICTING and PURGED candidates from new manifests without aborting the compile', () => {
    const fsm = new BitFrostTokenFsmManagerV1({ tokenBudget: 1000 });
    const rev = (n: number) => `sha256:${String(n).repeat(64).slice(0, 64)}`;

    for (const n of [1, 2, 3]) {
      fsm.registerUnloaded({ candidateOrdinal: n, packetKey: `pkg:cand${n}`, sourceRef: `src/cand${n}.ts`, sourceRevision: rev(n), tokenCount: 100 });
      fsm.admitCandidate({ candidateOrdinal: n, sourceRevision: rev(n), expectedRevision: rev(n) });
    }
    fsm.promoteToResident({ candidateOrdinal: 2, currentSourceRevision: rev(2) });
    fsm.demoteToEvicting(2);
    fsm.purgeCandidate(3);

    const bundle: FanoutEvidenceBundleV1 = buildFanoutEvidenceBundleV1({
      schema: 'atlas.fanout-evidence-bundle.v1',
      workspaceRevision: 'sha256:ws33333333333333333333333333333333333333333333333333333333333333',
      candidateSnapshotRevision: 'snap-003',
      ordinalMapChecksum: 'ord-003',
      representationRevisions: { semantic_768: 'rep-003' },
      edgePolicyRevision: 'edge-003',
      maxHopDepth: 2,
      candidates: [1, 2, 3].map((n) => ({
        candidateOrdinal: n,
        packetKey: `pkg:cand${n}`,
        sourceRef: `src/cand${n}.ts`,
        sourceRevision: rev(n),
        evidence: [
          {
            evidenceId: `ev-${n}`,
            kind: 'SEMANTIC' as const,
            sourceRef: `src/cand${n}.ts`,
            sourceRevision: rev(n),
            extractorRevision: 'ext-01',
            text: `evidence text ${n}`,
            startByte: 0,
            endByte: 50,
            confidence: 0.9,
          },
        ],
      })),
      summary: {
        tokenizerRevision: 'ornith-1.5-9b:tokenizer-unverified',
        tokenBudget: 1000,
        text: 'combined evidence text',
        evidenceOrder: ['ev-1', 'ev-2', 'ev-3'],
        checksum: 'sum-003',
      },
      canonicalAuthority: false,
    });

    let result: ReturnType<typeof compileFsmContextManifestV1> | undefined;
    expect(() => {
      result = compileFsmContextManifestV1({
        fsm,
        bundle,
        tokenBudget: 1000,
        requestId: 'req-evict',
        snapshotId: 'snap-evict',
        query: 'eviction probe',
        producerRevision: 'producer-evict',
      });
    }).not.toThrow();
    expect(result?.residentOrdinals).toEqual([1]);
    expect(result?.unselectedOrdinals).toEqual([2, 3]);
    expect(fsm.getSlot(2)?.state).toBe('EVICTING');
    expect(fsm.getSlot(3)?.state).toBe('PURGED');
  });

  // ---- In-flight leases, generation-qualified slots, two-phase compile, V2 selection binding ----

  const leaseRev = (n: number) => `sha256:${String(n).repeat(64).slice(0, 64)}`;

  function leaseFsmWith(ordinals: number[], resident: boolean, budget = 1000): BitFrostTokenFsmManagerV1 {
    const fsm = new BitFrostTokenFsmManagerV1({ tokenBudget: budget });
    for (const n of ordinals) {
      fsm.registerUnloaded({ candidateOrdinal: n, packetKey: `pkg:cand${n}`, sourceRef: `src/cand${n}.ts`, sourceRevision: leaseRev(n), tokenCount: 100 });
      fsm.admitCandidate({ candidateOrdinal: n, sourceRevision: leaseRev(n), expectedRevision: leaseRev(n) });
      if (resident) fsm.promoteToResident({ candidateOrdinal: n, currentSourceRevision: leaseRev(n) });
    }
    return fsm;
  }

  function leaseBundle(ordinals: number[], snapshot: string, revOf: (n: number) => string = leaseRev): FanoutEvidenceBundleV1 {
    return buildFanoutEvidenceBundleV1({
      schema: 'atlas.fanout-evidence-bundle.v1',
      workspaceRevision: 'sha256:ws44444444444444444444444444444444444444444444444444444444444444',
      candidateSnapshotRevision: snapshot,
      ordinalMapChecksum: `ord-${snapshot}`,
      representationRevisions: { semantic_768: 'rep-lease' },
      edgePolicyRevision: 'edge-lease',
      maxHopDepth: 2,
      candidates: ordinals.map((n) => ({
        candidateOrdinal: n,
        packetKey: `pkg:cand${n}`,
        sourceRef: `src/cand${n}.ts`,
        sourceRevision: revOf(n),
        evidence: [{
          evidenceId: `ev-${snapshot}-${n}`,
          kind: 'SEMANTIC' as const,
          sourceRef: `src/cand${n}.ts`,
          sourceRevision: revOf(n),
          extractorRevision: 'ext-01',
          text: `evidence ${n}`,
          startByte: 0,
          endByte: 40,
          confidence: 0.9,
        }],
      })),
      summary: {
        tokenizerRevision: 'ornith-1.5-9b:tokenizer-unverified',
        tokenBudget: 1000,
        text: 'lease evidence',
        evidenceOrder: ordinals.map((n) => `ev-${snapshot}-${n}`),
        checksum: `sum-${snapshot}`,
      },
      canonicalAuthority: false,
    });
  }

  it('FSM-03A: two requests lease one slot; eviction waits for both releases', () => {
    const fsm = leaseFsmWith([1], true);
    const a = fsm.acquireLease({ requestId: 'req-a', candidateOrdinal: 1 });
    const b = fsm.acquireLease({ requestId: 'req-b', candidateOrdinal: 1 });
    expect(fsm.activeLeaseCount(1)).toBe(2);

    fsm.purgeCandidate(1);
    expect(fsm.getSlot(1)?.state).toBe('EVICTING');

    expect(fsm.releaseLease(a.leaseId)).toBe(true);
    expect(fsm.getSlot(1)?.state).toBe('EVICTING');
    expect(fsm.releaseLease(b.leaseId)).toBe(true);
    expect(fsm.getSlot(1)?.state).toBe('PURGED');
  });

  it('FSM-03B: cancelling one request leaves the other lease live; a second release is a no-op', () => {
    const fsm = leaseFsmWith([1], true);
    const a = fsm.acquireLease({ requestId: 'req-a', candidateOrdinal: 1 });
    fsm.acquireLease({ requestId: 'req-b', candidateOrdinal: 1 });

    expect(fsm.releaseLease(a.leaseId)).toBe(true);
    expect(fsm.releaseLease(a.leaseId)).toBe(false);
    expect(fsm.activeLeaseCount(1)).toBe(1);
    expect(fsm.getSlot(1)?.state).toBe('RESIDENT');
  });

  it('FSM-03C: a stale lease from a previous slot generation cannot release the reused slot', () => {
    const fsm = leaseFsmWith([1], true);
    const old = fsm.acquireLease({ requestId: 'req-old', candidateOrdinal: 1 });
    fsm.releaseLease(old.leaseId);
    fsm.purgeCandidate(1);
    fsm.reclaimToUnloaded(1);
    fsm.registerUnloaded({ candidateOrdinal: 1, packetKey: 'pkg:cand1', sourceRef: 'src/cand1.ts', sourceRevision: leaseRev(1), tokenCount: 100 });
    fsm.admitCandidate({ candidateOrdinal: 1, sourceRevision: leaseRev(1), expectedRevision: leaseRev(1) });
    fsm.promoteToResident({ candidateOrdinal: 1, currentSourceRevision: leaseRev(1) });
    const fresh = fsm.acquireLease({ requestId: 'req-new', candidateOrdinal: 1 });

    expect(fresh.slotGeneration).toBe(old.slotGeneration + 1);
    expect(fsm.releaseLease(old.leaseId)).toBe(false);
    expect(fsm.activeLeaseCount(1)).toBe(1);
  });

  it('cancellation releases every lease of one request exactly once and leaves other requests intact', () => {
    const fsm = leaseFsmWith([1, 2], true);
    fsm.acquireLease({ requestId: 'req-cancel', candidateOrdinal: 1 });
    fsm.acquireLease({ requestId: 'req-cancel', candidateOrdinal: 2 });
    fsm.acquireLease({ requestId: 'req-keep', candidateOrdinal: 1 });

    expect(fsm.releaseRequest('req-cancel')).toBe(2);
    expect(fsm.releaseRequest('req-cancel')).toBe(0);
    expect(fsm.activeLeaseCount(1)).toBe(1);
    expect(fsm.activeLeaseCount(2)).toBe(0);
  });

  it('refuses a new lease on an EVICTING slot', () => {
    const fsm = leaseFsmWith([1], true);
    fsm.demoteToEvicting(1);
    expect(() => fsm.acquireLease({ requestId: 'req-late', candidateOrdinal: 1 })).toThrow('FSM_LEASE_DENIED');
  });

  it('FSM-07B: a failed preflight leaves every FSM state unchanged', () => {
    const fsm = leaseFsmWith([1, 2], false);
    const bundle = leaseBundle([1, 2], 'snap-pre', (n) => (n === 2 ? leaseRev(9) : leaseRev(n)));

    expect(() => compileFsmContextManifestV1({
      fsm, bundle, tokenBudget: 1000, requestId: 'req-pre', snapshotId: 'snap-pre', query: 'q', producerRevision: 'p',
    })).toThrow('FSM_REVISION_MISMATCH');
    expect(fsm.getSlot(1)?.state).toBe('ADMITTED');
    expect(fsm.getSlot(2)?.state).toBe('ADMITTED');
    expect(fsm.activeLeaseCount(1)).toBe(0);
  });

  it('rejects a duplicate compile for the same request without acquiring duplicate leases', () => {
    const fsm = leaseFsmWith([1], false);
    const bundle = leaseBundle([1], 'snap-dup');
    const input = { fsm, bundle, tokenBudget: 1000, requestId: 'req-dup', snapshotId: 'snap-dup', query: 'q', producerRevision: 'p' };
    compileFsmContextManifestV1(input);

    expect(() => compileFsmContextManifestV1(input)).toThrow('FSM_DUPLICATE_REQUEST');
    expect(fsm.activeLeaseCount(1)).toBe(1);
  });

  it('a state change between preflight and commit rejects without any promotion', () => {
    const fsm = leaseFsmWith([1, 2], false);
    const bundle = leaseBundle([1, 2], 'snap-commit');

    expect(() => compileFsmContextManifestV1({
      fsm, bundle, tokenBudget: 1000, requestId: 'req-commit', snapshotId: 'snap-commit', query: 'q', producerRevision: 'p',
      beforeCommit: () => fsm.purgeCandidate(2),
    })).toThrow('FSM_COMMIT_REVALIDATION_FAILED');
    expect(fsm.getSlot(1)?.state).toBe('ADMITTED');
    expect(fsm.getSlot(2)?.state).toBe('PURGED');
    expect(fsm.activeLeaseCount(1)).toBe(0);
  });

  it('FSM-09A: compiler selection checksums verify against the V2 manifest', () => {
    const fsm = leaseFsmWith([1, 2, 3], false, 1000);
    const bundle = leaseBundle([1, 2, 3], 'snap-v2');
    const result = compileFsmContextManifestV1({
      fsm, bundle, tokenBudget: 1000, requestId: 'req-v2', snapshotId: 'snap-v2', query: 'q', producerRevision: 'p',
    });
    const v2 = buildContextManifestV2(result.manifest, {
      selectedOrdinalSetChecksum: result.selectedOrdinalSetChecksum,
      orderedSelectionChecksum: result.orderedSelectionChecksum,
      evidenceRevisions: { sourceRevision: leaseRev(1), representationRevision: null, featureRevision: null, ontologyRevision: null, modelRevision: null, promptTemplateRevision: null },
      ordinalMapChecksum: bundle.ordinalMapChecksum,
      retrievalPolicyRevision: 'policy-1',
      acePlaybookRevision: 'ace-1',
    });

    expect(() => verifyContextManifestV2Selection(v2, {
      snapshotId: 'snap-v2',
      ordinalMapChecksum: bundle.ordinalMapChecksum,
      selectedOrdinals: result.residentOrdinals,
    })).not.toThrow();
  });

  it('FSM-09B: a mutated or corrupted selected-ordinal checksum is rejected', () => {
    const fsm = leaseFsmWith([1, 2], false, 1000);
    const bundle = leaseBundle([1, 2], 'snap-bad');
    const result = compileFsmContextManifestV1({
      fsm, bundle, tokenBudget: 1000, requestId: 'req-bad', snapshotId: 'snap-bad', query: 'q', producerRevision: 'p',
    });
    const v2 = buildContextManifestV2(result.manifest, {
      selectedOrdinalSetChecksum: 'f'.repeat(64),
      orderedSelectionChecksum: result.orderedSelectionChecksum,
      evidenceRevisions: { sourceRevision: leaseRev(1), representationRevision: null, featureRevision: null, ontologyRevision: null, modelRevision: null, promptTemplateRevision: null },
      ordinalMapChecksum: bundle.ordinalMapChecksum,
      retrievalPolicyRevision: 'policy-1',
      acePlaybookRevision: 'ace-1',
    });

    expect(() => verifyContextManifestV2Selection(v2, {
      snapshotId: 'snap-bad', ordinalMapChecksum: bundle.ordinalMapChecksum, selectedOrdinals: result.residentOrdinals,
    })).toThrow('CM2_SELECTED_ORDINAL_SET_MISMATCH');
    expect(() => verifyContextManifestV2Selection(v2, {
      snapshotId: 'snap-bad', ordinalMapChecksum: bundle.ordinalMapChecksum, selectedOrdinals: [1],
    })).toThrow('CM2_SELECTED_ORDINAL_SET_MISMATCH');
  });

  it('FSM-09C: reordering the same selected set changes ordered identity but not the set checksum', () => {
    const ctx = { snapshotId: 'snap-order', ordinalMapChecksum: 'ord-x' };
    const setA = computeSelectedOrdinalSetChecksumV1({ ...ctx, selectedOrdinals: [1, 2] });
    const setB = computeSelectedOrdinalSetChecksumV1({ ...ctx, selectedOrdinals: [2, 1] });
    const orderA = computeOrderedSelectionChecksumV1({ ordinals: [1, 2], selectedNodeKeys: ['a', 'b'], evidenceRefs: ['e1'] });
    const orderB = computeOrderedSelectionChecksumV1({ ordinals: [2, 1], selectedNodeKeys: ['b', 'a'], evidenceRefs: ['e1'] });

    expect(setA).toBe(setB);
    expect(orderA).not.toBe(orderB);
  });

  it('guarantees cold vs warm replay consistency', () => {
    const run = () => {
      const fsm = new BitFrostTokenFsmManagerV1({ tokenBudget: 400 });
      const rev = 'sha256:4444444444444444444444444444444444444444444444444444444444444444';
      fsm.registerUnloaded({ candidateOrdinal: 1, packetKey: 'pkg:c1', sourceRef: 'src/c1.ts', sourceRevision: rev, tokenCount: 150 });
      fsm.admitCandidate({ candidateOrdinal: 1, sourceRevision: rev, expectedRevision: rev });

      const bundle = buildFanoutEvidenceBundleV1({
        schema: 'atlas.fanout-evidence-bundle.v1',
        workspaceRevision: 'sha256:ws44444444444444444444444444444444444444444444444444444444444444',
        candidateSnapshotRevision: 'snap-002',
        ordinalMapChecksum: 'ord-002',
        representationRevisions: { semantic_768: 'rep-002' },
        edgePolicyRevision: 'edge-002',
        maxHopDepth: 1,
        candidates: [
          {
            candidateOrdinal: 1,
            packetKey: 'pkg:c1',
            sourceRef: 'src/c1.ts',
            sourceRevision: rev,
            evidence: [
              {
                evidenceId: 'ev-c1',
                kind: 'SEMANTIC',
                sourceRef: 'src/c1.ts',
                sourceRevision: rev,
                extractorRevision: 'ext-02',
                text: 'c1 text',
                startByte: 0,
                endByte: 10,
                confidence: 1.0,
              },
            ],
          },
        ],
        summary: {
          tokenizerRevision: 'ornith-1.5-9b:tokenizer-unverified',
          tokenBudget: 400,
          text: 'c1 summary',
          evidenceOrder: ['ev-c1'],
          checksum: 'sum-c1',
        },
        canonicalAuthority: false,
      });

      return compileFsmContextManifestV1({
        fsm,
        bundle,
        tokenBudget: 400,
        requestId: 'req-cold-warm',
        snapshotId: 'snap-002',
        query: 'deterministic query',
        producerRevision: 'prod-002',
      });
    };

    const cold = run();
    const warm = run();

    expect(cold.manifest).toEqual(warm.manifest);
    expect(cold.residentOrdinals).toEqual(warm.residentOrdinals);
    expect(cold.totalTokensUsed).toEqual(warm.totalTokensUsed);
  });
});
