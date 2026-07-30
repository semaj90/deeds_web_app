import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { OntologyLinkedTupleV1Schema } from '../atlas/contracts/ontology-linked-tuple-v1.js';
import {
  buildOntologyLinkedTupleCachePlan,
  writeOntologyLinkedTupleCachePlan,
} from '../atlas/ontology-linked-tuple-cache.js';
import { enrichCodebaseContextItem, fetchOntologyTuples, isContentBlocked } from './ontology-tuple-enricher.js';

describe('ontology-tuple-enricher', () => {
  const tuple = OntologyLinkedTupleV1Schema.parse({
    tupleId: 'tuple-ace-1',
    schemaVersion: 'ontology-linked-tuple.v1',
    packetKey: 'packet-ace-1',
    sourceRef: 'src/lib/server/example.ts',
    treeNodeId: 'node-1',
    titleId: 'title-1',
    surfaceText: 'retrieval',
    tokenIndex: 0,
    partOfSpeech: null,
    label: 'retrieval',
    labelKind: 'ontology',
    labelSource: 'semantic_tagger',
    ontologyIds: ['onto:retrieval'],
    conceptIds: ['concept:retrieval'],
    confidence: 0.95,
    evidenceState: 'ACTIVE_VERIFIED',
    provenance: {
      sourceTables: ['taxonomy_nodes', 'taxonomy_edges'],
      labelerVersion: 'labeler-v1',
      taggerVersion: 'tagger-v1',
      ontologyVersion: 'ontology-v1',
      nlpVersion: 'nlp-v1',
    },
  });

  function createFakeRedis() {
    const store = new Map<string, string>();
    return {
      store,
      get: async (key: string) => store.get(key) ?? null,
      keys: async (pattern: string) =>
        [...store.keys()].filter((key) => {
          if (pattern === 'ace:ontology:tuple:*') return key.startsWith('ace:ontology:tuple:');
          return key === pattern;
        }),
      pipeline() {
        return {
          set(key: string, value: string) {
            store.set(key, value);
            return this;
          },
          exec: async () => [],
        };
      },
    };
  }

  it('writes a tokenmap alias that the ACE reader can resolve', async () => {
    const redis = createFakeRedis();
    const plan = buildOntologyLinkedTupleCachePlan({
      packetId: 'packet-ace-1',
      packetRevision: 'packet-rev-1',
      featureId: 'feature-ace-1',
      sourceRef: 'src/lib/server/example.ts',
      tuples: [tuple],
      centroid: {
        domainClass: 'retrieval',
        domainCentroidKey: 'atlas:centroid:domain:retrieval',
        featureCentroidKey: 'atlas:centroid:feature:feature-ace-1',
        kmeansCentroidKey: 'atlas:centroid:kmeans:7',
        somCentroidKey: 'atlas:centroid:som:3:4',
        communityCentroidKey: 'atlas:centroid:community:9',
        somCluster: '3:4',
        somRow: 3,
        somCol: 4,
        kmeansClusters: [7],
        ontologyTags: ['retrieval', 'search'],
      },
      revisions: {
        workspaceRevision: 'workspace-rev-1',
        ontologyVersion: 'ontology-v1',
        centroidVersion: 'centroid-v1',
      },
      blockedContentHashes: [crypto.createHash('sha256').update('blocked').digest('hex')],
    });

    await writeOntologyLinkedTupleCachePlan(plan, 3600, redis as never);

    const tuples = await fetchOntologyTuples('src/lib/server/example.ts', 'feature-ace-1', {
      redis: redis as never,
    });
    expect(tuples).toHaveLength(1);
    expect(tuples[0]?.tupleId).toBe('tuple-ace-1');

    const enriched = await enrichCodebaseContextItem(
      { filePath: 'src/lib/server/example.ts', featureId: 'feature-ace-1', content: 'retrieval' },
      { redis: redis as never }
    );
    expect(enriched.ontologyTuples).toHaveLength(1);
    expect((enriched.ontologyTuples as Array<{ tupleId: string }>)[0]?.tupleId).toBe('tuple-ace-1');
  });

  it('blocks content by workspace revision ledger', async () => {
    const redis = createFakeRedis();
    const plan = buildOntologyLinkedTupleCachePlan({
      packetId: 'packet-ace-2',
      packetRevision: 'packet-rev-2',
      featureId: 'feature-ace-2',
      sourceRef: 'src/lib/server/blocked.ts',
      tuples: [tuple],
      centroid: {
        domainClass: 'retrieval',
        domainCentroidKey: 'atlas:centroid:domain:retrieval',
        featureCentroidKey: 'atlas:centroid:feature:feature-ace-2',
        kmeansCentroidKey: 'atlas:centroid:kmeans:7',
        somCentroidKey: 'atlas:centroid:som:3:4',
        communityCentroidKey: 'atlas:centroid:community:9',
        somCluster: '3:4',
        somRow: 3,
        somCol: 4,
        kmeansClusters: [7],
        ontologyTags: ['retrieval', 'search'],
      },
      revisions: {
        workspaceRevision: 'workspace-rev-2',
        ontologyVersion: 'ontology-v1',
        centroidVersion: 'centroid-v1',
      },
      blockedContentHashes: [crypto.createHash('sha256').update('prompt-injection').digest('hex')],
    });

    await writeOntologyLinkedTupleCachePlan(plan, 3600, redis as never);

    await expect(
      isContentBlocked('prompt-injection', 'workspace-rev-2', { redis: redis as never })
    ).resolves.toBe(true);
    await expect(isContentBlocked('safe content', 'workspace-rev-2', { redis: redis as never })).resolves.toBe(false);
  });
});
