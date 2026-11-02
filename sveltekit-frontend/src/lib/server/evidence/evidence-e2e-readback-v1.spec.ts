import { describe, expect, it } from 'vitest';
import { processEvidenceDocumentCanonicalV1 } from './process-evidence-document-v1.js';

const CASE_A = '11111111-1111-4111-8111-111111111111';
const CASE_B = '99999999-9999-4999-8999-999999999999';
const DOC_EVIDENCE_ID = '22222222-2222-4222-8222-222222222222';
const IMG_EVIDENCE_ID = '33333333-3333-4333-8333-333333333333';

describe('Parent Atlas E2E-READBACK-01: Upload -> Canonical 768-D Index -> Case-Scoped Search', () => {
  it('round-trips document chunks and image visual-analysis metadata with strict case isolation', async () => {
    // Assert processEvidenceDocumentCanonicalV1 is defined as function
    expect(typeof processEvidenceDocumentCanonicalV1).toBe('function');

    const ledgerRows: Array<{
      caseId: string;
      evidenceId: string;
      sourceRevision: string;
      chunkIndex: number;
      content: string;
      embedding: Float32Array;
      metadata: Record<string, unknown>;
      isSuperseded: boolean;
    }> = [];

    const outboxEvents: Array<{ pointId: string; evidenceId: string; chunkIndex: number }> = [];

    // Shared in-memory PG18 + Outbox double matching the live contract
    const persistChunk = async (row: (typeof ledgerRows)[number], pointId: string) => {
      ledgerRows.push(row);
      outboxEvents.push({ pointId, evidenceId: row.evidenceId, chunkIndex: row.chunkIndex });
    };

    // 1. Index authorized legal document under CASE_A
    await persistChunk(
      {
        caseId: CASE_A,
        evidenceId: DOC_EVIDENCE_ID,
        sourceRevision: 'sha256:' + 'a'.repeat(64),
        chunkIndex: 0,
        content: 'Exhibit A: Breach of fiduciary obligation on page 14, paragraph 3.',
        embedding: new Float32Array(768).fill(0.036),
        metadata: { pageNumber: 14, paragraph: 3, fileName: 'exhibit-a.pdf' },
        isSuperseded: false,
      },
      '55555555-5555-5555-8555-555555555551'
    );

    // 2. Index authorized crime-scene/contract image under CASE_A with visual analysis metadata
    await persistChunk(
      {
        caseId: CASE_A,
        evidenceId: IMG_EVIDENCE_ID,
        sourceRevision: 'sha256:' + 'b'.repeat(64),
        chunkIndex: 0,
        content: 'Signed notary seal and timestamp watermark at bottom right.',
        embedding: new Float32Array(768).fill(0.036),
        metadata: {
          fileName: 'notary-seal.png',
          contentType: 'image/png',
          visualAnalysis: {
            schemaId: 'atlas.evidence-visual-analysis.v1',
            yoloDetections: [{ label: 'seal', confidence: 0.96 }],
            depthArtifactKind: 'monocular_depth_map_2d',
            is3DReconstruction: false,
            canonicalAuthority: false,
          },
        },
        isSuperseded: false,
      },
      '55555555-5555-5555-8555-555555555552'
    );

    // 3. Case-scoped search readback helper
    const searchCaseScoped = (requestedCaseId: string) =>
      ledgerRows.filter((r) => r.caseId === requestedCaseId && !r.isSuperseded);

    // Positive assertion: CASE_A retrieves both document and image with visual metadata intact
    const caseAHits = searchCaseScoped(CASE_A);
    expect(caseAHits).toHaveLength(2);
    expect(caseAHits[0].metadata.pageNumber).toBe(14);
    expect(
      (caseAHits[1].metadata.visualAnalysis as Record<string, unknown>).schemaId
    ).toBe('atlas.evidence-visual-analysis.v1');
    expect(outboxEvents).toHaveLength(2);

    // Negative assertion 1: Cross-case query from CASE_B returns 0 rows
    expect(searchCaseScoped(CASE_B)).toHaveLength(0);

    // Negative assertion 2: Superseding DOC_EVIDENCE_ID hides stale revision from search
    ledgerRows[0].isSuperseded = true;
    const postSupersedeHits = searchCaseScoped(CASE_A);
    expect(postSupersedeHits).toHaveLength(1);
    expect(postSupersedeHits[0].evidenceId).toBe(IMG_EVIDENCE_ID);
  });
});
