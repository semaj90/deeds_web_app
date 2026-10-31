import { z } from 'zod';

const sha256Revision = z.string().regex(/^sha256:[a-f0-9]{64}$/i);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/i);
const evidenceRef = z.string().min(1);
const gitCommit = z.string().regex(/^[a-f0-9]{40}$/i);

export const GraphifyScopeDecisionV1Schema = z.object({
  scope: z.string().regex(/^repo:[^\s]+$/),
  decision: z.enum(['CANONICAL_ADMITTED', 'REFERENCE_ONLY', 'EXCLUDED', 'UNRESOLVED']),
  membershipIncluded: z.boolean(),
  pinnedCommit: gitCommit,
  currentHead: gitCommit,
  worktreeClean: z.boolean(),
  decisionEvidenceRef: evidenceRef.nullable(),
  sourceAuthorityRepoId: evidenceRef.nullable(),
  repositoryId: z.string().uuid().nullable(),
  sourceRevision: sha256Revision.nullable(),
  sourceBytesSha256: sha256Hex.nullable(),
  sourceBytesReceiptRef: evidenceRef.nullable(),
  externalProvenanceRef: evidenceRef.nullable(),
  licensePolicyRef: evidenceRef.nullable(),
  exclusionPolicyRef: evidenceRef.nullable(),
}).strict();

export const GraphifyScopePolicyInputV1Schema = z.object({
  expectedScopes: z.array(z.string().regex(/^repo:[^\s]+$/)).min(1),
  decisions: z.array(GraphifyScopeDecisionV1Schema),
}).strict();

export type GraphifyScopeDecisionV1 = z.infer<typeof GraphifyScopeDecisionV1Schema>;
export type GraphifyScopePolicyInputV1 = z.infer<typeof GraphifyScopePolicyInputV1Schema>;

export type GraphifyScopePolicyResultV1 = {
  status: 'PASS' | 'FAIL';
  eligibleCanonicalScopes: string[];
  dispositions: Array<{ scope: string; decision: GraphifyScopeDecisionV1['decision'] }>;
  blockers: string[];
};

export function validateGraphifyScopePolicyV1(input: GraphifyScopePolicyInputV1): GraphifyScopePolicyResultV1 {
  const parsed = GraphifyScopePolicyInputV1Schema.parse(input);
  const blockers: string[] = [];
  const expected = new Set(parsed.expectedScopes);
  const observed = new Map<string, GraphifyScopeDecisionV1>();
  const canonicalRepositoryIds = new Map<string, string>();
  const canonicalAuthorityKeys = new Map<string, string>();

  if (expected.size !== parsed.expectedScopes.length) blockers.push('EXPECTED_SCOPE_DUPLICATE');
  for (const decision of parsed.decisions) {
    if (observed.has(decision.scope)) {
      blockers.push(`SCOPE_DECISION_DUPLICATE:${decision.scope}`);
      continue;
    }
    observed.set(decision.scope, decision);
    if (!expected.has(decision.scope)) blockers.push(`SCOPE_NOT_IN_EXPECTED_INVENTORY:${decision.scope}`);
    if (!decision.decisionEvidenceRef) blockers.push(`SCOPE_DECISION_EVIDENCE_MISSING:${decision.scope}`);

    if (decision.decision === 'CANONICAL_ADMITTED') {
      if (!decision.membershipIncluded) blockers.push(`CANONICAL_SCOPE_MISSING_FROM_MEMBERSHIP:${decision.scope}`);
      if (!decision.sourceAuthorityRepoId || !decision.repositoryId) blockers.push(`CANONICAL_REPOSITORY_IDENTITY_MISSING:${decision.scope}`);
      if (decision.repositoryId) {
        const priorScope = canonicalRepositoryIds.get(decision.repositoryId);
        if (priorScope && priorScope !== decision.scope) blockers.push(`CANONICAL_REPOSITORY_ID_REUSED:${priorScope}:${decision.scope}`);
        canonicalRepositoryIds.set(decision.repositoryId, decision.scope);
      }
      if (decision.sourceAuthorityRepoId) {
        const priorScope = canonicalAuthorityKeys.get(decision.sourceAuthorityRepoId);
        if (priorScope && priorScope !== decision.scope) blockers.push(`CANONICAL_AUTHORITY_KEY_REUSED:${priorScope}:${decision.scope}`);
        canonicalAuthorityKeys.set(decision.sourceAuthorityRepoId, decision.scope);
      }
      if (!decision.sourceRevision || !decision.sourceBytesSha256 || !decision.sourceBytesReceiptRef) {
        blockers.push(`CANONICAL_SOURCE_BYTES_UNVERIFIED:${decision.scope}`);
      } else if (decision.sourceRevision.toLowerCase() !== `sha256:${decision.sourceBytesSha256.toLowerCase()}`) {
        blockers.push(`CANONICAL_SOURCE_REVISION_MISMATCH:${decision.scope}`);
      }
    } else if (decision.decision === 'REFERENCE_ONLY') {
      if (decision.membershipIncluded) blockers.push(`REFERENCE_SCOPE_PRESENT_IN_CANONICAL_MEMBERSHIP:${decision.scope}`);
      if (!decision.externalProvenanceRef || !decision.licensePolicyRef) blockers.push(`REFERENCE_PROVENANCE_OR_LICENSE_MISSING:${decision.scope}`);
    } else if (decision.decision === 'EXCLUDED') {
      if (decision.membershipIncluded) blockers.push(`EXCLUDED_SCOPE_PRESENT_IN_CANONICAL_MEMBERSHIP:${decision.scope}`);
      if (!decision.exclusionPolicyRef) blockers.push(`EXCLUSION_POLICY_EVIDENCE_MISSING:${decision.scope}`);
    } else {
      blockers.push(`SCOPE_DECISION_UNRESOLVED:${decision.scope}`);
    }
  }

  for (const scope of expected) if (!observed.has(scope)) blockers.push(`SCOPE_DECISION_MISSING:${scope}`);

  return {
    status: blockers.length === 0 ? 'PASS' : 'FAIL',
    eligibleCanonicalScopes: parsed.decisions
      .filter((decision) => decision.decision === 'CANONICAL_ADMITTED' && expected.has(decision.scope))
      .map((decision) => decision.scope)
      .sort(),
    dispositions: parsed.decisions.map(({ scope, decision }) => ({ scope, decision })).sort((a, b) => a.scope.localeCompare(b.scope)),
    blockers: [...new Set(blockers)].sort(),
  };
}
