export const AUDIT_STATES = Object.freeze(['PROVEN','READY','PARTIAL','WAITING','UNPROVEN','NOT_APPLICABLE']);

export function auditState({ proven=false, ready=false, partial=false, waiting=false, applicable=true }) {
  if (!applicable) return 'NOT_APPLICABLE';
  if (proven) return 'PROVEN';
  if (waiting) return 'WAITING';
  if (ready) return 'READY';
  if (partial) return 'PARTIAL';
  return 'UNPROVEN';
}

export function gate(key, state, evidence = [], blockers = [], details = {}) {
  return { key, state, evidence: [...new Set(evidence)].sort(), blockers: [...new Set(blockers)].sort(), details };
}
