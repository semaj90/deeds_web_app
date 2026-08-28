import { describe, expect, it } from 'vitest';
import { buildGroundedEvidenceItemV1 } from './grounded-evidence-adapter-v1.js';

describe('grounded evidence adapter', () => {
  it('accepts exact source-byte grounding', () => {
    const item = buildGroundedEvidenceItemV1({
      evidenceId: 'ast:e1', kind: 'STRUCTURAL', sourceRef: 'src/a.ts', sourceRevision: 'sha256:source',
      extractorRevision: 'treesitter-chunker:v1', extractionText: 'const x = 1', startByte: 0, endByte: 11,
      sourceBytes: new TextEncoder().encode('const x = 1;'), confidence: 1,
    });
    expect(item.startByte).toBe(0);
    expect(item.endByte).toBe(11);
  });

  it('rejects a model phrase that is not the exact source slice', () => {
    expect(() => buildGroundedEvidenceItemV1({
      evidenceId: 'bad', kind: 'ONTOLOGY', sourceRef: 'src/a.ts', sourceRevision: 'sha256:source',
      extractorRevision: 'langextract:v1', extractionText: 'x is initialized', startByte: 0, endByte: 11,
      sourceBytes: new TextEncoder().encode('const x = 1;'),
    })).toThrow('GROUNDED_EVIDENCE_SOURCE_SLICE_MISMATCH');
  });
});
