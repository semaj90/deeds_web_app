import { describe, expect, it } from 'vitest';
import { POST } from './+server.js';

describe('/api/atlas/concept-tagging', () => {
  it('returns a stable packet envelope for valid inputs', async () => {
    const response = await POST({
      locals: { user: { id: 'test-user' } },
      request: new Request('http://localhost/api/atlas/concept-tagging', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          packetKey: 'packet:pos-2',
          sourceRef: 'src/lib/server/example.ts',
          sourceRevision: 'source:rev-2',
          workspaceRevision: 'workspace:main',
          featureId: 'feature:example',
          featureLabel: 'Example concept',
          treeNodeId: 'tree:node:2',
          titleId: 'title:example',
          jsonlSourceDigest: 'sha256:jsonl',
          jsonlRecordIndex: 0,
          jsonlLineNumber: 7,
          jsonlParserRevision: 'jsonl-parser@1',
          representationId: 'semantic_768',
          representationRevision: 'semantic_768@2026-08-11',
          producerId: 'pos-concept-tagging-lane',
          producerRevision: 'lane:v1',
          featureRevision: 'feature:v1',
          partOfSpeech: 'NOUN',
          astSymbols: ['validateSession'],
          semanticConceptIds: ['concept:session'],
          ontologyIds: ['ontology:auth.sessions'],
          citations: [{ citationText: 'Miranda v. Arizona', sourceRef: 'citation:miranda' }],
          screenshots: [{ path: 'screenshots/session.png' }],
          policySummary: 'Prefer evidence-backed tags.',
          mcpToolCalls: [
            { callId: 'tool-1', toolName: 'trace.kag_search', dependencyMode: 'independent' },
          ],
          rankingSignals: { bm25: 0.5, pageRank: 0.7, somCell: '3:7' },
          participants: [
            { entityId: 'packet:pos-2', entityKind: 'packet', role: 'packet', label: 'Example concept' },
            { entityId: 'concept:session', entityKind: 'semantic_concept', role: 'target', label: 'session' },
          ],
          concepts: [],
          sourceTables: ['atlas_packets', 'feature_lexical_facts'],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.tupleCount).toBeGreaterThan(0);
    expect(body.packet.packetKey).toBe('packet:pos-2');
    expect(body.packet.ontologyLinkedTuples[0]?.provenance.sourceRevision).toBe('source:rev-2');
    expect(body.packet.featureMatrixSetup.semantic_dimension).toBe(768);
    expect(body.packet.featureMatrixSetup.feature_tiers.static_packet.width).toBe(5);
    expect(body.packet.featureMatrixSetup.feature_tiers.candidate_query.som_grid).toEqual([20, 20]);
    expect(body.packet.featureVector5Static.presence_mask).toEqual([1, 1, 1, 0, 0]);
    expect(body.packet.domainClassification.labels.length).toBeLessThanOrEqual(8);
  });

  it('keeps the top-level envelope stable on validation failure', async () => {
    const response = await POST({
      locals: { user: { id: 'test-user' } },
      request: new Request('http://localhost/api/atlas/concept-tagging', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packetKey: 'packet:pos-2' }),
      }),
    } as never);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.packet).toBeNull();
    expect(body.tuples).toEqual([]);
    expect(body.tupleCount).toBe(0);
  });
});
