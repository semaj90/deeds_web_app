import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  workspaceRevisionRecordV1Schema,
  workspaceSourceBindingV1Schema,
  type WorkspaceRevisionRecordV1,
  type WorkspaceSourceBindingV1,
} from './workspace-source-binding-v1.js';

export const REVISION_AUTHORITY_ENVELOPE_SCHEMA = 'atlas.revision-authority-envelope.v1' as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const contentRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/);

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`;
}

function checksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export const revisionAuthoritySourceClaimV1Schema = z.object({
  sourceRef: z.string().min(1),
  sourceRevision: contentRevision,
  bindingChecksum: sha256,
}).strict();
export type RevisionAuthoritySourceClaimV1 = z.infer<typeof revisionAuthoritySourceClaimV1Schema>;

export const revisionAuthorityEnvelopeV1Schema = z.object({
  schema: z.literal(REVISION_AUTHORITY_ENVELOPE_SCHEMA),
  repositoryId: z.string().min(1),
  workspaceRevision: contentRevision,
  workspaceManifestChecksum: sha256,
  workspaceRecordChecksum: sha256,
  sourceBindingSetChecksum: sha256,
  sourceBindingCount: z.number().int().nonnegative(),
  sourceClaims: z.array(revisionAuthoritySourceClaimV1Schema),
  workspaceRevisionAuthority: z.literal('WORKSPACE_SOURCE_MANIFEST_SHA256_V1'),
  sourceRevisionAuthority: z.literal('SOURCE_BYTES_SHA256_V1'),
  revisionStatus: z.literal('EXACT'),
  syntheticRevisionCount: z.literal(0),
  authorityChecksum: sha256,
  canonicalAuthority: z.literal(false),
}).strict();

export type RevisionAuthorityEnvelopeV1 = z.infer<typeof revisionAuthorityEnvelopeV1Schema>;

function authorityPayload(input: Omit<RevisionAuthorityEnvelopeV1, 'authorityChecksum'>) {
  return input;
}

export function buildRevisionAuthorityEnvelopeV1(input: {
  record: WorkspaceRevisionRecordV1;
  bindings: readonly WorkspaceSourceBindingV1[];
}): RevisionAuthorityEnvelopeV1 {
  const record = workspaceRevisionRecordV1Schema.parse(input.record);
  const bindings = input.bindings.map((binding) => workspaceSourceBindingV1Schema.parse(binding));

  if (bindings.length !== record.sourceCount) {
    throw new Error(`REVISION_AUTHORITY_SOURCE_COUNT_MISMATCH:${bindings.length}:${record.sourceCount}`);
  }

  const ordered = [...bindings].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef));
  const refs = new Set<string>();
  for (const binding of ordered) {
    if (binding.workspaceRevision !== record.workspaceRevision) {
      throw new Error(`REVISION_AUTHORITY_WORKSPACE_MISMATCH:${binding.sourceRef}`);
    }
    if (refs.has(binding.sourceRef)) throw new Error(`REVISION_AUTHORITY_DUPLICATE_SOURCE_REF:${binding.sourceRef}`);
    refs.add(binding.sourceRef);
  }

  const sourceClaims: RevisionAuthoritySourceClaimV1[] = ordered.map((binding) => revisionAuthoritySourceClaimV1Schema.parse({
    sourceRef: binding.sourceRef,
    sourceRevision: binding.sourceRevision,
    bindingChecksum: binding.checksum,
  }));
  const sourceBindingSetChecksum = checksum(sourceClaims);

  const payload = authorityPayload({
    schema: REVISION_AUTHORITY_ENVELOPE_SCHEMA,
    repositoryId: record.repositoryId,
    workspaceRevision: record.workspaceRevision,
    workspaceManifestChecksum: record.sourceManifestDigest,
    workspaceRecordChecksum: record.checksum,
    sourceBindingSetChecksum,
    sourceBindingCount: ordered.length,
    sourceClaims,
    workspaceRevisionAuthority: 'WORKSPACE_SOURCE_MANIFEST_SHA256_V1',
    sourceRevisionAuthority: 'SOURCE_BYTES_SHA256_V1',
    revisionStatus: 'EXACT',
    syntheticRevisionCount: 0,
    canonicalAuthority: false,
  });

  return revisionAuthorityEnvelopeV1Schema.parse({
    ...payload,
    authorityChecksum: checksum(payload),
  });
}

export function verifyRevisionAuthorityEnvelopeV1(input: RevisionAuthorityEnvelopeV1): void {
  const parsed = revisionAuthorityEnvelopeV1Schema.parse(input);
  const { authorityChecksum, ...payload } = parsed;
  if (parsed.sourceClaims.length !== parsed.sourceBindingCount) {
    throw new Error(`REVISION_AUTHORITY_CLAIM_COUNT_MISMATCH:${parsed.sourceClaims.length}:${parsed.sourceBindingCount}`);
  }
  const orderedClaims = [...parsed.sourceClaims].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef));
  const sourceBindingSetChecksum = checksum(orderedClaims);
  if (sourceBindingSetChecksum !== parsed.sourceBindingSetChecksum) {
    throw new Error(`REVISION_AUTHORITY_SOURCE_SET_CHECKSUM_MISMATCH:${sourceBindingSetChecksum}:${parsed.sourceBindingSetChecksum}`);
  }
  const actual = checksum(payload);
  if (actual !== authorityChecksum) {
    throw new Error(`REVISION_AUTHORITY_CHECKSUM_MISMATCH:${actual}:${authorityChecksum}`);
  }
}
