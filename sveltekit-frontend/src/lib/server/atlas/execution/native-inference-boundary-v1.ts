import { z } from 'zod';

export const NativeInferenceBoundaryV1Schema = z.object({
  schema: z.literal('atlas.native-inference-boundary.v1'),
  abiBoundary: z.literal('NODE_API'),
  directV8Internals: z.literal(false),
  tensorComputationOwner: z.literal('LIBTORCH_ATEN'),
  transport: z.literal('TYPED_BUFFERS_AND_RECEIPTS'),
  eventLoopPolicy: z.enum(['WORKER_THREAD', 'ASYNC_NATIVE_CALLBACK']),
  nodeApiVersion: z.string().min(1),
  nodeAddonApiRevision: z.string().min(1),
  libtorchVersion: z.string().min(1),
  pytorchReferenceRevision: z.string().min(1),
  cudaRuntimeRevision: z.string().min(1).nullable(),
  canonicalModelOwner: z.literal(false),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type NativeInferenceBoundaryV1 = z.infer<typeof NativeInferenceBoundaryV1Schema>;

export function buildNativeInferenceBoundaryV1(
  input: Omit<NativeInferenceBoundaryV1, 'schema' | 'abiBoundary' | 'directV8Internals' | 'tensorComputationOwner' | 'transport' | 'canonicalModelOwner' | 'canonicalAuthority' | 'writesPerformed'>,
): NativeInferenceBoundaryV1 {
  return NativeInferenceBoundaryV1Schema.parse({
    schema: 'atlas.native-inference-boundary.v1',
    abiBoundary: 'NODE_API',
    directV8Internals: false,
    tensorComputationOwner: 'LIBTORCH_ATEN',
    transport: 'TYPED_BUFFERS_AND_RECEIPTS',
    canonicalModelOwner: false,
    canonicalAuthority: false,
    writesPerformed: false,
    ...input,
  });
}
