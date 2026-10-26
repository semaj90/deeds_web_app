/**
 * Production checksum verifier for valkey-ace-handoff-v1.mjs.
 *
 * The hashing owner is `canonicalSha256V1` (sveltekit-frontend prefill). The
 * resolver and span-verification owners both return `{ ...payload, checksum:
 * canonicalSha256V1(payload) }`, so verification recomputes the hash over the
 * receipt minus `checksum` and compares. Run via tsx from `sveltekit-frontend/`
 * (`npx tsx ../scripts/atlas/<file>.mts`); this file reimplements no encoding.
 */
import { canonicalSha256V1 } from '../../sveltekit-frontend/src/lib/server/atlas/prefill/canonical-hash-v1.ts';

export type HandoffReceiptKindV1 = 'resolution' | 'sourceSpan';

export function verifyReceiptChecksumV1(_kind: HandoffReceiptKindV1, receipt: unknown): boolean {
  if (!receipt || typeof receipt !== 'object') return false;
  const { checksum, ...payload } = receipt as Record<string, unknown>;
  if (typeof checksum !== 'string' || !/^[a-f0-9]{64}$/.test(checksum)) return false;
  return canonicalSha256V1(payload) === checksum;
}
