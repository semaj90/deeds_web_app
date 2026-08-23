import { z } from 'zod';

export const GpuRuntimeAbiV1Schema = z.object({
  schema: z.literal('atlas.gpu-runtime-abi.v1'),
  laneId: z.string().min(1),
  platform: z.enum(['WINDOWS_NATIVE', 'WSL2_LINUX', 'LINUX']),
  gpuName: z.string().min(1),
  computeCapability: z.string().regex(/^\d+\.\d+$/),
  driverVersion: z.string().min(1),

  systemToolkitVersion: z.string().min(1).nullable(),
  compilerToolkitVersion: z.string().min(1).nullable(),

  framework: z.enum(['PYTORCH', 'LIBTORCH', 'RAPIDS', 'CUTILE', 'CUTLASS', 'CUSTOM_CUDA']),
  frameworkVersion: z.string().min(1),
  frameworkCudaRuntimeVersion: z.string().min(1).nullable(),

  nodeApi: z.object({
    used: z.boolean(),
    napiVersion: z.number().int().positive().nullable(),
    nodeAbiStable: z.boolean(),
    externalLibraryAbiStable: z.boolean(),
  }).strict(),

  libtorchAbi: z.object({
    used: z.boolean(),
    mode: z.enum(['NONE', 'VERSION_PINNED', 'LIMITED_STABLE_ABI']),
    torchVersion: z.string().min(1).nullable(),
    stableApiSubsetOnly: z.boolean(),
  }).strict(),

  cutile: z.object({
    used: z.boolean(),
    version: z.string().min(1).nullable(),
    ampereTargetSupported: z.boolean(),
    ctkSupportsTarget: z.boolean(),
  }).strict(),

  sharedMemory: z.object({
    requestedBytes: z.number().int().nonnegative().nullable(),
    resourceProofRequired: z.boolean(),
    treatedAsAbiMechanism: z.literal(false),
  }).strict(),

  checkpointing: z.object({
    enabled: z.boolean(),
    mechanism: z.enum(['NONE', 'PYTORCH_CHECKPOINT', 'HOST_REPLAY', 'CUSTOM']),
    affectsAbiClaim: z.literal(false),
  }).strict(),

  realTargetExecutionObserved: z.boolean(),
  parityPassed: z.boolean(),
  promotionAuthorized: z.literal(false),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.nodeApi.used && value.nodeApi.napiVersion == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodeApi', 'napiVersion'], message: 'NAPI_VERSION_REQUIRED' });
  }
  if (!value.nodeApi.used && value.nodeApi.napiVersion != null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodeApi', 'napiVersion'], message: 'NAPI_VERSION_MUST_BE_NULL_WHEN_UNUSED' });
  }
  if (value.nodeApi.nodeAbiStable && !value.nodeApi.used) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodeApi', 'nodeAbiStable'], message: 'NODE_API_ABI_CLAIM_REQUIRES_NODE_API' });
  }
  if (value.nodeApi.nodeAbiStable && !value.nodeApi.externalLibraryAbiStable && value.libtorchAbi.used) {
    // Node-API can keep the Node-facing ABI stable while the linked LibTorch ABI remains version-pinned.
    // Keep the two claims mechanically distinct rather than treating Node-API as transitive ABI stability.
  }
  if (value.libtorchAbi.mode === 'LIMITED_STABLE_ABI' && (!value.libtorchAbi.used || !value.libtorchAbi.stableApiSubsetOnly)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['libtorchAbi', 'stableApiSubsetOnly'], message: 'LIMITED_STABLE_LIBTORCH_ABI_REQUIRES_STABLE_API_SUBSET_ONLY' });
  }
  if (value.cutile.used && value.computeCapability === '8.6' && (!value.cutile.ampereTargetSupported || !value.cutile.ctkSupportsTarget)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cutile'], message: 'CUTILE_SM86_TARGET_SUPPORT_NOT_PROVEN' });
  }
  if (value.parityPassed && !value.realTargetExecutionObserved) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parityPassed'], message: 'PARITY_REQUIRES_REAL_TARGET_EXECUTION' });
  }
});

export type GpuRuntimeAbiV1 = z.infer<typeof GpuRuntimeAbiV1Schema>;

/**
 * Promotion stays outside this receipt. This contract records runtime/ABI facts only;
 * it cannot promote a kernel, representation, or executor by itself.
 */
export function validateGpuRuntimeAbiV1(input: z.input<typeof GpuRuntimeAbiV1Schema>): GpuRuntimeAbiV1 {
  return GpuRuntimeAbiV1Schema.parse(input);
}
