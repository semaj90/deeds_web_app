import { createHash } from 'node:crypto';

export type AtlasHumanDecision = 'APPROVE' | 'REJECT' | 'PREFER_A' | 'PREFER_B' | 'CORRECT';

export interface AtlasHumanDecisionReceiptV1 {
  schema: 'atlas.human-decision.v1';
  taskId: string;
  decision: AtlasHumanDecision;
  evidenceHash: string;
  actorUserId: string;
  actorRole: string;
  reasonCode?: string;
  candidateA?: string;
  candidateB?: string;
  selectedCandidate?: string;
  revisions: {
    workspace?: string | null;
    source?: string | null;
    graph?: string | null;
    model?: string | null;
  };
  evidenceRefs: string[];
  createdAt: string;
}

export function humanDecisionIdentity(receipt: AtlasHumanDecisionReceiptV1): string {
  const canonical = JSON.stringify({
    taskId: receipt.taskId,
    decision: receipt.decision,
    evidenceHash: receipt.evidenceHash,
    actorUserId: receipt.actorUserId,
    revisions: receipt.revisions,
    evidenceRefs: [...receipt.evidenceRefs].sort()
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** Human feedback is evidence, not an execution-state transition by itself. */
export function humanDecisionMayReleaseTask(receipt: AtlasHumanDecisionReceiptV1): boolean {
  return receipt.decision === 'APPROVE' && Boolean(receipt.evidenceHash && receipt.taskId);
}
