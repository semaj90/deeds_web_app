import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Stable, mutationPlanIntentDigest, type FileMutationPlanV1 } from './contracts.js';
import { admitGovernedReplayV1 } from './governed-replay-admission-v1.js';

function fixture() {
	const root = mkdtempSync(join(tmpdir(), 'atlas-governed-replay-'));
	mkdirSync(join(root, 'src'), { recursive: true });
	const base = {
		schema: 'atlas.file-mutation-plan.v1' as const,
		mutationId: 'mutation:1', requestId: 'request:1', workflowId: 'workflow:1', dagNodeId: 'mutate',
		workspaceRevision: 'workspace:1', operation: 'CREATE' as const, targetPath: 'src/new.ts',
		targetArtifactKind: 'source_module', requiredSymbols: ['run'], contextManifestId: 'manifest:1',
		packetKeys: [], sourceRefs: [], promotedEvidenceIds: ['promotion:1'], expectedAbsent: true,
		allowedRoots: ['src'], forbiddenRoots: [], validationNodeIds: ['typecheck'],
	};
	const approvalBody = {
		schema: 'atlas.mutation-approval-receipt.v1' as const,
		approvalId: 'approval:1', runId: 'run:1', approvedPlanDigest: mutationPlanIntentDigest(base),
		authorizationPolicyRevision: 'policy:1', approvedByUserId: 1, decision: 'approved' as const,
		approvedAt: '2026-09-14T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z', revokedAt: null,
	};
	const approvalReceipt = { ...approvalBody, receiptChecksum: sha256Stable(approvalBody) };
	const plan = { ...base, approvalReceipt, planChecksum: sha256Stable({ ...base, approvalReceipt }) } as FileMutationPlanV1;
	const event = {
		schema: 'atlas.workflow-action.v1', workflowId: 'workflow:1', workflowRevision: 1, sequence: 0,
		runId: '00000000-0000-4000-8000-000000000003',
		actionId: 'mutation:1', dagNodeId: 'mutate', attempt: 1, lane: 'tool', kind: 'started',
		producerRevision: 'producer:1', revisions: { workspace: 'workspace:1' },
	};
	const approvalRecord = {
		approvalId: 'approval:1', runId: 'run:1', decision: 'approved' as const, decidedByUserId: 1,
		decidedAt: approvalBody.approvedAt, expiresAt: approvalBody.expiresAt, revokedAt: null,
		approvedPlanDigest: approvalBody.approvedPlanDigest, authorizationPolicyRevision: 'policy:1',
	};
	return { root, plan, event, approvalRecord };
}

