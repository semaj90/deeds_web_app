import { describe, expect, it } from 'vitest';
import { buildAnalyzeThisAceAdapterV1 } from './analyze-this-ace-adapter.js';
import { coordinateAnalyzeThis } from './analyze-this-coordinator.js';

describe('analyze-this ACE adapter', () => {
	it('uses existing ContextManifest and PromptPlan owners without promotion', () => {
		const result = coordinateAnalyzeThis({
			query: 'find packet lineage',
			topK: 2,
			sourceMode: 'WORKTREE_DIAGNOSTIC',
			evidence: [
				{ kind: 'rg', filePath: 'src/a.ts', score: 0.9, snippet: 'packet' },
				{ kind: 'tree-sitter', filePath: 'src/b.ts', score: 0.8, startByte: 2, endByte: 8, parserRevision: 'tree-sitter-v1' },
			],
		});
		const adapted = buildAnalyzeThisAceAdapterV1(result, {
			requestId: 'req-analyze-this',
			tokenBudget: 512,
			retrievalPolicyRevision: 'retrieval-policy-v1',
			acePlaybookRevision: 'ace-playbook-v1',
		});

		expect(adapted.manifest.schema).toBe('atlas.context-manifest.v2');
		expect(adapted.promptPlan.schema).toBe('atlas.agentic-file-compiler.block-plan.v1');
		expect(adapted.manifest.v1.snapshotId).toMatch(/^worktree-diagnostic:/);
		expect(adapted.manifest.identityInput.evidenceRevisions.sourceRevision).toBeNull();
		expect(adapted.canonicalAuthority).toBe(false);
		expect(adapted.writesPerformed).toBe(false);
	});
});
