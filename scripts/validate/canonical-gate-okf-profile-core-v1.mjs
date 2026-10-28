import crypto from 'node:crypto';

const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

export function classifyOkfProfileEvidence(evidence) {
  const { receiptSha256, ...body } = evidence ?? {};
  if (evidence?.schema !== 'atlas.canonical-gate-okf-profile-evidence.v1'
    || evidence.canonicalAuthority !== false
    || evidence.writesPerformed !== false
    || receiptSha256 !== sha256(Buffer.from(JSON.stringify(body), 'utf8'))
    || typeof evidence.broadProfileDiagnostic?.sha256 !== 'string'
    || typeof evidence.profileReconciliation?.sha256 !== 'string') {
    return { verdict: 'FAIL', reasons: ['OKF_PROFILE_EVIDENCE_MALFORMED_OR_AUTHORITY_FLAGS_INVALID'] };
  }
  const profile = evidence.profileReconciliation;
  if (!profile?.counts || profile.counts.reconciled !== true || profile.counts.unclassified !== 0) {
    return { verdict: 'FAIL', reasons: ['OKF_PROFILE_INVENTORY_UNRECONCILED'] };
  }
  if (profile.status === 'OKF_PROFILE_RECONCILIATION_READ_ONLY_VERIFIED') return { verdict: 'PASS', reasons: [] };
  if (profile.status === 'OKF_PROFILE_RECONCILIATION_INCOMPLETE') {
    return { verdict: 'PARTIAL', reasons: [profile.firstBlocker ?? 'OKF_PROFILE_OWNER_EVIDENCE_INCOMPLETE'] };
  }
  return { verdict: 'FAIL', reasons: ['OKF_PROFILE_RECONCILIATION_STATUS_INVALID'] };
}
