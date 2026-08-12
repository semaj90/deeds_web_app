import type {
  AnalyticsMerkleCheckpointV1,
  CheckpointCommitV1,
  MerkleLeafReceiptV1,
} from '../contracts/merkle.js';
import { bytesToHex, merkleLeafHash, merkleTreeHash } from './rfc9162-merkle.js';
import { nodeSha256Hasher } from './node-sha256.js';

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
  eventSchemaRevision: string;
  checkpointAlgorithmRevision: string;
  modelRevisionSetHash?: string;
  sourceRevisionSetHash?: string;
  graphRevision?: string;
  producerId: string;
  producerRevision: string;

  persistLeafManifest(
    leaves: readonly MerkleLeafReceiptV1[],
  ): Promise<{ ref: string; hashHex: string }>;
}

export async function buildAnalyticsCheckpoint(
  input: BuildCheckpointInput,
): Promise<CheckpointCommitV1> {
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

  const checkpoint: AnalyticsMerkleCheckpointV1 = {
    schemaVersion: 'atlas.analytics-merkle-checkpoint.v1',
    checkpointId: input.checkpointId,
    stream: input.stream,
    startOffset: input.events[0].streamOffset,
    endOffset: input.events[input.events.length - 1].streamOffset,
    eventCount: input.events.length,
    firstOccurredAt: input.events[0].occurredAt,
    lastOccurredAt: input.events[input.events.length - 1].occurredAt,
    merkleRootHex: bytesToHex(root),
    eventSchemaRevision: input.eventSchemaRevision,
    checkpointAlgorithmRevision: input.checkpointAlgorithmRevision,
    modelRevisionSetHash: input.modelRevisionSetHash,
    sourceRevisionSetHash: input.sourceRevisionSetHash,
    graphRevision: input.graphRevision,
    createdAt: new Date().toISOString(),
  };

  return {
    schemaVersion: 'atlas.checkpoint-commit.v1',
    checkpoint,
    leafManifestRef: manifest.ref,
    leafManifestHashHex: manifest.hashHex,
    producerId: input.producerId,
    producerRevision: input.producerRevision,
  };
}
