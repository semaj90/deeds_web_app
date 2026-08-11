import { describe, expect, it } from 'vitest';
import {
  PosConceptTaggingRequestSchema,
  buildPosConceptTaggingPacket,
} from './pos-concept-tagging-lane.js';

const baseRequest = {
  schemaVersion: 'pos-concept-tagging-lane.v1' as const,
  packetKey: 'packet:pos-1',
  sourceRef: 'src/lib/server/example.ts',
  sourceRevision: 'source:rev-1',
  workspaceRevision: 'workspace:main',
  featureId: 'feature:example',
  featureLabel: 'Example concept',
  treeNodeId: 'tree:node:1',
  titleId: 'title:example',
  jsonlSourceDigest: 'sha256:jsonl',
  jsonlRecordIndex: 0,
  jsonlLineNumber: 12,
  jsonlParserRevision: 'jsonl-parser@1',
  representationId: 'semantic_768' as const,
  representationRevision: 'semantic_768@2026-08-11',
  producerId: 'pos-concept-tagging-lane',
  producerRevision: 'lane:v1',
  featureRevision: 'feature:v1',
  graphRevision: 'graph:v1',
  ontologyRevision: 'ontology:v1',
  modelRevision: 'model:v1',
  partOfSpeech: 'NOUN',
  astSymbols: ['validateSession', 'session'],
  semanticConceptIds: ['concept:session', 'concept:auth'],
  ontologyIds: ['ontology:auth.sessions'],
  posCandidateLabels: [
    { label: 'NOUN', score: 0.91 },
    { label: 'PROPN', score: 0.08 },
  ],
  citations: [{ citationText: 'Miranda v. Arizona', sourceRef: 'citation:miranda' }],
  screenshots: [{ path: 'screenshots/session.png', caption: 'session diagram' }],
  policySummary: 'Prefer canonical evidence-backed concepts.',
  mcpToolCalls: [
    { callId: 'tool-1', toolName: 'trace.kag_search', dependencyMode: 'independent', summary: 'search evidence' },
    { callId: 'tool-2', toolName: 'atlas.coverage', dependencyMode: 'independent', summary: 'coverage check' },
  ],
  rankingSignals: {
    bm25: 0.71,
    bm42: 0.66,
    pageRank: 0.83,
    somCell: '3:7',
    kmeansCluster: 12,
    communityId: 'community:auth',
    manifold: { x: 0.1, y: 0.2, z: 0.3, w: 0.4 },
  },
  participants: [
    { entityId: 'concept:session', entityKind: 'semantic_concept' as const, role: 'target' as const, label: 'session' },
    { entityId: 'packet:pos-1', entityKind: 'packet' as const, role: 'packet' as const, label: 'Example concept' },
  ],
  concepts: [],
  sourceTables: ['atlas_packets', 'feature_lexical_facts', 'feature_structural_facts'],
};

describe('pos-concept-tagging-lane', () => {
  it('keeps tuple identity stable when participant order changes', () => {
    const packetA = buildPosConceptTaggingPacket(baseRequest);
    const packetB = buildPosConceptTaggingPacket({
      ...baseRequest,
      participants: [...baseRequest.participants].reverse(),
    });

    expect(packetA.packetKey).toBe(baseRequest.packetKey);
    expect(packetA.sourceRef).toBe(baseRequest.sourceRef);
    expect(packetA.featureMatrixSetup.semantic_dimension).toBe(768);
    expect(packetA.featureMatrixSetup.feature_tiers.static_packet.width).toBe(5);
    expect(packetA.featureMatrixSetup.feature_tiers.candidate_query.kmeans_candidates).toEqual([64, 128, 256]);
    expect(packetA.featureMatrixSetup.feature_tiers.candidate_query.som_grid).toEqual([20, 20]);
    expect(packetA.featureMatrixSetup.feature_tiers.candidate_query.top_cluster_soft_cap).toBe(8);
    expect(packetA.featureVector5Static.features).toHaveLength(5);
    expect(packetA.featureVector5Static.presence_mask).toEqual([1, 1, 1, 0, 0]);
    expect(packetA.posTaggerOutput.top_k_labels).toHaveLength(2);
    expect(packetA.jsonlParsedEvidence.source_ref).toBe(baseRequest.sourceRef);
    expect(packetA.domainClassification?.labels.length).toBeLessThanOrEqual(8);
    expect(packetA.ontologyLinkedTuples.map((tuple) => tuple.tupleId)).toEqual(
      packetB.ontologyLinkedTuples.map((tuple) => tuple.tupleId)
    );
    expect(packetA.outputDigest).toBe(packetB.outputDigest);
  });

  it('keeps ranking signals out of canonical tuple identity', () => {
    const packetA = buildPosConceptTaggingPacket(baseRequest);
    const packetB = buildPosConceptTaggingPacket({
      ...baseRequest,
      rankingSignals: {
        ...baseRequest.rankingSignals,
        pageRank: 0.12,
        bm25: 0.21,
      },
    });

    expect(packetA.ontologyLinkedTuples.map((tuple) => tuple.tupleId)).toEqual(
      packetB.ontologyLinkedTuples.map((tuple) => tuple.tupleId)
    );
    expect(packetA.packetKey).toBe(packetB.packetKey);
    expect(packetA.sourceRevision).toBe(packetB.sourceRevision);
    expect(packetA.domainClassification?.primary_label).toBeTruthy();
  });

  it('requires explicit revision lineage and caps MCP fanout at 3', () => {
    expect(() =>
      PosConceptTaggingRequestSchema.parse({
        ...baseRequest,
        sourceRevision: '',
      })
    ).toThrow();

    expect(() =>
      PosConceptTaggingRequestSchema.parse({
        ...baseRequest,
        mcpToolCalls: [
          ...baseRequest.mcpToolCalls,
          { callId: 'tool-3', toolName: 'trace.graph.pagerank', dependencyMode: 'independent' as const },
          { callId: 'tool-4', toolName: 'atlas.coverage', dependencyMode: 'independent' as const },
        ],
      })
    ).toThrow();
  });
});
