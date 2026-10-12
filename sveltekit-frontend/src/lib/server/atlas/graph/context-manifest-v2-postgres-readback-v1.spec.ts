import { describe, expect, it } from 'vitest';
import {
  buildContextManifestV2,
} from './context-manifest-v2.js';
import {
  verifyContextManifestV2ReadbackRowV1,
} from './context-manifest-v2-postgres-readback-v1.js';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

const manifest = buildContextManifestV2({
  schema: 'atlas.context-manifest.v1',
  requestId: 'request-fixture-1',
  snapshotId: 'snapshot-fixture-1',
  graphRevision: null,
  query: 'fixture query',
  candidateBucket: 32,
  candidateCount: 1,
  tokenBudget: 128,
  selectedNodeKeys: ['packet:fixture-1'],
  evidenceRefs: ['source:fixture-1'],
  producerRevision: 'fixture-producer:v1',
}, {
  selectedOrdinalSetChecksum: 'ordinal-set-fixture',
  evidenceRevisions: {
    sourceRevision: null,
    representationRevision: null,
    featureRevision: null,
    ontologyRevision: null,
    modelRevision: null,
    promptTemplateRevision: null,
  },
  ordinalMapChecksum: 'ordinal-map-fixture',
  retrievalPolicyRevision: 'retrieval-policy-fixture:v1',
  acePlaybookRevision: 'ace-playbook-fixture:v1',
});

const row = (manifestJson: unknown = manifest) => ({
  identity_checksum: manifest.identityChecksum,
  request_id: manifest.v1.requestId,
  snapshot_id: manifest.v1.snapshotId,
  manifest_json: manifestJson,
  manifest_payload_checksum: canonicalSha256V1(manifest),
});

describe('ContextManifestV2 Postgres readback contract', () => {
  it('rebuilds identity and complete-payload checksums without admitting evidence', () => {
    const result = verifyContextManifestV2ReadbackRowV1(row(), manifest.identityChecksum);

    expect(result.status).toBe('READBACK_MATCH_NOT_ADMITTED');
    expect(result.manifest?.identityChecksum).toBe(manifest.identityChecksum);
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });

  it('rejects a self-consistent identity with a changed non-identity V1 field', () => {
    const tampered = {
      ...manifest,
      v1: { ...manifest.v1, query: 'altered query' },
    };

    expect(verifyContextManifestV2ReadbackRowV1(row(tampered), manifest.identityChecksum))
      .toMatchObject({ status: 'BLOCKED', reason: 'PAYLOAD_RECOMPUTE_MISMATCH' });
  });

  it('rejects row identity and request bindings that disagree with the stored manifest', () => {
    expect(verifyContextManifestV2ReadbackRowV1({ ...row(), request_id: 'other-request' }, manifest.identityChecksum))
      .toMatchObject({ status: 'BLOCKED', reason: 'MANIFEST_ROW_BINDING_MISMATCH' });
    expect(verifyContextManifestV2ReadbackRowV1(row(), '0'.repeat(64)))
      .toMatchObject({ status: 'BLOCKED', reason: 'IDENTITY_CHECKSUM_MISMATCH' });
  });
});
