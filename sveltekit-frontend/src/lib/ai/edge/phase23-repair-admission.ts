import type { EdgeRepairTaskV1 } from './phase23-agent-repair.js';
/** EDGE-09: pure admission check. Does not act as an ACP/A2A transport. */
export interface AuthorizedRepairEvidence {
  taskCardId: string; evidenceCardId: string; sourceRevision: string; approvalId: string;
  capability: string; expectedAction: EdgeRepairTaskV1['action'];
}
export function assessRepairAdmission(task: EdgeRepairTaskV1, proof?: AuthorizedRepairEvidence) {
  const fields = proof && Object.values(proof).every(v => typeof v === 'string' && v.trim().length > 0);
  const authorized = Boolean(fields && proof?.capability === 'atlas.edge-model.repair.propose' && proof?.expectedAction === task.action);
  return { status: authorized ? 'READY_FOR_OWNER_REVIEW' : 'NOT_AUTHORIZED', execute: false,
    reason: authorized ? 'TaskCard/EvidenceCard authority still requires readback by existing owner' : 'Missing revision-qualified approval or capability' } as const;
}
// TODO(EDGE-09): bind real TaskCard/EvidenceCard identifiers to canonical join owner.
// TODO: verify approval expiration, lease fence, policy, permissions, audit and transactional readback.
