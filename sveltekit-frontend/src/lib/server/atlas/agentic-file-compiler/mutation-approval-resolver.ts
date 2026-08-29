import { FileMutationPlanSchema, mutationPlanIntentDigest, sha256Stable, type FileMutationPlanV1, type MutationApprovalReceiptV1 } from './contracts.js';

export interface MutationApprovalRecordV1 {
	approvalId: string;
	runId: string;
	decision: 'approved' | 'rejected';
	decidedByUserId: number;
	decidedAt: string;
	expiresAt?: string | null;
	revokedAt?: string | null;
	approvedPlanDigest: string;
	authorizationPolicyRevision: string;
}

export interface MutationApprovalResolutionV1 {
	valid: boolean;
	errors: string[];
	approvalId: string;
	planDigest: string;
}

export function resolveMutationApproval(
	planInput: FileMutationPlanV1,
	record: MutationApprovalRecordV1,
	now = new Date(),
): MutationApprovalResolutionV1 {
	const plan = FileMutationPlanSchema.parse(planInput);
	const receipt = plan.approvalReceipt;
	const { approvalReceipt, planChecksum: _planChecksum, ...planWithoutApproval } = plan;
	const planDigest = mutationPlanIntentDigest(planWithoutApproval);
	const errors: string[] = [];

	if (receipt.approvalId !== record.approvalId) errors.push('approval id mismatch');
	if (receipt.runId !== record.runId) errors.push('approval run id mismatch');
	if (receipt.approvedPlanDigest !== planDigest || record.approvedPlanDigest !== planDigest) errors.push('approved plan digest mismatch');
	if (receipt.authorizationPolicyRevision !== record.authorizationPolicyRevision) errors.push('authorization policy revision mismatch');
	if (receipt.approvedByUserId !== record.decidedByUserId) errors.push('approving user mismatch');
	if (record.decision !== 'approved' || receipt.decision !== 'approved') errors.push('approval decision is not approved');
	if (receipt.revokedAt || record.revokedAt) errors.push('approval is revoked');
	const expiryTimes = [receipt.expiresAt, record.expiresAt]
		.filter((value): value is string => Boolean(value))
		.map((value) => Date.parse(value));
	if (expiryTimes.some((value) => value <= now.getTime())) errors.push('approval is expired');
	const { receiptChecksum, ...receiptWithoutChecksum } = receipt;
	if (receiptChecksum !== sha256Stable(receiptWithoutChecksum)) errors.push('approval receipt checksum mismatch');

	return { valid: errors.length === 0, errors, approvalId: receipt.approvalId, planDigest };
}
