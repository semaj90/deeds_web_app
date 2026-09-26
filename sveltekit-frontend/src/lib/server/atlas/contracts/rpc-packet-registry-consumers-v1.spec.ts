import { describe, expect, it } from 'vitest';
import {
  RegistrySnapshotManifestV1Schema,
  FutureConsumerReceiptV1Schema,
  admitAgenticDenseSearchContextV1,
} from './rpc-packet-registry-consumers-v1.js';

describe('rpc-packet-registry-consumers-v1', () => {
  const dummyIdentity = {
    schema: 'atlas.rpc-packet-registry.v1' as const,
    workspaceId: 'workspace-1',
    workspaceRevision: 'wr-1',
    packetKey: 'packet:example',
    packetRevision: 'pr-1',
    sourceRef: 'src/example.ts',
    sourceRevision: 'sr-1',
    contentHash: 'a'.repeat(64),
  };

  it('validates snapshot manifests without canonical authority', () => {
    const manifest = RegistrySnapshotManifestV1Schema.parse({
      schema: 'atlas.registry-snapshot-manifest.v1',
      manifestId: 'manifest-1',
      workspaceId: 'workspace-1',
      workspaceRevision: 'wr-1',
      packetCount: 100,
      manifestChecksum: 'b'.repeat(64),
      createdAt: new Date().toISOString(),
      format: 'arrow_ipc',
      canonicalAuthority: false,
      writesPerformed: false,
    });
    expect(manifest.canonicalAuthority).toBe(false);
    expect(manifest.writesPerformed).toBe(false);
  });

  it('validates consumer receipts with replay checksum', () => {
    const receipt = FutureConsumerReceiptV1Schema.parse({
      schema: 'atlas.future-consumer-receipt.v1',
      consumerKind: 'xgboost',
      consumerId: 'xgboost-ranker-1',
      manifestChecksum: 'b'.repeat(64),
      inputPacketCount: 100,
      replayChecksum: 'c'.repeat(64),
      admitted: true,
      canonicalAuthority: false,
      writesPerformed: false,
      generatedAt: new Date().toISOString(),
    });
    expect(receipt.writesPerformed).toBe(false);
    expect(receipt.admitted).toBe(true);
  });

  it('admits agentic dense search with bounded evidence budget', () => {
    const admission = admitAgenticDenseSearchContextV1(dummyIdentity, 25);
    expect(admission.packetKey).toBe('packet:example');
    expect(admission.evidenceBudget).toBe(25);
    expect(admission.writesPerformed).toBe(false);
  });
});
