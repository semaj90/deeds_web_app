import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { OntologyLinkedTupleV1Schema } from './contracts/ontology-linked-tuple-v1.js';
import {
  buildOntologyLinkedTupleCachePlan,
  writeOntologyLinkedTupleCachePlan,
} from './ontology-linked-tuple-cache.js';

describe('ontology-linked-tuple-cache', () => {
  const baseTuple = OntologyLinkedTupleV1Schema.parse({
    tupleId: 'tuple-123',
    schemaVersion: 'ontology-linked-tuple.v1',
    packetKey: 'packet-123',
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

  it('builds a revisioned tuple cache plan with ontology token-map metadata', () => {
    const plan = buildOntologyLinkedTupleCachePlan({
      packetId: 'packet-123',
      packetRevision: 'packet-rev-1',
      featureId: 'feature-123',
      sourceRef: 'taxonomy:node-1',
      tuples: [baseTuple],
      centroid: {
        domainClass: 'retrieval',
        domainCentroidKey: 'atlas:centroid:domain:retrieval',
        featureCentroidKey: 'atlas:centroid:feature:feature-123',
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

    expect(plan.schemaVersion).toBe('ontology-linked-tuple-cache-plan.v1');
    expect(plan.tupleKeys).toEqual(['ace:ontology:tuple:tuple-123']);
    expect(plan.tokenMapKey).toMatch(/^ace:ontology:tokenmap:feature-123:/);
    expect(plan.blockedHashesKey).toMatch(/^ace:ontology:blocked_content_hashes:/);
    expect(plan.records[0]?.trustTier).toBe('canonical');
    expect(plan.records[0]?.centroid.domainCentroidKey).toBe('atlas:centroid:domain:retrieval');
  });

  it('writes tuple, token-map, and blocked-hash entries to a redis-like pipeline', async () => {
    const plan = buildOntologyLinkedTupleCachePlan({
      packetId: 'packet-123',
      packetRevision: 'packet-rev-1',
      featureId: 'feature-123',
      sourceRef: 'taxonomy:node-1',
      tuples: [baseTuple],
      centroid: {
        domainClass: 'retrieval',
        domainCentroidKey: 'atlas:centroid:domain:retrieval',
        featureCentroidKey: 'atlas:centroid:feature:feature-123',
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

    const writes: Array<{ key: string; value: string; ttl?: number }> = [];
    const fakeRedis = {
      pipeline() {
        return {
          set(key: string, value: string, mode?: string, ttl?: number) {
            writes.push({ key, value, ttl: mode === 'EX' ? ttl : undefined });
            return this;
          },
          exec: async () => [],
        };
      },
    };

    await writeOntologyLinkedTupleCachePlan(plan, 3600, fakeRedis as never);

    const keys = writes.map((write) => write.key);
    expect(keys).toContain('ace:ontology:tuple:tuple-123');
    expect(keys).toContain(plan.tokenMapKey);
    expect(keys).toContain(plan.blockedHashesKey);

    const tokenMapWrite = writes.find((write) => write.key === plan.tokenMapKey);
    expect(tokenMapWrite).toBeTruthy();
    const tokenMap = JSON.parse(tokenMapWrite?.value ?? '{}');
    expect(tokenMap.schemaVersion).toBe('ontology-token-map.v1');
    expect(tokenMap.canonicalLabels).toContain('retrieval');
    expect(tokenMap.blockedContentHashes).toHaveLength(1);
  });
});
