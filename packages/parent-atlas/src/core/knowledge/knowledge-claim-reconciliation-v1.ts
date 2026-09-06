import { atlasKnowledgeClaimV1Schema, knowledgeClaimSetChecksumV1, type AtlasKnowledgeClaimV1 } from './knowledge-claim-v1.js';
import type { KnowledgeClaimPreflightIssueV1 } from './knowledge-claim-preflight-v1.js';
import { sha256HexV1 } from './stable-json-v1.js';

export interface KnowledgeClaimReconciliationInputV1 {
  confirmedClaimIds: string[];
  claims: AtlasKnowledgeClaimV1[];
  retractedClaimIds: string[];
}

export interface KnowledgeClaimReconciliationResultV1 {
  claims: AtlasKnowledgeClaimV1[];
  receipt: {
    schema: 'atlas.knowledge-claim-reconciliation-receipt.v1';
    beforeClaimSetChecksum: string;
    afterClaimSetChecksum: string;
    decisionChecksum: string;
    retainedWithoutModelRepeat: number;
    writesPerformed: false;
  };
}

export function reconcileKnowledgeClaimsV1(
  existingInput: readonly AtlasKnowledgeClaimV1[],
  preflightIssues: readonly KnowledgeClaimPreflightIssueV1[],
  decisions: KnowledgeClaimReconciliationInputV1,
): KnowledgeClaimReconciliationResultV1 {
  const existing = existingInput.map((claim) => atlasKnowledgeClaimV1Schema.parse(claim));
  const byId = new Map(existing.map((claim) => [claim.claimId, claim]));
  const confirmed = new Set(decisions.confirmedClaimIds);
  const retracted = new Set(decisions.retractedClaimIds);
  const updates = new Map(decisions.claims.map((claim) => {
    const parsed = atlasKnowledgeClaimV1Schema.parse(claim);
    return [parsed.claimId, parsed] as const;
  }));

  if (confirmed.size !== decisions.confirmedClaimIds.length) throw new Error('DUPLICATE_CONFIRMED_CLAIM_ID');
  if (retracted.size !== decisions.retractedClaimIds.length) throw new Error('DUPLICATE_RETRACTED_CLAIM_ID');
  if (updates.size !== decisions.claims.length) throw new Error('DUPLICATE_RECONCILED_CLAIM_ID');

  const allDecisionIds = new Set<string>();
  for (const [kind, ids] of [
    ['CONFIRM', confirmed],
    ['UPDATE', new Set(updates.keys())],
    ['RETRACT', retracted],
  ] as const) {
    for (const claimId of ids) {
      if (allDecisionIds.has(claimId)) throw new Error(`CONFLICTING_CLAIM_DECISION:${claimId}:${kind}`);
      allDecisionIds.add(claimId);
    }
  }

  for (const claimId of confirmed) if (!byId.has(claimId)) throw new Error(`CONFIRM_TARGET_NOT_FOUND:${claimId}`);
  for (const claimId of retracted) if (!byId.has(claimId)) throw new Error(`RETRACT_TARGET_NOT_FOUND:${claimId}`);

  const issueIds = new Set(preflightIssues.map((issue) => issue.claimId));
  for (const claimId of issueIds) {
    if (!updates.has(claimId) && !retracted.has(claimId)) throw new Error(`STALE_CLAIM_DECISION_MISSING:${claimId}`);
  }

  const next = new Map(byId);
  for (const [claimId, claim] of updates) next.set(claimId, claim);
  for (const claimId of retracted) {
    const current = byId.get(claimId);
    if (!current) continue;
    next.set(claimId, { ...current, state: 'RETRACTED' });
  }

  const claims = [...next.values()].sort((left, right) => left.claimId.localeCompare(right.claimId));
  const retainedWithoutModelRepeat = existing.filter((claim) => !allDecisionIds.has(claim.claimId)).length;
  return {
    claims,
    receipt: {
      schema: 'atlas.knowledge-claim-reconciliation-receipt.v1',
      beforeClaimSetChecksum: knowledgeClaimSetChecksumV1(existing),
      afterClaimSetChecksum: knowledgeClaimSetChecksumV1(claims),
      decisionChecksum: sha256HexV1(decisions),
      retainedWithoutModelRepeat,
      writesPerformed: false,
    },
  };
}
