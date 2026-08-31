import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from '../prefill/canonical-hash-v1.js';

/**
 * AUTORESEARCH-02: HardwareProfileV1.
 *
 * Pure schema + checksum. No execution, no GPU touch. An ExperimentHypothesisV1
 * (AUTORESEARCH-01) binds to a profile by checksum so a benchmark result can
 * never be silently compared across different hardware/toolchain combinations.
 *
 * Per openspec/changes/parent-atlas-autoresearch-fabric/proposal.md -- this
 * schema does not create a new GPU-residency/lease contract; it only
 * describes the device/toolchain an experiment ran under.
 */

export const HARDWARE_PROFILE_SCHEMA = 'atlas.autoresearch.hardware-profile.v1' as const;

export const GPU_FAMILIES = Object.freeze([
  'TURING',
  'AMPERE',
  'ADA',
  'HOPPER',
  'BLACKWELL',
] as const);
export type GpuFamily = typeof GPU_FAMILIES[number];

export const SUPPORTED_DTYPES = Object.freeze([
  'fp32',
  'fp16',
  'bf16',
  'tf32',
  'int8',
] as const);
export type SupportedDtype = typeof SUPPORTED_DTYPES[number];

export const COMPILER_PROVIDERS = Object.freeze([
  'nvcc',
  'cutile',
  'triton',
  'torch_inductor',
  'cutlass',
  'cutedsl',
] as const);
export type CompilerProvider = typeof COMPILER_PROVIDERS[number];

const positiveInt = z.number().int().positive();

export const hardwareProfileV1Schema = z.object({
  schema: z.literal(HARDWARE_PROFILE_SCHEMA),
  profileId: z.string().min(1),
  gpuFamily: z.enum(GPU_FAMILIES),
  gpuName: z.string().min(1),
  /** e.g. "8.6" for this repo's dev RTX 3060 Ti (Ampere). */
  computeCapability: z.string().regex(/^\d+\.\d+$/),
  driverRevision: z.string().min(1),
  cudaToolkitRevision: z.string().min(1),
  smCount: positiveInt,
  warpSize: z.literal(32),
  globalMemoryBytes: positiveInt,
  /** GB/s, theoretical peak. */
  memoryBandwidthGbps: z.number().positive(),
  sharedMemoryPerBlockBytes: positiveInt,
  registersPerBlock: positiveInt,
  tensorCoreCapabilities: z.array(z.enum(SUPPORTED_DTYPES)).min(0),
  supportedDtypes: z.array(z.enum(SUPPORTED_DTYPES)).min(1),
  compilerProviders: z.array(z.enum(COMPILER_PROVIDERS)).min(1),
  capturedAt: z.string().datetime(),
  /** How the values were obtained, e.g. "nvidia-smi + nvcc --version, live". Never speculative. */
  captureMethod: z.string().min(1),
  producerRevision: z.string().min(1),
  identityAuthority: z.literal(false),
  profileChecksum: sha256HexSchema,
}).strict().superRefine((value, ctx) => {
  const dtypeSet = new Set(value.supportedDtypes);
  if (dtypeSet.size !== value.supportedDtypes.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['supportedDtypes'], message: 'HARDWARE_PROFILE_DUPLICATE_DTYPE' });
  }
  const tensorCoreSet = new Set(value.tensorCoreCapabilities);
  if (tensorCoreSet.size !== value.tensorCoreCapabilities.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tensorCoreCapabilities'], message: 'HARDWARE_PROFILE_DUPLICATE_TENSOR_CORE_DTYPE' });
  }
  for (const dtype of value.tensorCoreCapabilities) {
    if (!dtypeSet.has(dtype)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tensorCoreCapabilities'], message: `HARDWARE_PROFILE_TENSOR_CORE_DTYPE_NOT_IN_SUPPORTED:${dtype}` });
    }
  }
  const providerSet = new Set(value.compilerProviders);
  if (providerSet.size !== value.compilerProviders.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['compilerProviders'], message: 'HARDWARE_PROFILE_DUPLICATE_COMPILER_PROVIDER' });
  }
  const { profileChecksum, ...body } = value;
  if (canonicalSha256V1(body) !== profileChecksum) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['profileChecksum'], message: 'HARDWARE_PROFILE_CHECKSUM_MISMATCH' });
  }
});

export type HardwareProfileV1 = z.infer<typeof hardwareProfileV1Schema>;

export function buildHardwareProfileV1(
  input: Omit<z.input<typeof hardwareProfileV1Schema>, 'schema' | 'identityAuthority' | 'profileChecksum'>,
): HardwareProfileV1 {
  const body = {
    schema: HARDWARE_PROFILE_SCHEMA,
    ...input,
    identityAuthority: false as const,
  };
  return hardwareProfileV1Schema.parse({
    ...body,
    profileChecksum: canonicalSha256V1(body),
  });
}

/**
 * This repo's actual dev GPU, values live-captured this session (2026-08-31)
 * via `nvidia-smi` (driver, GPU name) and `nvcc --version` (CUDA toolkit),
 * cross-referenced against NVIDIA's published Ampere/RTX 3060 Ti specs for
 * the fields not directly queryable from those two commands (SM count, warp
 * size, shared memory, register file, memory bandwidth). Not synthetic.
 */
export function buildDevWorkstationAmpereProfileV1(): HardwareProfileV1 {
  return buildHardwareProfileV1({
    profileId: 'dev-workstation-rtx-3060-ti-v1',
    gpuFamily: 'AMPERE',
    gpuName: 'NVIDIA GeForce RTX 3060 Ti',
    computeCapability: '8.6',
    driverRevision: '580.88',
    cudaToolkitRevision: '13.2',
    smCount: 38,
    warpSize: 32,
    globalMemoryBytes: 8 * 1024 * 1024 * 1024,
    memoryBandwidthGbps: 448,
    sharedMemoryPerBlockBytes: 101376,
    registersPerBlock: 65536,
    tensorCoreCapabilities: ['fp16', 'bf16', 'tf32', 'int8'],
    supportedDtypes: ['fp32', 'fp16', 'bf16', 'tf32', 'int8'],
    compilerProviders: ['nvcc', 'cutile', 'triton', 'torch_inductor'],
    capturedAt: '2026-08-31T14:00:00.000Z',
    captureMethod: 'nvidia-smi + nvcc --version, live this session; SM count/shared-memory/register-file/bandwidth from NVIDIA published Ampere GA104 specs, not queried directly',
    producerRevision: 'parent-atlas-autoresearch-fabric.hardware-profile.v1',
  });
}
