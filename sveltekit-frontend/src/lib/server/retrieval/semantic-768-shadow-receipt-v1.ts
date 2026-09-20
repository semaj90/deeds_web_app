import { createHash } from 'node:crypto';
import { checkVectorShapeV1, type EmbeddingReceiptV1 } from '../embedding/embedding-provider-v1.js';
import type { RetrievalTextV1 } from './retrieval-text-v1.js';

export interface Semantic768ShadowReceiptV1 {
  schema: 'atlas.semantic-768-shadow-receipt.v1';
  canonicalChunkId: string;
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  retrievalTextRevision: RetrievalTextV1['templateRevision'];
  retrievalTextChecksum: string;
  representationId: 'semantic_768';
  dimensions: 768;
  modelId: string;
  representationRevision: string;
  inputChecksum: string;
  vectorChecksum: string;
  executorReceipt: 'EmbeddingReceiptV1';
  shadowOnly: true;
  canonicalAuthority: false;
  writesPerformed: false;
  promotionAuthorized: false;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function buildSemantic768ShadowReceiptV1(
  retrievalText: RetrievalTextV1,
  receipt: EmbeddingReceiptV1,
): Semantic768ShadowReceiptV1 {
  if (retrievalText.schema !== 'atlas.retrieval-text.v1') throw new Error('SEMANTIC_768_SHADOW_RETRIEVAL_TEXT_SCHEMA_REQUIRED');
  const shape = checkVectorShapeV1(receipt.embedding);
  if (!shape.ok) throw new Error(`SEMANTIC_768_SHADOW_VECTOR_INVALID:${shape.failures.join(',')}`);
  if (!receipt.modelId.trim()) throw new Error('SEMANTIC_768_SHADOW_MODEL_REQUIRED');
  if (!receipt.representationRevision.trim()) throw new Error('SEMANTIC_768_SHADOW_REPRESENTATION_REVISION_REQUIRED');
  const expectedInputChecksum = sha256Hex(retrievalText.text);
  if (receipt.inputChecksum !== expectedInputChecksum) throw new Error('SEMANTIC_768_SHADOW_INPUT_CHECKSUM_MISMATCH');
  if (!receipt.vectorChecksum.trim()) throw new Error('SEMANTIC_768_SHADOW_VECTOR_CHECKSUM_REQUIRED');
  return {
    schema: 'atlas.semantic-768-shadow-receipt.v1',
    canonicalChunkId: retrievalText.canonicalChunkId,
    packetKey: retrievalText.packetKey,
    sourceRef: retrievalText.sourceRef,
    sourceRevision: retrievalText.sourceRevision,
    workspaceRevision: retrievalText.workspaceRevision,
    retrievalTextRevision: retrievalText.templateRevision,
    retrievalTextChecksum: retrievalText.textChecksum,
    representationId: 'semantic_768',
    dimensions: 768,
    modelId: receipt.modelId,
    representationRevision: receipt.representationRevision,
    inputChecksum: receipt.inputChecksum,
    vectorChecksum: receipt.vectorChecksum,
    executorReceipt: 'EmbeddingReceiptV1',
    shadowOnly: true,
    canonicalAuthority: false,
    writesPerformed: false,
    promotionAuthorized: false,
  };
}
