import { sha256HexV1 } from './stable-json-v1.js';

export const DIRECTORY_ENRICHMENT_HINT_V2_SCHEMA = 'atlas.directory-enrichment-hint.v2' as const;
export const DIRECTORY_INVENTORY_MANIFEST_V2_SCHEMA = 'atlas.directory-inventory-manifest.v2' as const;

const SHA256_PREFIXED_RE = /^sha256:[0-9a-f]{64}$/;

export interface InventoryMemberBindingV2 {
  sourceIdentityKey: string;
  sourceRef: string;
  sourceRevision: string;
  contentDigest: string;
  byteLength: number;
}

export interface InventoryExclusionRecordV2 {
  path: string;
  reason: string;
}

export interface DirectoryInventoryManifestBodyV2 {
  schema: typeof DIRECTORY_INVENTORY_MANIFEST_V2_SCHEMA;
  repositoryScope: string;
  workspaceRevision: string | null;
  members: readonly InventoryMemberBindingV2[];
  exclusions: readonly InventoryExclusionRecordV2[];
}

export interface DirectoryInventoryManifestV2 extends DirectoryInventoryManifestBodyV2 {
  inventoryManifestDigest: string;
}

export interface DirectoryEnrichmentHintV2 {
  schema: typeof DIRECTORY_ENRICHMENT_HINT_V2_SCHEMA;
  directory_path: string;
  status: 'HINT';
  packet_identity: string | null;
  workspace_revision: string | null;
  inventory_manifest_digest: string;
  producer_revision: string;
  embedding_representation_revision: string | null;
  card_content_digest: string;
  evidence_digest: string;
  member_count: number;
  canonicalAuthority: false;
  writesPerformed: false;
}

export interface DirectoryHintReadbackResultV2 {
  ok: boolean;
  status:
    | 'QUALIFIED_ADMITTED_READBACK_PROVEN'
    | 'PROPOSAL_UNBOUND_LOCAL_WORKTREE'
    | 'REFUSED_READBACK_DEFECT';
  errorCode: string | null;
  directoryPath: string;
  memberCount: number;
  recomputedInventoryDigest: string | null;
  recomputedEvidenceDigest: string | null;
  canonicalAuthority: false;
}

