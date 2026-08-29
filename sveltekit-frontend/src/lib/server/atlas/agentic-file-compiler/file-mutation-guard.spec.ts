import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preflightFileMutation } from './file-mutation-guard.js';
import { mutationPlanIntentDigest, sha256Stable, type FileMutationPlanV1 } from './contracts.js';

function plan(overrides: Partial<FileMutationPlanV1> = {}): FileMutationPlanV1 {
	const base = {
		schema: 'atlas.file-mutation-plan.v1' as const,
		mutationId: 'mut:1', requestId: 'req:1', workflowId: 'wf:1', dagNodeId: 'mutate', workspaceRevision: 'ws:1',
		operation: 'CREATE' as const, targetPath: 'src/new-file.ts', targetArtifactKind: 'source_module', requiredSymbols: ['run'],
		contextManifestId: 'manifest:1', packetKeys: [], sourceRefs: [], promotedEvidenceIds: ['promotion:1'], expectedAbsent: true,
		allowedRoots: ['src'], forbiddenRoots: ['src/generated'], validationNodeIds: ['typecheck'],
	};
	const intent = { ...base, ...overrides };
	const approvalBody = {
		schema: 'atlas.mutation-approval-receipt.v1' as const,
		approvalId: '00000000-0000-4000-8000-000000000001',
		runId: '00000000-0000-4000-8000-000000000002',
		approvedPlanDigest: mutationPlanIntentDigest(intent),
		authorizationPolicyRevision: 'auth:1',
		approvedByUserId: 7,
		decision: 'approved' as const,
		approvedAt: '2026-08-29T00:00:00.000Z',
		expiresAt: null,
		revokedAt: null,
	};
	const approvalReceipt = { ...approvalBody, receiptChecksum: sha256Stable(approvalBody) };
	return { ...intent, approvalReceipt, planChecksum: sha256Stable({ ...intent, approvalReceipt }) };
}

describe('file mutation preflight', () => {
	it('accepts a bounded create under an allowed root', () => {
		const root = mkdtempSync(join(tmpdir(), 'atlas-mutation-'));
		mkdirSync(join(root, 'src'), { recursive: true });
		const result = preflightFileMutation(plan(), root);
		expect(result.ok).toBe(true);
	});

	it('fails closed on traversal outside allowed roots', () => {
		const root = mkdtempSync(join(tmpdir(), 'atlas-mutation-'));
		mkdirSync(join(root, 'src'), { recursive: true });
		const result = preflightFileMutation(plan({ targetPath: '../escape.ts' }), root);
		expect(result.ok).toBe(false);
		expect(result.errors.some((error) => error.includes('outside allowedRoots'))).toBe(true);
	});

	it('fails CREATE expectedAbsent when target already exists', () => {
		const root = mkdtempSync(join(tmpdir(), 'atlas-mutation-'));
		mkdirSync(join(root, 'src'), { recursive: true });
		writeFileSync(join(root, 'src/new-file.ts'), 'export const x = 1;');
		const result = preflightFileMutation(plan(), root);
		expect(result.ok).toBe(false);
		expect(result.errors).toContain('CREATE expected target to be absent');
	});

	it('fails closed when approval receipt is bound to a different plan', () => {
		const root = mkdtempSync(join(tmpdir(), 'atlas-mutation-'));
		mkdirSync(join(root, 'src'), { recursive: true });
		const current = plan();
		const result = preflightFileMutation({ ...current, targetPath: 'src/other.ts' }, root);
		expect(result.ok).toBe(false);
		expect(result.errors).toContain('approval receipt plan digest mismatch');
	});

	it('fails closed when approval receipt checksum is invalid', () => {
		const root = mkdtempSync(join(tmpdir(), 'atlas-mutation-'));
		mkdirSync(join(root, 'src'), { recursive: true });
		const current = plan();
		const result = preflightFileMutation({ ...current, approvalReceipt: { ...current.approvalReceipt, receiptChecksum: '0'.repeat(64) } }, root);
		expect(result.ok).toBe(false);
		expect(result.errors).toContain('approval receipt checksum mismatch');
	});
});
