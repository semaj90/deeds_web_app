// Shared write guard for canonical writers that consume the tournament admission receipt.
// Tournament admission is source authority only. A canonical write needs its own approval scope,
// an explicit confirmation token on --apply, and the exact manifest bytes the receipt recorded.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const CANONICAL_WRITE_SCOPE = 'CANONICAL_SOURCE_BINDING_WRITE';

const sha256Hex = (buffer) => `sha256:${createHash('sha256').update(buffer).digest('hex')}`;

/**
 * Returns the verified snapshot manifest, or throws a named refusal.
 * @param {object} args
 * @param {string} args.root          repository root
 * @param {object} args.admission     parsed admission receipt
 * @param {boolean} args.apply        true when --apply was passed
 * @param {string[]} args.argv        process.argv.slice(2)
 * @param {string} args.confirmToken  full flag the writer requires on --apply, e.g. "--confirm-x=AUTHORIZE_X_V1"
 */
export function assertCanonicalWriteAuthorized({ root, admission, apply, argv, confirmToken }) {
  if (admission?.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true) {
    throw new Error('ADMITTED_WORKSPACE_REVISION_RECEIPT_NOT_AUTHORITATIVE');
  }
  if (admission.approval?.scope !== CANONICAL_WRITE_SCOPE) {
    throw new Error(`ADMISSION_SCOPE_NOT_CANONICAL_WRITE:${admission.approval?.scope ?? 'MISSING'}`);
  }
  if (apply && !argv.includes(confirmToken)) {
    throw new Error(`CANONICAL_WRITE_CONFIRMATION_REQUIRED:${confirmToken.split('=')[0]}`);
  }
  if (typeof admission.manifestPath !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(String(admission.manifestSha256 ?? ''))) {
    throw new Error('ADMISSION_MANIFEST_BINDING_MISSING');
  }
  const manifestPath = resolve(root, admission.manifestPath);
  const bytes = readFileSync(manifestPath);
  if (sha256Hex(bytes) !== admission.manifestSha256) throw new Error('ADMISSION_MANIFEST_SHA256_MISMATCH');
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (manifest.snapshotRevision !== admission.snapshotRevision) throw new Error('ADMISSION_SNAPSHOT_REVISION_MISMATCH');
  return { manifest, manifestPath };
}
