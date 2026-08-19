import { describe, expect, it } from 'vitest';
import {
  AlignedPolicySignalV1Schema,
  buildPrefillDecodeAlignment,
  dspyShadowAuthority,
  preferredAtlasPrimitive,
} from './aligned-policy-lanes.js';

describe('aligned Parent Atlas policy lanes', () => {
  it('keeps BM25 and experimental BM42 as lexical signals rather than dense inverses', () => {
    for (const kind of ['BM25', 'BM42_EXPERIMENTAL'] as const) {
      const signal = AlignedPolicySignalV1Schema.parse({
        kind,
        logicalLane: 'lexical',
        authority: 'EXACT_RETRIEVAL_SCORE',
        value: 0.7,
        representationId: null,
        representationRevision: null,
        algorithmRevision: `${kind.toLowerCase()}-r1`,
        evidenceRefs: [],
      });
      expect(signal.logicalLane).toBe('lexical');
    }
    expect(() => AlignedPolicySignalV1Schema.parse({
      kind: 'BM25', logicalLane: 'semantic', authority: 'EXACT_RETRIEVAL_SCORE', value: 1,
      representationId: 'semantic_768', representationRevision: 'r1', algorithmRevision: 'r1', evidenceRefs: [],
    })).toThrow(/lexical lane/);
  });

  it('keeps latent128/64 as derived semantic routing features', () => {
    const latent = AlignedPolicySignalV1Schema.parse({
      kind: 'LATENT_64', logicalLane: 'semantic', authority: 'DERIVED_FEATURE', value: 0.8,
      representationId: 'latent_64', representationRevision: 'latent-r1', algorithmRevision: 'ae-r1', evidenceRefs: [],
    });
    expect(latent.authority).toBe('DERIVED_FEATURE');
    expect(() => AlignedPolicySignalV1Schema.parse({ ...latent, authority: 'EXACT_RETRIEVAL_SCORE' })).toThrow(/derived routing features/);
  });

  it('keeps PageRank HITS and Leiden in one graph vote group', () => {
    for (const kind of ['PAGERANK', 'HITS_HUB', 'HITS_AUTHORITY', 'LEIDEN_COMMUNITY'] as const) {
      const signal = AlignedPolicySignalV1Schema.parse({
        kind, logicalLane: 'graph', authority: 'DERIVED_FEATURE', value: 0.5,
        representationId: 'sgraph', representationRevision: 'g1', algorithmRevision: `${kind}-r1`, evidenceRefs: [],
      });
      expect(signal.logicalLane).toBe('graph');
    }
  });

  it('keeps HMM and Viterbi state evidence out of retrieval authority', () => {
    const hmm = AlignedPolicySignalV1Schema.parse({
      kind: 'HMM_POSTERIOR', logicalLane: 'policy', authority: 'POLICY_STATE_ONLY', value: 0.8,
      representationId: null, representationRevision: null, algorithmRevision: 'hmm-r1', evidenceRefs: [],
    });
    expect(hmm.authority).toBe('POLICY_STATE_ONLY');
    expect(() => AlignedPolicySignalV1Schema.parse({ ...hmm, logicalLane: 'semantic' })).toThrow(/policy-state/);
  });

  it('keeps DSPy as a shadow optimizer unable to bypass legality or mutation gates', () => {
    const authority = dspyShadowAuthority({
      optimizerRevision: 'gepa-r1', heldOutMetricRevision: 'eval-r1', producerRevision: 'test',
    });
    expect(authority.mode).toBe('SHADOW');
    expect(authority.mayChooseAmongAllowedActions).toBe(true);
    expect(authority.mayChangeLegalHmmTransitions).toBe(false);
    expect(authority.mayBypassExactPromotion).toBe(false);
    expect(authority.mayAuthorizeMutation).toBe(false);
  });

  it('maps operations to executors without creating new evidence lanes', () => {
    expect(preferredAtlasPrimitive('LOW_RANK_PROJECTION')).toBe('CUBLASLT_GEMM');
    expect(preferredAtlasPrimitive('DENSE_EXACT_SEARCH')).toBe('CUVS_BRUTE_FORCE');
    expect(preferredAtlasPrimitive('DENSE_ANN_SEARCH')).toBe('CUVS_CAGRA');
    expect(preferredAtlasPrimitive('GRAPH_HUB_AUTHORITY')).toBe('CUGRAPH_HITS');
    expect(preferredAtlasPrimitive('LEXICAL_RETRIEVAL')).toBe('CPU_SERVICE');
  });

  it('requires exact promoted context before prefill and separates hybrid decode state', () => {
    const plan = buildPrefillDecodeAlignment({ schedulerRuntimeOwnsBatching: true, producerRevision: 'test' });
    expect(plan.prefill.exactPromotedEvidenceRequired).toBe(true);
    expect(plan.prefill.denseGemmPriority).toBe(true);
    expect(plan.decode.recurrentStatePreserved).toBe(true);
    expect(plan.decode.fullAttentionKvCacheAccountedSeparately).toBe(true);
    expect(plan.rerankerBeforePrefill).toBe(true);
  });
});
