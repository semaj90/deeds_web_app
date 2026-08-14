import { describe, expect, it } from 'vitest';
import {
  joinSearchRuntimeQasAsyncFeatureSources,
  joinSearchRuntimeQasFeatureSources,
} from './search-runtime-qas-feature-resolver.js';
import { projectAtlasSearchResponseToQasFromSources } from './search-runtime-adapter.js';

const candidate = {
  packetKey: 'packet:1',
  sourceRef: 'src/example.ts',
  stableSymbolId: 'symbol:1',
  symbolVersionId: 'symbol-version:1',
  workspaceRevision: 'workspace:r1',
  sourceRevision: 'source:r1',
  representationRevision: 'semantic_768:r1',
};

describe('SearchRuntime QAS feature resolver', () => {
  it('joins injected owners without filling missing evidence', () => {
    const joined = joinSearchRuntimeQasFeatureSources([candidate], {
      projection: () => ({ packet_key: 'packet:1', execution_utility: 0.4 }),
      context: () => ({
        graphRevision: 'graph:r1',
        featureRevision: 'features:r1',
        representationRevision: 'semantic_768:r1',
        taskKind: 'debug',
        features: {
          semanticAffinity: 0.9,
          lexicalAffinity: 0.8,
          graphAuthority: 0.7,
          astAffinity: 0.6,
          processAffinity: 0.5,
          domainAffinity: 0.4,
          priorExecutionSuccess: 0.4,
          reuseProbability: 0.3,
          recency: 0.2,
        },
      }),
    });

    expect(joined.projections).toEqual([{ packet_key: 'packet:1', execution_utility: 0.4 }]);
    expect(joined.missingProjectionPacketKeys).toEqual([]);
    expect(joined.missingContextPacketKeys).toEqual([]);
    expect(joined.resolveFeatures(candidate)?.features.processAffinity).toBe(0.5);
  });

  it('keeps absent owners explicit instead of fabricating a row', () => {
    const joined = joinSearchRuntimeQasFeatureSources([candidate], {
      projection: () => undefined,
      context: () => undefined,
    });

    expect(joined.projections).toEqual([{ packet_key: 'packet:1' }]);
    expect(joined.missingProjectionPacketKeys).toEqual(['packet:1']);
    expect(joined.missingContextPacketKeys).toEqual(['packet:1']);
    expect(joined.resolveFeatures(candidate)).toBeUndefined();
  });

  it('supports the Atlas response-to-QAS owner composition boundary', () => {
    const result = projectAtlasSearchResponseToQasFromSources({
      requestId: 'request:1',
      policyRevision: 'policy:r1',
      workspaceRevision: 'workspace:r1',
      representationRevision: 'semantic_768:r1',
      response: {
        packets: [{
          chunk_id: 'chunk:1',
          packet_key: 'packet:1',
          source_ref: 'src/example.ts',
          stable_symbol_id: 'symbol:1',
          symbol_version_id: 'symbol-version:1',
          workspace_revision: 'workspace:r1',
          source_revision: 'source:r1',
          representation_revision: 1,
          fusion_rank: 1,
          fusion_score: 0.9,
        }],
      },
      sources: {
        projection: () => ({
          packet_key: 'packet:1',
          semantic_similarity_768: 0.9,
          lexical_score: 0.8,
          ast_signal: 0.7,
          authority_norm: 0.6,
          domain_fit_query: 0.5,
          recency: 0.4,
          retrieval_frequency: 0.3,
          execution_utility: 0.2,
          process_fit: 0.1,
        }),
        context: () => ({
          graphRevision: 'graph:r1',
          featureRevision: 'features:r1',
          representationRevision: 'semantic_768:r1',
          taskKind: 'debug',
          features: {
            semanticAffinity: 0.9,
            lexicalAffinity: 0.8,
            graphAuthority: 0.6,
            astAffinity: 0.7,
            processAffinity: 0.1,
            domainAffinity: 0.5,
            priorExecutionSuccess: 0.2,
            reuseProbability: 0.3,
            recency: 0.4,
          },
        }),
      },
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.canonicalId).toBe('symbol:1');
    expect(result.exactBaseline).toEqual([{ canonicalId: 'symbol:1', rank: 1, score: 0.9 }]);
  });

  it('composes async snapshot owners without changing candidate order', async () => {
    const joined = await joinSearchRuntimeQasAsyncFeatureSources([candidate], {
      projection: async (item) => ({ packet_key: item.packetKey, execution_utility: 0.8 }),
      context: async () => ({
        graphRevision: 'graph:r1',
        featureRevision: 'features:r1',
        representationRevision: 'semantic_768:r1',
        taskKind: 'verify',
        features: {
          semanticAffinity: 0.9,
          lexicalAffinity: 0.8,
          graphAuthority: 0.7,
          astAffinity: 0.6,
          processAffinity: 0.5,
          domainAffinity: 0.4,
          priorExecutionSuccess: 0.8,
          reuseProbability: 0.3,
          recency: 0.2,
        },
      }),
    }, {
      hotness: 'hotness:r1',
      trace: 'trace:r1',
      process: 'process:r1',
    });

    expect(joined.projections[0]?.packet_key).toBe('packet:1');
    expect(joined.resolveFeatures(candidate)?.taskKind).toBe('verify');
    expect(joined.sourceRevisions).toEqual({ hotness: 'hotness:r1', trace: 'trace:r1', process: 'process:r1' });
  });
});
