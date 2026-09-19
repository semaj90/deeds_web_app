import { z } from 'zod';

export const TensorRtRtxCompatibilityV1Schema = z.object({
  schema: z.literal('atlas.tensorrt-rtx-compatibility.v1'),
  tensorRtRtxRevision: z.string().min(1),
  packageCudaLine: z.enum(['12.9-update-1', '13.4']),
  installedCudaLine: z.string().min(1),
  status: z.enum(['MATCH', 'CUDA_LINE_MISMATCH', 'PACKAGE_UNAVAILABLE']),
  promotionAllowed: z.literal(false),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type TensorRtRtxCompatibilityV1 = z.infer<typeof TensorRtRtxCompatibilityV1Schema>;

export function assessTensorRtRtxCompatibilityV1(input: {
  tensorRtRtxRevision: string | null;
  packageCudaLine: string | null;
  installedCudaLine: string;
}): TensorRtRtxCompatibilityV1 {
  const status = input.tensorRtRtxRevision === null || input.packageCudaLine === null
    ? 'PACKAGE_UNAVAILABLE' as const
    : input.packageCudaLine === input.installedCudaLine
      ? 'MATCH' as const
      : 'CUDA_LINE_MISMATCH' as const;
  return TensorRtRtxCompatibilityV1Schema.parse({
    schema: 'atlas.tensorrt-rtx-compatibility.v1',
    tensorRtRtxRevision: input.tensorRtRtxRevision ?? 'UNPROVEN',
    packageCudaLine: input.packageCudaLine === '12.9-update-1' || input.packageCudaLine === '13.4'
      ? input.packageCudaLine
      : '13.4',
    installedCudaLine: input.installedCudaLine,
    status,
    promotionAllowed: false,
    canonicalAuthority: false,
    writesPerformed: false,
  });
}
