import { z } from 'zod';

export const GpuRuntimeAbiModeSchema = z.enum([
  'FRAMEWORK_FREE_C_ABI',
  'DIRECT_LIBTORCH_MATCHED_BUILD',
  'LIBTORCH_STABLE_ABI',
]);

export const GpuRuntimeBackendSchema = z.enum([
  'LIBTORCH',
  'CUBLASLT',
  'CUTLASS',
  'CUTILE_AOT',
  'CUVS',
  'CUSTOM_CUDA',
]);

export const GpuRuntimeReceiptV1Schema = z.object({
  schema: z.literal('atlas.gpu-runtime-receipt.v1'),
  abiVersion: z.literal(1),
  abiMode: GpuRuntimeAbiModeSchema,
  backend: GpuRuntimeBackendSchema,
  gpuName: z.string().min(1),
  computeCapabilityMajor: z.number().int().nonnegative(),
  computeCapabilityMinor: z.number().int().nonnegative(),
  driverVersion: z.string().min(1),
  systemToolkitVersion: z.string().min(1).nullable(),
  compilerToolkitVersion: z.string().min(1).nullable(),
  framework: z.string().min(1).nullable(),
  frameworkVersion: z.string().min(1).nullable(),
  frameworkCudaRuntimeVersion: z.string().min(1).nullable(),
  backendLibraryVersion: z.string().min(1).nullable(),
  cxx11Abi: z.boolean().nullable(),
  nodeApiBoundary: z.boolean(),
  torchTypesCrossAbiBoundary: z.boolean(),
  rapidsCppTypesCrossAbiBoundary: z.boolean(),
  pythonObjectsCrossAbiBoundary: z.boolean(),
  devicePointerTransport: z.enum(['NONE', 'OPAQUE_HANDLE_ONLY', 'RAW_DEVICE_POINTER_INTERNAL_ONLY']),
  streamHandleTransport: z.enum(['NONE', 'OPAQUE_HANDLE_ONLY']),
  producerRevision: z.string().min(1),
  observedAt: z.string().datetime(),
}).strict().superRefine((receipt, ctx) => {
  if (receipt.torchTypesCrossAbiBoundary || receipt.rapidsCppTypesCrossAbiBoundary || receipt.pythonObjectsCrossAbiBoundary) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['abiMode'],
      message: 'framework-owned C++/Python types may not cross the Parent Atlas GPU runtime ABI boundary',
    });
  }

  if (receipt.abiMode === 'FRAMEWORK_FREE_C_ABI') {
    if (!receipt.nodeApiBoundary) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodeApiBoundary'], message: 'framework-free C ABI expects the existing Node-API boundary' });
    }
  }

  if (receipt.abiMode === 'DIRECT_LIBTORCH_MATCHED_BUILD') {
    if (receipt.framework !== 'pytorch' && receipt.framework !== 'libtorch') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['framework'], message: 'direct LibTorch ABI mode requires a LibTorch/PyTorch framework identity' });
    }
    if (!receipt.frameworkVersion) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['frameworkVersion'], message: 'direct LibTorch ABI mode requires the exact linked framework version' });
    }
  }

  if (receipt.abiMode === 'LIBTORCH_STABLE_ABI') {
    const match = receipt.frameworkVersion?.match(/^(\d+)\.(\d+)/);
    if (!match || Number(match[1]) < 2 || (Number(match[1]) === 2 && Number(match[2]) < 9)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['frameworkVersion'], message: 'current Parent Atlas stable-LibTorch ABI contract requires PyTorch/LibTorch 2.9+' });
    }
  }
});

export type GpuRuntimeReceiptV1 = z.infer<typeof GpuRuntimeReceiptV1Schema>;

export function expectedSmArchitecture(receipt: GpuRuntimeReceiptV1): string {
  const parsed = GpuRuntimeReceiptV1Schema.parse(receipt);
  return `sm_${parsed.computeCapabilityMajor}${parsed.computeCapabilityMinor}`;
}
