import { z } from 'zod';
import { AtlasPrecisionSchema } from './hardware-profile-v1.js';

export const KernelBackendSchema = z.enum([
  'cpu',
  'libtorch',
  'cublaslt',
  'cutlass',
  'cutile',
  'cuvs',
  'tensorrt',
  'custom_cuda',
]);

export const KernelPerfReceiptV1Schema = z.object({
  schemaVersion: z.literal('kernel-perf-receipt.v1'),
  receiptId: z.string().min(1),
  profileId: z.string().min(1),
  workloadRevision: z.string().min(1),
  kernelId: z.string().min(1),
  kernelRevision: z.string().min(1),
  backend: KernelBackendSchema,
  targetSm: z.number().int().positive(),
  precision: AtlasPrecisionSchema,
  problem: z.object({
    operation: z.string().min(1),
    m: z.number().int().nonnegative().optional(),
    n: z.number().int().nonnegative().optional(),
    k: z.number().int().nonnegative().optional(),
    batch: z.number().int().positive().default(1),
    featureCount: z.number().int().nonnegative().optional(),
    embeddingDim: z.number().int().nonnegative().optional(),
  }),
  launch: z.object({
    blockM: z.number().int().positive().nullable().optional(),
    blockN: z.number().int().positive().nullable().optional(),
    blockK: z.number().int().positive().nullable().optional(),
    warps: z.number().int().positive().nullable().optional(),
    stages: z.number().int().positive().nullable().optional(),
    sharedMemoryBytes: z.number().int().nonnegative().nullable().optional(),
  }),
  measurement: z.object({
    warmupIterations: z.number().int().nonnegative(),
    measuredIterations: z.number().int().positive(),
    medianLatencyUs: z.number().finite().nonnegative(),
    p95LatencyUs: z.number().finite().nonnegative(),
    throughputPerSecond: z.number().finite().nonnegative().nullable(),
    peakAllocatedBytes: z.number().int().nonnegative().nullable(),
  }),
  correctness: z.object({
    oracle: z.enum(['fp32_cpu', 'fp32_gpu', 'cublas', 'cuvs_exact', 'fixture']),
    passed: z.boolean(),
    maxAbsError: z.number().finite().nonnegative().nullable(),
    maxRelError: z.number().finite().nonnegative().nullable(),
    topKOverlap: z.number().min(0).max(1).nullable().optional(),
  }),
  source: z.enum(['TARGET_DEVICE', 'OFFLINE_PREDICTION']),
  measuredAt: z.string().datetime(),
}).superRefine((receipt, ctx) => {
  if (receipt.source === 'OFFLINE_PREDICTION' && receipt.correctness.passed) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['correctness', 'passed'],
      message: 'Offline predictions cannot establish target-device correctness.',
    });
  }
});

export type KernelPerfReceiptV1 = z.infer<typeof KernelPerfReceiptV1Schema>;
