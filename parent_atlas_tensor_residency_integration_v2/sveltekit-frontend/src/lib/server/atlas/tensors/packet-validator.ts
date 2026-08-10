export interface RevisionSnapshot {
  workspaceRevision: string;
  sourceRevision?: string;
  representationRevision?: string;
  graphRevision?: string;
}

export interface TensorPacketEnvelope {
  requestId: string;
  packetKey: string;
  workspaceRevision: string;
  sourceRevision?: string;
  representationRevision?: string;
  graphRevision?: string;
  producer: string;
  producerRevision: string;
  passName: string;
  passRevision: string;
  orderingScope: string;
  sequenceNumber?: number;
  inputHash: string;
  outputHash: string;
  schemaVersion: string;
  idempotencyKey: string;
}

export function validateTensorPacketEnvelope(e: TensorPacketEnvelope, frozen: RevisionSnapshot): string[] {
  const errors: string[] = [];
  if (!e.requestId || !e.packetKey || !e.idempotencyKey) errors.push('identity_missing');
  if (e.workspaceRevision !== frozen.workspaceRevision) errors.push('workspace_revision_mismatch');
  if (e.sourceRevision && frozen.sourceRevision && e.sourceRevision !== frozen.sourceRevision) errors.push('source_revision_mismatch');
  if (e.representationRevision && frozen.representationRevision && e.representationRevision !== frozen.representationRevision) errors.push('representation_revision_mismatch');
  if (e.graphRevision && frozen.graphRevision && e.graphRevision !== frozen.graphRevision) errors.push('graph_revision_mismatch');
  if (!e.inputHash || !e.outputHash) errors.push('hash_missing');
  return errors;
}
