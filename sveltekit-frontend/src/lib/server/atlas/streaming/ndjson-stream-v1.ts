import { z } from 'zod';

/**
 * NDJSON-STREAM-V1
 * 
 * Line-delimited JSON streaming format for:
 * - EVF receipts
 * - ACE evidence packets
 * - Error-fixing execution traces
 * - QLoRA training examples
 */

export const ErrorFixTrainingExampleSchema = z
  .object({
    kind: z.literal('ERROR_FIX_TRACE'),
    traceId: z.string().min(1),
    contextManifestChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    errorClass: z.string().min(1),
    sourceOrdinal: z.number().int().min(0),
    symbolOrdinal: z.number().int().min(0),
    domainOrdinal: z.number().int().min(0),
    topologyCell: z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int()]),
    patch: z.string().min(1),
    validationVerdict: z.enum(['PASS', 'FAIL']),
  })
  .strict();

export type ErrorFixTrainingExample = z.infer<typeof ErrorFixTrainingExampleSchema>;

export function serializeNdjsonStream<T extends Record<string, unknown>>(records: readonly T[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

export function parseNdjsonStream<T = unknown>(
  ndjsonText: string,
  validator?: (item: unknown) => T,
): T[] {
  const lines = ndjsonText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map((line, idx) => {
    try {
      const parsed = JSON.parse(line);
      return validator ? validator(parsed) : (parsed as T);
    } catch (err) {
      throw new Error(`Failed to parse NDJSON record at line ${idx + 1}: ${(err as Error).message}`);
    }
  });
}