describe('governed replay admission', () => {
	it('rejects without approval and never writes', () => {
		const { root, plan, event } = fixture();
		const { approvalReceipt: _approvalReceipt, ...unapprovedPlan } = plan;
		const result = admitGovernedReplayV1({ event, plan: unapprovedPlan, workspaceRoot: root });
		expect(result.status).toBe('REJECTED_NO_APPROVAL');
		expect(result.writesPerformed).toBe(false);
		expect(result.eventReceipt?.event_checksum).toMatch(/^[a-f0-9]{64}$/);
	});

	it('admits a plan-bound read-only replay after approval and preflight', () => {
		const { root, plan, event, approvalRecord } = fixture();
		const result = admitGovernedReplayV1({ event, plan, approvalRecord, workspaceRoot: root, now: new Date('2026-09-14T01:00:00.000Z') });
		expect(result.status).toBe('ADMITTED_READ_ONLY');
		expect(result.preflight?.ok).toBe(true);
		expect(result.writesPerformed).toBe(false);
		expect(result.eventReceipt?.runtime_evidence_checksum).toMatch(/^[a-f0-9]{64}$/);
	});

	it('rejects a stale canonical event revision', () => {
		const { root, plan, event, approvalRecord } = fixture();
		const result = admitGovernedReplayV1({ event: { ...event, revisions: { workspace: 'workspace:stale' } }, plan, approvalRecord, workspaceRoot: root });
		expect(result.status).toBe('REJECTED_EVENT_PLAN_MISMATCH');
		expect(result.writesPerformed).toBe(false);
	});

	it('rejects an allowed-root escape at preflight, not just at admission', () => {
		const { root, plan, event, approvalRecord } = fixture();
		// targetPath escapes plan.allowedRoots (['src']) by pointing at a sibling directory.
		// Rebuild the plan with a re-derived digest/checksum chain so only the escape triggers
		// REJECTED_PREFLIGHT, not an unrelated digest mismatch.
		const { approvalReceipt, planChecksum: _planChecksum, ...base } = plan;
		const escapedBase = { ...base, targetPath: 'outside/escape.ts' };
		const escapedApprovalBody = { ...approvalReceipt, approvedPlanDigest: mutationPlanIntentDigest(escapedBase) };
		const { receiptChecksum: _escapedChecksum, ...escapedApprovalWithoutChecksum } = escapedApprovalBody;
		const escapedApprovalReceipt = { ...escapedApprovalBody, receiptChecksum: sha256Stable(escapedApprovalWithoutChecksum) };
		const escapedPlan = {
			...escapedBase,
			approvalReceipt: escapedApprovalReceipt,
			planChecksum: sha256Stable({ ...escapedBase, approvalReceipt: escapedApprovalReceipt }),
		} as FileMutationPlanV1;
		const escapedApprovalRecord = { ...approvalRecord, approvedPlanDigest: escapedApprovalBody.approvedPlanDigest };
		const result = admitGovernedReplayV1({ event, plan: escapedPlan, approvalRecord: escapedApprovalRecord, workspaceRoot: root });
		expect(result.status).toBe('REJECTED_PREFLIGHT');
		expect(result.writesPerformed).toBe(false);
		expect(result.preflight?.errors.some((e) => e.includes('outside allowedRoots'))).toBe(true);
	});

	it('rejects a stale preimage when expectedExistingChecksum does not match the file on disk', () => {
		const { root, plan, event, approvalRecord } = fixture();
		const { approvalReceipt, planChecksum: _planChecksum, ...base } = plan;
		const patchBase = {
			...base,
			operation: 'PATCH' as const,
			expectedAbsent: false,
			expectedExistingChecksum: 'a'.repeat(64), // deliberately wrong -- file below will have different content
		};
		const patchApprovalBody = { ...approvalReceipt, approvedPlanDigest: mutationPlanIntentDigest(patchBase) };
		const { receiptChecksum: _patchChecksum, ...patchApprovalWithoutChecksum } = patchApprovalBody;
		const patchApprovalReceipt = { ...patchApprovalBody, receiptChecksum: sha256Stable(patchApprovalWithoutChecksum) };
		const patchPlan = {
			...patchBase,
			approvalReceipt: patchApprovalReceipt,
			planChecksum: sha256Stable({ ...patchBase, approvalReceipt: patchApprovalReceipt }),
		} as FileMutationPlanV1;
		const patchApprovalRecord = { ...approvalRecord, approvedPlanDigest: patchApprovalBody.approvedPlanDigest };
		writeFileSync(join(root, 'src', 'new.ts'), 'export const run = () => 1;\n');
		const result = admitGovernedReplayV1({ event, plan: patchPlan, approvalRecord: patchApprovalRecord, workspaceRoot: root });
		expect(result.status).toBe('REJECTED_PREFLIGHT');
		expect(result.writesPerformed).toBe(false);
		expect(result.preflight?.errors).toContain('existing checksum mismatch');
	});

	it('rejects a plan with no validation nodes -- targeted validation is mandatory', () => {
		const { root, plan, event, approvalRecord } = fixture();
		const { approvalReceipt, planChecksum: _planChecksum, ...base } = plan;
		const unvalidatedBase = { ...base, validationNodeIds: [] as string[] };
		const unvalidatedApprovalBody = { ...approvalReceipt, approvedPlanDigest: mutationPlanIntentDigest(unvalidatedBase) };
		const { receiptChecksum: _unvalidatedChecksum, ...unvalidatedApprovalWithoutChecksum } = unvalidatedApprovalBody;
		const unvalidatedApprovalReceipt = { ...unvalidatedApprovalBody, receiptChecksum: sha256Stable(unvalidatedApprovalWithoutChecksum) };
		const unvalidatedPlan = {
			...unvalidatedBase,
			approvalReceipt: unvalidatedApprovalReceipt,
			planChecksum: sha256Stable({ ...unvalidatedBase, approvalReceipt: unvalidatedApprovalReceipt }),
		} as FileMutationPlanV1;
		const unvalidatedApprovalRecord = { ...approvalRecord, approvedPlanDigest: unvalidatedApprovalBody.approvedPlanDigest };
		const result = admitGovernedReplayV1({ event, plan: unvalidatedPlan, approvalRecord: unvalidatedApprovalRecord, workspaceRoot: root });
		expect(result.status).toBe('REJECTED_APPROVAL');
		expect(result.writesPerformed).toBe(false);
		expect(result.errors).toContain('mutation plan is invalid');
	});

	it('the admitted receipt carries stable repair identity, revisions, and a checksum -- never a mutation', () => {
		const { root, plan, event, approvalRecord } = fixture();
		const result = admitGovernedReplayV1({ event, plan, approvalRecord, workspaceRoot: root, now: new Date('2026-09-14T01:00:00.000Z') });
		expect(result.status).toBe('ADMITTED_READ_ONLY');
		expect(result.writesPerformed).toBe(false);
		// Stable repair identity + revisions: workflow/action identity plus the workspace
		// revision the plan and canonical event were both bound to (checked equal at admission).
		expect(result.eventReceipt?.workflow_id).toBe(event.workflowId);
		expect(result.eventReceipt?.action_id).toBe(event.actionId);
		expect(result.eventReceipt?.producer_revision).toBe(event.producerRevision);
		expect(result.plan?.workspaceRevision).toBe(event.revisions.workspace);
		// Checksum: both receipt checksums are real, well-formed sha256 hex, not placeholders.
		expect(result.eventReceipt?.event_checksum).toMatch(/^[a-f0-9]{64}$/);
		expect(result.eventReceipt?.runtime_evidence_checksum).toMatch(/^[a-f0-9]{64}$/);
	});
});
