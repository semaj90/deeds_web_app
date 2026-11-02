import { z } from 'zod';
import {
  SEMANTIC_DIMENSION,
  SEMANTIC_REPRESENTATION_ID,
} from './embedding-contract-768.js';

export const FastEmbedOnnxExecutorReceiptV1Schema = z.object({
  schema: z.literal('atlas.fastembed-onnx-executor-receipt.v1'),
  modelId: z.literal('google/embeddinggemma-300m'),
  modelRevision: z.string().min(1),
  executorId: z.literal('fastembed_onnx'),
  executorRevision: z.string().min(1),
  artifactFormat: z.literal('onnx'),
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
  representationId: z.literal(SEMANTIC_REPRESENTATION_ID),
  dimension: z.literal(SEMANTIC_DIMENSION),
  promptRevision: z.string().min(1),
  tokenizerRevision: z.string().min(1),
  pooling: z.literal('mean'),
  normalization: z.literal('l2'),
  customModelRegistration: z.literal(true),
  runtimeStatus: z.enum(['CHALLENGER', 'PARITY_PROVEN', 'REJECTED']),
  canonicalPromotionAllowed: z.literal(false),
});

export type FastEmbedOnnxExecutorReceiptV1 = z.infer<typeof FastEmbedOnnxExecutorReceiptV1Schema>;

export const FastEmbedParityEvidenceV1Schema = z.object({
  dimensionExact: z.literal(true),
  finiteValues: z.literal(true),
  l2Normalized: z.literal(true),
  promptParity: z.literal(true),
  modelRevisionMatch: z.literal(true),
  tokenizerRevisionMatch: z.literal(true),
  minCosineAgainstCanonical: z.number().min(0).max(1),
  minTopKOverlap: z.number().min(0).max(1),
  cosineThreshold: z.number().min(0).max(1),
  topKOverlapThreshold: z.number().min(0).max(1),
});

export type FastEmbedParityEvidenceV1 = z.infer<typeof FastEmbedParityEvidenceV1Schema>;

export function buildFastEmbedOnnxExecutorReceiptV1(input: Omit<FastEmbedOnnxExecutorReceiptV1, 'schema' | 'canonicalPromotionAllowed'>): FastEmbedOnnxExecutorReceiptV1 {
  return FastEmbedOnnxExecutorReceiptV1Schema.parse({
    schema: 'atlas.fastembed-onnx-executor-receipt.v1',
    canonicalPromotionAllowed: false,
    ...input,
  });
}

export function evaluateFastEmbedParityV1(
  evidence: FastEmbedParityEvidenceV1,
): { parity: 'PASS' | 'FAIL'; canonicalPromotionAllowed: false; reasons: string[] } {
  const parsed = FastEmbedParityEvidenceV1Schema.parse(evidence);
  const reasons: string[] = [];
  if (parsed.minCosineAgainstCanonical < parsed.cosineThreshold) reasons.push('COSINE_PARITY_BELOW_THRESHOLD');
  if (parsed.minTopKOverlap < parsed.topKOverlapThreshold) reasons.push('TOP_K_OVERLAP_BELOW_THRESHOLD');
  return { parity: reasons.length === 0 ? 'PASS' : 'FAIL', canonicalPromotionAllowed: false, reasons };
}
