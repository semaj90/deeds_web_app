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
      reason: 'NO_OPERATOR_PIN' | 'PIN_NOT_SHA256_DIGEST' | 'LIVE_READBACK_UNAVAILABLE' | 'LIVE_READBACK_NOT_PROVEN' | 'LIVE_READBACK_SNAPSHOT_MISMATCH' | 'ADMISSION_RECEIPT_MISMATCH' | 'ADMISSION_SNAPSHOT_BINDING_MISSING';
      resolverRevision: typeof TRUSTED_WORKSPACE_RESOLVER_REVISION;
    };

export function resolveTrustedWorkspaceAuthorityFromEvidenceV1(input: {
  pin: string | null;
  receiptWorkspaceRevision: string | null | 'UNREADABLE';
  receiptSnapshotRevision: string | null;
  liveReadback: { ok: boolean; snapshotRevision: string | null; proven: boolean };
}): TrustedWorkspaceAuthorityV1 {
  const pin = input.pin?.trim() ?? '';
  if (!pin) return { status: 'UNAVAILABLE', workspaceRevision: null, reason: 'NO_OPERATOR_PIN', resolverRevision: TRUSTED_WORKSPACE_RESOLVER_REVISION };
  if (!SHA256_RE.test(pin)) return { status: 'UNAVAILABLE', workspaceRevision: null, reason: 'PIN_NOT_SHA256_DIGEST', resolverRevision: TRUSTED_WORKSPACE_RESOLVER_REVISION };
  if (input.receiptWorkspaceRevision !== pin) return { status: 'UNAVAILABLE', workspaceRevision: null, reason: 'ADMISSION_RECEIPT_MISMATCH', resolverRevision: TRUSTED_WORKSPACE_RESOLVER_REVISION };
  if (!input.receiptSnapshotRevision || !SHA256_RE.test(input.receiptSnapshotRevision)) return { status: 'UNAVAILABLE', workspaceRevision: null, reason: 'ADMISSION_SNAPSHOT_BINDING_MISSING', resolverRevision: TRUSTED_WORKSPACE_RESOLVER_REVISION };
  if (!input.liveReadback.ok) return { status: 'UNAVAILABLE', workspaceRevision: null, reason: 'LIVE_READBACK_UNAVAILABLE', resolverRevision: TRUSTED_WORKSPACE_RESOLVER_REVISION };
  if (!input.liveReadback.proven || !input.liveReadback.snapshotRevision) return { status: 'UNAVAILABLE', workspaceRevision: null, reason: 'LIVE_READBACK_NOT_PROVEN', resolverRevision: TRUSTED_WORKSPACE_RESOLVER_REVISION };
  if (input.liveReadback.snapshotRevision !== input.receiptSnapshotRevision) return { status: 'UNAVAILABLE', workspaceRevision: null, reason: 'LIVE_READBACK_SNAPSHOT_MISMATCH', resolverRevision: TRUSTED_WORKSPACE_RESOLVER_REVISION };
  return {
    status: 'TRUSTED', workspaceRevision: pin, source: 'OPERATOR_PIN',
    receiptCrossCheck: 'MATCHES_ADMISSION_RECEIPT', resolverRevision: TRUSTED_WORKSPACE_RESOLVER_REVISION,
  };
}

async function readWorkspaceAdmissionReceipt(): Promise<{ workspaceRevision: string; snapshotRevision: string } | null | 'UNREADABLE'> {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++, dir = path.dirname(dir)) {
    const text = await readFile(path.join(dir, RECEIPT_RELATIVE), 'utf8').catch(() => null);
    if (text !== null) {
      try {
        const receipt = JSON.parse(text) as { authority?: unknown; status?: unknown; workspaceRevision?: unknown; snapshotRevision?: unknown };
        return receipt.authority === true
          && receipt.status === 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED'
          && typeof receipt.workspaceRevision === 'string'
          && SHA256_RE.test(receipt.workspaceRevision)
          && typeof receipt.snapshotRevision === 'string'
          && SHA256_RE.test(receipt.snapshotRevision)
          ? { workspaceRevision: receipt.workspaceRevision, snapshotRevision: receipt.snapshotRevision }
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
  if (!pin || !SHA256_RE.test(pin)) return resolveTrustedWorkspaceAuthorityFromEvidenceV1({ pin: pin ?? null, receiptWorkspaceRevision: null, receiptSnapshotRevision: null, liveReadback: { ok: false, snapshotRevision: null, proven: false } });
  const receipt = await readWorkspaceAdmissionReceipt();
  const receiptWorkspaceRevision = receipt === 'UNREADABLE' ? 'UNREADABLE' : receipt?.workspaceRevision ?? null;
  const receiptSnapshotRevision = receipt && receipt !== 'UNREADABLE' ? receipt.snapshotRevision : null;
  if (receiptWorkspaceRevision !== pin) return resolveTrustedWorkspaceAuthorityFromEvidenceV1({ pin, receiptWorkspaceRevision, receiptSnapshotRevision, liveReadback: { ok: false, snapshotRevision: null, proven: false } });
  const live = await readLatestLiveReadbackV1(await findRepoRoot());
  return resolveTrustedWorkspaceAuthorityFromEvidenceV1({ pin, receiptWorkspaceRevision, receiptSnapshotRevision, liveReadback: live });
}
