import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * ERROR-NEIGHBORHOOD-RESOLVER-V1
 * 
 * Bounded Agentic Error-Fixing Neighborhood Resolver:
 * Replaces unstructured global grep with deterministic neighborhood resolution:
 * Error -> sourceOrdinal + symbolOrdinal + domain + topologyCell
 * -> Bounded callers, tests, related receipts -> ContextManifest input.
 */

export const ErrorFixNeighborhoodSchema = z
  .object({
    errorId: z.string().min(1),
    errorClass: z.string().min(1),
    sourceOrdinal: z.number().int().min(0),
    symbolOrdinal: z.number().int().min(0),
    domainOrdinal: z.number().int().min(0),
    topologyCell: z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int()]),
    callerOrdinals: z.array(z.number().int().min(0)),
    testOrdinals: z.array(z.number().int().min(0)),
    receiptRefs: z.array(z.string().min(1)),
    boundedTokenEstimate: z.number().int().min(0),
    neighborhoodChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

export type ErrorFixNeighborhood = z.infer<typeof ErrorFixNeighborhoodSchema>;

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function resolveErrorNeighborhood(input: {
  errorId: string;
  errorClass: string;
  sourceOrdinal: number;
  symbolOrdinal: number;
  domainOrdinal: number;
  topologyCell: [number, number, number, number];
  callerOrdinals?: number[];
  testOrdinals?: number[];
  receiptRefs?: string[];
}): ErrorFixNeighborhood {
  const callers = input.callerOrdinals ?? [];
  const tests = input.testOrdinals ?? [];
  const receipts = input.receiptRefs ?? [];

  // Bounded token estimate: ~150 tokens per symbol/test/caller reference
  const boundedTokenEstimate = (1 + callers.length + tests.length + receipts.length) * 150;

  const payload = {
    errorId: input.errorId,
    errorClass: input.errorClass,
    sourceOrdinal: input.sourceOrdinal,
    symbolOrdinal: input.symbolOrdinal,
    domainOrdinal: input.domainOrdinal,
    topologyCell: input.topologyCell,
    callerOrdinals: callers.sort((a, b) => a - b),
    testOrdinals: tests.sort((a, b) => a - b),
    receiptRefs: receipts.sort(),
    boundedTokenEstimate,
  };

  const neighborhoodChecksum = sha256(JSON.stringify(payload));

  return ErrorFixNeighborhoodSchema.parse({
    ...payload,
    neighborhoodChecksum,
  });
}
