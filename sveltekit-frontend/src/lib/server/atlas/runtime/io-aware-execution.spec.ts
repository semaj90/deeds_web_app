import { describe, expect, it } from 'vitest';
import {
  atlasRuleOfThree,
  createStreamingTopKState,
  findResidency,
  materializeTileRanges,
  mergeStreamingTopK,
  planTileScheduler,
  ResidencyTableV1Schema,
  SearchPartitionPolicyV1Schema,
} from './io-aware-execution.js';

describe('Atlas IO-aware execution', () => {
  it('encodes MOVE -> COMPUTE -> COMPACT as a mnemonic, not a math law', () => {
    expect(atlasRuleOfThree('test').phases).toEqual(['MOVE', 'COMPUTE', 'COMPACT']);
  });

  it('shrinks tiles to the usable VRAM envelope', () => {
    const plan = planTileScheduler({
      inputCount: 10_000,
      rowBytes: 768 * 4,
      requestedTileRows: 4096,
      availableVramBytes: 64 * 1024 * 1024,
      reserveVramBytes: 16 * 1024 * 1024,
      workingSetMultiplier: 3,
      prefetchDepth: 2,
      producerRevision: 'test',
    });
    const expectedCapacity = Math.floor((48 * 1024 * 1024) / ((768 * 4) * 3 * 2));
    expect(plan.tileRows).toBe(expectedCapacity);
    expect(plan.tileCount).toBe(Math.ceil(10_000 / expectedCapacity));
  });

  it('rejects a VRAM envelope too small for one resident row', () => {
    expect(() => planTileScheduler({
      inputCount: 1,
      rowBytes: 4096,
      requestedTileRows: 1,
      availableVramBytes: 4096,
      reserveVramBytes: 4096,
      producerRevision: 'test',
    })).toThrow(/cannot fit one resident row/);
  });

  it('uses serpentine traversal only as locality/order, not score semantics', () => {
    const plan = planTileScheduler({
      inputCount: 10,
      rowBytes: 4,
      requestedTileRows: 3,
      availableVramBytes: 1024,
      reserveVramBytes: 0,
      traversal: 'SERPENTINE',
      producerRevision: 'test',
    });
    expect(materializeTileRanges(plan).map((range) => range.direction)).toEqual([
      'FORWARD', 'REVERSE', 'FORWARD', 'REVERSE',
    ]);
    expect(plan.exactSemanticsPreserved).toBe(true);
  });

  it('keeps a deterministic compact top-K without globally sorting all rows', () => {
    let state = createStreamingTopKState(3, 'test');
    state = mergeStreamingTopK(state, [
      { canonicalId: 'B', score: 0.7, ordinal: 1 },
      { canonicalId: 'A', score: 0.7, ordinal: 0 },
      { canonicalId: 'C', score: 0.4, ordinal: 2 },
    ]);
    state = mergeStreamingTopK(state, [
      { canonicalId: 'D', score: 0.9, ordinal: 3 },
      { canonicalId: 'E', score: 0.6, ordinal: 4 },
    ]);
    expect(state.entries.map((entry) => entry.canonicalId)).toEqual(['D', 'A', 'B']);
    expect(state.currentCutoff).toBe(0.7);
    expect(state.processedRows).toBe(5);
  });

  it('prefers the hottest valid residency tier', () => {
    const table = ResidencyTableV1Schema.parse({
      schema: 'atlas.residency-table.v1',
      workspaceRevision: 'ws-1',
      entries: [
        {
          representationId: 'semantic_768', representationRevision: 'sem-7',
          ordinalStart: 0, ordinalEndExclusive: 100, tier: 'HOST_RAM', byteLength: 1000,
          checksumSha256: null, artifactRef: null, mutable: false,
        },
        {
          representationId: 'semantic_768', representationRevision: 'sem-7',
          ordinalStart: 0, ordinalEndExclusive: 100, tier: 'VRAM', byteLength: 1000,
          checksumSha256: null, artifactRef: null, mutable: false,
        },
      ],
      producerRevision: 'test',
    });
    expect(findResidency(table, 'semantic_768', 'sem-7', 42).map((entry) => entry.tier)).toEqual(['VRAM', 'HOST_RAM']);
  });

  it('does not turn the golden ratio into a generic graph-search law', () => {
    expect(() => SearchPartitionPolicyV1Schema.parse({
      schema: 'atlas.search-partition-policy.v1',
      policy: 'GOLDEN_SECTION_UNIMODAL_1D',
      domainKind: 'GRAPH',
      branchOrBeamWidth: null,
      goldenRatio: 1.618033988749895,
      canClaimGraphOptimality: false,
      notes: ['invalid on generic graph'],
      producerRevision: 'test',
    })).toThrow(/not a generic graph-search branching law/);
  });

  it('permits golden-section only as a bounded 1-D optimization policy', () => {
    const policy = SearchPartitionPolicyV1Schema.parse({
      schema: 'atlas.search-partition-policy.v1',
      policy: 'GOLDEN_SECTION_UNIMODAL_1D',
      domainKind: 'CONTINUOUS_1D',
      branchOrBeamWidth: null,
      goldenRatio: 1.618033988749895,
      canClaimGraphOptimality: false,
      notes: ['for tuning a scalar parameter with an assumed unimodal objective'],
      producerRevision: 'test',
    });
    expect(policy.goldenRatio).toBe(1.618033988749895);
  });
});
