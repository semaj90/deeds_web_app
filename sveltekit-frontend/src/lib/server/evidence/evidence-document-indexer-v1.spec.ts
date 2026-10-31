import { describe, expect, it, vi } from 'vitest';
import { indexEvidenceDocumentCanonicalV1 } from './evidence-document-indexer-v1.js';

describe('indexEvidenceDocumentCanonicalV1', () => {
  it('routes every legal chunk through the admitted EmbeddingGemma persistence port', async () => {
    const embed = vi.fn(async () => ({
      vector: Array.from({ length: 768 }, (_, index) => index === 0 ? 1 : 0),
      model: 'embeddinggemma:fixture',
      outputChecksum: 'fixture-output-checksum',
      provenance: { modelArtifactSha256: `sha256:${'a'.repeat(64)}` } as any,
    }));
    const persist = vi.fn(async () => undefined);

    const result = await indexEvidenceDocumentCanonicalV1({
      evidenceId: 'evidence-fixture',
      sourceRevision: `sha256:${'b'.repeat(64)}`,
      text: 'A short synthetic legal evidence document with a clearly bounded text body.',
      dependencies: { embed, persist },
    });

    expect(result.chunkCount).toBeGreaterThan(0);
    expect(result.persistedCount).toBe(result.chunkCount);
    expect(embed).toHaveBeenCalledTimes(result.chunkCount);
    expect(persist).toHaveBeenCalledTimes(result.chunkCount);
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      evidenceId: 'evidence-fixture',
      sourceRevision: `sha256:${'b'.repeat(64)}`,
      model: 'embeddinggemma:fixture',
      embedding: expect.arrayContaining([1]),
    }));
  });

  it('rejects missing source lineage before embedding or persistence', async () => {
    const embed = vi.fn();
    const persist = vi.fn();
    await expect(indexEvidenceDocumentCanonicalV1({
      evidenceId: 'evidence-fixture',
      sourceRevision: 'unqualified',
      text: 'Synthetic text',
      dependencies: { embed, persist },
    })).rejects.toThrow('EVIDENCE_SOURCE_REVISION_INVALID');
    expect(embed).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });
});
