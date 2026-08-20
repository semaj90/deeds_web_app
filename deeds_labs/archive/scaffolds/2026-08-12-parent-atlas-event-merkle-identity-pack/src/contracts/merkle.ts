export interface AnalyticsMerkleCheckpointV1 {
  schemaVersion: 'atlas.analytics-merkle-checkpoint.v1';
  checkpointId: string;
  stream: string;
  startOffset: string;
  endOffset: string;
  eventCount: number;
  firstOccurredAt: string;
  lastOccurredAt: string;
  merkleRootHex: string;
  eventSchemaRevision: string;
  checkpointAlgorithmRevision: string;
  modelRevisionSetHash?: string;
  sourceRevisionSetHash?: string;
  graphRevision?: string;
  createdAt: string;
}

export interface MerkleLeafReceiptV1 {
  ordinal: number;
  streamOffset: string;
  eventId: string;
  canonicalEventHashHex: string;
  merkleLeafHashHex: string;
}

export interface CheckpointCommitV1 {
  schemaVersion: 'atlas.checkpoint-commit.v1';
  checkpoint: AnalyticsMerkleCheckpointV1;
  leafManifestRef: string;
  leafManifestHashHex: string;
  producerId: string;
  producerRevision: string;
}
