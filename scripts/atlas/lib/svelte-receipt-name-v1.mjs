// Shared naming + validation for svelte-dom-splitter receipts (NEXT-01). One owner so the splitter, the N-ary bridge and the
// crosscheck scripts cannot drift apart. Receipts were named by basename only, so two `+page.svelte` files collided.
import crypto from 'node:crypto';
import path from 'node:path';

/** `svelte-dom-split-v1-<sanitized basename>.<sha256(repo-relative posix path)[:12]>.json` */
export function svelteReceiptFileNameV1(rel) {
  const normalized = String(rel).replace(/\\/g, '/');
  const base = path.posix.basename(normalized).replace(/[^\w.-]/g, '_');
  const pathHash = crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 12);
  return `svelte-dom-split-v1-${base}.${pathHash}.json`;
}

/**
 * Fail closed unless the receipt belongs to THIS path and THESE bytes. The filename carries a path hash, but the
 * contents are authoritative: both `source.path` and `source.disk_sha256` must match.
 * Returns null when valid, otherwise a reason code.
 */
export function receiptMismatchReasonV1(receipt, rel, sourceRevision) {
  const normalized = String(rel).replace(/\\/g, '/');
  if (!receipt || !receipt.source) return 'SPLITTER_RECEIPT_MALFORMED';
  if (String(receipt.source.path).replace(/\\/g, '/') !== normalized) return 'SPLITTER_RECEIPT_WRONG_PATH';
  if (receipt.source.disk_sha256 !== sourceRevision) return 'SPLITTER_RECEIPT_STALE';
  return null;
}
