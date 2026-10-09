const SHA256_REVISION = /^sha256:[a-f0-9]{64}$/;
const SHA256_DIGEST = /^[a-f0-9]{64}$/;

export function validateObservationFeaturePlanLineageV1(row, workspaceRevision) {
  const reasons = [];
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return { admitted: false, reasons: ['PLAN_ROW_INVALID'] };
  }
  if (typeof row.packetKey !== 'string' || !row.packetKey.trim()) reasons.push('PACKET_KEY_MISSING');
  if (typeof row.sourceRef !== 'string' || !row.sourceRef.trim()) reasons.push('SOURCE_REF_MISSING');
  if (typeof row.sourceRevision !== 'string' || !SHA256_REVISION.test(row.sourceRevision)) reasons.push('SOURCE_REVISION_UNQUALIFIED');
  if (typeof workspaceRevision !== 'string' || !SHA256_REVISION.test(workspaceRevision)) reasons.push('WORKSPACE_REVISION_UNQUALIFIED');
  if (typeof row.featureRevision !== 'string' || !row.featureRevision.trim()) reasons.push('FEATURE_REVISION_MISSING');
  if (typeof row.registryRevision !== 'string' || !row.registryRevision.trim()) reasons.push('REGISTRY_REVISION_MISSING');
  if (typeof row.inputDigest !== 'string' || !SHA256_DIGEST.test(row.inputDigest)) reasons.push('INPUT_DIGEST_MISSING_OR_INVALID');
  if (!Array.isArray(row.evidenceRefs) || row.evidenceRefs.length === 0
    || row.evidenceRefs.some((ref) => typeof ref !== 'string' || !ref.trim() || ref === row.packetKey)) {
    reasons.push('SOURCE_EVIDENCE_REFS_MISSING');
  }
  return { admitted: reasons.length === 0, reasons };
}

export function validateObservationFeaturePlanRowsV1(rows, workspaceRevision) {
  const rejected = [];
  rows.forEach((row, index) => {
    const result = validateObservationFeaturePlanLineageV1(row, workspaceRevision);
    if (!result.admitted) rejected.push({ index, packetKey: row?.packetKey ?? null, reasons: result.reasons });
  });
  return { admitted: rejected.length === 0, rowCount: rows.length, rejected };
}
