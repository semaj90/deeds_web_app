import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  RETRIEVAL_ROUTER_TENSOR_MANIFEST_V2,
  RETRIEVAL_ROUTER_TENSOR_REVISION_V2,
  RETRIEVAL_ROUTER_TENSOR_WIDTH_V2,
} from './retrieval-router-tensor-manifest-v2.js';

export const COMPACT_QUERY_ROUTER_TENSOR_SCHEMA = 'atlas.compact-query-router-tensor.v1' as const;
export const COMPACT_QUERY_ROUTER_TENSOR_WIDTH = 154 as const;

const checksumSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/i);

export const compactQueryRouterTensorV1Schema = z.object({
  schema: z.literal(COMPACT_QUERY_ROUTER_TENSOR_SCHEMA),
  sourceTensorRevision: z.literal(RETRIEVAL_ROUTER_TENSOR_REVISION_V2),
  sourceWidth: z.literal(RETRIEVAL_ROUTER_TENSOR_WIDTH_V2),
  sourceTensorChecksum: checksumSchema,
  tensorWidth: z.literal(COMPACT_QUERY_ROUTER_TENSOR_WIDTH),
  tensorChecksum: checksumSchema,
  sections: z.object({
    classificationMrl128: z.object({ sourceOffset: z.literal(0), width: z.literal(128) }).strict(),
    deterministicQueryFeatures26: z.object({ sourceOffset: z.literal(160), width: z.literal(26) }).strict(),
  }).strict(),
  tensor: z.instanceof(Float32Array),
  evidenceAuthority: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
}).strict();

export type CompactQueryRouterTensorV1 = z.infer<typeof compactQueryRouterTensorV1Schema>;

export function checksumRetrievalRouterTensorV2(tensor: Float32Array): string {
  const bytes = new Uint8Array(tensor.byteLength);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < tensor.length; index += 1) {
    view.setFloat32(index * 4, tensor[index]!, true);
  }
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function asFiniteFloat32Tensor(value: readonly number[] | Float32Array): Float32Array {
  const tensor = Float32Array.from(value, Number);
  if (tensor.length !== RETRIEVAL_ROUTER_TENSOR_WIDTH_V2) {
    throw new Error(`COMPACT_ROUTER_SOURCE_WIDTH_MISMATCH expected=${RETRIEVAL_ROUTER_TENSOR_WIDTH_V2} got=${tensor.length}`);
  }
  if (Array.from(tensor).some((item) => !Number.isFinite(item))) {
    throw new Error('COMPACT_ROUTER_SOURCE_NONFINITE');
  }
  return tensor;
}

function sourceSection(name: 'classification_mrl_128' | 'query_shape_v1') {
  const section = RETRIEVAL_ROUTER_TENSOR_MANIFEST_V2.sections.find((item) => item.name === name);
  if (!section) throw new Error(`COMPACT_ROUTER_SOURCE_SECTION_MISSING:${name}`);
  return section;
}

/** Extracts the frozen V2 sections; it never recomputes query features. */
export function projectCompactQueryRouterTensorV1(input: {
  sourceTensorRevision: string;
  sourceTensor: readonly number[] | Float32Array;
  sourceTensorChecksum: string;
}): CompactQueryRouterTensorV1 {
  if (input.sourceTensorRevision !== RETRIEVAL_ROUTER_TENSOR_REVISION_V2) {
    throw new Error('COMPACT_ROUTER_SOURCE_REVISION_UNSUPPORTED');
  }
  const source = asFiniteFloat32Tensor(input.sourceTensor);
  const sourceChecksum = checksumRetrievalRouterTensorV2(source);
  if (input.sourceTensorChecksum !== sourceChecksum) {
    throw new Error('COMPACT_ROUTER_SOURCE_CHECKSUM_MISMATCH');
  }

  const classification = sourceSection('classification_mrl_128');
  const queryFeatures = sourceSection('query_shape_v1');
  if (classification.offset !== 0 || classification.width !== 128 || queryFeatures.offset !== 160 || queryFeatures.width !== 26) {
    throw new Error('COMPACT_ROUTER_SOURCE_MANIFEST_OFFSET_MISMATCH');
  }

  const tensor = Float32Array.from([
    ...source.slice(classification.offset, classification.offset + classification.width),
    ...source.slice(queryFeatures.offset, queryFeatures.offset + queryFeatures.width),
  ]);
  const result = {
    schema: COMPACT_QUERY_ROUTER_TENSOR_SCHEMA,
    sourceTensorRevision: RETRIEVAL_ROUTER_TENSOR_REVISION_V2,
    sourceWidth: RETRIEVAL_ROUTER_TENSOR_WIDTH_V2,
    sourceTensorChecksum: sourceChecksum,
    tensorWidth: COMPACT_QUERY_ROUTER_TENSOR_WIDTH,
    tensorChecksum: checksumRetrievalRouterTensorV2(tensor),
    sections: {
      classificationMrl128: { sourceOffset: classification.offset as 0, width: classification.width as 128 },
      deterministicQueryFeatures26: { sourceOffset: queryFeatures.offset as 160, width: queryFeatures.width as 26 },
    },
    tensor,
    evidenceAuthority: false as const,
    canonicalWritesAllowed: false as const,
  };
  return compactQueryRouterTensorV1Schema.parse(result);
}
