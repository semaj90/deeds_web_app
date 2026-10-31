import { chunkLegalDocument, type LegalChunkerOptions } from '$lib/server/indexer/legal-chunker.js';
import type { EvidenceEmbeddingProvenance } from './evidence-embedding-contract.js';
import type { PersistEvidenceVectorInputV1 } from './evidence-vector-persistence-v1.js';

export interface EvidenceDocumentIndexerDependenciesV1 {
  embed(text: string): Promise<{
    vector: number[];
    model: string;
    outputChecksum: string;
    provenance: EvidenceEmbeddingProvenance;
  }>;
  persist(input: PersistEvidenceVectorInputV1): Promise<unknown>;
}

export async function indexEvidenceDocumentCanonicalV1(input: {
  evidenceId: string;
  sourceRevision: string;
  text: string;
  doclingBlocks?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
  dependencies: EvidenceDocumentIndexerDependenciesV1;
}): Promise<{ chunkCount: number; persistedCount: number }> {
  if (!input.evidenceId.trim()) throw new Error('EVIDENCE_ID_REQUIRED');
  if (!/^sha256:[a-f0-9]{64}$/.test(input.sourceRevision)) throw new Error('EVIDENCE_SOURCE_REVISION_INVALID');
  const text = input.text.trim();
  if (!text) throw new Error('EVIDENCE_TEXT_EMPTY');

  const chunks = chunkLegalDocument(text, {
    maxTokens: 512,
    overlap: 128,
    doclingBlocks: input.doclingBlocks as LegalChunkerOptions['doclingBlocks'],
  });
  if (chunks.length === 0) throw new Error('EVIDENCE_CHUNKING_EMPTY');

  let persistedCount = 0;
  for (const chunk of chunks) {
    const content = chunk.text.slice(0, 8000);
    const produced = await input.dependencies.embed(content);
    await input.dependencies.persist({
      evidenceId: input.evidenceId,
      sourceRevision: input.sourceRevision,
      chunkIndex: chunk.chunkIndex,
      content,
      embedding: produced.vector,
      model: produced.model,
      outputChecksum: produced.outputChecksum,
      provenance: produced.provenance,
      metadata: {
        ...(input.metadata ?? {}),
        source_revision: input.sourceRevision,
        embedding_provenance: produced.provenance,
        chunkIndex: chunk.chunkIndex,
        sectionPath: chunk.sectionPath,
        heading: chunk.heading,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        tokenCount: chunk.tokenCount,
      },
    });
    persistedCount += 1;
  }
  return { chunkCount: chunks.length, persistedCount };
}
