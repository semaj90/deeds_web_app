import type { CheckpointCommitPayloadV1 } from '$lib/server/queue/event-fabric.js';
import { bytesToHex, merkleLeafHash, merkleTreeHash } from './rfc9162-merkle.js';
import { nodeSha256Hasher } from './node-sha256.js';

export interface MerkleLeafReceiptV1 {
  ordinal: number;
  streamOffset: string;
  eventId: string;
  canonicalEventHashHex: string;
  merkleLeafHashHex: string;
}

export interface CanonicalCheckpointEvent {
  streamOffset: string;
  eventId: string;
  occurredAt: string;
  canonicalJson: string; // MUST come from existing Parent Atlas stableStringify()
  canonicalEventHashHex: string;
}

export interface BuildCheckpointInput {
  checkpointId: string;
  stream: string;
  events: readonly CanonicalCheckpointEvent[];
  schemaRevision: string;
  checkpointAlgorithmRevision: string;
  modelRevisionSetHash?: string;
  sourceRevisionSetHash?: string;
  graphRevision?: string;

  persistLeafManifest(
    leaves: readonly MerkleLeafReceiptV1[],
  ): Promise<{ ref: string; hashHex: string }>;
}

export interface CheckpointBuildResult {
  payload: CheckpointCommitPayloadV1;
  leafManifestRef: string;
  leafManifestHashHex: string;
}

export async function buildAnalyticsCheckpoint(
  input: BuildCheckpointInput,
): Promise<CheckpointBuildResult> {
  if (input.events.length === 0) {
    throw new Error('Refusing to checkpoint an empty analytics population');
  }

  const encoder = new TextEncoder();
  const canonicalLeaves = input.events.map((e) => encoder.encode(e.canonicalJson));
  const root = merkleTreeHash(canonicalLeaves, nodeSha256Hasher);

  const leaves: MerkleLeafReceiptV1[] = input.events.map((event, ordinal) => ({
    ordinal,
    streamOffset: event.streamOffset,
    eventId: event.eventId,
    canonicalEventHashHex: event.canonicalEventHashHex,
    merkleLeafHashHex: bytesToHex(
      merkleLeafHash(encoder.encode(event.canonicalJson), nodeSha256Hasher),
    ),
  }));

  const manifest = await input.persistLeafManifest(leaves);

  const payload: CheckpointCommitPayloadV1 = {
    checkpointId: input.checkpointId,
    stream: input.stream,
    startOffset: input.events[0].streamOffset,
    endOffset: input.events[input.events.length - 1].streamOffset,
    eventCount: input.events.length,
    firstOccurredAt: input.events[0].occurredAt,
    lastOccurredAt: input.events[input.events.length - 1].occurredAt,
    merkleRoot: bytesToHex(root),
    schemaRevision: input.schemaRevision,
    modelRevisionSetHash: input.modelRevisionSetHash,
    sourceRevisionSetHash: input.sourceRevisionSetHash,
    metadata: {
      checkpointAlgorithmRevision: input.checkpointAlgorithmRevision,
      graphRevision: input.graphRevision,
      leafManifestRef: manifest.ref,
      leafManifestHashHex: manifest.hashHex,
    },
  };

  return {
    payload,
    leafManifestRef: manifest.ref,
    leafManifestHashHex: manifest.hashHex,
  };
}