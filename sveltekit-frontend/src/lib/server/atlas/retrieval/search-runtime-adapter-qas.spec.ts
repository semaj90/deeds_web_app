import { describe, expect, it } from 'vitest';
import {
  admitSearchRuntimeQasToAceManifestV1,
  createAtlasSearchAdapter,
  projectAtlasSearchResponseToQas,
} from './search-runtime-adapter.js';

describe('SearchRuntime QAS projection boundary', () => {
  it('composes the opt-in caller from the canonical runtime response', async () => {
    const adapter = createAtlasSearchAdapter({
      runtime: {
        search: async () => ({
          packets: [{
            chunk_id: 'chunk:one', packet_key: 'packet:one', stable_symbol_id: 'symbol:one',
            symbol_version_id: 'symbol-version:one', source_ref: 'src/one.ts',
            workspace_revision: 'workspace:r1', source_revision: 'source:r1',
            representation_revision: 1, retrieval_score: 0.9, fusion_score: 0.8, fusion_rank: 1,
          }],
          metadata: {} as any,
          provenance: {} as any,
        } as any),
      },
    });
    expect(typeof adapter.search).toBe('function');
    expect(typeof adapter.searchWithQas).toBe('function');
    const result = await adapter.searchWithQas({ query: 'inspect', topK: 1 }, {
      requestId: 'request:one', policyRevision: 'policy:r1', workspaceRevision: 'workspace:r1',
      representationRevision: 'semantic_768:r1',
      sources: {
        projection: () => ({
          packet_key: 'packet:one', semantic_similarity_768: 0.9, lexical_score: 0.8,
          ast_signal: 0.7, authority_norm: 0.6, domain_fit_query: 0.5,
          recency: 0.4, retrieval_frequency: 0.3, execution_utility: 0.2, process_fit: 0.1,
        }),
        context: () => ({
          graphRevision: 'graph:r1', featureRevision: 'features:r1',
          representationRevision: 'semantic_768:r1', taskKind: 'DEBUG',
          features: {
            semanticAffinity: 0, lexicalAffinity: 0, graphAuthority: 0, astAffinity: 0,
            processAffinity: 0, domainAffinity: 0, priorExecutionSuccess: 0,
            reuseProbability: 0, recency: 0,
          },
        }),
      },
    });
    expect(result.response.packets).toHaveLength(1);
    expect(result.qas.accepted).toHaveLength(1);
    expect(result.qas.exactBaseline[0]?.canonicalId).toBe('symbol:one');

    const manifestResult = await adapter.searchWithAceManifest({ query: 'inspect', topK: 1 }, {
      requestId: 'request:one', policyRevision: 'policy:r1', workspaceRevision: 'workspace:r1',
      representationRevision: 'semantic_768:r1', candidateSnapshotRevision: 'snapshot:search:r1',
      retrievalPolicyRevision: 'policy:r1', acePlaybookRevision: 'ace-playbook:r1', tokenBudget: 1200,
      producerRevision: 'search-snapshot:r1', laneMaskByCanonicalId: { 'symbol:one': ['semantic', 'lexical', 'graph'] },
      sources: {
        projection: () => ({
          packet_key: 'packet:one', semantic_similarity_768: 0.9, lexical_score: 0.8,
          ast_signal: 0.7, authority_norm: 0.6, domain_fit_query: 0.5,
          recency: 0.4, retrieval_frequency: 0.3, execution_utility: 0.2, process_fit: 0.1,
        }),
        context: () => ({
          graphRevision: 'graph:r1', featureRevision: 'features:r1',
          representationRevision: 'semantic_768:r1', taskKind: 'DEBUG',
          features: { semanticAffinity: 0, lexicalAffinity: 0, graphAuthority: 0, astAffinity: 0,
            processAffinity: 0, domainAffinity: 0, priorExecutionSuccess: 0,
            reuseProbability: 0, recency: 0 },
        }),
      },
    });
    expect(manifestResult.admission.manifest.v1.snapshotId).toBe('snapshot:search:r1');
    expect(manifestResult.snapshot.rowCount).toBe(1);
    expect(manifestResult.snapshot.rows[0]?.canonicalId).toBe('symbol:one');
    expect(manifestResult.snapshot.identityAuthority).toBe(false);
    expect(manifestResult.writesPerformed).toBe(false);

    const admission = admitSearchRuntimeQasToAceManifestV1({
      projection: result.qas,
      candidateSnapshotRevision: 'snapshot:search:r1',
      retrievalPolicyRevision: 'policy:r1',
      representationRevision: 'semantic_768:r1',
      acePlaybookRevision: 'ace-playbook:r1',
      tokenBudget: 1200,
      graphRevision: 'graph:r1',
      laneMaskByCanonicalId: { 'symbol:one': ['semantic', 'lexical', 'graph'] },
      producerRevision: 'search-snapshot:r1',
    });
    expect(admission.manifest.v1.snapshotId).toBe('snapshot:search:r1');
    expect(admission.canonicalAuthority).toBe(false);
  });

  it('returns accepted rows and an exact baseline without writing artifacts', () => {
    const result = projectAtlasSearchResponseToQas({
      requestId: 'request:one',
      policyRevision: 'policy:r1',
      workspaceRevision: 'workspace:r1',
      representationRevision: 'semantic_768:r1',
      response: {
        packets: [{
          chunk_id: 'chunk:one', packet_key: 'packet:one', stable_symbol_id: 'symbol:one',
          symbol_version_id: 'symbol-version:one', source_ref: 'src/one.ts',
          workspace_revision: 'workspace:r1', source_revision: 'source:r1',
          representation_revision: 1, retrieval_score: 0.9, fusion_score: 0.8, fusion_rank: 1,
        }],
      } as any,
      projections: [{
        packet_key: 'packet:one', semantic_similarity_768: 0.9, lexical_score: 0.8,
        ast_signal: 0.7, authority_norm: 0.6, domain_fit_query: 0.5, recency: 0.4,
        retrieval_frequency: 0.3, execution_utility: 0.2, process_fit: 0.1,
      }],
      resolveFeatures: () => ({
        graphRevision: 'graph:r1', featureRevision: 'features:r1',
        representationRevision: 'semantic_768:r1', taskKind: 'DEBUG',
        features: {
          semanticAffinity: 0, lexicalAffinity: 0, graphAuthority: 0, astAffinity: 0,
          processAffinity: 0, domainAffinity: 0, priorExecutionSuccess: 0,
          reuseProbability: 0, recency: 0,
        },
      }),
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].canonicalId).toBe('symbol:one');
    expect(result.exactBaseline).toEqual([{ canonicalId: 'symbol:one', rank: 1, score: 0.8 }]);
    expect(result.rejected).toHaveLength(0);
  });
});
