import { describe, expect, it } from 'vitest';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import {
  createSearchRuntimeAceProductionSourceAdapterV1,
  SEARCH_RUNTIME_ACE_PRODUCTION_SOURCE_OWNER_V1,
} from './search-runtime-ace-production-source-adapter-v1.js';

const ordinalMap = materializeCandidateOrdinalMap({
  candidates: [],
  candidateSnapshotRevision: 'snapshot:production-test:r1',
  workspaceRevision: 'workspace:production-test:r1',
  producerRevision: 'ordinal:production-test:r1',
});

const sources = {
  candidates: [],
  ordinalMap,
  rows: [],
  laneMaskByOrdinal: {},
  producerRevision: 'feature:production-test:r1',
  retrievalPolicyRevision: 'policy:production-test:r1',
  representationRevision: 'semantic_768:production-test:r1',
  acePlaybookRevision: 'ace-playbook:production-test:r1',
  tokenBudget: 512,
  graphRevision: null,
};

describe('SearchRuntimeAceProductionSourceAdapterV1', () => {
  it('delegates only to the injected canonical source owner', async () => {
    const calls: string[] = [];
    const adapter = createSearchRuntimeAceProductionSourceAdapterV1({
      implementationRef: SEARCH_RUNTIME_ACE_PRODUCTION_SOURCE_OWNER_V1,
      resolveCanonicalSources: async (input) => {
        calls.push(`${input.query}:${input.requestId}:${input.workspaceRevision}`);
        return sources;
      },
    });

    const result = await adapter.resolve({
      query: 'inspect',
      requestId: 'request:production-test:r1',
      workspaceRevision: 'workspace:production-test:r1',
    });

    expect(result.ordinalMap.ordinalMapChecksum).toBe(ordinalMap.ordinalMapChecksum);
    expect(calls).toEqual(['inspect:request:production-test:r1:workspace:production-test:r1']);
  });

  it('fails closed when the canonical source owner is unavailable', async () => {
    const adapter = createSearchRuntimeAceProductionSourceAdapterV1({
      implementationRef: SEARCH_RUNTIME_ACE_PRODUCTION_SOURCE_OWNER_V1,
      resolveCanonicalSources: async () => null,
    });

    await expect(adapter.resolve({
      query: 'inspect',
      requestId: 'request:production-test:r1',
      workspaceRevision: 'workspace:production-test:r1',
    })).rejects.toThrow('ACE_PRODUCTION_SOURCE_OWNER_UNAVAILABLE');
  });

  it('rejects a mismatched implementation reference', () => {
    expect(() => createSearchRuntimeAceProductionSourceAdapterV1({
      implementationRef: 'historical.ace.owner.v0' as typeof SEARCH_RUNTIME_ACE_PRODUCTION_SOURCE_OWNER_V1,
      resolveCanonicalSources: async () => sources,
    })).toThrow('ACE_PRODUCTION_SOURCE_OWNER_IMPLEMENTATION_REF_MISMATCH');
  });
});
