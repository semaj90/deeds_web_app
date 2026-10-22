/**
 * Shared contract for deep-audit telemetry receipts (M10).
 *
 * One schema, imported by both the writer and the consumer. No second copy.
 *
 * Authority split:
 *   - Creating the receipt file itself is authorized: exactly one file, exclusive create, under
 *     reports/deep-audit/telemetry/. It is listed in `receiptFilesCreated`.
 *   - Data-store mutations are forbidden: valkey, postgres, qdrant and neo4j must all be false.
 *
 * Unknown properties are rejected (z.strictObject), so a receipt cannot carry fields the contract
 * does not define.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const WINDOW_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Regex shape plus a real calendar date: 2026-02-30 is rejected. */
export function isValidWindowId(windowId: string): boolean {
  if (!WINDOW_PATTERN.test(windowId)) return false;
  const parsed = new Date(`${windowId}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === windowId;
}

export const TELEMETRY_RECEIPT_SCHEMA = 'atlas.deep-audit-telemetry.v1';
export const TELEMETRY_VALIDATOR_VERSION = 'deep-audit-telemetry-receipt-v1@1';

export const TelemetryReceiptSchema = z.strictObject({
  schema: z.literal(TELEMETRY_RECEIPT_SCHEMA),
  adapter: z.string().min(1),
  namespace: z.string().regex(/^[a-z0-9-]{1,40}$/),
  windowId: z.string().refine(isValidWindowId, 'windowId must be a real calendar date'),
  graphFile: z.string().min(1),
  graphSha256: z.string().regex(/^[a-f0-9]{64}$/),
  distinctCounts: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,31}$/), z.number().int().nonnegative()),
  writesPerformed: z.strictObject({
    valkey: z.literal(false),
    postgres: z.literal(false),
    qdrant: z.literal(false),
    neo4j: z.literal(false),
  }),
  receiptFilesCreated: z.array(z.string().regex(/^telemetry-\d{4}-\d{2}-\d{2}-[a-f0-9]{10}\.json$/)).length(1),
  canonicalAuthority: z.literal(false),
});

export type TelemetryReceipt = z.infer<typeof TelemetryReceiptSchema>;

export type ValidationResult =
  | { ok: true; receipt: TelemetryReceipt; sha256: string; validatorVersion: string }
  | { ok: false; reason: string; sha256?: string; validatorVersion: string };

/** Parse and validate one receipt file. Never writes. */
export function validateReceiptFile(filePath: string): ValidationResult {
  const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  let raw: Buffer;
  try {
    raw = readFileSync(filePath);
  } catch (err) {
    return { ok: false, reason: `RECEIPT_MISSING:${(err as NodeJS.ErrnoException).code ?? 'ERROR'}`, validatorVersion: TELEMETRY_VALIDATOR_VERSION };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw.toString('utf8'));
  } catch {
    return { ok: false, reason: 'RECEIPT_NOT_JSON', sha256: sha256(raw), validatorVersion: TELEMETRY_VALIDATOR_VERSION };
  }
  const parsed = TelemetryReceiptSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: `RECEIPT_INVALID:${issue.path.join('.') || '(root)'}:${issue.code}`,
      sha256: sha256(raw),
      validatorVersion: TELEMETRY_VALIDATOR_VERSION,
    };
  }
  return { ok: true, receipt: parsed.data, sha256: sha256(raw), validatorVersion: TELEMETRY_VALIDATOR_VERSION };
}

export type ConsumerResult = {
  exitCode: 0 | 1;
  receipts: Array<{ path: string; result: ValidationResult }>;
};

/**
 * Validate the named receipts. Returns an exit code the runner can await and propagate.
 * Never selects receipts by timestamp and never writes anything.
 */
export function runTelemetryConsumer(receiptPaths: readonly string[]): ConsumerResult {
  const receipts = receiptPaths.map((p) => ({ path: path.normalize(p), result: validateReceiptFile(p) }));
  const allOk = receipts.length > 0 && receipts.every((r) => r.result.ok);
  return { exitCode: allOk ? 0 : 1, receipts };
}
