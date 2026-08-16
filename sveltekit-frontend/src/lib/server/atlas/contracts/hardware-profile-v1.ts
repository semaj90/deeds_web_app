import { z } from 'zod';

export const AtlasPrecisionSchema = z.enum(['fp32', 'tf32', 'bf16', 'fp16', 'int8', 'int4']);
export type AtlasPrecision = z.infer<typeof AtlasPrecisionSchema>;

export const HardwareProfileV1Schema = z.object({
  schemaVersion: z.literal('hardware-profile.v1'),
  profileId: z.string().min(1),
  capturedAt: z.string().datetime(),
  host: z.object({
    platform: z.string().min(1),
    arch: z.string().min(1),
  }),
  gpu: z.object({
    vendor: z.literal('nvidia'),
    name: z.string().min(1),
    uuid: z.string().min(1).nullable().optional(),
    computeCapability: z.object({
      major: z.number().int().nonnegative(),
      minor: z.number().int().nonnegative(),
      sm: z.number().int().positive(),
    }),
    totalVramBytes: z.number().int().nonnegative().nullable(),
    measuredFreeVramBytes: z.number().int().nonnegative().nullable(),
    memoryTelemetryState: z.enum(['MEASURED', 'UNAVAILABLE', 'UNTRUSTED']),
    supportedPrecisions: z.array(AtlasPrecisionSchema).min(1),
  }),
  runtime: z.object({
    driverVersion: z.string().min(1).nullable(),
    cudaRuntimeVersion: z.string().min(1).nullable(),
    cudaToolkitVersion: z.string().min(1).nullable(),
    libtorchVersion: z.string().min(1).nullable(),
    tensorrtVersion: z.string().min(1).nullable(),
    cutlassRevision: z.string().min(1).nullable(),
    cutileVersion: z.string().min(1).nullable(),
  }),
  capabilities: z.object({
    cudaAvailable: z.boolean(),
    tensorCores: z.boolean(),
    cudaGraphs: z.boolean(),
    cutile: z.boolean(),
    cuvs: z.boolean(),
    tensorrt: z.boolean(),
  }),
});

export type HardwareProfileV1 = z.infer<typeof HardwareProfileV1Schema>;

export function isAmpereSm86(profile: HardwareProfileV1): boolean {
  return profile.gpu.computeCapability.sm === 86;
}
