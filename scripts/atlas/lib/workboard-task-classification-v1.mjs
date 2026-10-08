const supersessionLanguage = /\b(?:superseded|supersedes|historical|archived|retired)\b/i;

export function classifyWorkboardTaskV1(changeId, text, convergenceChangeId) {
  if (/do not|don't|never|must not|no .* writes|without .* writes/i.test(text)) return 'NEGATIVE_CONSTRAINT';
  if (/human|authorization|approval|required direction|HITL/i.test(text)) return 'HUMAN_DECISION_REQUIRED';
  if (supersessionLanguage.test(text)) return 'SUPERSESSION_REVIEW_REQUIRED';
  if (/\bBLOCKED\b|blocked by|unresolved|missing authoritative|workspace.*mismatch|revision.*unproven/i.test(text)) return 'BLOCKED_UPSTREAM';
  if (changeId !== convergenceChangeId) return 'OWNED_BY_OTHER_CHANGE';
  if (/governance|authority|ledger|portfolio|task board|status|reconcile|receipt/i.test(text)) return 'GOVERNANCE_ONLY';
  return 'UNVERIFIED';
}

export function workboardEvidenceDispositionV1(classification, text) {
  if (classification === 'SUPERSESSION_REVIEW_REQUIRED') return 'SUPERSESSION_REPLACEMENT_EVIDENCE_REQUIRED';
  if (classification === 'BLOCKED_UPSTREAM') return 'BLOCKED';
  if (classification === 'HUMAN_DECISION_REQUIRED') return 'HUMAN_DECISION_REQUIRED';
  if (classification === 'NEGATIVE_CONSTRAINT') return 'CONSTRAINT';
  if (/regression|finding confirmed|follow[- ]?up open|confirmed.*unfixed/i.test(text)) {
    return 'FINDING_CONFIRMED_FOLLOWUP_OPEN';
  }
  if (classification === 'OWNED_BY_OTHER_CHANGE') return 'OWNED_BY_OTHER_CHANGE';
  return 'UNVERIFIED';
}
