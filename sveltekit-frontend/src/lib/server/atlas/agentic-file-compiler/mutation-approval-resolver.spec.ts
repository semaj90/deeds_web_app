import { describe, expect, it } from 'vitest';
import { mutationPlanIntentDigest, sha256Stable, type FileMutationPlanV1 } from './contracts.js';
import { resolveMutationApproval, type MutationApprovalRecordV1 } from './mutation-approval-resolver.js';

function fixture(): { plan: FileMutationPlanV1; record: MutationApprovalRecordV1 } {
	const base = {
		schema: 'atlas.file-mutation-plan.v1' as const, mutationId: 'mut:1', requestId: 'req:1', workflowId: 'wf:1', dagNodeId: 'mutate', workspaceRevision: 'ws:1',
		operation: 'CREATE' as const, targetPath: 'src/new-file.ts', targetArtifactKind: 'source_module', requiredSymbols: ['run'], contextManifestId: 'manifest:1', packetKeys: [], sourceRefs: [], promotedEvidenceIds: ['promotion:1'], expectedAbsent: true,
		allowedRoots: ['src'], forbiddenRoots: ['src/generated'], validationNodeIds: ['typecheck'],
	};
	const approvalBody = {
		schema: 'atlas.mutation-approval-receipt.v1' as const, approvalId: 'approval:1', runId: 'run:1', approvedPlanDigest: mutationPlanIntentDigest(base), authorizationPolicyRevision: 'auth:1', approvedByUserId: 7, decision: 'approved' as const, approvedAt: '2026-08-29T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z', revokedAt: null,
	};
	const approvalReceipt = { ...approvalBody, receiptChecksum: sha256Stable(approvalBody) };
	const plan = { ...base, approvalReceipt, planChecksum: sha256Stable({ ...base, approvalReceipt }) } as FileMutationPlanV1;
	const record = { approvalId: 'approval:1', runId: 'run:1', decision: 'approved' as const, decidedByUserId: 7, decidedAt: approvalBody.approvedAt, expiresAt: approvalBody.expiresAt, revokedAt: null, approvedPlanDigest: approvalBody.approvedPlanDigest, authorizationPolicyRevision: 'auth:1' };
	return { plan, record };
}

describe('mutation approval resolver', () => {
	it('accepts an approved, unexpired, plan-bound record', () => {
		const { plan, record } = fixture();
		expect(resolveMutationApproval(plan, record, new Date('2026-08-29T01:00:00.000Z')).valid).toBe(true);
	});

	it('rejects a different run, expired approval, and revoked approval', () => {
		const { plan, record } = fixture();
		expect(resolveMutationApproval(plan, { ...record, runId: 'run:other' }).errors).toContain('approval run id mismatch');
		expect(resolveMutationApproval(plan, { ...record, expiresAt: '2026-08-28T00:00:00.000Z' }, new Date('2026-08-29T01:00:00.000Z')).errors).toContain('approval is expired');
		expect(resolveMutationApproval(plan, { ...record, revokedAt: '2026-08-29T00:30:00.000Z' }).errors).toContain('approval is revoked');
	});
});
