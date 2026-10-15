import { describe, expect, it } from 'vitest';
import {
  RegistrySnapshotManifestV1Schema,
  FutureConsumerReceiptV1Schema,
  TorchAnalysisRpcReceiptV1Schema,
  admitAgenticDenseSearchContextV1,
} from './rpc-packet-registry-consumers-v1.js';

describe('rpc-packet-registry-consumers-v1', () => {
  const torchReceipt = {
    schema: 'atlas.torch-analysis-rpc-receipt.v1' as const,
    requestId: 'request-1',
    runId: 'run-1',
    workerId: 'torch-cpu-0',
    operation: 'graph_tensor_metrics' as const,
    status: 'SUCCEEDED' as const,
    workspaceId: 'workspace-1',
    workspaceRevision: 'workspace-rev-1',
    registryManifestChecksum: 'a'.repeat(64),
    candidateSnapshotRevision: 'candidate-snapshot-1',
    ordinalMapChecksum: 'b'.repeat(64),
    inputArtifactId: 'artifact-in-1',
    inputArtifactUri: 'file:///artifacts/input.arrow',
    inputArtifactChecksum: 'c'.repeat(64),
    inputShape: [4, 8],
    inputDtype: 'float32' as const,
    outputArtifactId: 'artifact-out-1',
    outputArtifactUri: 'file:///artifacts/output.arrow',
    outputArtifactChecksum: 'd'.repeat(64),
    outputShape: [4, 8],
    outputDtype: 'float32' as const,
    metricReceiptSchema: 'atlas.graph-tensor-metrics.v1',
    metricReceiptChecksum: 'e'.repeat(64),
    replayChecksum: 'f'.repeat(64),
    torchVersion: '2.x',
    producerRevision: 'git:abc123',
    device: 'cpu' as const,
    generatedAt: '2026-10-14T12:00:00.000Z',
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };

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

  it('validates a noncanonical Torch analysis receipt with external artifact references', () => {
    const receipt = TorchAnalysisRpcReceiptV1Schema.parse(torchReceipt);
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.writesPerformed).toBe(false);
    expect(receipt.inputShape).toEqual([4, 8]);
  });

  it('rejects successful analysis without an output artifact', () => {
    expect(TorchAnalysisRpcReceiptV1Schema.safeParse({
      ...torchReceipt,
      outputArtifactId: null,
      outputArtifactUri: null,
      outputArtifactChecksum: null,
      outputShape: null,
      outputDtype: null,
    }).success).toBe(false);
  });

  it('rejects raw tensor payloads and any write-authority claim', () => {
    expect(TorchAnalysisRpcReceiptV1Schema.safeParse({ ...torchReceipt, tensor: [1, 2, 3] }).success).toBe(false);
    expect(TorchAnalysisRpcReceiptV1Schema.safeParse({ ...torchReceipt, writesPerformed: true }).success).toBe(false);
  });

  it('admits agentic dense search with bounded evidence budget', () => {
    const admission = admitAgenticDenseSearchContextV1(dummyIdentity, 25);
    expect(admission.packetKey).toBe('packet:example');
    expect(admission.evidenceBudget).toBe(25);
    expect(admission.writesPerformed).toBe(false);
  });
});
