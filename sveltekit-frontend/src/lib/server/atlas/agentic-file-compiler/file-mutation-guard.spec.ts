import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preflightFileMutation } from './file-mutation-guard.js';
import { sha256Stable, type FileMutationPlanV1 } from './contracts.js';

function plan(overrides: Partial<FileMutationPlanV1> = {}): FileMutationPlanV1 {
	const base = {
		schema: 'atlas.file-mutation-plan.v1' as const,
		mutationId: 'mut:1', requestId: 'req:1', workflowId: 'wf:1', dagNodeId: 'mutate', workspaceRevision: 'ws:1',
		operation: 'CREATE' as const, targetPath: 'src/new-file.ts', targetArtifactKind: 'source_module', requiredSymbols: ['run'],
		contextManifestId: 'manifest:1', packetKeys: [], sourceRefs: [], promotedEvidenceIds: ['promotion:1'], expectedAbsent: true,
		allowedRoots: ['src'], forbiddenRoots: ['src/generated'], validationNodeIds: ['typecheck'],
	};
	return { ...base, planChecksum: sha256Stable(base), ...overrides };
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
});
