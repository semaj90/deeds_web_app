import { describe, expect, it } from 'vitest';
import { computePacketKey } from '$lib/server/atlas/identity/packet-key-builder.js';
import { buildPosConceptTaggingPacketFromSource } from './source-pos-concept-packet.js';

describe('source-pos-concept-packet', () => {
  it('builds a deterministic packet from AST and LangExtract evidence', async () => {
    const packetKey = computePacketKey(
      'src/lib/server/example.ts',
      'tree:node:7',
      'title:session-store'
    );

    const result = await buildPosConceptTaggingPacketFromSource({
      packetKey,
      sourceRef: 'src/lib/server/example.ts',
      sourceRevision: 'source:rev-1',
      treeNodeId: 'tree:node:7',
      titleId: 'title:session-store',
      featureId: 'feature:session-store',
      featureLabel: 'Session store',
      text: 'export class SessionStore { loadSession(sessionId: string) { return sessionId; } }',
      isCode: true,
      representationRevision: 'semantic_768@1',
      producerId: 'source-pos-concept-adapter',
      producerRevision: 'source-pos-concept-adapter-v1',
      featureRevision: 'feature:v1',
      semanticConceptIds: ['concept:session', 'concept:store'],
      ontologyIds: ['ontology:session-store'],
      extractedFeatures: [
        {
          type: 'ast_class',
          name: 'SessionStore',
          description: 'Class SessionStore',
          source: 'ast-grep',
          lineNumber: 1,
          confidence: 0.95,
        },
        {
          type: 'ast_function',
          name: 'loadSession',
          description: 'Function loadSession',
          source: 'ast-grep',
          lineNumber: 2,
          confidence: 0.95,
        },
        {
          type: 'entity_org',
          name: 'OpenAI',
          description: 'ORG entity: "OpenAI"',
          source: 'langextract',
          confidence: 0.88,
        },
      ],
    });

    expect(result).not.toBeNull();
    expect(result?.packet.packetKey).toBe(packetKey);
    expect(result?.packet.sourceRef).toBe('src/lib/server/example.ts');
    expect(result?.packet.sourceRevision).toBe('source:rev-1');
    expect(result?.packet.posTaggerOutput.head_type).toBe('pytorch');
    expect(result?.packet.posTaggerOutput.part_of_speech).toBe('PROPN');
    expect(result?.packet.astSymbols).toEqual(expect.arrayContaining(['SessionStore', 'loadSession']));
    expect(result?.packet.semanticConceptIds.some((value) => value.includes('openai'))).toBe(true);
    expect(result?.packet.featureMatrixSetup.feature_tiers.static_packet.width).toBe(5);
    expect(result?.packet.featureMatrixSetup.feature_tiers.candidate_query.som_grid).toEqual([20, 20]);
    expect(result?.packet.featureMatrixSetup.feature_tiers.candidate_query.exact_knn_top_k).toBe(100);
    expect(result?.packet.jsonlParsedEvidence.content_hash).toMatch(/^sha256:/);
    expect(result?.packet.domainClassification?.primary_label).toBe('pos-tagging');
  });
});
