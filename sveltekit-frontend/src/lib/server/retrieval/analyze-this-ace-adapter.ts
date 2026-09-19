import { buildContextManifestV2, type ContextManifestV2 } from '../atlas/graph/context-manifest-v2.js';
import type { ContextManifestV1 } from '../atlas/graph/graph-runtime-contracts.js';
import { buildAgenticFileCompilerBlockPlan, type AgenticFileCompilerBlockPlanV1 } from '../atlas/agentic-file-compiler/prompt-plan.js';
import { canonicalSha256V1 } from '../atlas/prefill/canonical-hash-v1.js';
import type { AnalyzeThisResult } from './analyze-this-coordinator.js';

export interface AnalyzeThisAceAdapterInputV1 {
	requestId: string;
	tokenBudget: number;
	retrievalPolicyRevision: string;
	acePlaybookRevision: string;
	modelRevision?: string | null;
	promptTemplateRevision?: string | null;
}

export interface AnalyzeThisAceAdapterResultV1 {
	schema: 'atlas.analyze-this-ace-adapter.v1';
	manifest: ContextManifestV2;
	promptPlan: AgenticFileCompilerBlockPlanV1;
	canonicalAuthority: false;
	writesPerformed: false;
}

/**
 * Bridges diagnostic coordinator output into the existing ACE identity and
 * prompt-plan owners. It does not admit the worktree as canonical evidence,
 * perform retrieval, or persist either projection.
 */
export function buildAnalyzeThisAceAdapterV1(
	result: AnalyzeThisResult,
	input: AnalyzeThisAceAdapterInputV1,
): AnalyzeThisAceAdapterResultV1 {
	if (!input.requestId.trim()) throw new Error('ANALYZE_THIS_ACE_REQUEST_ID_REQUIRED');
	if (!input.retrievalPolicyRevision.trim()) throw new Error('ANALYZE_THIS_ACE_POLICY_REVISION_REQUIRED');
	if (!input.acePlaybookRevision.trim()) throw new Error('ANALYZE_THIS_ACE_PLAYBOOK_REVISION_REQUIRED');

	const selectedOrdinalSetChecksum = canonicalSha256V1({
		schema: 'atlas.analyze-this-selected-files.v1',
		files: result.files.map((file) => file.filePath),
	});
	const evidenceRevisionChecksum = canonicalSha256V1({
		schema: 'atlas.analyze-this-evidence-revisions.v1',
		revisions: result.files.flatMap((file) => file.evidence.map((item) => ({
			sourceRef: item.sourceRef,
			sourceRevision: item.sourceRevision,
			contentHash: item.contentHash,
		}))),
	});
	const ordinalMapChecksum = canonicalSha256V1({
		schema: 'atlas.analyze-this-diagnostic-ordinal-map.v1',
		files: result.files.map((file, index) => ({ ordinal: index, filePath: file.filePath })),
	});
	const v1: ContextManifestV1 = {
		schema: 'atlas.context-manifest.v1',
		requestId: input.requestId,
		snapshotId: `worktree-diagnostic:${result.contextManifest.checksum}`,
		graphRevision: null,
		query: result.query,
		candidateBucket: result.files.length <= 32 ? 32 : result.files.length <= 64 ? 64 : 128,
		candidateCount: result.files.length,
		tokenBudget: Math.max(1, Math.trunc(input.tokenBudget)),
		selectedNodeKeys: result.files.map((file) => file.filePath),
		evidenceRefs: result.files.flatMap((file) => file.evidence.map((item) => item.sourceRef)),
		producerRevision: 'atlas.analyze-this-coordinator.v1',
	};
	const manifest = buildContextManifestV2(v1, {
		selectedOrdinalSetChecksum,
		evidenceRevisions: {
			sourceRevision: null,
			representationRevision: null,
			featureRevision: result.contextManifest.checksum,
			ontologyRevision: null,
			modelRevision: input.modelRevision ?? null,
			promptTemplateRevision: input.promptTemplateRevision ?? null,
		},
		ordinalMapChecksum,
		retrievalPolicyRevision: input.retrievalPolicyRevision,
		acePlaybookRevision: input.acePlaybookRevision,
	});
	const promptPlan = buildAgenticFileCompilerBlockPlan({
		promptPlanId: `worktree-diagnostic-prompt:${manifest.identityChecksum}`,
		contextManifestId: manifest.identityChecksum,
		systemInstructionRevision: input.acePlaybookRevision,
		toolSchemaRevision: input.retrievalPolicyRevision,
		blocks: result.files.map((file) => ({ kind: 'EVIDENCE' as const, ref: file.filePath })),
		estimatedTokens: input.tokenBudget,
	});
	return {
		schema: 'atlas.analyze-this-ace-adapter.v1',
		manifest,
		promptPlan,
		canonicalAuthority: false,
		writesPerformed: false,
	};
}