export function directoryOfSourceRefV2(sourceRef: string): string {
  const norm = sourceRef.replace(/\\/g, '/').replace(/^\.\//, '');
  const idx = norm.lastIndexOf('/');
  return idx <= 0 ? '.' : norm.slice(0, idx);
}

function cmpCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortMemberBindingsV2(
  members: readonly InventoryMemberBindingV2[],
): InventoryMemberBindingV2[] {
  return [...members].sort((a, b) =>
    cmpCodePoint(a.sourceRef, b.sourceRef) || cmpCodePoint(a.sourceIdentityKey, b.sourceIdentityKey),
  );
}

export function sortExclusionsV2(
  exclusions: readonly InventoryExclusionRecordV2[],
): InventoryExclusionRecordV2[] {
  return [...exclusions].sort((a, b) => cmpCodePoint(a.path, b.path) || cmpCodePoint(a.reason, b.reason));
}

export function computeInventoryManifestDigestV2(
  manifest: DirectoryInventoryManifestBodyV2,
): string {
  const canonicalPayload: DirectoryInventoryManifestBodyV2 = {
    schema: DIRECTORY_INVENTORY_MANIFEST_V2_SCHEMA,
    repositoryScope: manifest.repositoryScope,
    workspaceRevision: manifest.workspaceRevision,
    members: sortMemberBindingsV2(manifest.members),
    exclusions: sortExclusionsV2(manifest.exclusions),
  };
  return `sha256:${sha256HexV1(canonicalPayload)}`;
}

export function computeDirectoryEvidenceDigestV2(input: {
  directoryPath: string;
  workspaceRevision: string | null;
  inventoryManifestDigest: string;
  members: readonly InventoryMemberBindingV2[];
  producerRevision: string;
  cardContentDigest: string;
}): string {
  const canonicalPayload = {
    directory_path: input.directoryPath,
    workspace_revision: input.workspaceRevision,
    inventory_manifest_digest: input.inventoryManifestDigest,
    members: sortMemberBindingsV2(input.members),
    producer_revision: input.producerRevision,
    card_content_digest: input.cardContentDigest,
  };
  return `sha256:${sha256HexV1(canonicalPayload)}`;
}

/**
 * Resolve the immutable inventory manifest by `hint.inventory_manifest_digest`,
 * verify manifest immutability, extract exact directory member bindings, and
 * recompute `evidence_digest` before allowing any downstream consumption.
 */
export function verifyDirectoryHintReadbackV2(
  hint: DirectoryEnrichmentHintV2,
  resolveManifestByDigest: (digest: string) => DirectoryInventoryManifestV2 | null | undefined,
  options: { requireAdmittedWorkspaceRevision?: boolean } = {},
): DirectoryHintReadbackResultV2 {
  const fail = (errorCode: string, recomputedInventoryDigest: string | null = null, recomputedEvidenceDigest: string | null = null): DirectoryHintReadbackResultV2 => ({
    ok: false,
    status: 'REFUSED_READBACK_DEFECT',
    errorCode,
    directoryPath: hint.directory_path,
    memberCount: 0,
    recomputedInventoryDigest,
    recomputedEvidenceDigest,
    canonicalAuthority: false,
  });

  if (hint.schema !== DIRECTORY_ENRICHMENT_HINT_V2_SCHEMA || hint.canonicalAuthority !== false) {
    return fail('HINT_SCHEMA_OR_AUTHORITY_INVALID');
  }
  if (!SHA256_PREFIXED_RE.test(hint.inventory_manifest_digest)) {
    return fail('INVENTORY_MANIFEST_DIGEST_MALFORMED');
  }
  if (!SHA256_PREFIXED_RE.test(hint.evidence_digest)) {
    return fail('EVIDENCE_DIGEST_MALFORMED');
  }
  if (!SHA256_PREFIXED_RE.test(hint.producer_revision)) {
    return fail('PRODUCER_REVISION_MALFORMED');
  }
  if (hint.workspace_revision !== null && !SHA256_PREFIXED_RE.test(hint.workspace_revision)) {
    return fail('WORKSPACE_REVISION_MALFORMED');
  }

  const manifest = resolveManifestByDigest(hint.inventory_manifest_digest);
  if (!manifest) {
    return fail('INVENTORY_MANIFEST_NOT_FOUND');
  }

  const recomputedInv = computeInventoryManifestDigestV2(manifest);
  if (recomputedInv !== hint.inventory_manifest_digest || manifest.inventoryManifestDigest !== hint.inventory_manifest_digest) {
    return fail('INVENTORY_DIGEST_MISMATCH', recomputedInv);
  }
  if (manifest.workspaceRevision !== hint.workspace_revision) {
    return fail('WORKSPACE_REVISION_MISMATCH', recomputedInv);
  }

  const members = manifest.members.filter(
    (m) => directoryOfSourceRefV2(m.sourceRef) === hint.directory_path,
  );
  if (members.length !== hint.member_count || members.length === 0) {
    return fail('DIRECTORY_MEMBER_COUNT_MISMATCH', recomputedInv);
  }

  for (const member of members) {
    if (
      !SHA256_PREFIXED_RE.test(member.sourceRevision) ||
      !SHA256_PREFIXED_RE.test(member.contentDigest) ||
      !Number.isInteger(member.byteLength) ||
      member.byteLength < 0
    ) {
      return fail('MEMBER_BYTES_OR_DIGEST_MISSING', recomputedInv);
    }
  }

  const recomputedEv = computeDirectoryEvidenceDigestV2({
    directoryPath: hint.directory_path,
    workspaceRevision: hint.workspace_revision,
    inventoryManifestDigest: hint.inventory_manifest_digest,
    members,
    producerRevision: hint.producer_revision,
    cardContentDigest: hint.card_content_digest,
  });
  if (recomputedEv !== hint.evidence_digest) {
    return fail('EVIDENCE_DIGEST_MISMATCH', recomputedInv, recomputedEv);
  }

  if (hint.workspace_revision === null) {
    if (options.requireAdmittedWorkspaceRevision) {
      return fail('WORKSPACE_REVISION_UNBOUND', recomputedInv, recomputedEv);
    }
    return {
      ok: true,
      status: 'PROPOSAL_UNBOUND_LOCAL_WORKTREE',
      errorCode: null,
      directoryPath: hint.directory_path,
      memberCount: members.length,
      recomputedInventoryDigest: recomputedInv,
      recomputedEvidenceDigest: recomputedEv,
      canonicalAuthority: false,
    };
  }

  return {
    ok: true,
    status: 'QUALIFIED_ADMITTED_READBACK_PROVEN',
    errorCode: null,
    directoryPath: hint.directory_path,
    memberCount: members.length,
    recomputedInventoryDigest: recomputedInv,
    recomputedEvidenceDigest: recomputedEv,
    canonicalAuthority: false,
  };
}

export function verifyDirectoryHintsBatchV2(
  hints: readonly DirectoryEnrichmentHintV2[],
  resolveManifestByDigest: (digest: string) => DirectoryInventoryManifestV2 | null | undefined,
  options: { requireAdmittedWorkspaceRevision?: boolean } = {},
): {
  ok: boolean;
  totalHints: number;
  qualifiedAdmittedCount: number;
  proposalUnboundCount: number;
  defectCount: number;
  defects: Array<{ dir: string; code: string }>;
  canonicalAuthority: false;
} {
  const cache = new Map<
    string,
    {
      errorCode: string | null;
      manifest: DirectoryInventoryManifestV2 | null;
      byDir: Map<string, InventoryMemberBindingV2[]>;
    }
  >();
  let qualifiedAdmittedCount = 0;
  let proposalUnboundCount = 0;
  const defects: Array<{ dir: string; code: string }> = [];

  for (const hint of hints) {
    if (!SHA256_PREFIXED_RE.test(hint.inventory_manifest_digest)) {
      defects.push({ dir: hint.directory_path, code: 'INVENTORY_MANIFEST_DIGEST_MALFORMED' });
      continue;
    }
    let cached = cache.get(hint.inventory_manifest_digest);
    if (!cached) {
      const m = resolveManifestByDigest(hint.inventory_manifest_digest);
      if (!m) {
        cached = { errorCode: 'INVENTORY_MANIFEST_NOT_FOUND', manifest: null, byDir: new Map() };
      } else if (
        computeInventoryManifestDigestV2(m) !== hint.inventory_manifest_digest ||
        m.inventoryManifestDigest !== hint.inventory_manifest_digest
      ) {
        cached = { errorCode: 'INVENTORY_DIGEST_MISMATCH', manifest: null, byDir: new Map() };
      } else {
        const byDir = new Map<string, InventoryMemberBindingV2[]>();
        for (const member of m.members) {
          const d = directoryOfSourceRefV2(member.sourceRef);
          const arr = byDir.get(d);
          if (arr) arr.push(member);
          else byDir.set(d, [member]);
        }
        cached = { errorCode: null, manifest: m, byDir };
      }
      cache.set(hint.inventory_manifest_digest, cached);
    }

    if (cached.errorCode || !cached.manifest) {
      defects.push({ dir: hint.directory_path, code: cached.errorCode ?? 'INVENTORY_MANIFEST_NOT_FOUND' });
      continue;
    }
    if (cached.manifest.workspaceRevision !== hint.workspace_revision) {
      defects.push({ dir: hint.directory_path, code: 'WORKSPACE_REVISION_MISMATCH' });
      continue;
    }
    const members = cached.byDir.get(hint.directory_path) ?? [];
    if (members.length !== hint.member_count || members.length === 0) {
      defects.push({ dir: hint.directory_path, code: 'DIRECTORY_MEMBER_COUNT_MISMATCH' });
      continue;
    }
    const recomputedEv = computeDirectoryEvidenceDigestV2({
      directoryPath: hint.directory_path,
      workspaceRevision: hint.workspace_revision,
      inventoryManifestDigest: hint.inventory_manifest_digest,
      members,
      producerRevision: hint.producer_revision,
      cardContentDigest: hint.card_content_digest,
    });
    if (recomputedEv !== hint.evidence_digest) {
      defects.push({ dir: hint.directory_path, code: 'EVIDENCE_DIGEST_MISMATCH' });
      continue;
    }
    if (hint.workspace_revision === null) {
      if (options.requireAdmittedWorkspaceRevision) {
        defects.push({ dir: hint.directory_path, code: 'WORKSPACE_REVISION_UNBOUND' });
      } else {
        proposalUnboundCount += 1;
      }
    } else {
      qualifiedAdmittedCount += 1;
    }
  }

  return {
    ok: defects.length === 0,
    totalHints: hints.length,
    qualifiedAdmittedCount,
    proposalUnboundCount,
    defectCount: defects.length,
    defects: defects.slice(0, 20),
    canonicalAuthority: false,
  };
}
