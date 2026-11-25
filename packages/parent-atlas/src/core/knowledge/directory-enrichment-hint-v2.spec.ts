import { describe, expect, it } from 'vitest';
import {
  DIRECTORY_ENRICHMENT_HINT_V2_SCHEMA,
  DIRECTORY_INVENTORY_MANIFEST_V2_SCHEMA,
  computeDirectoryEvidenceDigestV2,
  computeInventoryManifestDigestV2,
  verifyDirectoryHintReadbackV2,
  type DirectoryEnrichmentHintV2,
  type DirectoryInventoryManifestV2,
  type InventoryMemberBindingV2,
} from './directory-enrichment-hint-v2.js';

const WS_REV = 'sha256:' + 'a'.repeat(64);
const PROD_REV = 'sha256:' + 'b'.repeat(64);
const CARD_DIGEST = 'sha256:' + 'c'.repeat(64);

function buildFixture(workspaceRevision: string | null) {
  const members: InventoryMemberBindingV2[] = [
    {
      sourceIdentityKey: 'file:python/atlas_compute/ranker.py',
      sourceRef: 'python/atlas_compute/ranker.py',
      sourceRevision: 'sha256:' + '1'.repeat(64),
      contentDigest: 'sha256:' + '1'.repeat(64),
      byteLength: 512,
    },
    {
      sourceIdentityKey: 'file:python/atlas_compute/LLMS.md',
      sourceRef: 'python/atlas_compute/LLMS.md',
      sourceRevision: 'sha256:' + '2'.repeat(64),
      contentDigest: 'sha256:' + '2'.repeat(64),
      byteLength: 128,
    },
  ];
  const body = {
    schema: DIRECTORY_INVENTORY_MANIFEST_V2_SCHEMA,
    repositoryScope: 'deeds-web-app',
    workspaceRevision,
    members,
    exclusions: [{ path: '.tmp/**', reason: 'scratch_excluded' }],
  };
  const invDigest = computeInventoryManifestDigestV2(body);
  const manifest: DirectoryInventoryManifestV2 = {
    ...body,
    inventoryManifestDigest: invDigest,
  };
  const evDigest = computeDirectoryEvidenceDigestV2({
    directoryPath: 'python/atlas_compute',
    workspaceRevision,
    inventoryManifestDigest: invDigest,
    members,
    producerRevision: PROD_REV,
    cardContentDigest: CARD_DIGEST,
  });
  const hint: DirectoryEnrichmentHintV2 = {
    schema: DIRECTORY_ENRICHMENT_HINT_V2_SCHEMA,
    directory_path: 'python/atlas_compute',
    status: 'HINT',
    packet_identity: null,
    workspace_revision: workspaceRevision,
    inventory_manifest_digest: invDigest,
    producer_revision: PROD_REV,
    embedding_representation_revision: 'eg2-onnx-q8:768:cos',
    card_content_digest: CARD_DIGEST,
    evidence_digest: evDigest,
    member_count: 2,
    canonicalAuthority: false,
    writesPerformed: false,
  };
  const store = new Map<string, DirectoryInventoryManifestV2>([[invDigest, manifest]]);
  return { hint, manifest, store };
}

describe('directory-enrichment-hint.v2 readback verifier', () => {
  it('proves readback when workspace_revision is admitted and digests match', () => {
    const { hint, store } = buildFixture(WS_REV);
    const res = verifyDirectoryHintReadbackV2(hint, (d) => store.get(d), {
      requireAdmittedWorkspaceRevision: true,
    });
    expect(res.ok).toBe(true);
    expect(res.status).toBe('QUALIFIED_ADMITTED_READBACK_PROVEN');
    expect(res.memberCount).toBe(2);
    expect(res.canonicalAuthority).toBe(false);
  });

  it('distinguishes unbound local worktree proposals and refuses when admitted revision is required', () => {
    const { hint, store } = buildFixture(null);
    const proposal = verifyDirectoryHintReadbackV2(hint, (d) => store.get(d));
    expect(proposal.ok).toBe(true);
    expect(proposal.status).toBe('PROPOSAL_UNBOUND_LOCAL_WORKTREE');

    const refused = verifyDirectoryHintReadbackV2(hint, (d) => store.get(d), {
      requireAdmittedWorkspaceRevision: true,
    });
    expect(refused.ok).toBe(false);
    expect(refused.errorCode).toBe('WORKSPACE_REVISION_UNBOUND');
  });

  it('fails closed on missing manifest or tampered member byteLength', () => {
    const { hint, manifest, store } = buildFixture(WS_REV);
    const missing = verifyDirectoryHintReadbackV2(hint, () => undefined);
    expect(missing.ok).toBe(false);
    expect(missing.errorCode).toBe('INVENTORY_MANIFEST_NOT_FOUND');

    const tamperedManifest: DirectoryInventoryManifestV2 = {
      ...manifest,
      members: manifest.members.map((m, idx) => (idx === 0 ? { ...m, byteLength: 99999 } : m)),
    };
    store.set(hint.inventory_manifest_digest, tamperedManifest);
    const tampered = verifyDirectoryHintReadbackV2(hint, (d) => store.get(d));
    expect(tampered.ok).toBe(false);
    expect(tampered.errorCode).toBe('INVENTORY_DIGEST_MISMATCH');
  });
});
