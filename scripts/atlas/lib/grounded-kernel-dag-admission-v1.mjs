import { createHash } from 'node:crypto';
import { buildKernelDagCandidate, validateKernelDagCandidate } from './kernel-dag-v1.mjs';

export function stableHash(value) {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

export function buildGroundedKernelDagCandidate(input) {
  if (input.groundedClaimReceipt?.status !== 'ORNITH_GROUNDED_CLAIM_VALIDATION_PROVEN' || input.groundedClaimReceipt?.receipt?.verdict !== 'VERIFIED') throw new Error('DAG_ADMISSION_CLAIM_NOT_VERIFIED');
  if (input.synthesisReceipt?.status !== 'ORNITH_EXTERNAL_EVIDENCE_SYNTHESIS_REPLAY_PROVEN' || input.synthesisReceipt?.responseChecksums?.identical !== true) throw new Error('DAG_ADMISSION_SYNTHESIS_NOT_REPLAY_PROVEN');
  if (input.contextManifest?.status !== 'GPU_FEATURE_CONTEXT_MANIFEST_REPLAY_PROVEN') throw new Error('DAG_ADMISSION_CONTEXT_NOT_REPLAY_PROVEN');
  if (input.synthesisReceipt.contextManifestChecksum !== input.contextManifest.manifestChecksum) throw new Error('DAG_ADMISSION_CONTEXT_CHECKSUM_MISMATCH');
  const claimRefs = new Set(input.groundedClaimReceipt.receipt.evidence_refs);
  const contextRefs = new Set(input.contextManifest.evidenceRefs);
  if ([...claimRefs].some((ref) => !contextRefs.has(ref))) throw new Error('DAG_ADMISSION_EVIDENCE_CLOSURE_FAILED');
  const kernelCandidate = buildKernelDagCandidate({ ...input.candidate, canonicalAuthority: false, executable: false });
  const body = {
    schema: 'atlas.grounded-kernel-dag-candidate.v1',
    kernelCandidate,
    groundedClaimReceiptChecksum: stableHash(input.groundedClaimReceipt.receipt),
    synthesisReceiptChecksum: stableHash({ contextManifestChecksum: input.synthesisReceipt.contextManifestChecksum, responseChecksums: input.synthesisReceipt.responseChecksums }),
    contextManifestChecksum: input.contextManifest.manifestChecksum,
    mutationRequested: false,
    canonicalAuthority: false,
    executionAuthority: false,
  };
  return { ...body, candidateDagChecksum: stableHash(body) };
}

export function validateGroundedKernelDagAdmission(input) {
  const candidate = buildGroundedKernelDagCandidate(input);
  const receipt = validateKernelDagCandidate({ ...input.validator, candidate: candidate.kernelCandidate });
  const status = receipt.status === 'ACCEPTED' && candidate.mutationRequested === false && candidate.executionAuthority === false
    ? 'GROUNDED_TYPED_DAG_ADMISSION_PROVEN'
    : 'GROUNDED_TYPED_DAG_ADMISSION_REJECTED';
  return {
    schema: 'atlas.grounded-kernel-dag-validation.v1',
    status,
    groundedClaimReceiptChecksum: candidate.groundedClaimReceiptChecksum,
    synthesisReceiptChecksum: candidate.synthesisReceiptChecksum,
    contextManifestChecksum: candidate.contextManifestChecksum,
    candidateDagChecksum: candidate.candidateDagChecksum,
    validatedDagChecksum: receipt.validatedDagChecksum,
    nodeCount: candidate.kernelCandidate.nodes.length,
    edgeCount: candidate.kernelCandidate.edges.length,
    lineageValidation: receipt.revisionMismatches.length === 0 ? 'PASS' : 'FAIL',
    evidenceValidation: candidate.kernelCandidate.nodes.every((node) => node.evidenceRefs.length > 0) ? 'PASS' : 'FAIL',
    schemaValidation: receipt.argumentSchemaFailures.length === 0 && receipt.cycleDetected === false ? 'PASS' : 'FAIL',
    permissionValidation: receipt.unauthorizedMutations.length === 0 ? 'PASS' : 'FAIL',
    runtimeCapabilityValidation: receipt.runtimeCapabilitiesMissing.length === 0 ? 'PASS' : 'FAIL',
    budgetValidation: receipt.resourceBudgetExceeded.length === 0 ? 'PASS' : 'FAIL',
    mutationRequested: false,
    executionPerformed: false,
    writesPerformed: false,
    validatorReceipt: receipt,
    canonicalAuthority: false,
  };
}
