/**
 * Trusted workspace authority resolver (single owner for server-side workspace revision).
 *
 * Caller-supplied workspace, source, or representation revisions are never inputs here.
 * A server operator pin, matching admission receipt, and independently proven latest live
 * byte-readback for the same revision are all required. None authorizes by itself.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { findRepoRoot, readLatestLiveReadbackV1 } from '$lib/server/atlas/admission/workspace-admission-panel-v1.js';

export const TRUSTED_WORKSPACE_RESOLVER_REVISION = 'atlas.trusted-workspace-resolver.v1' as const;

const PIN_ENV = 'ATLAS_ADMITTED_WORKSPACE_REVISION';
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
const RECEIPT_RELATIVE = path.join('docs', 'reports', 'workspace-revision-tournament-admission-v1.json');

export type TrustedWorkspaceAuthorityV1 =
  | {
      status: 'TRUSTED';
      workspaceRevision: string;
      source: 'OPERATOR_PIN';
      receiptCrossCheck: 'MATCHES_ADMISSION_RECEIPT' | 'NOT_IN_ADMISSION_RECEIPT' | 'RECEIPT_UNREADABLE';
      resolverRevision: typeof TRUSTED_WORKSPACE_RESOLVER_REVISION;
    }
  | {
      status: 'UNAVAILABLE';
      workspaceRevision: null;
      reason: 'NO_OPERATOR_PIN' | 'PIN_NOT_SHA256_DIGEST' | 'LIVE_READBACK_UNAVAILABLE' | 'LIVE_READBACK_NOT_PROVEN' | 'LIVE_READBACK_REVISION_MISMATCH' | 'ADMISSION_RECEIPT_MISMATCH';
      resolverRevision: typeof TRUSTED_WORKSPACE_RESOLVER_REVISION;
    };

export function resolveTrustedWorkspaceAuthorityFromEvidenceV1(input: {
  pin: string | null;
  receiptRevision: string | null | 'UNREADABLE';
  liveReadback: { ok: boolean; snapshotRevision: string | null; proven: boolean };
}): TrustedWorkspaceAuthorityV1 {
  const pin = input.pin?.trim() ?? '';
  if (!pin) return { status: 'UNAVAILABLE', workspaceRevision: null, reason: 'NO_OPERATOR_PIN', resolverRevision: TRUSTED_WORKSPACE_RESOLVER_REVISION };
  if (!SHA256_RE.test(pin)) return { status: 'UNAVAILABLE', workspaceRevision: null, reason: 'PIN_NOT_SHA256_DIGEST', resolverRevision: TRUSTED_WORKSPACE_RESOLVER_REVISION };
  if (input.receiptRevision !== pin) return { status: 'UNAVAILABLE', workspaceRevision: null, reason: 'ADMISSION_RECEIPT_MISMATCH', resolverRevision: TRUSTED_WORKSPACE_RESOLVER_REVISION };
  if (!input.liveReadback.ok) return { status: 'UNAVAILABLE', workspaceRevision: null, reason: 'LIVE_READBACK_UNAVAILABLE', resolverRevision: TRUSTED_WORKSPACE_RESOLVER_REVISION };
  if (!input.liveReadback.proven || !input.liveReadback.snapshotRevision) return { status: 'UNAVAILABLE', workspaceRevision: null, reason: 'LIVE_READBACK_NOT_PROVEN', resolverRevision: TRUSTED_WORKSPACE_RESOLVER_REVISION };
  if (input.liveReadback.snapshotRevision !== pin) return { status: 'UNAVAILABLE', workspaceRevision: null, reason: 'LIVE_READBACK_REVISION_MISMATCH', resolverRevision: TRUSTED_WORKSPACE_RESOLVER_REVISION };
  return {
    status: 'TRUSTED', workspaceRevision: pin, source: 'OPERATOR_PIN',
    receiptCrossCheck: 'MATCHES_ADMISSION_RECEIPT', resolverRevision: TRUSTED_WORKSPACE_RESOLVER_REVISION,
  };
}

async function readReceiptWorkspaceRevision(): Promise<string | null | 'UNREADABLE'> {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++, dir = path.dirname(dir)) {
    const text = await readFile(path.join(dir, RECEIPT_RELATIVE), 'utf8').catch(() => null);
    if (text !== null) {
      try {
        const receipt = JSON.parse(text) as { authority?: unknown; status?: unknown; workspaceRevision?: unknown };
        return receipt.authority === true && receipt.status === 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' && typeof receipt.workspaceRevision === 'string'
          ? receipt.workspaceRevision
          : null;
      } catch {
        return 'UNREADABLE';
      }
    }
    if (path.dirname(dir) === dir) break;
  }
  return null;
}

/** Resolve the trusted workspace revision. Never reads request input. Fails closed to UNAVAILABLE. */
export async function resolveTrustedWorkspaceAuthorityV1(): Promise<TrustedWorkspaceAuthorityV1> {
  const pin = process.env[PIN_ENV]?.trim();
  if (!pin || !SHA256_RE.test(pin)) return resolveTrustedWorkspaceAuthorityFromEvidenceV1({ pin: pin ?? null, receiptRevision: null, liveReadback: { ok: false, snapshotRevision: null, proven: false } });
  const receiptRevision = await readReceiptWorkspaceRevision();
  if (receiptRevision !== pin) return resolveTrustedWorkspaceAuthorityFromEvidenceV1({ pin, receiptRevision, liveReadback: { ok: false, snapshotRevision: null, proven: false } });
  const live = await readLatestLiveReadbackV1(await findRepoRoot());
  return resolveTrustedWorkspaceAuthorityFromEvidenceV1({ pin, receiptRevision, liveReadback: live });
}
